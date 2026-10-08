/* ---------- Working state: published data + localStorage overlay ----------
   Two mutable objects, held as full working copies:
     cards  { id: {id, text, category, origin?, tags?} }   <- data/cards.js
     tags   { order, groups, tags }                        <- data/tags.js
   Every mutation writes the working copy to localStorage, namespaced by the
   publish stamp, plus a "base" snapshot of the published data the work started
   from. Save (github.js) commits the changed files and calls adoptSaved(). If
   the site moves on (another device saved), the old stamp's work is 3-way
   merged onto the new published data instead of being orphaned.
*/
window.Wisdom = window.Wisdom || {};
window.Wisdom.Store = (function () {
  var W = window.Wisdom;
  var C = W.config;

  var stamp = String(W.stamp || "0");
  var KEYS = ["cards", "tags"];
  var FIELDS = ["text", "category", "origin", "tags"];
  function lsKey(k) { return C.lsPrefix + stamp + "::" + k; }
  function J(x) { return JSON.stringify(x); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  /* canonical card: fixed key order, empty origin/tags omitted (matches cards.js on disk) */
  function norm(c) {
    var o = { id: c.id, text: c.text, category: c.category };
    if (c.origin) o.origin = c.origin;
    if (c.tags && c.tags.length) o.tags = c.tags.slice();
    return o;
  }
  function toMap(list) {
    var m = {};
    (list || []).forEach(function (c) { m[c.id] = norm(c); });
    return m;
  }
  function sortedList(map) {
    return Object.keys(map).map(function (k) { return norm(map[k]); })
      .sort(function (a, b) { return a.id - b.id; });
  }
  function fixTags(t) {
    t = t || {};
    if (!t.order) t.order = [];
    if (!t.groups) t.groups = {};
    if (!t.tags) t.tags = {};
    return t;
  }

  var saved = {
    cards: toMap(W.cards),
    tags:  fixTags(clone(W.tags || {}))
  };

  /* ---------- carry unsaved work across a publish (3-way merge) ---------- */
  function mergeMap(base, work, cur) {
    var res = clone(cur), seen = {};
    Object.keys(base).concat(Object.keys(work)).forEach(function (k) {
      if (seen[k]) return; seen[k] = 1;
      if (J(base[k]) === J(work[k])) return;
      if (work[k] === undefined) delete res[k]; else res[k] = clone(work[k]);
    });
    return res;
  }
  function mergeCards(base, work, cur) {
    var res = clone(cur), maxId = 0;
    Object.keys(cur).concat(Object.keys(base), Object.keys(work)).forEach(function (k) { if (+k > maxId) maxId = +k; });
    Object.keys(work).forEach(function (k) {
      var w = work[k], b = base[k], c = res[k];
      if (!b) {                                           /* new on this device */
        var n = clone(w);
        if (c) { n.id = ++maxId; }                        /* id taken by the other device */
        res[n.id] = n;
      } else if (c) {                                     /* field-level: keep this device's changes */
        FIELDS.forEach(function (f) {
          if (J(b[f]) === J(w[f])) return;
          if (w[f] === undefined || (f === "tags" && !w[f].length)) delete c[f]; else c[f] = clone(w[f]);
        });
        res[k] = norm(c);
      }                                                   /* else: deleted elsewhere - that wins */
    });
    Object.keys(base).forEach(function (k) { if (!work[k]) delete res[k]; });   /* deleted here */
    return res;
  }
  function mergeWork(base, work, cur) {
    var bt = fixTags(base.tags), wt = fixTags(work.tags), ct = fixTags(cur.tags);
    return {
      cards: mergeCards(base.cards, work.cards, cur.cards),
      tags: {
        order: ct.order.concat(wt.order.filter(function (g) { return ct.order.indexOf(g) === -1; })),
        groups: mergeMap(bt.groups, wt.groups, ct.groups),
        tags: mergeMap(bt.tags, wt.tags, ct.tags)
      }
    };
  }
  /* Work saved under OTHER stamps (with a base) is merged into the current
     published data. Returns {work, recovered:n} or null. */
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
      var cur = { cards: clone(saved.cards), tags: clone(saved.tags) };
      var recovered = 0;
      Object.keys(groups).sort().forEach(function (s) {
        var g = groups[s];
        if (!g.base) return;
        var base = JSON.parse(localStorage.getItem(g.base));
        var work = {};
        KEYS.forEach(function (x) { work[x] = g[x] ? JSON.parse(localStorage.getItem(g[x])) : clone(base[x]); });
        if (KEYS.some(function (x) { return J(base[x]) !== J(work[x]); })) { cur = mergeWork(base, work, cur); recovered++; }
        Object.keys(g).forEach(function (x) { localStorage.removeItem(g[x]); });
      });
      return recovered ? { work: cur, recovered: recovered } : null;
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
  var work = recovery ? recovery.work : { cards: load("cards"), tags: load("tags") };
  fixTags(work.tags);

  function persist(k) {
    try {
      if (localStorage.getItem(lsKey("base")) == null) {    /* published data this work started from */
        localStorage.setItem(lsKey("base"), J({ cards: saved.cards, tags: saved.tags }));
      }
      localStorage.setItem(lsKey(k), J(work[k]));
    } catch (e) {}
  }
  if (recovery) KEYS.forEach(persist);

  /* ---------- merged card list (what the UI renders) ---------- */
  function cards() {
    return sortedList(work.cards).map(function (c) {
      var s = saved.cards[c.id];
      return {
        id: c.id, text: c.text, category: c.category,
        tags: (c.tags || []).slice(), origin: c.origin || null,
        added: !s,
        edited: !!s && (s.text !== c.text || s.category !== c.category)
      };
    });
  }

  /* ---------- card mutations ---------- */
  function editCard(id, text, category) {
    var c = work.cards[id]; if (!c) return;
    c.text = text; c.category = category;
    persist("cards");
  }
  function nextId() {
    /* one past the highest id anywhere (published or local) */
    var mx = 0;
    Object.keys(saved.cards).concat(Object.keys(work.cards)).forEach(function (k) { if (+k > mx) mx = +k; });
    return mx + 1;
  }
  function addCard(text, category) {
    var id = nextId();
    work.cards[id] = { id: id, text: text, category: category };
    persist("cards");
    return id;
  }
  function deleteCard(id) {
    delete work.cards[id];
    persist("cards");
  }
  function setTags(id, slugs) {
    var c = work.cards[id]; if (!c) return;
    slugs = slugs.filter(Boolean);
    if (slugs.length) c.tags = slugs; else delete c.tags;
    persist("cards");
  }
  function toggleTag(id, slug) {
    var c = work.cards[id];
    var cur = ((c && c.tags) || []).slice();
    var i = cur.indexOf(slug);
    if (i === -1) cur.push(slug); else cur.splice(i, 1);
    setTags(id, cur);
    return cur;
  }
  function setOrigin(id, val) {
    var c = work.cards[id]; if (!c) return;
    if (val) c.origin = val; else delete c.origin;
    persist("cards");
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
  function eachCard(fn) { Object.keys(work.cards).forEach(function (k) { fn(work.cards[k]); }); }
  function deleteTag(slug) {
    delete work.tags.tags[slug];
    eachCard(function (c) {
      if (!c.tags) return;
      c.tags = c.tags.filter(function (s) { return s !== slug; });
      if (!c.tags.length) delete c.tags;
    });
    persist("tags"); persist("cards");
  }
  function mergeTags(from, into) {
    if (!work.tags.tags[into] || from === into) return;
    eachCard(function (c) {
      if (!c.tags || c.tags.indexOf(from) === -1) return;
      c.tags = c.tags.filter(function (s) { return s !== from; });
      if (c.tags.indexOf(into) === -1) c.tags.push(into);
    });
    delete work.tags.tags[from];
    persist("tags"); persist("cards");
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
  function diffs() {
    var d = { added: 0, deleted: 0, edited: 0, tagged: 0, origins: 0 };
    Object.keys(work.cards).forEach(function (k) {
      var w = work.cards[k], s = saved.cards[k];
      if (!s) { d.added++; return; }
      if (s.text !== w.text || s.category !== w.category) d.edited++;
      if (J(s.tags || []) !== J(w.tags || [])) d.tagged++;
      if ((s.origin || null) !== (w.origin || null)) d.origins++;
    });
    Object.keys(saved.cards).forEach(function (k) { if (!work.cards[k]) d.deleted++; });
    d.vocab = J(work.tags) !== J(saved.tags);
    return d;
  }
  function pending() {
    var d = diffs(), q = d.added + d.deleted + d.edited;
    /* new cards carry their own tags/origin; count those as part of the card */
    return { quotes: q, assign: d.tagged > 0, origins: d.origins > 0, tags: d.vocab,
             any: !!(q || d.tagged || d.origins || d.vocab) };
  }
  /* which app-written files differ from what's published */
  function changedKeys() {
    return KEYS.filter(function (k) {
      return k === "cards" ? J(sortedList(work.cards)) !== J(sortedList(saved.cards)) : J(work.tags) !== J(saved.tags);
    });
  }
  /* short human commit message, e.g. "Wisdom — +3 cards, tags on 12" */
  function summary() {
    var d = diffs(), parts = [];
    if (d.added) parts.push("+" + d.added + " card" + (d.added > 1 ? "s" : ""));
    if (d.edited) parts.push("edited " + d.edited);
    if (d.deleted) parts.push("deleted " + d.deleted);
    if (d.tagged) parts.push("tags on " + d.tagged);
    if (d.origins) parts.push("origin on " + d.origins);
    if (d.vocab) parts.push("tag list");
    return "Wisdom — " + (parts.join(", ") || "update");
  }

  var HEADERS = {
    cards: "/* APP-WRITTEN. One object per card: {id, text, category, origin?, tags?}. */",
    tags:  "/* APP-WRITTEN by the tag manager. Safe to hand-edit. */",
    stamp: "/* APP-WRITTEN. Bumped on every publish; namespaces localStorage. */"
  };
  function serialize(k, newStamp) {
    var head = HEADERS[k] + "\nwindow.Wisdom = window.Wisdom || {};\nwindow.Wisdom.";
    if (k === "cards") {
      return head + "cards = [\n" + sortedList(work.cards).map(function (c) { return " " + J(c); }).join(",\n") + "\n];\n";
    }
    if (k === "stamp") return head + "stamp = " + J(newStamp || String(Date.now())) + ";\n";
    return head + "tags = " + JSON.stringify(work.tags, null, 1) + ";\n";
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
    pending: pending, serialize: serialize, adoptSaved: adoptSaved
  };
})();
