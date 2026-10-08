/* ---------- Publish to the site via the GitHub Git Data API ----------
   One atomic commit per Save, containing only the changed data files, after
   checking that nobody has published since this page loaded.
*/
window.Wisdom = window.Wisdom || {};
window.Wisdom.Github = (function () {
  var W = window.Wisdom;
  var C = W.config;
  var Store = W.Store;

  var PATH = {
    cards: "data/cards.js",
    tags:  "data/tags.js",
    stamp: "data/stamp.js"
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
  function unb64(str) {
    var bin = atob(str.replace(/\n/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function stampOf(jsText) {
    var m = jsText && jsText.match(/\.stamp\s*=\s*"([^"]*)"/);
    return m ? m[1] : null;
  }

  function api(cfg, path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", headers: headers(cfg), cache: "no-store" };
    if (opts.body) init.body = JSON.stringify(opts.body);
    return fetch(C.api + "/repos/" + cfg.owner + "/" + cfg.repo + path, init).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error("auth");
      if (r.status === 409 || r.status === 422) throw new Error("conflict");
      if (!r.ok) throw new Error(init.method + " " + path.split("?")[0] + ": " + r.status);
      return r.json();
    });
  }

  /* publish: ONE atomic commit containing only the changed files (+ the stamp).
     Git Data API: read branch head -> build tree on top of it -> commit -> move
     the branch ref (non-force). If anything fails nothing is published; if the
     branch moved meanwhile the ref update is rejected -> "conflict". */
  function publish(onStatus) {
    var cfg = loadConfig();
    if (!cfg || !cfg.owner || !cfg.repo || !cfg.token) return Promise.reject(new Error("noconfig"));
    var p = Store.pending();
    if (!p.any) return Promise.resolve("Nothing to save — no changes pending");

    var loadedStamp = String(W.stamp || "0");
    var newStamp = String(Date.now());
    var message = Store.summary();
    var keys = Store.changedKeys().concat("stamp");
    var branch, headSha;

    onStatus && onStatus("Checking the site…");
    return api(cfg, "").then(function (repo) {
      branch = cfg.branch || repo.default_branch || "main";
      return api(cfg, "/git/ref/heads/" + branch);
    }).then(function (ref) {
      headSha = ref.object.sha;
      return api(cfg, "/contents/" + PATH.stamp + "?ref=" + headSha);
    }).then(function (info) {
      var remoteStamp = stampOf(unb64(info.content));
      if (remoteStamp && remoteStamp !== loadedStamp) throw new Error("behind");
      return api(cfg, "/git/commits/" + headSha);
    }).then(function (commit) {
      onStatus && onStatus("Saving " + keys.length + " file" + (keys.length > 1 ? "s" : "") + "…");
      return api(cfg, "/git/trees", { method: "POST", body: {
        base_tree: commit.tree.sha,
        tree: keys.map(function (k) {
          return { path: PATH[k], mode: "100644", type: "blob", content: Store.serialize(k, newStamp) };
        })
      }});
    }).then(function (tree) {
      return api(cfg, "/git/commits", { method: "POST", body: { message: message, tree: tree.sha, parents: [headSha] } });
    }).then(function (commit) {
      return api(cfg, "/git/refs/heads/" + branch, { method: "PATCH", body: { sha: commit.sha, force: false } });
    }).then(function () {
      Store.adoptSaved(newStamp);
      W.stamp = newStamp;
      return "Saved ✓ (" + message.replace("Wisdom — ", "") + "). Other devices see it after a refresh.";
    });
  }

  return {
    loadConfig: loadConfig, saveConfig: saveConfig, clearConfig: clearConfig,
    publish: publish
  };
})();
