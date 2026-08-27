#!/usr/bin/env python3
"""
Pre-commit guard for the Wisdom data files. Run from the repo root:

    python scripts/validate.py

Exits non-zero (and prints what failed) if:
  - data/quotes.js is missing or malformed
  - any quote id is duplicated
  - any category is not quote | poem | prayer
  - data/assignments.js or data/origins.js references an id not in quotes.js
  - an origin value is not aa | religious | misc
  - the owner's name or an explicit sobriety-date pattern appears in quotes.js
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATEGORIES = {"quote", "poem", "prayer"}
ORIGINS = {"aa", "religious", "misc"}

# public site - block obvious personal identifiers from the generated corpus
PII_PATTERNS = [
    re.compile(r"\blane\s+haden\b", re.I),
    re.compile(r"\bfinite\s+lane\b", re.I),
    re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b"),          # 9/28/21
    re.compile(r"\b(sober|clean)\s+(since|on)\b", re.I),
]


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
    quotes = load_global(ROOT / "data" / "quotes.js", "window.Wisdom.quotes", None)
    if not isinstance(quotes, list) or not quotes:
        fail("data/quotes.js: not a non-empty array")
        return report()

    ids = set()
    for r in quotes:
        if r["id"] in ids:
            fail(f"duplicate quote id {r['id']}")
        ids.add(r["id"])
        if r.get("category") not in CATEGORIES:
            fail(f"id {r['id']}: bad category {r.get('category')!r}")
        for pat in PII_PATTERNS:
            if pat.search(r["text"]):
                fail(f"id {r['id']}: matches PII pattern /{pat.pattern}/ -> {r['text'][:60]!r}")

    assignments = load_global(ROOT / "data" / "assignments.js", "window.Wisdom.assignments", {})
    tags = load_global(ROOT / "data" / "tags.js", "window.Wisdom.tags", {"tags": {}})
    origins = load_global(ROOT / "data" / "origins.js", "window.Wisdom.origins", {})

    known_tags = set(tags.get("tags", {}))
    for qid, slugs in assignments.items():
        if int(qid) not in ids:
            fail(f"assignments.js: id {qid} not in quotes.js")
        for s in slugs:
            if known_tags and s not in known_tags:
                fail(f"assignments.js: id {qid} uses unknown tag {s!r}")

    for qid, val in origins.items():
        if int(qid) not in ids:
            fail(f"origins.js: id {qid} not in quotes.js")
        if val not in ORIGINS:
            fail(f"origins.js: id {qid} bad origin {val!r}")

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
