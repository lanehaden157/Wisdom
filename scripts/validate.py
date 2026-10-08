#!/usr/bin/env python3
"""
Pre-commit guard for the Wisdom data files. Run from the repo root:

    python scripts/validate.py

Exits non-zero (and prints what failed) if:
  - data/cards.js is missing, malformed, or has empty text / a bad or duplicate id
  - any category is not quote | poem | prayer
  - an origin value is not aa | religious | misc
  - a card uses a tag slug that isn't in data/tags.js, or a tag's group is unknown
  - a date pattern appears in a card, or a hashed protected identifier appears
    in ANY file in the repo (everything here is publicly served)
"""

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATEGORIES = {"quote", "poem", "prayer"}
ORIGINS = {"aa", "religious", "misc"}

# public site - block obvious personal identifiers from the generated corpus
PII_PATTERNS = [
    re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b"),          # any numeric date
    re.compile(r"\b(sober|clean)\s+(since|on)\b", re.I),
]

# The protected phrases are stored as sha256 of their normalised form (lowercase
# alphanumeric tokens joined by single spaces), so this public file doesn't spell
# them out. scan_tokens() hashes every 1-3 token window of a text and compares.
PII_HASHES = {
    "f9133f1f0eb4bb2be3cede1ce4f605efdc37f3deae7a67f4f85311b6397e65d9",
    "7462b868780d1e38c2f52b973e445977941b4b8d61a59c97c87cd60eb563cb0e",
    "e7e5c7bdd593588295668ce91d3154345722bf99a24e9fcbdf2d8a5d083feddb",
    "83ca98ad17ff7b1bee018c386be71acdd33901a3bfd239f43710e2c8737e5e8e",
    "e2a42207e32ba63c4bdd4df5a0872369dededcfe562f9175b12da6869226af13",
    "a1a417ce1433341eae9c3e0b36b926075569daf8fe3860b4a873207017d1514c",
    "bdeae905cd82e21fc5b45444c0e7551871df1922e9f27fc795f20fe9cd0036cf",
    "132d999778bec88a3d9919dd005d60445f71d1a0664652e2ef6010b46f9a73e6",
}
SKIP_DIRS = {".git", "node_modules"}


def scan_tokens(text):
    toks = re.findall(r"[a-z0-9]+", text.lower())
    for n in (1, 2, 3):
        for i in range(len(toks) - n + 1):
            if hashlib.sha256(" ".join(toks[i:i + n]).encode()).hexdigest() in PII_HASHES:
                return True
    return False


def scan_served_files():
    """Every file in the repo is publicly served - check them all."""
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file() or SKIP_DIRS & set(p.relative_to(ROOT).parts):
            continue
        try:
            txt = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if scan_tokens(txt):
            fail(f"{p.relative_to(ROOT).as_posix()}: contains a protected personal identifier")


def load_global(path, var, default):
    if not path.exists():
        return default
    txt = path.read_text(encoding="utf-8")
    m = re.search(r"=\s*(\{.*\}|\[.*\])\s*;?\s*$", txt, re.S)
    if not m:
        fail(f"{path.name}: could not find `{var} = ...` assignment")
    return json.loads(m.group(1))


errors = []


def fail(msg):
    errors.append(msg)


def main():
    cards = load_global(ROOT / "data" / "cards.js", "window.Wisdom.cards", None)
    if not isinstance(cards, list) or not cards:
        fail("data/cards.js: not a non-empty array")
        return report()
    tags = load_global(ROOT / "data" / "tags.js", "window.Wisdom.tags", {"tags": {}})
    known_tags = set(tags.get("tags", {}))

    ids = set()
    for r in cards:
        i = r.get("id")
        if not isinstance(i, int) or i < 1:
            fail(f"bad card id {i!r}")
            continue
        if i in ids:
            fail(f"duplicate card id {i}")
        ids.add(i)
        if not isinstance(r.get("text"), str) or not r["text"].strip():
            fail(f"id {i}: empty text")
            continue
        if r.get("category") not in CATEGORIES:
            fail(f"id {i}: bad category {r.get('category')!r}")
        if "origin" in r and r["origin"] not in ORIGINS:
            fail(f"id {i}: bad origin {r['origin']!r}")
        for s in r.get("tags", []):
            if s not in known_tags:
                fail(f"id {i}: uses unknown tag {s!r}")
        if len(set(r.get("tags", []))) != len(r.get("tags", [])):
            fail(f"id {i}: duplicate tags")
        for pat in PII_PATTERNS:
            if pat.search(r["text"]):
                fail(f"id {i}: matches PII pattern /{pat.pattern}/ -> {r['text'][:60]!r}")

    for slug, t_ in tags.get("tags", {}).items():
        if t_.get("group") not in tags.get("order", []):
            fail(f"tags.js: tag {slug!r} has group {t_.get('group')!r} not in order")

    scan_served_files()
    report()


def report():
    if errors:
        print(f"VALIDATION FAILED ({len(errors)})")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    print("validate.py: OK")


if __name__ == "__main__":
    main()
