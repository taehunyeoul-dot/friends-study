/* Friends 영어공부 — 오프라인 캐시 (앱 셸 프리캐시 + 데이터 런타임 캐시) */
const VER = "fs-v12";
const SHELL = ["./", "index.html", "app.css", "app.js", "manifest.webmanifest",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
  "icons/icon-maskable-192.png", "icons/icon-maskable-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VER).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // 데이터: 캐시 우선 (대본·표현은 불변), 없으면 네트워크 후 캐시
  if (url.pathname.includes("/data/")) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VER).then((c) => c.put(e.request, copy));
          }
          return res;
        }))
    );
    return;
  }
  // 앱 셸: 네트워크 우선 (업데이트 반영), 오프라인이면 캐시
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VER).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("index.html")))
  );
});
