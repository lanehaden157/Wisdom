/* ---------- Small shared helpers ---------- */
window.Wisdom = window.Wisdom || {};
window.Wisdom.util = {
  /* DOM element with class + textContent (never innerHTML — card/tag text is user data) */
  el: function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  },
  $: function (id) { return document.getElementById(id); },
  /* "No. 0042" */
  cardNo: function (id) { return "No. " + String(id).padStart(4, "0"); },
  /* label text followed by a small count badge */
  withCount: function (label, n) {
    var frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode(label));
    var s = document.createElement("span"); s.className = "n"; s.textContent = n;
    frag.appendChild(s);
    return frag;
  },
  /* tiny localStorage helpers: storage can be blocked, never let that break the page */
  lsGet: function (k, fallback) {
    try { var v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  lsSet: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- Dialog manager: focus trap, Escape, focus restore ----------
   Every overlay (edit, settings, tag manager, draw, tagging queue) opens through
   Dialog.show(root, {onClose, focus}) and closes through Dialog.hide(root).
   Escape closes the top-most one (via onClose, which should call hide). */
window.Wisdom.Dialog = (function () {
  var stack = [];
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (n) {
      return n.offsetParent !== null || n === document.activeElement;
    });
  }
  function top() { return stack[stack.length - 1]; }

  function show(root, opts) {
    opts = opts || {};
    if (!root.getAttribute("role")) root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.classList.remove("hidden");
    stack = stack.filter(function (e) { return e.root !== root; });
    stack.push({ root: root, onClose: opts.onClose, opener: document.activeElement });
    var f = opts.focus || focusables(root)[0];
    if (f) f.focus();
  }
  function hide(root) {
    root.classList.add("hidden");
    var i = -1;
    stack.forEach(function (e, k) { if (e.root === root) i = k; });
    if (i === -1) return;
    var entry = stack.splice(i, 1)[0];
    var o = entry.opener;
    if (o && document.contains(o) && typeof o.focus === "function") o.focus();
  }

  document.addEventListener("keydown", function (e) {
    var t = top();
    if (!t) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (t.onClose) t.onClose(); else hide(t.root);
      return;
    }
    if (e.key !== "Tab") return;
    var items = focusables(t.root);
    if (!items.length) { e.preventDefault(); return; }
    var first = items[0], last = items[items.length - 1], a = document.activeElement;
    if (!t.root.contains(a)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  });

  return { show: show, hide: hide };
})();
