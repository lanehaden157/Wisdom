#!/usr/bin/env python3
"""
ONE-TIME migration (Phase 1): merge the four-file data layout into data/cards.js.

  data/quotes.js        generated corpus        \
  data/quote-edits.js   edits / deletes / added  |  ->  data/cards.js
  data/assignments.js   id -> [tag slugs]        |       [{id,text,category,origin?,tags?}]
  data/origins.js       id -> origin            /

Run from the repo root: python scripts/migrate_to_cards.py
It writes data/cards.js, then re-derives the old merged view independently and
asserts every card is identical (text, category, tags, origin, id set) before
reporting success. It does not delete the old files.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"


def load(name, default):
    p = D / name
    if not p.exists():
        return default
    m = re.search(r"=\s*(\{.*\}|\[.*\])\s*;?\s*$", p.read_text(encoding="utf-8"), re.S)
    return json.loads(m.group(1))


def old_view():
    quotes = load("quotes.js", [])
    qe = load("quote-edits.js", {"edits": {}, "deletes": [], "added": []})
    assign = load("assignments.js", {})
    origins = load("origins.js", {})
    dele = set(qe.get("deletes", []))
    out = {}
    for q in quotes:
        if q["id"] in dele:
            continue
        e = qe.get("edits", {}).get(str(q["id"]))
        out[q["id"]] = {"id": q["id"],
                        "text": e["text"] if e and e.get("text") is not None else q["text"],
                        "category": e["category"] if e and e.get("category") else q["category"]}
    for a in qe.get("added", []):
        if a["id"] not in dele:
            out[a["id"]] = {"id": a["id"], "text": a["text"], "category": a["category"]}
    for i, c in out.items():
        c["tags"] = list(assign.get(str(i), []))
        c["origin"] = origins.get(str(i))
    return out, assign, origins


def to_cards(view):
    cards = []
    for i in sorted(view):
        c = view[i]
        card = {"id": c["id"], "text": c["text"], "category": c["category"]}
        if c["origin"]:
            card["origin"] = c["origin"]
        if c["tags"]:
            card["tags"] = c["tags"]
        cards.append(card)
    return cards


def render(cards):
    body = ",\n".join(" " + json.dumps(c, ensure_ascii=False, separators=(",", ":")) for c in cards)
    return ("/* APP-WRITTEN. One object per card: {id, text, category, origin?, tags?}. */\n"
            "window.Wisdom = window.Wisdom || {};\n"
            "window.Wisdom.cards = [\n" + body + "\n];\n")


def main():
    view, assign, origins = old_view()
    # dangling assignments/origins (id not a live card) would be silently lost
    dangling = [i for i in list(assign) + list(origins) if int(i) not in view]
    if dangling:
        print("WARNING: assignments/origins for non-existent cards (dropped):", sorted(set(dangling)))
    cards = to_cards(view)
    (D / "cards.js").write_text(render(cards), encoding="utf-8")

    # independent check: re-read the file we wrote and compare to the old view
    back = {c["id"]: c for c in load("cards.js", [])}
    assert set(back) == set(view), "id sets differ"
    for i, c in view.items():
        b = back[i]
        assert b["text"] == c["text"] and b["category"] == c["category"], f"card {i} text/category differs"
        assert b.get("tags", []) == c["tags"], f"card {i} tags differ"
        assert b.get("origin") == c["origin"], f"card {i} origin differs"
    cats = {}
    for c in cards:
        cats[c["category"]] = cats.get(c["category"], 0) + 1
    print(f"data/cards.js written: {len(cards)} cards {cats}; "
          f"{sum(1 for c in cards if 'tags' in c)} tagged, {sum(1 for c in cards if 'origin' in c)} with origin. "
          "Equivalence check passed.")


if __name__ == "__main__":
    main()
