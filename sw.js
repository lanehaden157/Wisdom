/* Wisdom service worker.
   - index.html + data/*  : network-first (fresh when online, cached copy offline)
   - css/js/icons         : cache-first. Their URLs carry ?v=..., so a new release is a new URL.
   - Google Fonts         : stale-while-revalidate
   Bump SHELL when this file's strategy changes; old caches are dropped on activate. */
var SHELL = "wisdom-shell-v1";
var FONTS = "wisdom-fonts-v1";
var DATA_FILES = ["data/stamp.js", "data/tags.js", "data/cards.js"];
var NETWORK_TIMEOUT = 5000;

self.addEventListener("install", function (e) {
  e.waitUntil((async function () {
    var cache = await caches.open(SHELL);
    var res = await fetch("index.html", { cache: "no-cache" });
    var html = await res.clone().text();
    await cache.put(new Request("index.html"), res);
    var urls = ["manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
    var re = /(?:src|href)="((?:css|js)\/[^"]+)"/g, m;
    while ((m = re.exec(html))) urls.push(m[1]);
    DATA_FILES.forEach(function (f) { urls.push(f); });
    await Promise.all(urls.map(async function (u) {
      var r = await fetch(u, { cache: "no-cache" });
      if (r.ok) await cache.put(dataKey(new URL(u, self.location).href), r);
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", function (e) {
  e.waitUntil((async function () {
    var keep = [SHELL, FONTS];
    (await caches.keys()).forEach(function (k) { if (keep.indexOf(k) === -1) caches.delete(k); });
    await self.clients.claim();
  })());
});

/* data files are keyed by path alone, so there is exactly one copy of each */
function dataKey(href) {
  var u = new URL(href);
  var isData = /\/data\/[^/]+\.js$/.test(u.pathname);
  return isData ? new Request(u.origin + u.pathname) : new Request(href);
}

function networkFirst(req, key) {
  return caches.open(SHELL).then(function (cache) {
    var net = fetch(req, { cache: "no-cache" }).then(function (res) {
      if (res.ok) cache.put(key, res.clone());
      return res;
    });
    var timeout = new Promise(function (_, rej) { setTimeout(rej, NETWORK_TIMEOUT); });
    return Promise.race([net, timeout]).catch(function () {
      return cache.match(key).then(function (hit) { return hit || net; });
    });
  });
}

function cacheFirst(req) {
  return caches.open(SHELL).then(function (cache) {
    return cache.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) { if (res.ok) cache.put(req, res.clone()); return res; });
    });
  });
}

function staleWhileRevalidate(req) {
  return caches.open(FONTS).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; });
      return hit || net;
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.origin !== self.location.origin) return;

  var dir = self.location.pathname.replace(/[^/]*$/, "");
  var rel = url.pathname.slice(dir.length);
  if (req.mode === "navigate" || rel === "" || rel === "index.html") {
    e.respondWith(networkFirst(new Request("index.html"), new Request("index.html")));
  } else if (/^data\/[^/]+\.js$/.test(rel)) {
    e.respondWith(networkFirst(req, dataKey(req.url)));
  } else if (/^(css|js|icons)\//.test(rel) || rel === "manifest.webmanifest") {
    e.respondWith(cacheFirst(req));
  }
});
