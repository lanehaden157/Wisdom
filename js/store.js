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
    tags:    W.tags        || { order: [], groups: {}, tags: {} },
    assign:  W.assignments  || {},
    origins: W.origins      || {},
    qedits:  W.quoteEdits   || { edits: {}, deletes: [], added: [] }
  };

  var KEYS = ["tags", "assign", "origins", "qedits"];
  function J(x) { return JSON.stringify(x); }

  /* ---------- carry unsaved work across a publish (3-way merge) ----------
     Each device keeps a "base" snapshot (the published data its working copy
     started from). If the site moves on (stamp changes - e.g. the phone saved),
     the old stamp's work is merged onto the new published data instead of being
     orphaned: only what THIS device changed relative to its base is re-applied. */
  function mergeMap(base, work, cur) {
    var res = clone(cur), seen = {};
    Object.keys(base).concat(Object.keys(work)).forEach(function (k) {
      if (seen[k]) return; seen[k] = 1;
      if (J(base[k]) === J(work[k])) return;
      if (work[k] === undefined) delete res[k]; else res[k] = clone(work[k]);
    });
    return res;
  }
  function mergeWork(base, work, cur) {
    var out = {};
    out.assign  = mergeMap(base.assign,  work.assign,  cur.assign);
    out.origins = mergeMap(base.origins, work.origins, cur.origins);
    var bt = base.tags, wt = work.tags, ct = cur.tags;
    out.tags = {
      order: ct.order.concat((wt.order || []).filter(function (g) { return ct.order.indexOf(g) === -1; })),
      groups: mergeMap(bt.groups || {}, wt.groups || {}, ct.groups || {}),
      tags: mergeMap(bt.tags || {}, wt.tags || {}, ct.tags || {})
    };
    var bq = base.qedits, wq = work.qedits, cq = cur.qedits;
    var qe = { edits: mergeMap(bq.edits || {}, wq.edits || {}, cq.edits || {}), deletes: cq.deletes.slice(), added: clone(cq.added) };
    wq.deletes.forEach(function (id) { if (bq.deletes.indexOf(id) === -1 && qe.deletes.indexOf(id) === -1) qe.deletes.push(id); });
    var baseAdded = {}, workAdded = {};
    bq.added.forEach(function (a) { baseAdded[a.id] = a; });
    wq.added.forEach(function (a) { workAdded[a.id] = a; });
    bq.added.forEach(function (a) {                       /* removed locally */
      if (!workAdded[a.id]) qe.added = qe.added.filter(function (x) { return x.id !== a.id; });
    });
    var used = {};
    (W.quotes || []).forEach(function (q) { used[q.id] = 1; });
    qe.added.forEach(function (a) { used[a.id] = 1; });
    wq.added.forEach(function (a) {
      if (baseAdded[a.id]) {                              /* edited locally */
        if (J(baseAdded[a.id]) !== J(a)) qe.added = qe.added.map(function (x) { return x.id === a.id ? clone(a) : x; });
        return;
      }
      var n = clone(a);                                   /* brand-new local card */
      if (used[n.id]) {                                   /* id taken by the other device */
        var mx = 0; Object.keys(used).forEach(function (k) { if (+k > mx) mx = +k; });
        var old = n.id; n.id = mx + 1;
        if (out.assign[old] && work.assign[old]) { out.assign[n.id] = out.assign[old]; if (!cur.assign[old]) delete out.assign[old]; }
        if (out.origins[old] && work.origins[old]) { out.origins[n.id] = out.origins[old]; if (!cur.origins[old]) delete out.origins[old]; }
      }
      used[n.id] = 1; qe.added.push(n);
    });
    out.qedits = qe;
    return out;
  }
  /* Looks for work saved under OTHER stamps that has a base; merges it into the
     current published data. Returns {work, recovered:n} or null. */
  function recoverOrphans() {
    var pre = C.lsPrefix, mine = pre + stamp + "::", groups = {}, hasMine = false;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key.indexOf(pre) !== 0) continue;
        if (key.indexOf(mine) === 0) { hasMine = true; continue; }
        var m = key.slice(pre.length).split("::");
        (groups[m[0]] = groups[m[0]] || {})[m[1]] = key;
      }
      if (hasMine) return null;                           /* this stamp already has local work */
      var cur = { tags: clone(saved.tags), assign: clone(saved.assign), origins: clone(saved.origins), qedits: clone(saved.qedits) };
      ["order", "groups", "tags"].forEach(function (x) { if (!cur.tags[x]) cur.tags[x] = x === "order" ? [] : {}; });
      ["edits", "deletes", "added"].forEach(function (x) { if (!cur.qedits[x]) cur.qedits[x] = x === "edits" ? {} : []; });
      var result = null, recovered = 0;
      Object.keys(groups).sort().forEach(function (s) {
        var g = groups[s];
        if (!g.base) return;
        var base = JSON.parse(localStorage.getItem(g.base));
        var work = {};
        KEYS.forEach(function (x) { work[x] = g[x] ? JSON.parse(localStorage.getItem(g[x])) : clone(base[x]); });
        ["order", "groups", "tags"].forEach(function (x) { if (!base.tags[x]) base.tags[x] = work.tags[x] = x === "order" ? [] : {}; if (!work.tags[x]) work.tags[x] = x === "order" ? [] : {}; });
        ["edits", "deletes", "added"].forEach(function (x) { [base, work].forEach(function (o) { if (!o.qedits[x]) o.qedits[x] = x === "edits" ? {} : []; }); });
        var changed = KEYS.some(function (x) { return J(base[x]) !== J(work[x]); });
        if (changed) { cur = mergeWork(base, work, cur); recovered++; }
        Object.keys(g).forEach(function (x) { localStorage.removeItem(g[x]); });
      });
      if (!recovered) return null;
      return { work: cur, recovered: recovered };
    } catch (e) { return null; }
  }

  function load(k) {
    try {
      var raw = localStorage.getItem(lsKey(k));
      if (raw != null) return JSON.parse(raw);
    } catch (e) {}
    return clone(saved[k]);
  }

  var recovery = recoverOrphans();
  var work = recovery ? recovery.work : {
    tags:    load("tags"),
    assign:  load("assign"),
    origins: load("origins"),
    qedits:  load("qedits")
  };
  if (recovery) KEYS.forEach(function (k) { persist(k); });
  ["order", "groups", "tags"].forEach(function (k) { if (!work.tags[k]) work.tags[k] = (k === "order" ? [] : {}); });
  ["edits", "deletes", "added"].forEach(function (k) { if (!work.qedits[k]) work.qedits[k] = (k === "deletes" || k === "added" ? [] : {}); });

  function persist(k) {
    try {
      if (localStorage.getItem(lsKey("base")) == null) {    /* published data this work started from */
        localStorage.setItem(lsKey("base"), J({ tags: saved.tags, assign: saved.assign, origins: saved.origins, qedits: saved.qedits }));
      }
      localStorage.setItem(lsKey(k), J(work[k]));
    } catch (e) {}
  }

  /* ---------- merged card list ---------- */
  function cards() {
    var del = {};
    work.qedits.deletes.forEach(function (id) { del[id] = 1; });
    var savedAddedIds = {};
    saved.qedits.added.forEach(function (a) { savedAddedIds[a.id] = 1; });
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
      if (!del[a.id]) out.push({ id: a.id, text: a.text, category: a.category, added: !savedAddedIds[a.id] });
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
  function nextId() {
    /* continue the single id sequence: one past the highest id anywhere —
       the generated corpus, plus any app-created cards (saved or still local). */
    var mx = 0;
    (W.quotes || []).forEach(function (q) { if (q.id > mx) mx = q.id; });
    saved.qedits.added.forEach(function (a) { if (a.id > mx) mx = a.id; });
    work.qedits.added.forEach(function (a) { if (a.id > mx) mx = a.id; });
    return mx + 1;
  }
  function addCard(text, category) {
    var id = nextId();
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
    /* compare the working copy to what's actually published — a card that has
       already been saved lives on in work.qedits forever and must NOT keep
       showing as unsaved (that was the "prompted to Save on every load" bug). */
    var qe = JSON.stringify(work.qedits) !== JSON.stringify(saved.qedits);
    var a  = JSON.stringify(work.assign)  !== JSON.stringify(saved.assign);
    var o  = JSON.stringify(work.origins) !== JSON.stringify(saved.origins);
    var t  = JSON.stringify(work.tags)    !== JSON.stringify(saved.tags);

    var q = 0;
    if (qe) {
      var sEd = saved.qedits.edits || {};
      var sDel = saved.qedits.deletes || [];
      var sAdd = {};
      (saved.qedits.added || []).forEach(function (x) { sAdd[x.id] = JSON.stringify(x); });
      Object.keys(work.qedits.edits).forEach(function (id) {
        if (JSON.stringify(work.qedits.edits[id]) !== JSON.stringify(sEd[id])) q++;
      });
      work.qedits.deletes.forEach(function (id) { if (sDel.indexOf(id) === -1) q++; });
      work.qedits.added.forEach(function (x) { if (sAdd[x.id] !== JSON.stringify(x)) q++; });
    }
    return { quotes: q, assign: a, origins: o, tags: t, any: qe || a || o || t };
  }

  /* which app-written files differ from what's published */
  function changedKeys() {
    return KEYS.filter(function (k) { return J(work[k]) !== J(saved[k]); });
  }
  /* short human commit message, e.g. "Wisdom — +3 cards, tags on 12" */
  function summary() {
    var sq = saved.qedits, wq = work.qedits, parts = [];
    var sAdd = {}; sq.added.forEach(function (a) { sAdd[a.id] = 1; });
    var added = wq.added.filter(function (a) { return !sAdd[a.id]; }).length;
    var deleted = wq.deletes.filter(function (id) { return sq.deletes.indexOf(id) === -1; }).length;
    var edited = Object.keys(wq.edits).filter(function (id) { return J(wq.edits[id]) !== J(sq.edits[id]); }).length;
    function diffCount(a, b) {
      var n = 0, seen = {};
      Object.keys(a).concat(Object.keys(b)).forEach(function (k) { if (!seen[k]) { seen[k] = 1; if (J(a[k]) !== J(b[k])) n++; } });
      return n;
    }
    var tg = diffCount(saved.assign, work.assign), og = diffCount(saved.origins, work.origins);
    if (added) parts.push("+" + added + " card" + (added > 1 ? "s" : ""));
    if (edited) parts.push("edited " + edited);
    if (deleted) parts.push("deleted " + deleted);
    if (tg) parts.push("tags on " + tg);
    if (og) parts.push("origin on " + og);
    if (J(work.tags) !== J(saved.tags)) parts.push("tag list");
    return "Wisdom — " + (parts.join(", ") || "update");
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
    KEYS.concat("base").forEach(function (k) {
      if (k !== "base") saved[k] = clone(work[k]);
      try { localStorage.removeItem(lsKey(k)); } catch (e) {}
    });
    stamp = String(newStamp);
  }

  return {
    cards: cards, config: C, recovered: recovery ? recovery.recovered : 0,
    summary: summary, changedKeys: changedKeys,
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
