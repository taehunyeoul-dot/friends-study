# -*- coding: utf-8 -*-
"""Copy episode/vocab data into the app folder and build app/data/index.json.

Also augments each vocab expression with `occ`: up to 3 dialogue lines from
OTHER episodes where the same expression appears (표현 등장 지도).

Run this after every extraction batch so the app picks up new vocab:
    python build_app_data.py
"""
import bisect
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EP = ROOT / "data" / "episodes"
VOCAB = ROOT / "data" / "vocab"
APP = ROOT / "app" / "data"

STOP = {"someone", "somebody", "something", "sth", "sb", "one's", "ones",
        "a", "an", "the", "to", "be", "it", "that", "this", "of", "in", "on",
        "with", "and", "or", "you", "your", "name", "adjective", "number",
        "i", "is", "was", "so", "not", "no", "do", "did"}


def expr_keywords(expr):
    s = re.sub(r"\(([^)]*)\)", r" \1 ", expr)
    s = re.sub(r"\[[^\]]*\]", " ", s)
    s = re.sub(r"[/~,]", " ", s)
    words = [w.lower().removesuffix("'s") for w in re.findall(r"[A-Za-z']+", s)]
    return sorted({w for w in words if len(w) >= 3 and w not in STOP},
                  key=len, reverse=True)


def stem(w):
    return re.sub(r"(e|ed|ing|s)$", "", w) if len(w) > 4 else w


# 구 매칭용: 표현에서 자리표시어만 뺀 실제 단어열 (전치사·대명사 유지)
PLACEHOLDER = {"someone", "somebody", "something", "sth", "sb", "one's",
               "ones", "name", "adjective", "number", "x", "y"}


def phrase_words(alt):
    s = re.sub(r"\([^)]*\)", " ", alt)
    s = re.sub(r"\[[^\]]*\]", " ", s)
    words = [w.lower() for w in re.findall(r"[A-Za-z']+", s)]
    return [w for w in words if w not in PLACEHOLDER]


def phrase_in(words, tokens, max_gap=2):
    """words가 tokens 안에 순서대로(단어 사이 간격 max_gap 이하) 등장하는가."""
    stems = [stem(w) for w in words]
    n = len(tokens)
    for start in range(n):
        pos, i = start, 0
        while i < len(stems) and pos < n:
            if tokens[pos].startswith(stems[i]) or stems[i].startswith(tokens[pos]):
                i += 1
                pos += 1
            else:
                if i == 0:
                    break
                pos += 1
                if pos - start > len(stems) + max_gap * len(stems):
                    break
        if i == len(stems):
            return True
    return False


class Corpus:
    """전 시즌 대사 역색인 — 표현이 등장하는 다른 대사를 빠르게 찾는다."""

    def __init__(self, manifest):
        self.lines = []           # (ep_id, code, speaker, text)
        self.inv = {}             # token -> set(line_idx)
        for m in manifest:
            ep = json.loads((EP / f"{m['id']}.json").read_text(encoding="utf-8"))
            for l in ep["lines"]:
                if l["t"] != "dialogue":
                    continue
                idx = len(self.lines)
                self.lines.append((m["id"], m["code"], l["speaker"], l["text"]))
                for tok in set(re.findall(r"[a-z']+", l["text"].lower())):
                    self.inv.setdefault(tok, set()).add(idx)
        self.tokens = sorted(self.inv)

    def _candidates(self, kw):
        s = stem(kw)
        if len(s) < 3:
            return None
        lo = bisect.bisect_left(self.tokens, s)
        out = set()
        for t in self.tokens[lo:lo + 200]:
            if not t.startswith(s):
                break
            out |= self.inv[t]
        return out

    def find(self, expr, exclude_ep, limit=3):
        hits = set()
        for alt in expr.split("/"):
            words = phrase_words(alt)
            anchors = [w for w in words if len(stem(w)) >= 3]
            if not words or not anchors:
                continue
            anchor = max(anchors, key=len)
            cands = self._candidates(anchor) or set()
            for idx in cands:
                text = self.lines[idx][3]
                tokens = [stem(t) for t in re.findall(r"[a-z']+", text.lower())]
                if phrase_in(words, tokens):
                    hits.add(idx)
        out, seen_eps = [], set()
        for idx in sorted(hits):
            ep_id, code, speaker, text = self.lines[idx]
            if ep_id == exclude_ep or ep_id in seen_eps or len(text) > 260:
                continue
            seen_eps.add(ep_id)
            out.append({"ep": ep_id, "code": code, "speaker": speaker, "text": text})
            if len(out) >= limit:
                break
        return out


def main():
    (APP / "episodes").mkdir(parents=True, exist_ok=True)
    (APP / "vocab").mkdir(parents=True, exist_ok=True)

    manifest = json.loads((EP / "manifest.json").read_text(encoding="utf-8"))
    corpus = Corpus(manifest)
    index = []
    n_vocab = 0
    for m in manifest:
        eid = m["id"]
        shutil.copy2(EP / f"{eid}.json", APP / "episodes" / f"{eid}.json")
        vocab_path = VOCAB / f"{eid}.json"
        has_vocab = vocab_path.exists()
        expr_count = 0
        if has_vocab:
            vocab = json.loads(vocab_path.read_text(encoding="utf-8"))
            expr_count = len(vocab["expressions"])
            for x in vocab["expressions"]:
                x["occ"] = corpus.find(x["expression"], eid)
            (APP / "vocab" / f"{eid}.json").write_text(
                json.dumps(vocab, ensure_ascii=False), encoding="utf-8")
            n_vocab += 1
        index.append({
            "id": eid,
            "season": m["season"],
            "code": m["code"],
            "title": m["title"],
            "dialogueCount": m["dialogueCount"],
            "hasVocab": has_vocab,
            "exprCount": expr_count,
        })
    (APP / "index.json").write_text(
        json.dumps(index, ensure_ascii=False), encoding="utf-8")
    print(f"{len(index)} episodes copied, {n_vocab} with vocab -> {APP}")


if __name__ == "__main__":
    main()
