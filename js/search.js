/* ---------- Forgiving, ranked search + "more like this" ----------
   Plain JS, no index file: ~1k cards tokenise in a few ms. Matching is by word:
   punctuation, curly apostrophes and accents are ignored, a typed word may match a
   word prefix, a light stem ("drinking" ~ "drink") or a near-miss spelling.
   Text, hidden keywords (kw) and tag labels are all searched; keyword hits weigh
   more than text hits so a card *about* a thing outranks one that merely mentions it. */
window.Wisdom = window.Wisdom || {};
window.Wisdom.Search = (function () {
  var W = window.Wisdom;

  var STOP = {};
  ("a an and are as at be but by for from had has have he her his i if in is it its me my of on or our she so that the their them then there they this to was we were what when which who with you your " +
   "about just like not no do did does").split(" ").forEach(function (w) { STOP[w] = 1; });

  function norm(s) {
    return String(s || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/['’‘`]/g, "")             /* don't -> dont, God's -> gods */
      .replace(/[^a-z0-9]+/g, " ").trim();
  }
  function words(s) { var n = norm(s); return n ? n.split(" ") : []; }

  function stem(w) {
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /(ed|es)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }

  /* bounded Levenshtein: returns distance, or max+1 once it can't be <= max */
  function dist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      var lo = cur[0];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < lo) lo = cur[j];
      }
      if (lo > max) return max + 1;
      var t = prev; prev = cur; cur = t;
    }
    return prev[b.length];
  }

  /* per-card word sets, rebuilt only when the card's searchable content changes */
  var cache = {};
  function indexOf(c, tagLabel) {
    var tl = (c.tags || []).map(tagLabel).join(" ");
    var sig = c.text.length + "|" + (c.kw || "") + "|" + tl;
    var hit = cache[c.id];
    if (hit && hit.sig === sig) return hit;
    function set(s) { var o = {}; words(s).forEach(function (w) { o[w] = 1; o[stem(w)] = 1; }); return o; }
    var ix = { sig: sig, text: set(c.text), kw: set((c.kw || "") + " " + tl) };
    ix.textList = Object.keys(ix.text); ix.kwList = Object.keys(ix.kw);
    cache[c.id] = ix;
    return ix;
  }

  /* score of one query word against one word set (0 = no match) */
  function wordScore(q, qs, set, list, wExact, wPrefix, wFuzzy) {
    if (set[q] || set[qs]) return wExact;
    var i, w;
    if (q.length >= 3) {
      for (i = 0; i < list.length; i++) { w = list[i]; if (w.indexOf(q) === 0 || w.indexOf(qs) === 0) return wPrefix; }
    }
    if (q.length >= 4) {
      var max = q.length >= 8 ? 2 : 1;
      for (i = 0; i < list.length; i++) {
        w = list[i];
        if (w.length >= 3 && (dist(q, w, max) <= max || dist(qs, w, max) <= max)) return wFuzzy;
      }
    }
    return 0;
  }

  /* parse once per query */
  function parse(raw) {
    var all = words(raw);
    var ws = all.filter(function (w) { return !STOP[w]; });
    if (!ws.length) ws = all;               /* query made only of stopwords: keep it */
    return { raw: norm(raw), words: ws.map(function (w) { return { q: w, s: stem(w) }; }) };
  }

  /* 0 = no match; higher = better. Every word must match; if nothing does, the
     caller may retry with `partial` (about half the words) for half-remembered quotes. */
  function score(c, pq, partial, tagLabel) {
    if (!pq.words.length) return 1;
    var ix = indexOf(c, tagLabel), total = 0, hits = 0;
    pq.words.forEach(function (w) {
      var t = wordScore(w.q, w.s, ix.text, ix.textList, 6, 4, 2);
      var k = wordScore(w.q, w.s, ix.kw, ix.kwList, 8, 5, 2);
      var best = Math.max(t, k);
      if (best) { hits++; total += best + (t && k ? 2 : 0); }
    });
    var n = pq.words.length, need = partial ? (n <= 2 ? 1 : Math.ceil(n * 0.5)) : n;
    if (hits < need) return 0;
    /* a typed phrase that appears verbatim is the best possible hit */
    if (pq.words.length > 1 && norm(c.text).indexOf(pq.raw) !== -1) total += 12;
    return total * (hits / pq.words.length);
  }

  /* filter + rank a list of cards; returns [{card, score}] best first */
  function run(cards, raw, tagLabel) {
    var pq = parse(raw);
    function pass(partial) {
      var out = [];
      cards.forEach(function (c) { var s = score(c, pq, partial, tagLabel); if (s) out.push({ card: c, score: s }); });
      return out;
    }
    var out = pass(false), approx = false;
    if (!out.length && pq.words.length > 1) { out = pass(true); approx = out.length > 0; }
    out.sort(function (a, b) { return b.score - a.score || a.card.id - b.card.id; });
    return { hits: out, approx: approx };
  }

  /* "more like this": shared tags (rare tags count more) + shared keywords */
  function similar(target, cards, limit, tagLabel) {
    var freq = {};
    cards.forEach(function (c) { (c.tags || []).forEach(function (t) { freq[t] = (freq[t] || 0) + 1; }); });
    var n = cards.length || 1;
    var mine = {}; (target.tags || []).forEach(function (t) { mine[t] = 1; });
    var myKw = {}; words(target.kw || "").forEach(function (w) { if (!STOP[w] && w.length > 2) myKw[stem(w)] = 1; });
    var out = [];
    cards.forEach(function (c) {
      if (c.id === target.id) return;
      var s = 0, shared = 0;
      (c.tags || []).forEach(function (t) { if (mine[t]) { s += Math.log(1 + n / freq[t]); shared++; } });
      var seen = {};
      words(c.kw || "").forEach(function (w) {
        var st = stem(w);
        if (myKw[st] && !seen[st]) { seen[st] = 1; s += 1.2; }
      });
      if (s > 0 && shared > 0) out.push({ card: c, score: s });
    });
    out.sort(function (a, b) { return b.score - a.score || a.card.id - b.card.id; });
    return out.slice(0, limit || 12);
  }

  return { run: run, similar: similar, parse: parse, norm: norm };
})();
