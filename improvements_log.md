# Improvements log

Append-only. Concrete changes made to the project. Check before redoing work.

## 2026-08-26
- Added `CLAUDE.md` — project context, current state, target architecture,
  invariants, phased plan summary.
- Added `refactor_plan.md` — full plan: single `index.html` → offline Python
  data pipeline + individually editable static files; discard the 67-tag
  auto-taxonomy for a manual retagging system; 3 category tabs
  (Quotes / Poems / Prayers); manual origin coloring (aa / religious / misc).
  Not started.
- Owner decisions recorded: no bundler; old tags archived + hidden; quote text
  and tag assignments in separate files; raw = source of truth with a derived,
  versioned patch set carrying the ~48 prior hand fixes forward.
- Added `session_index.md` and this file (per global session-context convention).
- No code changes. `index.html` untouched; site still the single-file app.

## 2026-08-26 (session 2) — refactor built
- Froze v1 → `data/archive/index-v1.html`, `data/archive/quotes-v1.json`.
- `scripts/build_data.py` — corpus + `poems-prayers-raw.txt` + `new-quotes.json`
  → `data/quotes.js` (934 cards: 909 quote / 10 poem / 15 prayer). Writes only
  that file + `source/ids.json`. `scripts/validate.py` — id/category/PII guards.
- `source/patches/new-quotes.json` — the 2 genuinely-new quotes from text.txt
  (rest of text.txt is the pre-cleanup version of the corpus — not imported).
- Poems/prayers from `poems-prayers-raw.txt`: 14 corpus cards moved to
  poem/prayer (kept id, took poems-file text), 11 new. Moves listed in
  `scripts/last-build.txt` — e.g. #44/#45 "What would you have me do/be", #56
  "God save me from myself" left the Quotes tab.
- Split CSS → `css/tokens|layout|components.css`; JS → `js/config|store|github|
  render|modals|tagger|app.js`. `index.html` is now a shell.
- New data files (app-written, `window.Wisdom.*` globals): `tags.js`,
  `assignments.js` (empty — clean-slate tagging), `origins.js`, `quote-edits.js`,
  `stamp.js`.
- Built: 3 category tabs w/ per-tab facet counts + "reading" layout for
  poems/prayers; edit modal gains category + origin segmented controls + inline
  tag creation; tagging queue (recently-used palette, scope/order selectors,
  origin control, progress, save-nudge); tag manager (rename/regroup/merge/
  delete + counts); "untagged" facet.
- Save rewritten (`github.js`): per-file PUT + SHA + stamp check for
  phone-published-since-load; no more whole-DOM serialization / token-scrub.
- `.claude/launch.json` at workspace root (python http.server on 4173).
- Verified in browser: tabs, edit modal, tag create/assign/origin persistence,
  tagging queue next/back/tag, tag manager, draw, save-needs-config path,
  clean reload with no localStorage.
- NOT done: queue keyboard shortcuts (1–9 / space). `text.txt`, `P$P.txt` still
  at repo root (superseded by `source/`).

## 2026-08-27 — tag taxonomy repopulated, colour-coded
- `data/tags.js`: 86 tags, 3 groups, `order: ["Steps", "Style", "Concept"]`.
  - **Steps** (13): `step-01`..`step-12` (zero-padded slugs so the picker's
    alphabetical sort stays numeric — labels are plain "Step 1".."Step 12"),
    `traditions`.
  - **Style** (12): old Form set minus `poem` (redundant with the tab) —
    aphorism, humor, question, acronym, passage, metaphor, process, prayer —
    plus 4 new: slogan, story, paradox, list.
  - **Concept** (61): old Theme set (39 — dropped `self-acceptance`, renamed
    `self-deception`→`delusion`) + non-step Program tags (7: sponsorship,
    meetings, service, relapse, newcomer, fellowship, unity — `amends`
    dropped, redundant with Step 9) + `prayer-concept` (labelled "Prayer",
    distinct slug from Style's `prayer` so both can exist) + 14 new: anger,
    self-will, letting-go, loneliness, self-pity, expectations, serenity,
    present-moment, perfectionism, relationships, obsession, rock-bottom,
    purpose, mortality.
  - `assignments.js` left empty — clean slate stands, tag by hand as before.
- Colour tokens in `css/tokens.css`: `--tag-steps` (oxblood, reuses
  `--origin-religious`), `--tag-style` (brass, reuses `--origin-misc`),
  `--tag-concept` (pine, reuses `--origin-aa`) — same three-colour family as
  origin, applied via `data-group="Steps|Style|Concept"` on chip elements.
- Coloured every place tags render: facet nav chips + group headers
  (`render.js`), card-front tag chips (`render.js`), edit-modal/queue tag
  picker chips + group labels (`modals.js` shared `tagPicker`), draw-overlay
  tag chips (`modals.js`), queue "recent" chips (`tagger.js`), tag-manager
  rows — coloured left border + label text (`tagger.js`).
- New-tag creation in the shared picker now defaults its group `<select>` to
  Concept (was whichever group happened to sort first).
- Verified in browser: all 86 tags present and correctly grouped/ordered in
  the edit modal, Steps sort numerically 1–12, active-chip fill matches group
  colour, card-front chips inherit group colour after save, facet nav shows
  only groups with ≥1 tagged card (existing behaviour, unchanged), tag
  manager rows show correct colour + border per tag. `validate.py` passes.
