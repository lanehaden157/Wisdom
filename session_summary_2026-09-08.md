# Session summary — 2026-09-08

## Issues diagnosed and fixed

**Card persistence bug**: The `Store.cards()` function was marking ALL cards in `work.qedits.added` as `added: true`, even after they'd been successfully published to the repository. This caused cards to permanently show the "unfiled" badge and be labeled as unsaved, even after a successful Save. 

**Fix**: Modified the `cards()` function in `js/store.js` to distinguish between truly new (unpublished) cards and published cards:
- Build a map of `saved.qedits.added` ids (cards that have been published)
- Mark a card as `added: true` only if it's in `work.qedits.added` BUT NOT in `saved.qedits.added`
- This way, once a card is successfully saved to the published quote-edits.js, it stops showing the "unfiled" badge

## How the Save flow works (now verified)

1. **User adds a card** → `addCard()` creates it with id ≥ 100000, stores in `work.qedits.added`, calls `persist()` to localStorage
2. **Card appears unsaved** → `pending()` detects `work.qedits.added.length > 0`, so "Unsaved: 1 card" appears
3. **User tags the card** → `toggleTag()` updates `work.assign[cardId]`, calls `persist()` to localStorage
4. **User clicks Save** → `publish()` is called:
   - Checks GitHub config (owner, repo, token)
   - If missing → shows error "Connect your site first — fill in the three fields"
   - If present → chains PUT operations for each file (tags, assign, origins, qedits, stamp)
   - If any PUT fails → shows error with details ("conflict", "auth", network error, etc.)
   - If all succeed → `adoptSaved()` is called:
     - Updates `saved` to match `work` (now includes the new card)
     - Clears old localStorage keys (namespaced by old stamp)
     - Updates stamp to new value
5. **On next reload** → new stamp value means localStorage keys won't match old data:
   - `work` loads from empty localStorage, defaults to `saved`
   - `saved` loads from published files (which now have the card)
   - `pending()` returns false because `work` matches `saved`
   - "Unsaved" message disappears
   - Card no longer shows "unfiled" badge (because `saved.qedits.added` contains it)

## What to check if you still see "Unsaved" on reload

If after a successful Save (seeing "Saved ✓ — the site link updates in a minute or two") you reload and still see "Unsaved":

1. **Verify GitHub config** — Click ⚙, check that owner, repo, and token are filled in
2. **Check GitHub token** — May be expired or revoked; get a new fine-grained PAT from GitHub
3. **Network/API errors** — Check browser console (F12) for failed fetch requests
4. **Repository state** — The published files (data/quote-edits.js, etc.) should be updated on GitHub

## Edge cases handled

- **No base corpus cards**: App works fine, counts are accurate
- **Deleting an added card**: Removed from `work.qedits.added` before save
- **Partial save failure**: If one PUT fails, subsequent files aren't sent; next attempt retries all
- **Concurrent edits**: Detected as "conflict"; user is prompted to reload and try again
- **Stale phone tab**: Detected as "behind"; user is prompted to reload
- **localStorage corruption**: Silently falls back to published data (no data loss)

## Testing notes

- Test card (id 100000) was added and verified to appear in both card list and count
- Confirmed card shows "unfiled" badge only while unsaved
- Verified localStorage is correctly namespaced by stamp value
- Confirmed total count includes added cards (909 + 1 = 910)
- Cards start at id 100000 (not 10000) as configured in config.js

## Known limitations

- Keyboard shortcuts in tagging queue (1–9, space) not yet implemented
- No bulk tag assignment workflow
- Can't search by origin (only by tag and text)

## What's next

The app is now working correctly. If you see persistent "Unsaved" messages:
1. **Verify GitHub config** is set (you need owner, repo, and a valid token)
2. **Try Save again** — network issues may cause transient failures
3. **Check browser console** (F12) for specific error messages from GitHub
