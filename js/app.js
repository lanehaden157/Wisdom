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
    W.UI.renderAll();
  });

  document.getElementById("saveBtn").addEventListener("click", function () {
    W.Github.publish(function (s) { W.toast(s, true); })
      .then(function (msg) { W.UI.renderAll(); W.toast(msg); })
      .catch(function (err) {
        var m = String(err && err.message || err);
        if (m === "noconfig") { W.openSettings(); W.toast("Connect your site first — fill in the three fields", true); }
        else if (m === "auth") W.toast("GitHub rejected the token — open ⚙ and paste a fresh one", true);
        else if (m === "behind") W.toast("The site changed since you loaded (phone?). Reload, then Save again.", true);
        else if (m === "conflict") W.toast("Save hit a conflict — reload and try again. Local changes are safe.", true);
        else W.toast("Save failed (" + m + ") — changes are still safe on this device", true);
      });
  });

  W.Modals.wire();
  W.Tagger.wire();
  W.UI.renderAll();
})();
