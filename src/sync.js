const SESSION_KEY = "nexaflow-supabase-session";

export const DEFAULT_SYNC_SETTINGS = {
  mode: "local",
  supabaseUrl: "",
  supabaseAnonKey: "",
  selfHostedUrl: "",
  selfHostedToken: ""
};

function isValidWorkspace(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    ["projects", "tasks", "notes", "messages"].every(key => Array.isArray(value[key])) &&
    ["activity", "goals", "templates"].every(key => value[key] === undefined || Array.isArray(value[key]));
}

export function readSyncSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("nexaflow-sync-settings") || "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return DEFAULT_SYNC_SETTINGS;
    return {
      ...DEFAULT_SYNC_SETTINGS,
      ...saved,
      mode: ["local", "supabase", "self-hosted"].includes(saved.mode) ? saved.mode : "local"
    };
  } catch (error) {
    console.error("Could not read sync settings:", error);
    return DEFAULT_SYNC_SETTINGS;
  }
}

export function saveSyncSettings(settings) {
  localStorage.setItem("nexaflow-sync-settings", JSON.stringify(settings));
}

export function readSupabaseSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    return session && typeof session.access_token === "string" && typeof session.refresh_token === "string"
      ? session
      : null;
  } catch (error) {
    console.error("Could not read the Supabase session:", error);
    return null;
  }
}

export function writeSupabaseSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function supabaseUrl(settings, endpoint) {
  const base = settings.supabaseUrl.trim().replace(/\/+$/, "");
  const key = settings.supabaseAnonKey.trim();
  if (!/^https:\/\/[^/]+$/i.test(base) || !key) {
    throw new Error("Enter a valid Supabase project URL and publishable anon key.");
  }
  return { url: `${base}${endpoint}`, key };
}

async function readResponse(response) {
  const text = await response.text();
  let result = {};
  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error("The sync service returned an invalid response.");
    }
  }
  if (!response.ok) {
    const message = result.msg || result.message || result.error_description || result.error;
    if (response.status === 409 || response.status === 412) {
      throw new Error("This workspace changed on another device. Reload the cloud copy before editing further.");
    }
    throw new Error(typeof message === "string" ? message : `Sync request failed (${response.status}).`);
  }
  return result;
}

export async function authenticateSupabase(settings, action, email, password) {
  const route = action === "signup" ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password";
  const { url, key } = supabaseUrl(settings, route);
  const result = await readResponse(await fetch(url, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
    signal: AbortSignal.timeout(15000)
  }));
  if (result.access_token && result.refresh_token) {
    const session = {
      ...result,
      expires_at: result.expires_at || Math.floor(Date.now() / 1000) + (result.expires_in || 3600)
    };
    writeSupabaseSession(session);
    return session;
  }
  writeSupabaseSession(null);
  return result;
}

export async function signOutSupabase(settings, session) {
  try {
    if (session?.access_token) {
      const { url, key } = supabaseUrl(settings, "/auth/v1/logout");
      try {
        await readResponse(await fetch(url, {
          method: "POST",
          headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
          signal: AbortSignal.timeout(10000)
        }));
      } catch (error) {
        throw new Error(`Signed out on this device, but Supabase could not revoke the server session: ${error.message}`);
      }
    }
  } finally {
    writeSupabaseSession(null);
  }
}

async function freshSession(settings, session) {
  if (!session?.refresh_token) throw new Error("Sign in to Supabase before syncing this workspace.");
  if (session.expires_at && session.expires_at > Date.now() / 1000 + 60) return session;

  const { url, key } = supabaseUrl(settings, "/auth/v1/token?grant_type=refresh_token");
  const renewed = await readResponse(await fetch(url, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
    signal: AbortSignal.timeout(15000)
  }));
  const sessionWithExpiry = {
    ...renewed,
    expires_at: renewed.expires_at || Math.floor(Date.now() / 1000) + (renewed.expires_in || 3600)
  };
  writeSupabaseSession(sessionWithExpiry);
  return sessionWithExpiry;
}

async function supabaseRequest(settings, session, endpoint, options = {}) {
  const activeSession = await freshSession(settings, session);
  const { url, key } = supabaseUrl(settings, `/rest/v1/${endpoint}`);
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${activeSession.access_token}`,
      "Content-Type": "application/json",
      ...options.headers
    },
    signal: AbortSignal.timeout(15000)
  });
  return readResponse(response);
}

export async function readSupabaseWorkspace(settings, session) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Your Supabase session is missing its account ID. Sign in again.");
  const rows = await supabaseRequest(
    settings,
    session,
    `nexaflow_workspaces?select=state,revision&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  );
  const row = rows[0];
  if (!row) return { state: null, revision: 0, exists: false };
  if (!isValidWorkspace(row.state) || !Number.isSafeInteger(row.revision) || row.revision < 0) {
    throw new Error("The cloud workspace has an invalid format. Export a backup before making changes.");
  }
  return { state: row.state, revision: row.revision, exists: true };
}

export async function writeSupabaseWorkspace(settings, session, workspace, revision, exists) {
  if (!isValidWorkspace(workspace)) throw new Error("The workspace is not valid and cannot be synced.");
  const userId = session?.user?.id;
  if (!userId) throw new Error("Sign in to Supabase before syncing this workspace.");

  if (!exists) {
    const rows = await supabaseRequest(settings, session, "nexaflow_workspaces", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: userId, state: workspace, revision: 1 })
    });
    if (!rows.length) throw new Error("The cloud service did not confirm workspace creation.");
    return 1;
  }

  const rows = await supabaseRequest(
    settings,
    session,
    `nexaflow_workspaces?user_id=eq.${encodeURIComponent(userId)}&revision=eq.${revision}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ state: workspace, revision: revision + 1, updated_at: new Date().toISOString() })
    }
  );
  if (!rows.length) {
    throw new Error("This workspace changed on another device. Reload the cloud copy before editing further.");
  }
  return revision + 1;
}

function selfHostedUrl(settings, path) {
  let base;
  try {
    base = new URL(settings.selfHostedUrl);
  } catch {
    throw new Error("Enter the full URL of your self-hosted NexaFlow server.");
  }
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(base.hostname);
  if (base.protocol !== "https:" && !isLocal) {
    throw new Error("Self-hosted sync requires HTTPS. Use localhost only for testing on this device.");
  }
  if (!settings.selfHostedToken.trim()) throw new Error("Enter the sync token configured on your NexaFlow server.");
  return new URL(path, base.toString().replace(/\/?$/, "/")).toString();
}

export async function requestSelfHostedWorkspace(settings, method = "GET", state, revision) {
  const response = await fetch(selfHostedUrl(settings, "/api/state"), {
    method,
    headers: {
      Authorization: `Bearer ${settings.selfHostedToken.trim()}`,
      ...(method === "POST" ? {
        "Content-Type": "application/json",
        ...(revision ? { "If-Match": revision } : {})
      } : {})
    },
    ...(method === "POST" ? { body: JSON.stringify(state) } : {}),
    signal: AbortSignal.timeout(15000)
  });
  return readResponse(response);
}
