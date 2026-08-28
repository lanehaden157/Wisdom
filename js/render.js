/* ---------- Tabs, facet nav, results grid ---------- */
window.Wisdom = window.Wisdom || {};
window.Wisdom.UI = (function () {
  var W = window.Wisdom;
  var C = W.config;
  var Store = W.Store;

  var state = { category: "quote", query: "", selectedTags: new Set() };
  var facetOpen = {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function isReading(cat) { return C.readingCategories.indexOf(cat) !== -1; }

  function inCategory(cards) {
    return cards.filter(function (c) { return c.category === state.category; });
  }
  function matches(c) {
    var q = state.query.trim().toLowerCase();
    if (q && c.text.toLowerCase().indexOf(q) === -1) return false;
    if (state.selectedTags.size) {
      if (state.selectedTags.has("__untagged__")) return c.tags.length === 0;
      if (!c.tags.some(function (t) { return state.selectedTags.has(t); })) return false;
    }
    return true;
  }

  /* ---- tabs ---- */
  function renderTabs(all) {
    var bar = document.getElementById("tabs");
    bar.innerHTML = "";
    var counts = {};
    all.forEach(function (c) { counts[c.category] = (counts[c.category] || 0) + 1; });
    C.categories.forEach(function (cat) {
      var b = el("button", "tab");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", state.category === cat ? "true" : "false");
      b.innerHTML = C.categoryLabel[cat] + "<span class='n'>" + (counts[cat] || 0) + "</span>";
      b.addEventListener("click", function () {
        if (state.category === cat) return;
        state.category = cat;
        state.selectedTags.clear();
        renderAll();
      });
      bar.appendChild(b);
    });
  }

  /* ---- facet nav ---- */
  function groupsForView(counts) {
    var tm = Store.tagsMap();
    var groups = {};
    (tm.order || []).forEach(function (g) {
      var gc = (tm.groups && tm.groups[g]) || {};
      if (gc.categories && gc.categories.indexOf(state.category) === -1) return;
      groups[g] = [];
    });
    Object.keys(counts).forEach(function (slug) {
      var t = tm.tags[slug];
      var g = t ? t.group : "Other";
      if (!groups[g]) groups[g] = [];
      groups[g].push(slug);
    });
    Object.keys(groups).forEach(function (g) {
      groups[g].sort(function (a, b) { return counts[b] - counts[a]; });
    });
    return groups;
  }

  function renderFacets(viewCards) {
    var nav = document.getElementById("facetNav");
    nav.innerHTML = "";
    var counts = Store.tagCountsFor(viewCards);
    var groups = groupsForView(counts);
    var tm = Store.tagsMap();
    var order = (tm.order || []).slice();
    Object.keys(groups).forEach(function (g) { if (order.indexOf(g) === -1) order.push(g); });

    var untagged = viewCards.filter(function (c) { return c.tags.length === 0; }).length;

    order.forEach(function (g) {
      var slugs = groups[g];
      if (!slugs || !slugs.length) return;
      var det = el("details", "facet-group");
      det.setAttribute("data-group", g);
      det.open = !!facetOpen[g];
      det.addEventListener("toggle", function () { facetOpen[g] = det.open; });
      var sum = el("summary");
      sum.appendChild(el("span", null, g));
      var active = slugs.filter(function (s) { return state.selectedTags.has(s); });
      if (active.length) sum.appendChild(el("span", "active-hint", active.join(", ")));
      sum.appendChild(el("span", "arrow", "›"));
      det.appendChild(sum);
      var row = el("div", "chip-row");
      slugs.forEach(function (slug) {
        var t = tm.tags[slug];
        var chip = el("button", "chip" + (state.selectedTags.has(slug) ? " active" : ""));
        chip.type = "button";
        chip.setAttribute("data-group", g);
        chip.innerHTML = (t ? t.label : slug) + "<span class='n'>" + counts[slug] + "</span>";
        chip.addEventListener("click", function () {
          if (state.selectedTags.has(slug)) state.selectedTags.delete(slug);
          else state.selectedTags.add(slug);
          renderAll();
        });
        row.appendChild(chip);
      });
      det.appendChild(row);
      nav.appendChild(det);
    });

    if (untagged) {
      var d = el("details", "facet-group");
      d.open = !!facetOpen.__untagged;
      d.addEventListener("toggle", function () { facetOpen.__untagged = d.open; });
      var s = el("summary");
      s.appendChild(el("span", null, "Untagged"));
      s.appendChild(el("span", "arrow", "›"));
      d.appendChild(s);
      var r = el("div", "chip-row");
      var ch = el("button", "chip" + (state.selectedTags.has("__untagged__") ? " active" : ""));
      ch.type = "button";
      ch.innerHTML = "show untagged<span class='n'>" + untagged + "</span>";
      ch.addEventListener("click", function () {
        if (state.selectedTags.has("__untagged__")) state.selectedTags.delete("__untagged__");
        else { state.selectedTags.clear(); state.selectedTags.add("__untagged__"); }
        renderAll();
      });
      r.appendChild(ch);
      d.appendChild(r);
      nav.appendChild(d);
    }
  }

  /* ---- grid ---- */
  function renderGrid(viewCards) {
    var grid = document.getElementById("grid");
    var meta = document.getElementById("resultsMeta");
    var reading = isReading(state.category);
    grid.className = "grid" + (reading ? " reading" : "");
    var filtered = viewCards.filter(matches);

    meta.innerHTML = "";
    var desc = [];
    if (state.selectedTags.size) {
      desc.push(state.selectedTags.has("__untagged__") ? "untagged"
        : "tagged " + Array.from(state.selectedTags).join(" or "));
    }
    if (state.query.trim()) desc.push('matching "' + state.query.trim() + '"');
    meta.appendChild(el("span", null,
      filtered.length + " of " + viewCards.length + " " + C.categoryLabel[state.category].toLowerCase() +
      (desc.length ? " — " + desc.join(", ") : "")));
    if (state.selectedTags.size || state.query.trim()) {
      var clr = el("button", "ghost", "Clear");
      clr.addEventListener("click", function () {
        state.query = ""; state.selectedTags.clear();
        document.getElementById("search").value = "";
        renderAll();
      });
      meta.appendChild(clr);
    }

    grid.innerHTML = "";
    if (!filtered.length) {
      grid.appendChild(el("div", "empty-state", "Nothing filed under that yet."));
      return;
    }
    var tm = Store.tagsMap();
    filtered.forEach(function (c) {
      var card = el("div", "card" + (reading ? " reading " + c.category : ""));
      if (c.origin) card.setAttribute("data-origin", c.origin);
      if (c.edited || c.added) {
        card.appendChild(el("span", "draft-badge", c.added ? "unfiled" : "edited"));
      }
      card.appendChild(el("span", "id", "No. " + String(c.id).padStart(4, "0")));
      card.appendChild(el("div", "quote", c.text));
      var foot = el("div", "card-foot");
      var tags = el("div", "tags");
      if (c.tags.length) {
        c.tags.forEach(function (slug) {
          var t = tm.tags[slug];
          var chip = el("button", "tag-chip", t ? t.label : slug);
          chip.type = "button";
          if (t) chip.setAttribute("data-group", t.group);
          chip.addEventListener("click", function () {
            state.selectedTags.clear(); state.selectedTags.add(slug);
            window.scrollTo({ top: 0, behavior: "smooth" });
            renderAll();
          });
          tags.appendChild(chip);
        });
      } else {
        tags.appendChild(el("span", "tag-chip untagged", "untagged"));
      }
      foot.appendChild(tags);
      var edit = el("button", "edit-btn", "edit");
      edit.type = "button";
      edit.addEventListener("click", function () { W.Modals.openEdit(c); });
      foot.appendChild(edit);
      card.appendChild(foot);
      grid.appendChild(card);
    });
  }

  function renderPending() {
    var note = document.getElementById("pendingNote");
    var p = Store.pending();
    if (!p.any) { note.classList.add("hidden"); note.innerHTML = ""; return; }
    var bits = [];
    if (p.quotes) bits.push(p.quotes + " card" + (p.quotes > 1 ? "s" : ""));
    if (p.assign) bits.push("tags");
    if (p.origins) bits.push("origins");
    if (p.tags) bits.push("tag list");
    note.classList.remove("hidden");
    note.textContent = "Unsaved: " + bits.join(", ") + " — hit Save to publish.";
  }

  function renderAll() {
    var all = Store.cards();
    renderTabs(all);
    var view = inCategory(all);
    renderFacets(view);
    renderGrid(view);
    renderPending();
  }

  return { state: state, renderAll: renderAll, inCategory: inCategory, matches: matches };
})();
