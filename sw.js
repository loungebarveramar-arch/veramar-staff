
const CACHE="veramar-staff-v9";
const ASSETS=["./","index.html","styles.css","app.js","manifest.webmanifest","icon-192.svg","icon-512.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
