# Session index

Read this first. Three lines max per session. Newest at top.

## 2026-09-08 (2) — actually shipped the new-card fixes
The 09-08 (1) `store.js` fix was never committed, so the live site kept the old code. Committed it plus: `pending()` now diffs work vs saved qedits (was counting raw lengths → perpetual "Unsaved" nag on every load, even after a good Save); new cards now number from the highest live id (935, 936…) instead of jumping to 100000; `build_data.py` reserves app-created ids so a corpus rebuild can't collide. Added `?v=` cache-busting to css/js in index.html. Count was always correct. See session_summary_2026-09-08_2.md.

## 2026-09-08 — fixed card persistence and added flag logic
Fixed bug in Store.cards() where all cards in work.qedits.added were marked `added: true` even after being published. Now cards only show "unfiled" badge while truly unsaved. Also confirmed Save flow works correctly when GitHub config is set. localStorage properly persists unsaved changes; "Unsaved" message appears until successfully saved.

## 2026-08-27 — repopulated the tag taxonomy, colour-coded groups
Seeded `data/tags.js` with 86 tags in 3 groups: Steps (1-12 + Traditions),
Style (12, incl. new slogan/story/paradox/list), Concept (61, incl. 14 new).
Colour-coded chips oxblood/brass/pine everywhere tags render; new tags
default to Concept. `assignments.js` still empty — clean slate, tag by hand.

## 2026-08-26 (2) — built the modular refactor
Split `index.html` → `css/` + `js/` (7 modules) + `data/*.js` + `scripts/` Python
pipeline. 3 category tabs (Quotes/Poems/Prayers), manual origin colouring, clean-slate
tagging queue + tag manager, per-file GitHub Save with conflict detection.
934 cards (909/10/15). Tested in browser, all core flows work. Not done: queue
keyboard shortcuts. See session_summary_2026-08-26_2.md.

## 2026-08-26 (1) — planning the pipeline refactor
Wrote `CLAUDE.md` + `refactor_plan.md`. Decisions: no bundler, offline Python
pipeline, separate data files, category tabs, manual retagging, origin colouring.
