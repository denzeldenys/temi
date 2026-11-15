// Temi service worker: makes the app installable and fully offline.
//
// - The shell is cached on install.
// - On first run the page sends the full list of game assets ("precache").
// - Every same-origin request is answered from the cache first and refreshed
//   in the background, so a new deploy shows up the launch after next.
//   Bump CACHE to force everyone onto fresh files immediately.

const CACHE = "temi-v1";

const CORE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/shell.css",
  "js/app.js",
  "js/audio.js",
  "js/games.js",
  "js/hold.js",
  "js/preloader.js",
  "assets/fonts/fredoka-bold.woff2",
  "assets/logo.png",
  "assets/mascot.png",
  "icons/favicon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "precache") return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const failed = [];
    await Promise.all(data.urls.map(async (url) => {
      try {
        if (new URL(url).origin !== self.location.origin) return;
        if (await cache.match(url)) return;
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.status);
        await cache.put(url, res);
      } catch {
        failed.push(url);
      }
    }));
    const reply = { type: "precached", total: (await cache.keys()).length, failed };
    if (event.ports[0]) event.ports[0].postMessage(reply);
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const isPage = req.mode === "navigate";
    const cached = await cache.match(req, { ignoreSearch: isPage });
    const refresh = fetch(req).then((res) => {
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    });
    if (cached) {
      event.waitUntil(refresh.catch(() => {}));
      return cached;
    }
    try {
      return await refresh;
    } catch (err) {
      if (isPage) {
        const page = await cache.match("index.html");
        if (page) return page;
      }
      throw err;
    }
  })());
});
