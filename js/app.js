/* ---------- Boot ---------- */
(function () {
  "use strict";
  var W = window.Wisdom;

  /* toast */
  var statusEl, timer = null;
  W.toast = function (msg, sticky) {
    statusEl = statusEl || document.getElementById("saveStatus");
    statusEl.textContent = msg;
    statusEl.classList.remove("hidden");
    if (timer) clearTimeout(timer);
    if (!sticky) timer = setTimeout(function () { statusEl.classList.add("hidden"); }, 4200);
  };

  document.getElementById("search").addEventListener("input", function (e) {
    W.UI.state.query = e.target.value;
    W.UI.state.similarTo = null;
    W.UI.renderAll();
  });

  document.getElementById("saveBtn").addEventListener("click", function () {
    W.Github.publish(function (s) { W.toast(s, true); })
      .then(function (msg) { W.UI.renderAll(); W.toast(msg); })
      .catch(function (err) {
        var m = String(err && err.message || err);
        if (m === "noconfig") { W.openSettings(); W.toast("Connect your site first — fill in the three fields", true); }
        else if (m === "auth") W.toast("GitHub rejected the token — open ⚙ and paste a fresh one", true);
        else if (m === "behind") W.toast("The site changed since you loaded (phone?). Reload — your unsaved changes will be merged in automatically.", true);
        else if (m === "conflict") W.toast("Save hit a conflict — reload and try again. Local changes are safe.", true);
        else if (navigator.onLine === false) W.toast("You're offline — your changes are kept on this device. Hit Save when you're back online.", true);
        else W.toast("Save failed (" + m + ") — changes are still safe on this device", true);
      });
  });

  if (W.Store.recovered) W.toast("The site was updated elsewhere — your unsaved changes were carried over. Review, then Save.", true);

  /* theme: follows the OS until the ◐ button is used, then remembers the choice */
  var root = document.documentElement;
  function effectiveTheme() {
    return root.getAttribute("data-theme") ||
      (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function syncThemeColor() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
    m.content = getComputedStyle(document.body).backgroundColor;
  }
  document.getElementById("themeBtn").addEventListener("click", function () {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("wisdom_theme", next); } catch (e) {}
    syncThemeColor();
  });
  syncThemeColor();

  /* offline edits wait in localStorage; remind when the connection returns */
  window.addEventListener("online", function () {
    if (W.Store.pending().any) W.toast("Back online — you have unsaved changes. Hit Save to publish.");
  });

  /* installable / offline: register the service worker (not on file://) */
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  W.Modals.wire();
  W.setOwner(W.isOwner());
  W.Tagger.wire();
  W.UI.renderAll();
})();
