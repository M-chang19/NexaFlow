import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = path.join(root, "data");
const dataPath = path.join(dataDirectory, "nexaflow.json");
const buildDirectory = path.join(root, "dist");
const host = process.env.NEXAFLOW_HOST || "127.0.0.1";
const port = Number(process.env.NEXAFLOW_PORT || 4317);
const syncToken = process.env.NEXAFLOW_SYNC_TOKEN || "";
const allowedOrigin = process.env.NEXAFLOW_ALLOWED_ORIGIN || "";
const trustedLocalOrigin = process.env.NEXAFLOW_TRUSTED_LOCAL_ORIGIN || "";
const emptyState = { projects: [], tasks: [], notes: [], messages: [], activity: [], goals: [], templates: [] };
const allowedModes = new Set([
  "general problem-solving",
  "project planning and productivity",
  "customer support problem-solving"
]);
let workspaceWriteQueue = Promise.resolve();

function workspaceRevision(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function ensureWorkspace() {
  await mkdir(dataDirectory, { recursive: true });
  try {
    await readFile(dataPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(dataPath, `${JSON.stringify(emptyState, null, 2)}\n`, { flag: "wx" }).catch(async writeError => {
      if (writeError.code !== "EEXIST") throw writeError;
    });
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

function isLoopbackAddress(address = "") {
  return address === "::1" || address === "127.0.0.1" || address.startsWith("::ffff:127.");
}

function isTrustedLocalOriginRequest(request) {
  if (!trustedLocalOrigin) return false;
  const origin = request.headers.origin;
  return request.headers.host?.toLowerCase() === new URL(trustedLocalOrigin).host.toLowerCase() &&
    (!origin || origin === trustedLocalOrigin);
}

function isLocalRequest(request) {
  if (!isLoopbackAddress(request.socket.remoteAddress)) return isTrustedLocalOriginRequest(request);
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname.replace(/^\[|\]$/g, "");
    return isLoopbackAddress(hostname);
  } catch {
    return false;
  }
}

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (allowedOrigin && origin !== allowedOrigin) return false;
  if (!allowedOrigin && !isLocalRequest(request)) return false;
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match");
  response.setHeader("Access-Control-Max-Age", "600");
  return true;
}

function authorizeWorkspaceRequest(request) {
  if (!syncToken || isLocalRequest(request)) return true;
  return request.headers.authorization === `Bearer ${syncToken}`;
}

async function readJson(request) {
  const maximumBytes = 2 * 1024 * 1024;
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maximumBytes) {
      const error = new Error("Request body is too large (maximum 2 MB).");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (totalBytes === 0) {
    const error = new Error("A JSON request body is required.");
    error.status = 400;
    throw error;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

async function saveState(state) {
  for (const key of ["projects", "tasks", "notes", "messages"]) {
    if (!Array.isArray(state?.[key])) {
      const error = new Error(`Workspace data is invalid: '${key}' must be an array.`);
      error.status = 400;
      throw error;
    }
  }
  for (const key of ["activity", "goals", "templates"]) {
    if (state?.[key] !== undefined && !Array.isArray(state[key])) {
      const error = new Error(`Workspace data is invalid: '${key}' must be an array.`);
      error.status = 400;
      throw error;
    }
  }
  const temporaryPath = path.join(dataDirectory, `nexaflow-${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, dataPath);
  } catch (error) {
    await unlink(temporaryPath).catch(cleanupError => {
      if (cleanupError.code !== "ENOENT") console.error(`Could not clean up temporary workspace file: ${cleanupError.message}`);
    });
    throw error;
  }
}

function saveWorkspace(state, expectedRevision) {
  const operation = workspaceWriteQueue.then(async () => {
    if (expectedRevision) {
      const current = await readFile(dataPath, "utf8");
      if (workspaceRevision(current) !== expectedRevision) {
        const error = new Error("This workspace changed on another device. Reload it before saving again.");
        error.status = 409;
        throw error;
      }
    }
    await saveState(state);
    return workspaceRevision(await readFile(dataPath, "utf8"));
  });
  workspaceWriteQueue = operation.catch(() => {});
  return operation;
}

async function handleAssistant(request, response) {
  const apiKey = process.env.NEXAFLOW_AI_API_KEY;
  if (!apiKey) {
    sendJson(response, 503, { error: "AI is not configured. Set NEXAFLOW_AI_API_KEY in this terminal, then restart the local server." });
    return;
  }

  const input = await readJson(request);
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message || message.length > 12000) {
    sendJson(response, 400, { error: "Please enter a message of 1-12,000 characters." });
    return;
  }

  const baseUrl = (process.env.NEXAFLOW_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
  const model = process.env.NEXAFLOW_AI_MODEL || "gpt-4o-mini";
  const mode = allowedModes.has(input.mode) ? input.mode : "general problem-solving";
  try {
    const providerResponse = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `You are NexaFlow, a thoughtful, practical assistant for personal productivity, project planning, customer-support problem solving, and everyday questions. The user's selected focus is: ${mode}. Be warm, clear, and concise. Ask a clarifying question when needed. For complex problems, give actionable steps. Do not claim to have taken actions in their workspace.` },
          { role: "user", content: message }
        ]
      }),
      signal: AbortSignal.timeout(60000)
    });
    if (!providerResponse.ok) {
      console.error(`AI provider request failed with HTTP ${providerResponse.status}.`);
      sendJson(response, 502, { error: "The AI provider request failed. Check the base URL, model, API key, and network connection, then try again." });
      return;
    }
    const result = await providerResponse.json();
    const reply = result.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      sendJson(response, 502, { error: "The AI provider returned an empty reply. Check the selected model and provider settings." });
      return;
    }
    sendJson(response, 200, { reply });
  } catch (error) {
    console.error(`AI provider request failed: ${error.message}`);
    sendJson(response, 502, { error: "The AI provider request failed. Check the base URL, model, API key, and network connection, then try again." });
  }
}

async function serveBuild(pathname, response) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid URL path." });
    return;
  }
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^[/\\]+/, "");
  const filePath = path.resolve(buildDirectory, relativePath);
  if (!filePath.startsWith(`${buildDirectory}${path.sep}`)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  try {
    const content = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".json": "application/json; charset=utf-8",
      ".webmanifest": "application/manifest+json; charset=utf-8",
      ".png": "image/png",
      ".ico": "image/x-icon"
    };
    response.writeHead(200, {
      "Cache-Control": extension === ".html" || path.basename(filePath) === "sw.js" || extension === ".webmanifest" ? "no-cache" : "public, max-age=31536000, immutable",
      "Content-Type": types[extension] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      sendJson(response, 404, { error: "Not found." });
      return;
    }
    throw error;
  }
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, `http://${host}:${port}`).pathname;
    if (pathname.startsWith("/api/") && !applyCors(request, response)) {
      sendJson(response, 403, { error: "This app origin is not allowed to use the self-hosted sync API." });
      return;
    }
    if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === "GET" && pathname === "/api/state") {
      if (!authorizeWorkspaceRequest(request)) {
        sendJson(response, 401, { error: "A valid self-hosted sync token is required." });
        return;
      }
      const contents = await readFile(dataPath, "utf8");
      const state = JSON.parse(contents);
      sendJson(response, 200, {
        state,
        revision: workspaceRevision(contents),
        dataFile: dataPath,
        aiConfigured: Boolean(process.env.NEXAFLOW_AI_API_KEY),
        aiModel: process.env.NEXAFLOW_AI_MODEL || "gpt-4o-mini"
      });
      return;
    }
    if (request.method === "POST" && pathname === "/api/state") {
      if (!authorizeWorkspaceRequest(request)) {
        sendJson(response, 401, { error: "A valid self-hosted sync token is required." });
        return;
      }
      const state = await readJson(request);
      const revision = await saveWorkspace(state, request.headers["if-match"]);
      sendJson(response, 200, { saved: true, revision });
      return;
    }
    if (request.method === "POST" && pathname === "/api/assistant") {
      await handleAssistant(request, response);
      return;
    }
    if (request.method === "GET" && !pathname.startsWith("/api/")) {
      await serveBuild(pathname === "/workspace" ? "/index.html" : pathname, response);
      return;
    }
    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    console.error(`Request failed: ${error.message}`);
    sendJson(response, error.status || 500, { error: error.status ? error.message : "The local server could not complete the request." });
  }
});

await ensureWorkspace();
if (trustedLocalOrigin) {
  let localOrigin;
  try {
    localOrigin = new URL(trustedLocalOrigin);
  } catch {
    throw new Error("NEXAFLOW_TRUSTED_LOCAL_ORIGIN must be a valid loopback origin.");
  }
  if (!["http:", "https:"].includes(localOrigin.protocol) ||
      !isLoopbackAddress(localOrigin.hostname.replace(/^\[|\]$/g, "")) ||
      localOrigin.origin !== trustedLocalOrigin) {
    throw new Error("NEXAFLOW_TRUSTED_LOCAL_ORIGIN must be an exact HTTP(S) loopback origin without a path.");
  }
}
if (!["127.0.0.1", "localhost", "::1"].includes(host) && !syncToken) {
  throw new Error("Set NEXAFLOW_SYNC_TOKEN before binding the workspace API to a network interface.");
}
server.listen(port, host, () => {
  console.log(`NexaFlow local API: http://${host}:${port}`);
  console.log(`Workspace data: ${dataPath}`);
  console.log(process.env.NEXAFLOW_AI_API_KEY ? "AI key is configured." : "AI is not configured. Add NEXAFLOW_AI_API_KEY to enable assistant replies.");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
