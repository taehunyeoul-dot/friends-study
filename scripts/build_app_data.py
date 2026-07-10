# -*- coding: utf-8 -*-
"""Copy episode/vocab data into the app folder and build app/data/index.json.

Run this after every extraction batch so the app picks up new vocab:
    python build_app_data.py
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EP = ROOT / "data" / "episodes"
VOCAB = ROOT / "data" / "vocab"
APP = ROOT / "app" / "data"


def main():
    (APP / "episodes").mkdir(parents=True, exist_ok=True)
    (APP / "vocab").mkdir(parents=True, exist_ok=True)

    manifest = json.loads((EP / "manifest.json").read_text(encoding="utf-8"))
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
            shutil.copy2(vocab_path, APP / "vocab" / f"{eid}.json")
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
