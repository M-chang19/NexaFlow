const CACHE_NAME = "nexaflow-shell-v6";
const APP_SHELL = ["/", "/workspace", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
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
        const cachedPage = await caches.match(url.pathname) || await caches.match("/workspace") || await caches.match("/");
        if (cachedPage) return cachedPage;
        throw new Error("NexaFlow is not available offline yet.");
      }
    }

    const cached = await caches.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, copy);
      }
      return response;
    } catch (error) {
      throw error;
    }
  })());
});
