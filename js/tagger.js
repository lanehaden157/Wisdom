/* ---------- Tagging queue + tag manager ---------- */
window.Wisdom = window.Wisdom || {};
window.Wisdom.Tagger = (function () {
  var W = window.Wisdom;
  var C = W.config;
  var Store = W.Store;

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function $(id) { return document.getElementById(id); }

  /* ================= tagging queue ================= */
  var q = { list: [], i: 0, order: "sequential", scope: "untagged", recent: [], tagged: 0, skipped: 0, sinceSave: 0 };

  function buildList() {
    var all = Store.cards();
    if (q.scope === "category") all = all.filter(function (c) { return c.category === W.UI.state.category; });
    else if (q.scope === "untagged") all = all.filter(function (c) { return c.tags.length === 0; });
    if (q.order === "random") all.sort(function () { return Math.random() - 0.5; });
    else if (q.order === "shortest") all.sort(function (a, b) { return a.text.length - b.text.length; });
    else all.sort(function (a, b) { return a.id - b.id; });
    q.list = all;
    if (q.i >= all.length) q.i = Math.max(0, all.length - 1);
  }

  function open() {
    q.i = 0; q.tagged = 0; q.skipped = 0; q.sinceSave = 0;
    buildList();
    $("queue").classList.remove("hidden");
    render();
  }
  function closeQ() { $("queue").classList.add("hidden"); W.UI.renderAll(); }

  function pushRecent(slug) {
    q.recent = [slug].concat(q.recent.filter(function (s) { return s !== slug; })).slice(0, 12);
  }

  function render() {
    var wrap = $("queue");
    wrap.innerHTML = "";

    var bar = el("div", "queue-bar");
    bar.appendChild(el("span", null, "card " + (q.i + 1) + " / " + q.list.length +
      "  ·  " + q.tagged + " tagged  ·  " + q.skipped + " skipped"));
    bar.appendChild(el("span", "spacer"));
    var sel = document.createElement("select"); sel.className = "queue-order";
    [["untagged", "untagged only"], ["category", "this tab"], ["all", "everything"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1];
      if (o[0] === q.scope) op.selected = true; sel.appendChild(op);
    });
    sel.addEventListener("change", function () { q.scope = sel.value; q.i = 0; buildList(); render(); });
    bar.appendChild(sel);
    var ord = document.createElement("select"); ord.className = "queue-order";
    [["sequential", "in order"], ["random", "shuffled"], ["shortest", "shortest first"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1];
      if (o[0] === q.order) op.selected = true; ord.appendChild(op);
    });
    ord.addEventListener("change", function () { q.order = ord.value; buildList(); render(); });
    bar.appendChild(ord);
    var x = el("button", null, "Done"); x.addEventListener("click", closeQ); bar.appendChild(x);
    wrap.appendChild(bar);

    if (!q.list.length) {
      wrap.appendChild(el("div", "queue-card", "Nothing in this queue — every card here is tagged."));
      return;
    }

    var card = q.list[q.i];
    var live = Store.cards().filter(function (c) { return c.id === card.id; })[0] || card;

    var scroll = el("div", "queue-scroll");
    var qc = el("div", "queue-card");
    qc.appendChild(el("span", "id", "No. " + String(live.id).padStart(4, "0") + " · " + live.category));
    qc.appendChild(el("div", "quote", live.text));
    scroll.appendChild(qc);

    var chosen = new Set(live.tags);

    var originWrap = el("div", "field-row");
    originWrap.appendChild(el("span", "field-label", "origin"));
    W.segmented(originWrap, [{ value: null, label: "—" }].concat(
      C.origins.map(function (v) { return { value: v, label: C.originLabel[v] }; })),
      live.origin, function (v) { Store.setOrigin(live.id, v); });
    scroll.appendChild(originWrap);

    if (q.recent.length) {
      scroll.appendChild(el("span", "field-label", "recent"));
      var rr = el("div", "chip-row");
      q.recent.forEach(function (s) {
        var tm = Store.tagsMap().tags[s];
        var chip = el("button", "chip" + (chosen.has(s) ? " active" : ""), tm ? tm.label : s);
        chip.type = "button";
        if (tm) chip.setAttribute("data-group", tm.group);
        chip.addEventListener("click", function () {
          var cur = Store.toggleTag(live.id, s);
          chosen = new Set(cur); pushRecent(s); render();
        });
        rr.appendChild(chip);
      });
      scroll.appendChild(rr);
    }

    var picker = el("div");
    W.tagPicker(picker, chosen, function () {
      Store.setTags(live.id, Array.from(chosen));
      Array.from(chosen).forEach(pushRecent);
    });
    scroll.appendChild(picker);
    wrap.appendChild(scroll);

    var nav = el("div", "queue-nav");
    var back = el("button", null, "‹ Back");
    back.addEventListener("click", function () { if (q.i > 0) { q.i--; render(); } });
    var skip = el("button", null, "Skip");
    skip.addEventListener("click", function () { q.skipped++; advance(); });
    var next = el("button", "primary", "Next ›");
    next.addEventListener("click", function () {
      if (Store.cards().filter(function (c) { return c.id === live.id; })[0].tags.length) q.tagged++;
      advance();
    });
    nav.appendChild(back); nav.appendChild(skip); nav.appendChild(next);
    wrap.appendChild(nav);
  }

  function advance() {
    q.sinceSave++;
    if (q.sinceSave >= C.savePromptEvery) { q.sinceSave = 0; W.toast("Tip: hit Save to publish your tagging so far", true); }
    if (q.i < q.list.length - 1) { q.i++; render(); }
    else { W.toast("End of the queue"); closeQ(); }
  }

  /* ================= tag manager ================= */
  function openManager() {
    var m = $("tagManModal");
    var body = $("tagManBody");
    function draw() {
      body.innerHTML = "";
      var tm = Store.tagsMap();
      var counts = Store.tagCountsFor(Store.cards());
      var slugs = Object.keys(tm.tags).sort(function (a, b) { return (counts[b] || 0) - (counts[a] || 0); });
      if (!slugs.length) body.appendChild(el("p", "modal-hint", "No tags yet — create them as you tag cards."));
      slugs.forEach(function (s) {
        var row = el("div", "tagman-row");
        row.setAttribute("data-group", tm.tags[s].group);
        var name = el("span", "slug", tm.tags[s].label);
        name.title = s;
        row.appendChild(name);
        row.appendChild(el("span", "count", String(counts[s] || 0)));

        var grp = document.createElement("select");
        (tm.order || []).forEach(function (g) {
          var o = document.createElement("option"); o.value = g; o.textContent = g;
          if (g === tm.tags[s].group) o.selected = true; grp.appendChild(o);
        });
        grp.addEventListener("change", function () { Store.setTagGroup(s, grp.value); draw(); });
        row.appendChild(grp);

        var ren = el("button", null, "rename");
        ren.addEventListener("click", function () {
          var v = prompt("Rename tag", tm.tags[s].label);
          if (v) { Store.renameTag(s, v); draw(); }
        });
        row.appendChild(ren);

        var mrg = el("button", null, "merge→");
        mrg.addEventListener("click", function () {
          var into = prompt("Merge “" + tm.tags[s].label + "” into which tag slug?\n\n" + slugs.join(", "));
          if (into && tm.tags[into]) { Store.mergeTags(s, into); draw(); }
        });
        row.appendChild(mrg);

        var del = el("button", null, "delete");
        del.addEventListener("click", function () {
          if (confirm("Delete “" + tm.tags[s].label + "” and remove it from " + (counts[s] || 0) + " cards?")) { Store.deleteTag(s); draw(); }
        });
        row.appendChild(del);
        body.appendChild(row);
      });
    }
    draw();
    m.classList.remove("hidden");
  }

  function wire() {
    $("tagBtn").addEventListener("click", open);
    $("tagManBtn").addEventListener("click", openManager);
    $("tagManClose").addEventListener("click", function () { $("tagManModal").classList.add("hidden"); W.UI.renderAll(); });
    $("tagManModal").addEventListener("click", function (e) {
      if (e.target === $("tagManModal")) { $("tagManModal").classList.add("hidden"); W.UI.renderAll(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("queue").classList.contains("hidden")) closeQ();
    });
  }

  return { wire: wire, openQueue: open, openManager: openManager };
})();
