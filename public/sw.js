const CACHE_NAME = "nexaflow-shell-v5";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    const pageResponse = await fetch("/");
    if (!pageResponse.ok) throw new Error("NexaFlow could not cache the offline app shell.");
    await cache.put("/workspace", pageResponse.clone());
    const html = await pageResponse.text();
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
      .map(match => new URL(match[1], self.location.origin).href);
    const manifestResponse = await fetch("/.vite/manifest.json");
    if (manifestResponse.ok && manifestResponse.headers.get("content-type")?.includes("json")) {
      const manifest = await manifestResponse.json();
      for (const entry of Object.values(manifest)) {
        if (entry.file) assets.push(new URL(`/${entry.file}`, self.location.origin).href);
        for (const stylesheet of entry.css || []) {
          assets.push(new URL(`/${stylesheet}`, self.location.origin).href);
        }
      }
    }
    await cache.addAll([...new Set(assets)]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("notificationclick", event => {
  const taskId = event.notification.data?.taskId;
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = clients.find(item => new URL(item.url).origin === self.location.origin);
    if (client) {
      await client.focus();
      client.postMessage({ type: "open-task", taskId });
      return;
    }
    const target = taskId ? `/workspace?task=${encodeURIComponent(taskId)}` : "/workspace";
    await self.clients.openWindow(target);
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith((async () => {
    if (request.mode === "navigate") {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(url.pathname, response.clone());
          if (url.pathname === "/") await cache.put("/workspace", response.clone());
        }
        return response;
      } catch {
        const cachedPage = await caches.match(url.pathname) || await caches.match("/");
        if (cachedPage) return cachedPage;
        throw new Error("NexaFlow is not available offline yet.");
      }
    }
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const copy = response.clone();
        await caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    } catch (error) {
      throw error;
    }
  })());
});
