/* ---------- Working state: saved data files + localStorage overlay ----------
   The four mutable objects (tags / assignments / origins / quoteEdits) are held
   as full working copies. Every mutation writes the whole object to
   localStorage, namespaced by the build stamp. Save (github.js) PUTs each file
   and calls adoptSaved(); a stale cached page simply finds nothing under the
   new stamp and starts clean from the published data.
*/
window.Wisdom = window.Wisdom || {};
window.Wisdom.Store = (function () {
  var W = window.Wisdom;
  var C = W.config;

  var stamp = String(W.stamp || "0");
  function lsKey(k) { return C.lsPrefix + stamp + "::" + k; }

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  var saved = {
    tags:    W.tags        || { order: ["Program", "Theme", "Form"], groups: {}, tags: {} },
    assign:  W.assignments  || {},
    origins: W.origins      || {},
    qedits:  W.quoteEdits   || { edits: {}, deletes: [], added: [] }
  };

  function load(k) {
    try {
      var raw = localStorage.getItem(lsKey(k));
      if (raw != null) return JSON.parse(raw);
    } catch (e) {}
    return clone(saved[k]);
  }

  var work = {
    tags:    load("tags"),
    assign:  load("assign"),
    origins: load("origins"),
    qedits:  load("qedits")
  };
  ["order", "groups", "tags"].forEach(function (k) { if (!work.tags[k]) work.tags[k] = (k === "order" ? [] : {}); });
  ["edits", "deletes", "added"].forEach(function (k) { if (!work.qedits[k]) work.qedits[k] = (k === "deletes" || k === "added" ? [] : {}); });

  function persist(k) {
    try { localStorage.setItem(lsKey(k), JSON.stringify(work[k])); } catch (e) {}
  }

  /* ---------- merged card list ---------- */
  function cards() {
    var del = {};
    work.qedits.deletes.forEach(function (id) { del[id] = 1; });
    var out = [];
    (W.quotes || []).forEach(function (q) {
      if (del[q.id]) return;
      var e = work.qedits.edits[q.id];
      out.push({
        id: q.id,
        text: e && e.text != null ? e.text : q.text,
        category: e && e.category ? e.category : q.category,
        edited: !!e
      });
    });
    work.qedits.added.forEach(function (a) {
      if (!del[a.id]) out.push({ id: a.id, text: a.text, category: a.category, added: true });
    });
    out.forEach(function (c) {
      c.tags = (work.assign[c.id] || []).slice();
      c.origin = work.origins[c.id] || null;
    });
    return out;
  }

  /* ---------- quote edits ---------- */
  function findBase(id) {
    for (var i = 0; i < (W.quotes || []).length; i++) if (W.quotes[i].id === id) return W.quotes[i];
    return null;
  }
  function editCard(id, text, category) {
    var added = work.qedits.added.filter(function (a) { return a.id === id; })[0];
    if (added) { added.text = text; added.category = category; persist("qedits"); return; }
    var base = findBase(id);
    if (base && base.text === text && base.category === category) delete work.qedits.edits[id];
    else work.qedits.edits[id] = { text: text, category: category };
    persist("qedits");
  }
  function addCard(text, category) {
    var maxAdded = work.qedits.added.reduce(function (m, a) { return Math.max(m, a.id); }, C.addedIdBase - 1);
    var id = maxAdded + 1;
    work.qedits.added.push({ id: id, text: text, category: category });
    persist("qedits");
    return id;
  }
  function deleteCard(id) {
    if (work.qedits.added.some(function (a) { return a.id === id; })) {
      work.qedits.added = work.qedits.added.filter(function (a) { return a.id !== id; });
    } else if (work.qedits.deletes.indexOf(id) === -1) {
      work.qedits.deletes.push(id);
    }
    delete work.qedits.edits[id];
    delete work.assign[id];
    delete work.origins[id];
    persist("qedits"); persist("assign"); persist("origins");
  }

  /* ---------- assignments / origins ---------- */
  function setTags(id, slugs) {
    slugs = slugs.filter(Boolean);
    if (slugs.length) work.assign[id] = slugs; else delete work.assign[id];
    persist("assign");
  }
  function toggleTag(id, slug) {
    var cur = (work.assign[id] || []).slice();
    var i = cur.indexOf(slug);
    if (i === -1) cur.push(slug); else cur.splice(i, 1);
    setTags(id, cur);
    return cur;
  }
  function setOrigin(id, val) {
    if (val) work.origins[id] = val; else delete work.origins[id];
    persist("origins");
  }

  /* ---------- tag vocabulary ---------- */
  function slugify(s) {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function createTag(label, group) {
    var slug = slugify(label);
    if (!slug) return null;
    if (!work.tags.tags[slug]) work.tags.tags[slug] = { label: label.trim(), group: group };
    if (work.tags.order.indexOf(group) === -1) work.tags.order.push(group);
    if (!work.tags.groups[group]) work.tags.groups[group] = {};
    persist("tags");
    return slug;
  }
  function renameTag(slug, label) {
    if (work.tags.tags[slug]) { work.tags.tags[slug].label = label.trim(); persist("tags"); }
  }
  function setTagGroup(slug, group) {
    if (work.tags.tags[slug]) {
      work.tags.tags[slug].group = group;
      if (work.tags.order.indexOf(group) === -1) work.tags.order.push(group);
      if (!work.tags.groups[group]) work.tags.groups[group] = {};
      persist("tags");
    }
  }
  function deleteTag(slug) {
    delete work.tags.tags[slug];
    Object.keys(work.assign).forEach(function (id) {
      var n = work.assign[id].filter(function (s) { return s !== slug; });
      if (n.length) work.assign[id] = n; else delete work.assign[id];
    });
    persist("tags"); persist("assign");
  }
  function mergeTags(from, into) {
    if (!work.tags.tags[into] || from === into) return;
    Object.keys(work.assign).forEach(function (id) {
      var arr = work.assign[id];
      if (arr.indexOf(from) === -1) return;
      arr = arr.filter(function (s) { return s !== from; });
      if (arr.indexOf(into) === -1) arr.push(into);
      work.assign[id] = arr;
    });
    delete work.tags.tags[from];
    persist("tags"); persist("assign");
  }
  function setGroupCategories(group, cats) {
    if (!work.tags.groups[group]) work.tags.groups[group] = {};
    if (cats && cats.length) work.tags.groups[group].categories = cats;
    else delete work.tags.groups[group].categories;
    persist("tags");
  }
  function tagCountsFor(cardList) {
    var n = {};
    cardList.forEach(function (c) { c.tags.forEach(function (t) { n[t] = (n[t] || 0) + 1; }); });
    return n;
  }

  /* ---------- pending / save plumbing ---------- */
  function pending() {
    var q = 0;
    q += Object.keys(work.qedits.edits).length + work.qedits.deletes.length + work.qedits.added.length;
    var a = JSON.stringify(work.assign) !== JSON.stringify(saved.assign);
    var o = JSON.stringify(work.origins) !== JSON.stringify(saved.origins);
    var t = JSON.stringify(work.tags) !== JSON.stringify(saved.tags);
    return { quotes: q, assign: a, origins: o, tags: t,
             any: q > 0 || a || o || t };
  }

  var HEADERS = {
    tags:    "/* APP-WRITTEN by the tag manager. Safe to hand-edit. */",
    assign:  "/* APP-WRITTEN by the tagging queue. { quoteId: [tagSlug, ...] }. */",
    origins: "/* APP-WRITTEN. { quoteId: \"aa\" | \"religious\" | \"misc\" }. */",
    qedits:  "/* APP-WRITTEN. Overlay on data/quotes.js (edits / deletes / added). */",
    stamp:   "/* APP-WRITTEN. Bumped on every publish; namespaces localStorage. */"
  };
  var GLOBAL = { tags: "tags", assign: "assignments", origins: "origins", qedits: "quoteEdits", stamp: "stamp" };

  function serialize(k, newStamp) {
    var val = k === "stamp" ? (newStamp || String(Date.now())) : work[k];
    return HEADERS[k] + "\nwindow.Wisdom = window.Wisdom || {};\nwindow.Wisdom." +
      GLOBAL[k] + " = " + JSON.stringify(val, null, 1) + ";\n";
  }

  function adoptSaved(newStamp) {
    ["tags", "assign", "origins", "qedits"].forEach(function (k) {
      saved[k] = clone(work[k]);
      try { localStorage.removeItem(lsKey(k)); } catch (e) {}
    });
    stamp = String(newStamp);
  }

  return {
    cards: cards, config: C,
    editCard: editCard, addCard: addCard, deleteCard: deleteCard,
    setTags: setTags, toggleTag: toggleTag, setOrigin: setOrigin,
    tagsMap: function () { return work.tags; },
    createTag: createTag, renameTag: renameTag, setTagGroup: setTagGroup,
    deleteTag: deleteTag, mergeTags: mergeTags, setGroupCategories: setGroupCategories,
    tagCountsFor: tagCountsFor,
    pending: pending, serialize: serialize, adoptSaved: adoptSaved,
    fileList: ["tags", "assign", "origins", "qedits", "stamp"]
  };
})();
