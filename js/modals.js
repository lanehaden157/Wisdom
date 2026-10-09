/* ---------- Edit modal, settings modal, draw overlay ---------- */
window.Wisdom = window.Wisdom || {};
window.Wisdom.Modals = (function () {
  var W = window.Wisdom;
  var C = W.config;
  var Store = W.Store;

  var el = W.util.el, $ = W.util.$, cardNo = W.util.cardNo;

  /* ---- shared: segmented control ---- */
  function segmented(container, options, current, onPick) {
    container.innerHTML = "";
    var seg = el("div", "seg");
    options.forEach(function (o) {
      var b = el("button", null, o.label);
      b.type = "button";
      b.setAttribute("aria-pressed", o.value === current ? "true" : "false");
      b.addEventListener("click", function () {
        current = o.value;
        Array.prototype.forEach.call(seg.children, function (c) { c.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        onPick(o.value);
      });
      seg.appendChild(b);
    });
    container.appendChild(seg);
  }

  /* ---- recently used tags (per device, survives publishes) ---- */
  var RECENT_KEY = "wisdom_recent_tags_v1";
  function recentTags() {
    var tags = Store.tagsMap().tags;
    return W.util.lsGet(RECENT_KEY, []).filter(function (s) { return tags[s]; });
  }
  function noteRecent(slug) {
    var r = recentTags().filter(function (s) { return s !== slug; });
    W.util.lsSet(RECENT_KEY, [slug].concat(r).slice(0, 10));
  }

  /* ---- shared: fast tag picker ----
     Selected tags on top (tap to drop), search-to-pick, recent tags, and the
     full grouped list tucked behind "Browse all". Enter in the search box picks
     the single match or creates the tag. */
  function tagPicker(container, chosenSet, onChange) {
    container.innerHTML = "";
    var selBox = el("div", "picker-sel");
    var search = document.createElement("input");
    search.type = "search"; search.className = "picker-search";
    search.placeholder = "Find or add a tag…";
    search.setAttribute("aria-label", "Find or add a tag");
    search.autocomplete = "off";
    var hits = el("div", "picker-hits");
    var recentBox = el("div");
    var all = el("details", "picker-all");
    all.appendChild(el("summary", null, "Browse all tags"));
    var allBody = el("div");
    all.appendChild(allBody);
    [selBox, search, hits, recentBox, all].forEach(function (n) { container.appendChild(n); });

    function tagChip(slug, extra) {
      var t = Store.tagsMap().tags[slug];
      var on = chosenSet.has(slug);
      var chip = el("button", "chip" + (on ? " active" : ""), t ? t.label : slug);
      chip.type = "button";
      chip.setAttribute("aria-pressed", on ? "true" : "false");
      if (t) chip.setAttribute("data-group", t.group);
      chip.addEventListener("click", function () { toggle(slug); });
      return chip;
    }
    function toggle(slug) {
      if (chosenSet.has(slug)) chosenSet.delete(slug); else { chosenSet.add(slug); noteRecent(slug); }
      onChange();
      redraw();
    }
    function matchesFor(q) {
      var tags = Store.tagsMap().tags;
      q = q.trim().toLowerCase();
      if (!q) return [];
      return Object.keys(tags).filter(function (s) {
        return tags[s].label.toLowerCase().indexOf(q) !== -1 || s.indexOf(q) !== -1;
      }).sort(function (a, b) {
        var ap = tags[a].label.toLowerCase().indexOf(q) === 0 ? 0 : 1;
        var bp = tags[b].label.toLowerCase().indexOf(q) === 0 ? 0 : 1;
        return ap - bp || tags[a].label.localeCompare(tags[b].label);
      });
    }
    function exact(q) {
      var tags = Store.tagsMap().tags;
      q = q.trim().toLowerCase();
      return Object.keys(tags).filter(function (s) { return tags[s].label.toLowerCase() === q; })[0];
    }
    function create(q) {
      var slug = Store.createTag(q.trim(), "Concept");
      if (slug) { chosenSet.add(slug); noteRecent(slug); search.value = ""; onChange(); redraw(); }
    }

    function redraw() {
      var tm = Store.tagsMap();
      selBox.innerHTML = "";
      Array.from(chosenSet).forEach(function (s) {
        var t = tm.tags[s];
        var chip = el("button", "chip active", t ? t.label : s);
        chip.type = "button";
        chip.setAttribute("aria-label", "Remove tag " + (t ? t.label : s));
        if (t) chip.setAttribute("data-group", t.group);
        chip.appendChild(el("span", "x", "×"));
        chip.addEventListener("click", function () { toggle(s); });
        selBox.appendChild(chip);
      });

      hits.innerHTML = "";
      var q = search.value;
      if (q.trim()) {
        var row = el("div", "chip-row");
        matchesFor(q).slice(0, 12).forEach(function (s) { row.appendChild(tagChip(s)); });
        if (!exact(q)) {
          var mk = el("button", "chip create", "+ create “" + q.trim() + "”");
          mk.type = "button";
          mk.addEventListener("click", function () { create(q); });
          row.appendChild(mk);
        }
        hits.appendChild(row);
      }

      recentBox.innerHTML = "";
      var rec = recentTags();
      if (rec.length && !q.trim()) {
        recentBox.appendChild(el("span", "field-label", "recent"));
        var rr = el("div", "chip-row");
        rec.forEach(function (s, i) {
          var ch = tagChip(s);
          if (i < 9) ch.setAttribute("data-key", i + 1);   /* tagging queue: press 1-9 */
          rr.appendChild(ch);
        });
        recentBox.appendChild(rr);
      }

      allBody.innerHTML = "";
      var order = (tm.order || []).slice(), byGroup = {};
      Object.keys(tm.tags).forEach(function (s) {
        var g = tm.tags[s].group || "Other";
        (byGroup[g] = byGroup[g] || []).push(s);
      });
      Object.keys(byGroup).forEach(function (g) { if (order.indexOf(g) === -1) order.push(g); });
      order.forEach(function (g) {
        var slugs = (byGroup[g] || []).sort();
        if (!slugs.length) return;
        var lbl = el("span", "field-label", g);
        lbl.setAttribute("data-group", g);
        allBody.appendChild(lbl);
        var gr = el("div", "chip-row");
        slugs.forEach(function (s) { gr.appendChild(tagChip(s)); });
        allBody.appendChild(gr);
      });
    }

    search.addEventListener("input", redraw);
    search.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      var q = search.value;
      if (!q.trim()) return;
      var ex = exact(q), m = matchesFor(q);
      if (ex) { toggle(ex); search.value = ""; redraw(); }
      else if (m.length === 1) { toggle(m[0]); search.value = ""; redraw(); }
      else if (!m.length) create(q);
    });
    redraw();
  }
  W.tagPicker = tagPicker;
  W.segmented = segmented;

  /* ---- owner mode: edit controls only exist while a token is connected ---- */
  function setOwner(on) {
    if (on) document.documentElement.setAttribute("data-owner", "1");
    else document.documentElement.removeAttribute("data-owner");
    document.body.classList.toggle("owner", !!on);
  }
  W.setOwner = setOwner;
  function isOwner() { var c = W.Github.loadConfig(); return !!(c && c.token); }
  W.isOwner = isOwner;

  /* ---- edit modal ---- */
  var modal, card = null, chosen = new Set(), cat = "quote", origin = null, delArmed = false, afterEdit = null;

  function openEdit(c, onDone) {
    modal = $("editModal");
    card = c || null;
    afterEdit = onDone || null;
    delArmed = false;
    chosen = new Set(card ? card.tags : []);
    cat = card ? card.category : W.UI.state.category;
    origin = card ? card.origin : null;

    $("modalTitle").textContent = card ? "Edit " + cardNo(card.id) : "File a new card";
    $("saveEdit").textContent = card ? "Save changes" : "File this card";
    $("editQuoteText").value = card ? card.text : "";
    var del = $("deleteCard");
    del.style.display = card ? "" : "none";
    del.textContent = "Remove card"; del.classList.remove("confirming");

    segmented($("editCategory"), C.categories.map(function (v) { return { value: v, label: C.categoryLabel[v] }; }),
      cat, function (v) { cat = v; });
    segmented($("editOrigin"),
      [{ value: null, label: "—" }].concat(C.origins.map(function (v) { return { value: v, label: C.originLabel[v] }; })),
      origin, function (v) { origin = v; });
    tagPicker($("modalFacets"), chosen, function () {});

    W.Dialog.show(modal, { onClose: close, focus: card ? $("cancelEdit") : $("editQuoteText") });
  }
  function close() { W.Dialog.hide(modal); card = null; }
  function done() { var f = afterEdit; afterEdit = null; W.UI.renderAll(); if (f) f(); }

  function wire() {
    $("addBtn").addEventListener("click", function () { openEdit(null); });
    $("cancelEdit").addEventListener("click", close);
    $("editModal").addEventListener("click", function (e) { if (e.target === $("editModal")) close(); });
    $("saveEdit").addEventListener("click", function () {
      var text = $("editQuoteText").value.trim();
      if (!text) { $("editQuoteText").focus(); return; }
      var id = card ? card.id : Store.addCard(text, cat);
      if (card) Store.editCard(id, text, cat);
      Store.setTags(id, Array.from(chosen));
      Store.setOrigin(id, origin);
      close();
      done();
    });
    $("deleteCard").addEventListener("click", function () {
      if (!card) return;
      if (!delArmed) { delArmed = true; this.textContent = "Tap again to remove"; this.classList.add("confirming"); return; }
      Store.deleteCard(card.id);
      close();
      done();
    });

    /* settings */
    var sm = $("settingsModal");
    function openSettings() {
      var cfg = W.Github.loadConfig() || {};
      $("cfgOwner").value = cfg.owner || "";
      $("cfgRepo").value = cfg.repo || "";
      $("cfgToken").value = cfg.token || "";
      W.Dialog.show(sm, { onClose: closeSettings });
    }
    function closeSettings() {
      ["cfgOwner", "cfgRepo", "cfgToken"].forEach(function (i) { $(i).value = ""; });
      W.Dialog.hide(sm);
    }
    W.openSettings = openSettings;
    $("settingsBtn").addEventListener("click", openSettings);
    $("cfgCancel").addEventListener("click", closeSettings);
    sm.addEventListener("click", function (e) { if (e.target === sm) closeSettings(); });
    $("cfgSave").addEventListener("click", function () {
      var cfg = { owner: $("cfgOwner").value.trim(), repo: $("cfgRepo").value.trim(), token: $("cfgToken").value.trim() };
      if (!cfg.owner || !cfg.repo || !cfg.token) { W.toast("All three fields are needed"); return; }
      W.Github.saveConfig(cfg); closeSettings();
      setOwner(true); W.UI.renderAll();
      W.toast("Connected — Save now writes to your site");
    });
    $("cfgClear").addEventListener("click", function () {
      W.Github.clearConfig(); closeSettings();
      setOwner(false); W.UI.renderAll();
      W.toast("Token forgotten on this device");
    });

    /* draw - keeps a history so Back returns to the previous card */
    var ov = $("drawOverlay"), hist = [], pos = -1;
    function byId(id) { return Store.cards().filter(function (c) { return c.id === id; })[0]; }
    function pool() {
      var v = W.UI.inCategory(Store.cards()).filter(W.UI.matches);
      return v.length ? v : W.UI.inCategory(Store.cards());
    }
    function paint() {
      var pick = byId(hist[pos]);
      while (!pick && hist.length) {            /* card was removed meanwhile */
        hist.splice(pos, 1); pos = Math.min(pos, hist.length - 1);
        pick = hist.length ? byId(hist[pos]) : null;
      }
      if (!pick) { fresh(); return; }
      $("drawId").textContent = cardNo(pick.id);
      $("drawQuote").textContent = pick.text;
      var tw = $("drawTags"); tw.innerHTML = "";
      var tm = Store.tagsMap();
      pick.tags.forEach(function (s) {
        var ch = el("button", "tag-chip", tm.tags[s] ? tm.tags[s].label : s);
        ch.type = "button";
        if (tm.tags[s]) ch.setAttribute("data-group", tm.tags[s].group);
        ch.addEventListener("click", function () {
          closeDraw();
          W.UI.state.selectedTags.clear(); W.UI.state.selectedTags.add(s);
          W.UI.renderAll();
        });
        tw.appendChild(ch);
      });
      $("drawBack").disabled = pos <= 0;
    }
    function fresh() {
      var p = pool(), cur = hist[pos], pick;
      if (!p.length) return;
      if (p.length === 1) pick = p[0];
      else do { pick = p[Math.floor(Math.random() * p.length)]; } while (pick.id === cur);
      hist = hist.slice(0, pos + 1); hist.push(pick.id);
      if (hist.length > 60) hist.shift();
      pos = hist.length - 1;
      paint();
    }
    function again() { if (pos < hist.length - 1) { pos++; paint(); } else fresh(); }
    function closeDraw() { W.Dialog.hide(ov); }
    $("drawBtn").addEventListener("click", function () {
      W.Dialog.show(ov, { onClose: closeDraw, focus: $("drawAgain") });
      fresh();
    });
    $("drawAgain").addEventListener("click", again);
    $("drawBack").addEventListener("click", function () { if (pos > 0) { pos--; paint(); } });
    $("drawEdit").addEventListener("click", function () {
      var c = byId(hist[pos]);
      if (c) openEdit(c, paint);
    });
    $("drawClose").addEventListener("click", closeDraw);
    ov.addEventListener("click", function (e) { if (e.target === ov) closeDraw(); });
  }

  return { openEdit: openEdit, wire: wire };
})();
