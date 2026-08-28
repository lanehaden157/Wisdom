/* ---------- Edit modal, settings modal, draw overlay ---------- */
window.Wisdom = window.Wisdom || {};
window.Wisdom.Modals = (function () {
  var W = window.Wisdom;
  var C = W.config;
  var Store = W.Store;

  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function $(id) { return document.getElementById(id); }

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

  /* ---- shared: grouped tag picker with inline create ---- */
  function tagPicker(container, chosenSet, onChange) {
    function draw() {
      container.innerHTML = "";
      var tm = Store.tagsMap();
      var order = (tm.order || []).slice();
      var bySlug = tm.tags;
      var byGroup = {};
      Object.keys(bySlug).forEach(function (s) {
        var g = bySlug[s].group || "Other";
        (byGroup[g] = byGroup[g] || []).push(s);
      });
      Object.keys(byGroup).forEach(function (g) { if (order.indexOf(g) === -1) order.push(g); });

      order.forEach(function (g) {
        var slugs = (byGroup[g] || []).sort();
        if (!slugs.length) return;
        var lbl = el("span", "field-label", g);
        lbl.setAttribute("data-group", g);
        container.appendChild(lbl);
        var row = el("div", "chip-row");
        slugs.forEach(function (s) {
          var chip = el("button", "chip" + (chosenSet.has(s) ? " active" : ""), bySlug[s].label);
          chip.type = "button";
          chip.setAttribute("data-group", g);
          chip.addEventListener("click", function () {
            if (chosenSet.has(s)) chosenSet.delete(s); else chosenSet.add(s);
            chip.classList.toggle("active");
            onChange();
          });
          row.appendChild(chip);
        });
        container.appendChild(row);
      });

      var mk = el("div", "field-row");
      var inp = document.createElement("input");
      inp.className = "cfg-input";
      inp.placeholder = "new tag…";
      inp.style.flex = "1";
      var grp = document.createElement("select");
      grp.className = "cfg-input";
      grp.style.flex = "0 0 40%";
      var defaultGroup = "Concept";
      (Store.tagsMap().order || [defaultGroup]).forEach(function (g) {
        var o = document.createElement("option"); o.value = g; o.textContent = g;
        if (g === defaultGroup) o.selected = true;
        grp.appendChild(o);
      });
      var add = el("button", null, "+ create");
      add.type = "button";
      add.style.cssText = "font-family:'IBM Plex Mono',monospace;font-size:.72rem;border:1px solid var(--rule);background:var(--accent);color:#F3EEE1;border-radius:4px;padding:8px 12px;cursor:pointer";
      function create() {
        var label = inp.value.trim();
        if (!label) return;
        var slug = Store.createTag(label, grp.value);
        if (slug) { chosenSet.add(slug); inp.value = ""; draw(); onChange(); }
      }
      add.addEventListener("click", create);
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); create(); } });
      mk.appendChild(inp); mk.appendChild(grp); mk.appendChild(add);
      container.appendChild(mk);
    }
    draw();
  }
  W.tagPicker = tagPicker;
  W.segmented = segmented;

  /* ---- edit modal ---- */
  var modal, card = null, chosen = new Set(), cat = "quote", origin = null, delArmed = false;

  function openEdit(c) {
    modal = $("editModal");
    card = c || null;
    delArmed = false;
    chosen = new Set(card ? card.tags : []);
    cat = card ? card.category : W.UI.state.category;
    origin = card ? card.origin : null;

    $("modalTitle").textContent = card ? "Edit No. " + String(card.id).padStart(4, "0") : "File a new card";
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

    modal.classList.remove("hidden");
    if (!card) $("editQuoteText").focus();
  }
  function close() { modal.classList.add("hidden"); card = null; }

  function wire() {
    $("addBtn").addEventListener("click", function () { openEdit(null); });
    $("cancelEdit").addEventListener("click", close);
    $("editModal").addEventListener("click", function (e) { if (e.target === $("editModal")) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("editModal").classList.contains("hidden")) close();
    });
    $("saveEdit").addEventListener("click", function () {
      var text = $("editQuoteText").value.trim();
      if (!text) { $("editQuoteText").focus(); return; }
      var id = card ? card.id : Store.addCard(text, cat);
      if (card) Store.editCard(id, text, cat);
      Store.setTags(id, Array.from(chosen));
      Store.setOrigin(id, origin);
      close();
      W.UI.renderAll();
    });
    $("deleteCard").addEventListener("click", function () {
      if (!card) return;
      if (!delArmed) { delArmed = true; this.textContent = "Tap again to remove"; this.classList.add("confirming"); return; }
      Store.deleteCard(card.id);
      close();
      W.UI.renderAll();
    });

    /* settings */
    var sm = $("settingsModal");
    function openSettings() {
      var cfg = W.Github.loadConfig() || {};
      $("cfgOwner").value = cfg.owner || "";
      $("cfgRepo").value = cfg.repo || "";
      $("cfgToken").value = cfg.token || "";
      sm.classList.remove("hidden");
    }
    function closeSettings() {
      ["cfgOwner", "cfgRepo", "cfgToken"].forEach(function (i) { $(i).value = ""; });
      sm.classList.add("hidden");
    }
    W.openSettings = openSettings;
    $("settingsBtn").addEventListener("click", openSettings);
    $("cfgCancel").addEventListener("click", closeSettings);
    sm.addEventListener("click", function (e) { if (e.target === sm) closeSettings(); });
    $("cfgSave").addEventListener("click", function () {
      var cfg = { owner: $("cfgOwner").value.trim(), repo: $("cfgRepo").value.trim(), token: $("cfgToken").value.trim() };
      if (!cfg.owner || !cfg.repo || !cfg.token) { W.toast("All three fields are needed"); return; }
      W.Github.saveConfig(cfg); closeSettings();
      W.toast("Connected — Save now writes to your site");
    });
    $("cfgClear").addEventListener("click", function () { W.Github.clearConfig(); closeSettings(); W.toast("Token forgotten on this device"); });

    /* draw */
    var ov = $("drawOverlay"), last = null;
    function pool() {
      var v = W.UI.inCategory(Store.cards()).filter(W.UI.matches);
      return v.length ? v : W.UI.inCategory(Store.cards());
    }
    function one() {
      var p = pool(), pick;
      if (p.length === 1) pick = p[0];
      else do { pick = p[Math.floor(Math.random() * p.length)]; } while (pick.id === last);
      last = pick.id;
      $("drawId").textContent = "No. " + String(pick.id).padStart(4, "0");
      $("drawQuote").textContent = pick.text;
      var tw = $("drawTags"); tw.innerHTML = "";
      var tm = Store.tagsMap();
      pick.tags.forEach(function (s) {
        var ch = el("button", "tag-chip", tm.tags[s] ? tm.tags[s].label : s);
        ch.type = "button";
        if (tm.tags[s]) ch.setAttribute("data-group", tm.tags[s].group);
        ch.addEventListener("click", function () {
          ov.classList.add("hidden");
          W.UI.state.selectedTags.clear(); W.UI.state.selectedTags.add(s);
          W.UI.renderAll();
        });
        tw.appendChild(ch);
      });
    }
    $("drawBtn").addEventListener("click", function () { ov.classList.remove("hidden"); one(); $("drawAgain").focus(); });
    $("drawAgain").addEventListener("click", one);
    $("drawClose").addEventListener("click", function () { ov.classList.add("hidden"); });
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.classList.add("hidden"); });
  }

  return { openEdit: openEdit, wire: wire };
})();
