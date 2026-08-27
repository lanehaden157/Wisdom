# Session summary — 2026-08-26 (session 2)

## What was done

Built the modular refactor planned in session 1. The single `index.html` is now
a shell; everything is split into individually editable files.

**Pipeline** (`scripts/`)
- `build_data.py`: frozen v1 corpus + `source/poems-prayers-raw.txt` +
  `source/patches/new-quotes.json` → `data/quotes.js`. Writes only that file
  (+ `source/ids.json` hash→id ledger). Manifest in `scripts/last-build.txt`.
- `validate.py`: duplicate id / bad category / dead-id assignment or origin /
  bad origin / PII in `quotes.js`. Currently passes.

**Data** (`data/*.js`, all `window.Wisdom.*` global assignments so `file://` works)
- `quotes.js` GENERATED — 934 cards: 909 quote, 10 poem, 15 prayer.
- `tags.js`, `assignments.js`, `origins.js`, `quote-edits.js`, `stamp.js` —
  app-written, start empty/clean.
- `data/archive/` — frozen `index-v1.html` and `quotes-v1.json` (corpus + old 67 tags).

**Poems/prayers reconciliation**
- `poems-prayers-raw.txt` is authoritative for those two tabs.
- 14 corpus cards matched (similarity ≥ 0.86) → moved to poem/prayer, kept id,
  took the poems-file text (better line breaks).
- 11 new poem/prayer cards (ids 922–932). 2 new quotes (933–934).
- Note: #44 "What would you have me do?", #45 "…me be?", #56 "God save me from
  myself" moved out of the Quotes tab into Prayers. Reverse by lowering matches
  in `build_data.py` or moving those blocks out of `poems-prayers-raw.txt`.

**Code** — `css/tokens|layout|components.css`, `js/config|store|github|render|
modals|tagger|app.js`.

**Features built**
- 3 category tabs (Quotes/Poems/Prayers), per-tab facet counts, "reading"
  layout (line breaks kept, 2-up, prayers centred).
- Edit modal: category + origin segmented controls, inline tag creation.
- Tagging queue: one card full-screen, recently-used-first palette, scope
  (untagged / this tab / everything) + order (in order / shuffled / shortest)
  selectors, origin control, progress line, Save nudge every 25.
- Tag manager: rename, regroup, merge, delete, live counts.
- "Untagged" facet. Origin colours = coloured left card edge.
- Save: per-file GitHub PUT + SHA + "published since you loaded" (stamp) check.
  Whole-DOM serialization and the token-scrub hack are gone.

**Verified in browser** (localhost:4173): tab switching, edit modal + persistence
to localStorage, tag create/assign/origin, tagging queue next/back/tag, tag
manager, draw, Save-needs-config path, clean reload with cleared localStorage.
No console errors.

## Takeaways / decisions

- `text.txt` was the pre-cleanup version of the live corpus — a full re-import
  would only have re-introduced typos and PII. Reduced Phase 4 to 2 quotes.
- Data-as-`<script>`-globals (not `fetch`) chosen so double-clicking
  `index.html` still works. Pipeline and Save both emit the trivial wrapper.
- localStorage namespaced by publish stamp — a stale phone tab can't bleed
  unsaved edits into a fresh publish.

## Open questions / next

- Queue keyboard shortcuts (1–9 toggle tag, space = next) not built.
- Delete root `text.txt` / `P$P.txt`? Superseded by `source/`. Left them in place.
- The GitHub Save path is untested against a real repo/token (no credentials in
  this session). Logic mirrors the working v1 flow; worth a live test.
- A couple of raw typos ride along in new P&P items (e.g. "word left out,Were
  printed"); left as-is per "prefer minimal edits".
- If the owner wants poem/prayer items to also stay searchable in Quotes,
  switch the reconciliation from "move" to "copy".
