# -*- coding: utf-8 -*-
"""Verify extracted vocab: check that each expression's dialogue actually
appears in the episode transcript (guards against hallucinated quotes).

Usage: python verify_vocab.py [id ...]   (no args = verify all files in data/vocab)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EP = ROOT / "data" / "episodes"
VOCAB = ROOT / "data" / "vocab"

SPEAKER_RE = re.compile(r"^[A-Za-z .,'&/#-]{1,40}:\s*")


def norm(s: str) -> str:
    # 지문 "(...)"은 양쪽 표기가 다를 수 있으므로 대조 전에 제거
    s = re.sub(r"\([^)]*\)", " ", s)
    return re.sub(r"[^a-z0-9]", "", s.lower())


def verify(vocab_path: Path):
    vocab = json.loads(vocab_path.read_text(encoding="utf-8"))
    ep = json.loads((EP / f"{vocab['id']}.json").read_text(encoding="utf-8"))
    transcript = norm(" ".join(l["text"] for l in ep["lines"]))
    ok, bad = 0, []
    for x in vocab["expressions"]:
        # 화자 라벨("Name:") 기준으로 대사 조각을 분리 (줄바꿈 유무와 무관)
        segments = re.split(r"[A-Z][A-Za-z .,'&/#-]{0,30}:\s*", x["dialogue"])
        keys = [norm(s)[:50] for s in segments if len(norm(s)) >= 10]
        if keys and any(k in transcript for k in keys):
            ok += 1
        else:
            bad.append(x["expression"])
    status = "OK " if not bad else "WARN"
    print(f"{status} {vocab['id']}: {ok}/{len(vocab['expressions'])} verified"
          + (f" | not found: {', '.join(bad)}" if bad else ""))
    return not bad


def main():
    ids = sys.argv[1:]
    files = ([VOCAB / f"{i}.json" for i in ids] if ids
             else sorted(VOCAB.glob("s*.json")))
    results = [verify(f) for f in files]
    print(f"\n{sum(results)}/{len(results)} episodes fully verified")


if __name__ == "__main__":
    main()
