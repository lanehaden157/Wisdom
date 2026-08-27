#!/usr/bin/env python3
"""
Wisdom data pipeline.

Reads hand-edited source files, writes exactly one output: data/quotes.js
(the base corpus the app loads). Run from the repo root:

    python scripts/build_data.py

INVARIANT: this script writes data/quotes.js and updates source/ids.json.
It NEVER touches data/tags.js, data/assignments.js, data/origins.js or
data/quote-edits.js - those are owned by the app and hold the manual
tagging / classification work.

Inputs
  data/archive/quotes-v1.json      frozen v1 corpus {corpus:[{id,quote,tags}], facet_map:{}}
  source/quotes-raw.txt            raw quote dump (reference only; not parsed here)
  source/poems-prayers-raw.txt     raw poems + prayers, blank-line separated,
                                   two section headers: "Poems" then "Prayers"
  source/patches/new-quotes.json   {quotes:[{text,category}]} appended after the base corpus
  source/ids.json                  append-only ledger: normalized-text-hash -> int id

Output
  data/quotes.js    window.Wisdom.quotes = [{id, text, category}, ...]
  source/ids.json   updated ledger
  scripts/last-build.txt + stdout   build manifest
"""

import hashlib
import json
import re
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / "data" / "archive" / "quotes-v1.json"
PP_RAW = ROOT / "source" / "poems-prayers-raw.txt"
NEW_QUOTES = ROOT / "source" / "patches" / "new-quotes.json"
IDS = ROOT / "source" / "ids.json"
OUT = ROOT / "data" / "quotes.js"
MANIFEST = ROOT / "scripts" / "last-build.txt"

# Poems section: 1-based indices of blank-line-separated blocks that belong to
# the SAME poem. Anything not listed is its own poem. Tied to the current
# poems-prayers-raw.txt; update if the poem set changes.
POEM_BLOCK_GROUPS = [
    [1, 2, 3, 4, 5, 6, 7, 8, 9],   # "I stand by the door"
    [12, 13],                       # "A Creed For Those Who Have Suffered" (title + body)
]
# Above this text-similarity ratio a poems/prayers item is treated as the same
# quote as a corpus entry: it keeps that id and leaves the Quotes tab.
MATCH_THRESHOLD = 0.86

RSQUO, LSQUO = chr(0x2019), chr(0x2018)
RDQUO, LDQUO = chr(0x201D), chr(0x201C)
LSEP, PSEP = chr(0x2028), chr(0x2029)


def curl(s):
    """Straight apostrophes -> curly, to match the v1 corpus house style."""
    return s.replace("'", RSQUO)


def clean_pp(s):
    """Normalise the odd line separators found in the raw poems file."""
    return s.replace(LSEP, "\n").replace(PSEP, "\n").replace("\r\n", "\n")


def norm(s):
    s = unicodedata.normalize("NFKD", s)
    for a, b in [(RSQUO, "'"), (LSQUO, "'"), (RDQUO, '"'),
                 (LDQUO, '"'), (LSEP, " "), (PSEP, " ")]:
        s = s.replace(a, b)
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def text_hash(s):
    return hashlib.sha1(norm(s).encode("utf-8")).hexdigest()[:16]


def parse_poems_prayers(raw):
    raw = clean_pp(raw)
    blocks = [b.strip("\n") for b in re.split(r"\n\s*\n", raw) if b.strip()]

    group_of = {}
    for g in POEM_BLOCK_GROUPS:
        for idx in g:
            group_of[idx] = g[0]

    section = None
    poem_n = 0
    poem_buf = {}
    prayers = []
    for b in blocks:
        head = b.strip()
        if head in ("Poems", "Prayers"):
            section = head
            continue
        if section == "Poems":
            poem_n += 1
            key = group_of.get(poem_n, poem_n)
            poem_buf.setdefault(key, []).append(b)
        elif section == "Prayers":
            prayers.append(b.strip())

    poems = ["\n\n".join(v).strip() for _, v in sorted(poem_buf.items())]
    return [("poem", t) for t in poems] + [("prayer", t) for t in prayers]


def main():
    archive = json.loads(ARCHIVE.read_text(encoding="utf-8"))
    corpus = archive["corpus"]  # [{id, quote, tags}]

    ledger = {}
    if IDS.exists():
        ledger = json.loads(IDS.read_text(encoding="utf-8")).get("hash_to_id", {})
    for c in corpus:
        ledger.setdefault(text_hash(c["quote"]), c["id"])
    next_id = max(list(ledger.values()) + [c["id"] for c in corpus]) + 1

    def id_for(text):
        nonlocal next_id
        h = text_hash(text)
        if h not in ledger:
            ledger[h] = next_id
            next_id += 1
        return ledger[h]

    corpus_norm = [(norm(c["quote"]), c) for c in corpus]
    pp_items = parse_poems_prayers(PP_RAW.read_text(encoding="utf-8"))

    moved = {}      # corpus id -> (category, poems-file text)
    new_pp = []     # brand-new poem/prayer records
    manifest = []

    for category, text in pp_items:
        n = norm(text)
        best_c, best_r = None, 0.0
        for cn, c in corpus_norm:
            r = SequenceMatcher(None, n, cn).ratio()
            if r > best_r:
                best_c, best_r = c, r
        first_line = text.splitlines()[0][:58]
        if best_r >= MATCH_THRESHOLD:
            # keep the stable corpus id, but take the poems-file text (better
            # line breaks) since that file is authoritative for these tabs
            moved[best_c["id"]] = (category, curl(text))
            manifest.append(
                "  move  #%-4d -> %-6s (r=%.2f)  %s" % (best_c["id"], category, best_r, first_line))
        else:
            rid = id_for(text)
            new_pp.append({"id": rid, "text": curl(text), "category": category})
            manifest.append(
                "  new   #%-4d    %-6s             %s" % (rid, category, first_line))

    out = []
    for c in corpus:
        if c["id"] in moved:
            cat, text = moved[c["id"]]
            out.append({"id": c["id"], "text": text, "category": cat})
        else:
            out.append({"id": c["id"], "text": c["quote"], "category": "quote"})

    np = json.loads(NEW_QUOTES.read_text(encoding="utf-8")).get("quotes", [])
    for q in np:
        rid = id_for(q["text"])
        out.append({"id": rid, "text": curl(q["text"]), "category": q.get("category", "quote")})
        manifest.append("  add   #%-4d    %-6s             %s"
                        % (rid, q.get("category", "quote"), q["text"][:58]))

    out.extend(new_pp)
    out.sort(key=lambda r: r["id"])

    payload = json.dumps(out, ensure_ascii=False, indent=1)
    OUT.write_text(
        "/* GENERATED by scripts/build_data.py - do not hand-edit. */\n"
        "window.Wisdom = window.Wisdom || {};\n"
        "window.Wisdom.quotes = " + payload + ";\n",
        encoding="utf-8")
    IDS.write_text(json.dumps(
        {"_comment": "append-only: normalized-text-hash -> stable quote id",
         "hash_to_id": ledger}, ensure_ascii=False, indent=1), encoding="utf-8")

    cats = {}
    for r in out:
        cats[r["category"]] = cats.get(r["category"], 0) + 1
    summary = (
        "build_data.py\n"
        "  quotes.js : %d cards  " % len(out)
        + "  ".join("%s=%d" % (k, v) for k, v in sorted(cats.items()))
        + "\n  poems/prayers: %d matched+moved, %d new\n" % (len(moved), len(new_pp))
        + "  appended new quotes: %d\n" % len(np)
        + "  id ledger: %d entries, next id %d\n\n" % (len(ledger), next_id)
        + "\n".join(manifest) + "\n")
    MANIFEST.write_text(summary, encoding="utf-8")
    print(summary)


if __name__ == "__main__":
    sys.exit(main())
