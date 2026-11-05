const CACHE_NAME = "nexaflow-shell-v3";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    const html = await (await fetch("/")).text();
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)].map(match => new URL(match[1], self.location.origin).href);
    await cache.addAll(assets);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith((async () => {
    if (request.mode === "navigate") {
      try {
        const response = await fetch(request);
        if (response.ok) await caches.open(CACHE_NAME).then(cache => cache.put("/", response.clone()));
        return response;
      } catch {
        const cachedPage = await caches.match("/");
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
