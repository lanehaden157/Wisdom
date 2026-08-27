# Wisdom refactor plan

Status: **built** (2026-08-26). Phases 0–3 and 5–7 done; Phase 4 reduced to
appending 2 new quotes (owner prefers the frozen corpus over a raw re-import);
Phase 8 partly done (untagged filter yes, queue keyboard shortcuts no).
`CLAUDE.md` describes the app as built — the notes below are the original plan
plus a "what actually happened" section at the end.

## What actually happened

- Owner: keep the frozen v1 corpus wording; `source/quotes-raw.txt` is only a
  diff reference. `diff(raw, corpus)` showed the corpus IS the cleaned raw —
  only 2 genuinely new quotes, now in `source/patches/new-quotes.json`.
- No `anonymize.json` / `merges.json` / `text-fixes.json` — not needed against
  the already-clean corpus. `validate.py` keeps a PII guard anyway.
- Poems/prayers: `source/poems-prayers-raw.txt` is authoritative for those two
  tabs. Pipeline matches each item to the corpus (ratio ≥ 0.86): 14 matched
  cards moved out of Quotes keeping their id + taking the poems-file text; 11
  new poem/prayer cards. Poem block grouping is a constant in `build_data.py`.
- Data files load as plain `<script>` globals (`window.Wisdom.*`), not `fetch`,
  so `file://` works. JS is plain ordered scripts, no modules.
- `quotes.js` field is `text` (not `quote`); an app-written `quote-edits.js`
  carries edits/deletes/added; a `stamp.js` carries the publish stamp.
- Tag groups: `tags.js` holds `order` + per-group optional `categories` scope.

## Goals

1. Split the single `index.html` into individually editable files — quote text,
   tags, aesthetics, card logic each in their own place.
2. Keep the app as plain static files GitHub Pages serves as-is. **No JS
   bundler.** Edits (including from the phone) must deploy instantly.
3. "Pipeline" = an offline Python data-generation step, not a JS build.
4. Re-import the owner's raw quote data as the source of truth for quote text.
5. Discard the auto-generated 67-tag taxonomy. Rebuild tags by hand from
   scratch, inside the app, over time — existing cards and new ones.
6. Three category tabs — Quotes / Poems / Prayers — same functionality, own
   grouping and presentation per tab.
7. Manual origin coloring — AA-sourced vs religious vs misc — set by hand.

## Decisions locked

- No build step for app code. Files served directly, loaded at runtime.
- `<script>` tags plain and ordered (not ES modules — modules break `file://`
  and would kill trivial local dev).
- Old tag assignments: **archived, hidden** in `data/archive/quotes-v1.json`.
- Data shape: quote text and tag assignments in **separate files**.
  `quotes.json` = text (+ category); `assignments.json` = quote id → tag slugs.
- Raw re-import: **replace all quote text from raw**, carry every prior hand fix
  forward as a derived, versioned patch set (Phase 4). **Confirmed by owner.**
- `category` (quote/poem/prayer) is a field in `quotes.json`, pipeline-assigned
  from which source file the item came from — not a tag, not app-editable.
  Reclassify by moving the entry at source and rebuilding.
- `origin` (aa/religious/misc) is one manual value per card in `origins.json`,
  app-written, no seed. Drives card color.

## Why no bundler

The phone Save button PUTs a finished `index.html` and the live site updates in
~1 min. A bundler means committing source, waiting on a GitHub Action, and a
new "build broke, site is stale" failure mode. Not worth it for a single-user
static site. Runtime-loaded files give individual editability with zero added
latency.

## Target file layout

```
source/                      hand-edited inputs, feed the pipeline
  quotes-raw.*               owner's raw quotes dump — source of truth for text
  poems-prayers-raw.*        owner's raw poems + prayers, provided separately;
                             authoritative for the poem/prayer category split
  patches/
    anonymize.json            personal-identifier rewrites (name, sobriety date)
    merges.json               duplicate pairs → chosen survivor
    text-fixes.json           typo + God-pronoun-capitalization fixes, each with
                              an explicit id remap (the fix changes the hash)
  ids.json                   append-only ledger: normalized-text-hash → int id
scripts/
  build_data.py              source + patches -> data/quotes.json  (ONLY that file)
  validate.py                pre-commit guards
data/
  quotes.json                GENERATED. [{id, text, category}]. Never hand-edit,
                             app never writes it.
  tags.json                  APP-WRITTEN. {slug: {label, group}} + group order +
                             optional per-group category scope.
  assignments.json           APP-WRITTEN. {quoteId: [slug, ...]}.
  origins.json               APP-WRITTEN. {quoteId: "aa" | "religious" | "misc"}.
  archive/quotes-v1.json     frozen: original corpus with old 67-tag assignments
index.html                   shell: <head>, mount points, <link>/<script> tags
css/
  tokens.css                 :root palette, type scale, spacing, origin colors
  layout.css                 topbar, tabs, grid, breakpoints
  components.css             card, chip, modal, overlay, poem/prayer card variants
js/
  config.js                  storage keys, API paths, category list, group order
  store.js                   load data, apply localStorage overlay, persist
  github.js                  Contents API, per-file SHA, 409 conflict detection
  filter.js                  search + tag filtering (within active category)
  render.js                  card / facet-nav / results-meta DOM
  tabs.js                    category routing + per-category presentation
  tagger.js                  tagging queue + tag manager (+ origin setting)
  modals.js                  edit / settings / draw
  app.js                     wiring + init
```

Python: **stdlib only** (`json`, `hashlib`, `re`, `pathlib`). No venv, no pip.

## Category tabs

- Three tabs: **Quotes / Poems / Prayers**. Each card has exactly one
  `category`. The tab bar filters the corpus to that category; search, tag
  filter, Draw, Add, and Edit all operate within the active tab.
- Presentation per tab: Quotes = current card grid. Poems / Prayers = preserve
  line breaks and stanza whitespace, taller cards, likely 1–2 columns; Prayers
  may center. Refined once real data lands in Phase 4 (only a handful of
  poem/prayer cards exist in v1).
- Grouping per tab: one shared tag vocabulary and one `assignments.json`. Facet
  nav recomputes counts for the active category, so prayer-relevant tags simply
  show zero in the Quotes tab. A `tags.json` group may optionally declare which
  categories it appears in (default: all).
- Add card: category defaults to the active tab; editable in the add modal.
- Draw: pulls from the active tab's currently-filtered pool.

## Origin coloring

- `origins.json`: `{quoteId: "aa" | "religious" | "misc"}`, one value per card,
  fully manual, no pipeline seed.
- Drives a subtle card treatment (border / corner / wash) — must sit inside the
  cream/oxblood palette, defined as tokens in `css/tokens.css`.
- Set in-app: a three-way control in the edit modal and in the tagging queue
  (tag + classify origin in the same pass).
- Not a tag and not a category — a separate axis with its own file.

## Invariants (enforce in code where possible)

1. `build_data.py` writes `data/quotes.json` and nothing else. If a rebuild
   ever overwrote `assignments.json` / `tags.json` / `origins.json` it would
   erase the retagging and classification work.
2. `validate.py` exits non-zero if:
   - any `assignments.json` or `origins.json` key references a quote id absent
     from `quotes.json`
   - any `category` value is not `quote` / `poem` / `prayer`
   - the owner's name or exact sobriety-date pattern appears in `quotes.json`
     (a one-time cleanup becomes a permanent guard on a public site)
3. Quote ids are stable forever. Rebuild matches raw quotes to `ids.json` by
   normalized-text-hash and reuses the id. New quotes get the next int. Ledger
   ids absent from raw are **flagged for human review, never silently dropped.**
4. No id-renumbering step ships after tagging begins (Phase 7).

## Raw re-import (Phase 4)

Confirmed: raw = source of truth for quote text. `index.html` currently holds
~48 deliberate hand fixes (3 quotes rewritten to remove the owner's name /
sobriety date on a PUBLIC site; 4 duplicate pairs merged; ~40 typo +
God-pronoun-capitalization fixes). Approach: derive the patch set from
`diff(raw, current corpus)`, review it once with the owner, freeze it into
`source/patches/*.json`. From then on the pipeline reapplies all fixes on every
build — manual one-off edits become declarative and re-runnable. Anonymization
must be verified before anything public ships.

## Phased approach

Each phase independently shippable. Never change code and data in the same
phase — it makes bugs impossible to localize.

| # | Step | What moves | Risk |
|---|------|------------|------|
| 0 | Freeze v1 — archive `index.html` and the current corpus (with 67-tag assignments) into `data/archive/` | nothing live | none |
| 1 | Pipeline v1 — `build_data.py` extracts the *current* corpus from `index.html` → `data/quotes.json`; seed `category` from existing `poem`/`prayer` Form tags; seed `source/ids.json` | data files appear, ids unchanged | low |
| 2 | Split CSS/JS out of `index.html`; app `fetch()`es `data/*.json` at load; **zero behavior change** | code only | medium, mechanical |
| 3 | Category tabs — tab bar, category routing, per-category card presentation | code only, v1 data | low |
| 4 | Pipeline v2 — swap input to the two raw files; derive `patches/*` from `diff(raw, current corpus)`; **review the diff with the owner** | quote text + categories | medium |
| 5 | Rewrite Save — per-file PUT of small JSON, SHA tracking, 409 → merge prompt; delete the DOM-serialization + token-scrub path | code only | medium |
| 6 | Tag manager — list tags w/ usage counts; create, rename, merge, delete, reassign group | new feature | low |
| 7 | Tagging queue — full-screen card, recently-used-first palette, in-flow tag creation, origin control, skip/next/back, progress, per-tap persist | new feature; **ids now frozen** | low |
| 8 | Polish — "untagged" filter, tagging stats, desktop keyboard shortcuts (1–9 toggle tag, space = next) | additive | low |

Phase 2 ships with **no new features**.

## Retagging UX detail

**Tagging queue** (primary new screen)
- One card at a time, full screen. Tag palette below, recently-used first
  (tagging is bursty and thematic — biggest speed win).
- Tag search box = tag creation: type a word → no match → "+ create <word>" →
  choose its group → applied immediately.
- Origin control on the same screen — set aa / religious / misc in the same pass.
- Controls: Skip, Next, Back. Progress: `card 47 · 312 tagged · 24 skipped`.
- Queue order: sequential | random | shortest-first. Optional filter to the
  active category or to untagged-only.
- Every tap writes to localStorage immediately. Prompt to Save ~every 25 cards.

**Tag manager** (separate, occasional)
- Every tag with its usage count. Rename, delete, reassign group.
- **Merge** two tags into one (union their assignments). Tagging 910 cards from
  scratch guarantees near-duplicate tags to collapse later.

**Groups** — `tags.json` carries each tag's group, the group display order, and
optional category scoping, replacing the old `#facet-map-data` + `FACET_ORDER`.

## Save / conflict model (Phase 5)

Current Save serializes the entire live DOM back to `index.html` and PUTs it —
the only reason the token-scrub hack exists. Target: PUT just the file that
changed (`assignments.json`, `origins.json`, `tags.json`; `quotes.json` only
via a pipeline commit). Track each file's GitHub blob SHA; a stale PUT returns
409 → "the phone published since you loaded — reload and merge?". First time
phone-vs-computer conflicts are detectable from the repo side.

PAT unchanged: fine-grained, this repo only, Contents: r/w, entered once via ⚙,
stored in localStorage `wisdom_site_config_v1`, never written into a served file.

## Known tradeoffs

- ES modules would break `file://` → plain ordered `<script>` tags instead.
- ~15 requests instead of 1. HTTP/2 on Pages makes this a non-issue in
  practice; concatenate later only if bad signal in a meeting actually bites.
- After Phase 7 starts, the app is briefly weak at its real job: ~910 untagged
  cards, no facet browsing until retagging catches up. Search still works.
  Optional mitigation: a "legacy tags" toggle reading `archive/quotes-v1.json`
  until the new taxonomy is usable.

## Open questions for the owner

1. The two raw files — what format (PDF text dump? export?), and does the quotes
   file predate the hand cleanups? Determines whether Phase 4 is a diff review
   or a straight swap. (Poems/prayers file is new content — no prior fixes to
   preserve there.)
2. Poem / prayer presentation preferences — column count, alignment, whether
   attribution lines are shown. Can wait until Phase 3/4.
