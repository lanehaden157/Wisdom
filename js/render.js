/* ---------- Tabs, facet nav, results grid ---------- */
window.Wisdom = window.Wisdom || {};
window.Wisdom.UI = (function () {
  var W = window.Wisdom;
  var C = W.config;
  var Store = W.Store;
  var el = W.util.el, cardNo = W.util.cardNo;

  var state = { category: "quote", query: "", selectedTags: new Set(), tagMode: "and", similarTo: null };
  var facetOpen = {};
  var PAGE = 60, shown = PAGE, lastSig = "";   /* render a page at a time: ~900 cards at once froze phones */

  function isReading(cat) { return C.readingCategories.indexOf(cat) !== -1; }

  function inCategory(cards) {
    return cards.filter(function (c) { return c.category === state.category; });
  }
  function matches(c) {
    if (state.selectedTags.size) {
      if (state.selectedTags.has("__untagged__")) return c.tags.length === 0;
      var picked = Array.from(state.selectedTags);
      var has = function (t) { return c.tags.indexOf(t) !== -1; };
      if (state.tagMode === "or" ? !picked.some(has) : !picked.every(has)) return false;
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
      b.appendChild(W.util.withCount(C.categoryLabel[cat], counts[cat] || 0));
      b.addEventListener("click", function () {
        if (state.category === cat) return;
        state.category = cat;
        state.similarTo = null;
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
        chip.appendChild(W.util.withCount(t ? t.label : slug, counts[slug]));
        chip.addEventListener("click", function () {
          state.similarTo = null;
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
      ch.appendChild(W.util.withCount("show untagged", untagged));
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
    var reading = isReading(state.category) && state.similarTo == null;   /* similar view mixes categories */
    grid.className = "grid" + (reading ? " reading" : "");
    var filtered = viewCards.filter(matches);
    var q = state.query.trim(), approx = false, simCard = null;
    var tagLabel = function (slug) { var t = Store.tagsMap().tags[slug]; return t ? t.label : slug; };
    if (state.similarTo != null) {
      simCard = Store.cards().filter(function (c) { return c.id === state.similarTo; })[0] || null;
      if (!simCard) state.similarTo = null;
    }
    if (simCard) {
      filtered = [simCard].concat(W.Search.similar(simCard, Store.cards(), 12, tagLabel).map(function (h) { return h.card; }));
    } else if (q) {
      var r = W.Search.run(filtered, q, tagLabel);
      filtered = r.hits.map(function (h) { return h.card; });
      approx = r.approx;
    }

    meta.innerHTML = "";
    var desc = [];
    if (state.selectedTags.size) {
      desc.push(state.selectedTags.has("__untagged__") ? "untagged"
        : "tagged " + Array.from(state.selectedTags).join(state.tagMode === "or" ? " or " : " + "));
    }
    if (q && !simCard) desc.push((approx ? "closest to " : "matching ") + '"' + q + '"');
    meta.appendChild(el("span", null, simCard
      ? "More like " + cardNo(simCard.id) + " — " + (filtered.length - 1) + " found, across all tabs"
      : filtered.length + " of " + viewCards.length + " " + C.categoryLabel[state.category].toLowerCase() +
        (desc.length ? " — " + desc.join(", ") : "")));
    var multi = state.selectedTags.size > 1 && !state.selectedTags.has("__untagged__");
    if (multi) {
      var mm = el("span", "match-mode");
      mm.appendChild(el("span", null, "match"));
      var host = el("span");
      W.segmented(host, [{ value: "and", label: "all tags" }, { value: "or", label: "any tag" }], state.tagMode,
        function (v) { state.tagMode = v; renderAll(); });
      mm.appendChild(host);
      meta.appendChild(mm);
    }
    if (state.selectedTags.size || q || simCard) {
      var clr = el("button", "ghost", "Clear");
      clr.addEventListener("click", function () {
        state.query = ""; state.selectedTags.clear(); state.similarTo = null;
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
    var sig = [state.category, state.query, Array.from(state.selectedTags).join(","), state.tagMode, state.similarTo].join("|");
    if (sig !== lastSig) { lastSig = sig; shown = PAGE; }
    var tm = Store.tagsMap();
    filtered.slice(0, shown).forEach(function (c) {
      var cardReading = isReading(c.category) && (reading || simCard);
      var card = el("div", "card" + (cardReading ? " reading " + c.category : ""));
      if (c.origin) card.setAttribute("data-origin", c.origin);
      if (c.edited || c.added) {
        card.appendChild(el("span", "draft-badge", c.added ? "unfiled" : "edited"));
      }
      card.appendChild(el("span", "id", cardNo(c.id)));
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
            state.similarTo = null;
            state.selectedTags.clear(); state.selectedTags.add(slug);
            window.scrollTo({ top: 0, behavior: "smooth" });
            renderAll();
          });
          tags.appendChild(chip);
        });
      } else {
        tags.appendChild(el("span", "tag-chip untagged owner-only", "untagged"));
      }
      foot.appendChild(tags);
      var like = el("button", "like-btn", "like this");
      like.type = "button";
      like.setAttribute("aria-label", "like this, " + cardNo(c.id));
      like.addEventListener("click", function () {
        state.similarTo = c.id; state.query = ""; state.selectedTags.clear();
        document.getElementById("search").value = "";
        window.scrollTo({ top: 0, behavior: "smooth" });
        renderAll();
      });
      foot.appendChild(like);
      var edit = el("button", "edit-btn owner-only", "edit");
      edit.setAttribute("aria-label", "Edit " + cardNo(c.id));
      edit.type = "button";
      edit.addEventListener("click", function () { W.Modals.openEdit(c); });
      foot.appendChild(edit);
      card.appendChild(foot);
      grid.appendChild(card);
    });
    if (filtered.length > shown) {
      var more = el("button", "show-more", "Show more (" + (filtered.length - shown) + " left)");
      more.type = "button";
      more.addEventListener("click", function () { shown += PAGE * 2; renderAll(); });
      grid.appendChild(more);
    }
  }

  function renderPending() {
    var note = document.getElementById("pendingNote");
    var p = Store.pending();
    var fab = document.getElementById("saveBtn");
    fab.classList.toggle("hidden", !p.any);
    if (!p.any) { note.classList.add("hidden"); note.textContent = ""; return; }
    var bits = [];
    if (p.quotes) bits.push(p.quotes + " card" + (p.quotes > 1 ? "s" : ""));
    if (p.assign) bits.push("tags");
    if (p.origins) bits.push("origins");
    if (p.tags) bits.push("tag list");
    note.classList.remove("hidden");
    note.className = "pending-note owner-only";
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
