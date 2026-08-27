/* ---------- Publish to the site via the GitHub Contents API ----------
   PUTs each changed data file individually (small JSON payloads), after
   checking that nobody has published since this page loaded.
*/
window.Wisdom = window.Wisdom || {};
window.Wisdom.Github = (function () {
  var W = window.Wisdom;
  var C = W.config;
  var Store = W.Store;

  var PATH = {
    tags:   "data/tags.js",
    assign: "data/assignments.js",
    origins:"data/origins.js",
    qedits: "data/quote-edits.js",
    stamp:  "data/stamp.js"
  };

  function loadConfig() {
    try { return JSON.parse(localStorage.getItem(C.configKey) || "null"); } catch (e) { return null; }
  }
  function saveConfig(cfg) { localStorage.setItem(C.configKey, JSON.stringify(cfg)); }
  function clearConfig() { localStorage.removeItem(C.configKey); }

  function headers(cfg) {
    return {
      "Authorization": "Bearer " + cfg.token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }
  function contentsUrl(cfg, path) {
    return C.api + "/repos/" + cfg.owner + "/" + cfg.repo + "/contents/" + path;
  }

  function b64(str) {
    var bytes = new TextEncoder().encode(str), bin = "", CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  function unb64(str) {
    var bin = atob(str.replace(/\n/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function stampOf(jsText) {
    var m = jsText && jsText.match(/\.stamp\s*=\s*"([^"]*)"/);
    return m ? m[1] : null;
  }

  function getFile(cfg, path) {
    return fetch(contentsUrl(cfg, path), { headers: headers(cfg) }).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error("auth");
      if (r.status === 404) return null;               /* file not yet in repo */
      if (!r.ok) throw new Error("get " + path + ": " + r.status);
      return r.json();
    });
  }

  function putFile(cfg, path, text, sha, msg) {
    var body = { message: msg, content: b64(text) };
    if (sha) body.sha = sha;
    return fetch(contentsUrl(cfg, path), {
      method: "PUT", headers: headers(cfg), body: JSON.stringify(body)
    }).then(function (r) {
      if (r.status === 409) throw new Error("conflict");
      if (r.status === 422) throw new Error("conflict");   /* stale sha */
      if (!r.ok) throw new Error("put " + path + ": " + r.status);
      return r.json();
    });
  }

  /* publish: returns a Promise<string> resolving to a status message */
  function publish(onStatus) {
    var cfg = loadConfig();
    if (!cfg || !cfg.owner || !cfg.repo || !cfg.token) return Promise.reject(new Error("noconfig"));
    var p = Store.pending();
    if (!p.any) return Promise.resolve("Nothing to save — no changes pending");

    var loadedStamp = String(W.stamp || "0");
    var newStamp = String(Date.now());
    var today = new Date().toISOString().slice(0, 10);

    onStatus && onStatus("Checking the site…");
    return getFile(cfg, PATH.stamp).then(function (info) {
      var remoteStamp = info ? stampOf(unb64(info.content)) : loadedStamp;
      if (info && remoteStamp && remoteStamp !== loadedStamp) {
        throw new Error("behind");
      }
      /* PUT every app-written file in order, threading fresh shas */
      var keys = Store.fileList;
      var chain = Promise.resolve();
      keys.forEach(function (k) {
        chain = chain.then(function () {
          onStatus && onStatus("Saving " + PATH[k].replace("data/", "") + "…");
          return getFile(cfg, PATH[k]).then(function (fi) {
            var text = Store.serialize(k, newStamp);
            return putFile(cfg, PATH[k], text, fi && fi.sha, "Wisdom — " + today);
          });
        });
      });
      return chain;
    }).then(function () {
      Store.adoptSaved(newStamp);
      W.stamp = newStamp;
      return "Saved ✓ — the site link updates in a minute or two";
    });
  }

  return {
    loadConfig: loadConfig, saveConfig: saveConfig, clearConfig: clearConfig,
    publish: publish
  };
})();
