# -*- coding: utf-8 -*-
"""Parse Friends season transcript text files into per-episode JSON.

Input : data/raw/seasonNN.txt  (converted from the original .doc files)
Output: data/episodes/sNNeNN.json  +  data/episodes/manifest.json

Episode JSON structure:
{
  "id": "s01e01", "season": 1, "episodes": [1], "code": "101",
  "title": "The One Where Monica Gets a New Roommate",
  "lines": [
    {"t": "scene", "text": "Central Perk, Chandler, Joey, ..."},
    {"t": "dialogue", "speaker": "Monica", "text": "There's nothing to tell!"},
    {"t": "direction", "text": "They all stare, bemused."}
  ]
}
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "episodes"

HEADER_RE = re.compile(r"^\s*(\d{3,4})(?:\s*-\s*(\d{3,4}))?\.\s+(.+?)\s*$")
SCENE_RE = re.compile(r"\[\s*Scene\s*:?\s*(.*?)\]", re.IGNORECASE)
DIALOGUE_RE = re.compile(r"^([A-Z][A-Za-z .,'&/#-]{0,40}?):\s+(\S.*)$")
# Metadata/credit lines to drop entirely
META_RE = re.compile(
    r"^\s*(written by|teleplay by|story by|directed by|transcribed by|"
    r"additional transcribing|adjustments by|transcriber|with help from|"
    r"minor additions|note)\b.*:?",
    re.IGNORECASE,
)


def read_text(path: Path) -> str:
    data = path.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "cp1252", "cp949"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def is_header(line: str, season: int):
    m = HEADER_RE.match(line)
    if not m:
        return None
    lo = int(m.group(1))
    if not (season * 100 < lo < season * 100 + 30):
        return None
    eps = [lo % 100]
    if m.group(2):
        hi = int(m.group(2))
        if season * 100 < hi < season * 100 + 30:
            eps.append(hi % 100)
    return eps, m.group(3).strip()


def normalize_speaker(name: str) -> str:
    name = name.strip()
    if name.isupper() and len(name) > 2:
        return name.title()
    return name


def parse_episode_lines(raw_lines):
    out = []
    for line in raw_lines:
        line = line.strip()
        if not line or META_RE.match(line):
            continue
        # Pull out embedded [Scene: ...] markers (they sometimes share a line
        # with dialogue text).
        scenes = SCENE_RE.findall(line)
        line_wo_scene = SCENE_RE.sub("", line).strip()

        if line_wo_scene:
            m = DIALOGUE_RE.match(line_wo_scene)
            if m:
                out.append({
                    "t": "dialogue",
                    "speaker": normalize_speaker(m.group(1)),
                    "text": m.group(2).strip(),
                })
            else:
                text = line_wo_scene.strip("()").strip()
                if text:
                    out.append({"t": "direction", "text": text})
        for sc in scenes:
            out.append({"t": "scene", "text": sc.strip()})
    return out


def parse_season(season: int):
    path = RAW / f"season{season:02d}.txt"
    lines = read_text(path).splitlines()

    episodes = {}  # key: first episode number -> dict (later duplicates win)
    current = None
    for line in lines:
        h = is_header(line.strip(), season)
        if h:
            eps, title = h
            if eps[0] in episodes:
                if "uncut" in title.lower():
                    # Same episode re-listed as an uncut version (s04 423): replace.
                    pass
                else:
                    # Source typo: two different episodes share a number
                    # (s09 lists 909 as "908"). Shift to the next free slot.
                    nxt = eps[0]
                    while nxt in episodes:
                        nxt += 1
                    eps = [nxt] + eps[1:]
            current = {"episodes": eps, "title": title, "raw": []}
            episodes[eps[0]] = current
            continue
        if current is not None:
            current["raw"].append(line)
    result = []
    for first_ep in sorted(episodes):
        e = episodes[first_ep]
        eps = e["episodes"]
        code = f"{season}{eps[0]:02d}" + (f"-{season}{eps[1]:02d}" if len(eps) > 1 else "")
        ep_json = {
            "id": f"s{season:02d}e{eps[0]:02d}",
            "season": season,
            "episodes": eps,
            "code": code,
            "title": e["title"],
            "lines": parse_episode_lines(e["raw"]),
        }
        result.append(ep_json)
    return result


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    total_dialogue = 0
    for season in range(1, 11):
        eps = parse_season(season)
        for ep in eps:
            out_path = OUT / f"{ep['id']}.json"
            out_path.write_text(
                json.dumps(ep, ensure_ascii=False, indent=1), encoding="utf-8"
            )
            n_dlg = sum(1 for l in ep["lines"] if l["t"] == "dialogue")
            total_dialogue += n_dlg
            manifest.append({
                "id": ep["id"],
                "season": season,
                "episodes": ep["episodes"],
                "code": ep["code"],
                "title": ep["title"],
                "dialogueCount": n_dlg,
            })
        print(f"season {season:2d}: {len(eps)} episodes")
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"total: {len(manifest)} episode units, {total_dialogue} dialogue lines")
    # Sanity checks
    problems = [m for m in manifest if m["dialogueCount"] < 100]
    if problems:
        print("WARNING - episodes with suspiciously few dialogue lines:")
        for p in problems:
            print(f"  {p['id']} ({p['title']}): {p['dialogueCount']}")
        sys.exit(1)


if __name__ == "__main__":
    main()
