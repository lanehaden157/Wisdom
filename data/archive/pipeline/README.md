Retired in Phase 1 (2026-10-08). `build_data.py` generated the old data/quotes.js
from the v1 corpus + source/ files. Card data now lives directly in data/cards.js
(edited in the app); `scripts/migrate_to_cards.py` did the one-time conversion.
Paths inside build_data.py are relative to the old repo layout and will not run
as-is. Kept for history only.
