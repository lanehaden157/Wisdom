# Session summary — 2026-09-08 (2)

Follow-up to the earlier 09-08 session. Lane reported: new cards stay "unfiled"
after saving, "Unsaved" nag on every page load, new card numbers start at 100000
instead of continuing the sequence, and possibly not counted in totals.

## Root causes

1. **The earlier 09-08 `store.js` fix was never committed.** It sat as an
   uncommitted working-tree change. GitHub Pages (and Lane's phone) kept serving
   the code from commit `5ea55b8`, which still hard-coded `added: true`. So the
   "unfiled after saving" fix simply wasn't live.

2. **`pending()` never cleared for card changes.** It computed
   `q = edits.length + deletes.length + added.length` and returned
   `any: q > 0 || …`. A published added-card lives in `work.qedits.added`
   forever, so `q` stayed ≥ 1 and the "Unsaved — hit Save to publish" note
   showed on *every* load, even immediately after a successful Save. (The
   assign/origins/tags checks already did the right thing — a JSON diff against
   `saved`.) Fixed by diffing `work.qedits` vs `saved.qedits` the same way.

3. **New-card ids jumped to 100000.** `addCard()` based the id on
   `config.addedIdBase` (100000). Changed to `nextId()` = one past the highest
   id anywhere (corpus max 934 → first new card is 935). `build_data.py` now
   also reserves the `added` ids from `data/quote-edits.js` when computing its
   `next_id`, so a future corpus rebuild can't collide with an app-created id.

4. **Count was never actually wrong.** Added cards were always in `Store.cards()`
   and counted in the tab badges and results meta. It *looked* wrong because the
   card was stuck showing "unfiled" / "Unsaved", so it read as not-really-there.

5. **Asset caching made fixes look ineffective.** GitHub Pages serves css/js
   with ~10 min max-age. Added `?v=20260908` to the css/ and js/ script tags in
   `index.html` (deliberately NOT the data/ tags — Save rewrites those and they
   must revalidate normally). Bump the query string whenever code ships.

## Files changed

- `js/store.js` — kept the (now-committed) `cards()` fix; rewrote `pending()`;
  `addCard()` → `nextId()`.
- `js/config.js` — `addedIdBase` now a dead fallback, comment updated.
- `js/github.js` — Save success toast explains the Pages cache lag.
- `scripts/build_data.py` — reserves `quote-edits.js` `added` ids in `next_id`.
- `index.html` — `?v=` cache-busting on css/js.
- `data/quote-edits.js` — header comment (ids "continue past the corpus").

`python scripts/build_data.py` + `scripts/validate.py`: corpus output
byte-identical, validate OK.

## Verified (preview browser)

- Add card → id **935**; second add → 936; third → 937.
- While pending: "unfiled" badge + "Unsaved: 1 card" note; Quotes tab 910,
  "910 of 910 quotes", total 935.
- After `adoptSaved` (simulated publish): badge gone, note gone,
  `pending().any === false`. A later add correctly re-flags pending.

## Renumbering the 4 live cards (done, second commit)

Push #1 rebased onto 5 site-published saves that were on origin but not local —
tagging work plus the first 4 app-created cards, already saved at ids
**100000-100003** (card 100000 had 15 tags + an `aa` origin).

Lane chose to renumber them. Changed by hand:
- `data/quote-edits.js`: the 4 `id` values → 935, 936, 937, 938.
- `data/assignments.js`: key `"100000"` → `"935"` (tags unchanged).
- `data/origins.js`: key `"100000"` → `"935"`.
- `data/stamp.js`: `1788884637166` → `1788894147242` — bumping it means any
  device still holding localStorage under the old stamp loads clean from the
  renumbered files instead of resurrecting the 100000-series ids.

`scripts/validate.py` had a latent bug this exposed: it only knew corpus ids, so
a tag/origin on any app-created card failed validation (it had been silently
failing on card 100000). It now folds `quote-edits.js` `added` ids into the
known set and checks them for collision / bad category / PII.

Verified in a fresh browser tab: 938 cards, Quotes tab 913, no "Unsaved" nag,
card 935 keeps its 15 tags + `aa` origin, ids 935-938 unique, next new card 939.

## Not done / open
- The ~10 min Pages cache window still means "Save, then wait a few minutes or
  hard-refresh" for the *public* link. In-tab it's instant after Save.
- If Lane has no ⚙ GitHub connection set, added cards persist in localStorage
  but can never leave "Unsaved" — that's correct behaviour, not a bug.
- Still open from before: tagging-queue keyboard shortcuts (1–9, space).
- Cleared this preview browser's localStorage during testing (localhost:4173
  only — not Lane's real browser / token).
