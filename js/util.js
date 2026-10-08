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
  }
};
