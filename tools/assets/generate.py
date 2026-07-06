#!/usr/bin/env python3
"""Queue Kit asset generator.

Reads manifest.json, generates each asset with `openclaw infer image generate`
(model openai/gpt-image-2), knocks out the chroma-key background to alpha for
transparency assets, then produces @1x/@2x/@3x PNGs into
src/assets/games/<game>/ with sips. Idempotent, per-asset isolated, writes a
lockfile, prints a summary, exits nonzero if anything failed.

Usage:
    python3 tools/assets/generate.py                 # all assets, skip existing
    python3 tools/assets/generate.py --only gamekit  # one game batch
    python3 tools/assets/generate.py --only sharky --force
    python3 tools/assets/generate.py --dry-run       # print plan, no API calls

Deps: python3 stdlib + PIL (Pillow, already installed) + sips + openclaw.
See STYLE.md for the locked prompt prefix and pipeline rationale.
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

# ---- Locked style, verbatim from MASTER_PLAN_QUEUE_KIT.md Component 4 ---------
STYLE_PREFIX = (
    "flat vector game asset, bold clean shapes, thick 3px outlines, "
    "TPS palette navy #09268f blue #00a5f5 gold #fec90e coral accent, "
    "subtle cel shading, transparent background, no text"
)

# Appended to EVERY prompt. Kills the model's tendency to add text/watermarks
# and pins the flat 3/4 perspective.
NEGATIVE = (
    "no text, no letters, no numbers, no words, no watermark, no signature, "
    "no logo, no photorealism, no 3D render, no realistic photography, "
    "flat vector only, consistent 3/4 flat perspective, thick navy #09268f "
    "outlines, cel shading only"
)

# For transparency assets: generate on a flat green key we can flood-fill out.
# Explicitly forbids glow/shadow/halo (the #1 fringe cause) and a busy scene.
CHROMA_HEX = "#00FF00"
TRANSPARENT_SUFFIX = (
    "isolated single subject centered with generous margin, "
    "NO glow, NO drop shadow, NO gradient halo, NO outer aura, "
    "solid flat pure green background color #00FF00 filling all empty space, "
    "hard crisp edge between subject and background, no blur, no busy scene"
)
# For opaque backgrounds: full-bleed, no chroma key, no knockout.
OPAQUE_SUFFIX = "full-bleed fills the entire frame edge to edge"

MODEL = "openai/gpt-image-2"
QUALITY = "high"          # low|medium|high|auto — high for shippable app assets
CHROMA_TOL = 70           # flood-fill color tolerance for knockout
KNOCKOUT_SEED_STEP = 3    # sample every Nth edge pixel as a flood seed

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
MANIFEST = os.path.join(HERE, "manifest.json")
LOCKFILE = os.path.join(HERE, "generated-manifest.json")
OUT_ROOT = os.path.join(REPO, "src", "assets", "games")
RAW_DIR = os.path.join(HERE, ".raw")  # keep raw generations for re-resizing/debug


def log(msg):
    print(msg, flush=True)


def build_prompt(asset):
    """PREFIX + subject + category suffix + negatives.

    Edit-derived frames (asset has `base_frame`) already carry the full
    character-consistency instruction and inherit style from the source image,
    so we skip the style PREFIX and only append the background keep + negatives.
    """
    if asset.get("needs_transparency"):
        tail = TRANSPARENT_SUFFIX
    else:
        tail = OPAQUE_SUFFIX
    if asset.get("base_frame"):
        # For transparency edits, keep the green key from the source frame.
        keep_bg = (
            "Keep the solid flat pure green #00FF00 background, hard crisp "
            "edges, no glow, no drop shadow."
            if asset.get("needs_transparency") else OPAQUE_SUFFIX
        )
        return f"{asset['prompt']} {keep_bg} {NEGATIVE}."
    return f"{STYLE_PREFIX}. {asset['prompt']}. {tail}. {NEGATIVE}."


def run_edit(prompt, base_raw, out_path, size, dry_run=False):
    """Derive a frame from an existing raw via `openclaw infer image edit`.

    Used for animation frames so the character stays identical across frames
    (text-to-image `generate` has no frame memory and drifts into different
    characters — see STYLE.md / swim-frame notes)."""
    cmd = [
        "openclaw", "infer", "image", "edit",
        "--model", MODEL,
        "--file", base_raw,
        "--prompt", prompt,
        "--output", out_path,
        "--size", size,
        "--quality", QUALITY,
    ]
    if dry_run:
        log("  [dry-run edit] " + " ".join(f'"{c}"' if " " in c else c for c in cmd))
        return
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    combined = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0 or not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
        interesting = [
            ln for ln in combined.splitlines()
            if any(k in ln.lower() for k in ("error", "failed", "candidate", "auth"))
        ]
        detail = interesting[-1] if interesting else combined.strip().splitlines()[-1:] or "unknown"
        raise RuntimeError(f"openclaw edit failed (rc={proc.returncode}): {detail}")


def run_generate(prompt, out_path, size, dry_run=False):
    cmd = [
        "openclaw", "infer", "image", "generate",
        "--model", MODEL,
        "--prompt", prompt,
        "--output", out_path,
        "--size", size,
        "--quality", QUALITY,
    ]
    if dry_run:
        log("  [dry-run] " + " ".join(f'"{c}"' if " " in c else c for c in cmd))
        return
    # openclaw is chatty on stderr (doctor warnings); only surface real failures.
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    combined = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0 or not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
        # pull the most useful line for the error message
        interesting = [
            ln for ln in combined.splitlines()
            if any(k in ln.lower() for k in ("error", "failed", "candidate", "auth"))
        ]
        detail = interesting[-1] if interesting else combined.strip().splitlines()[-1:] or "unknown"
        raise RuntimeError(f"openclaw generate failed (rc={proc.returncode}): {detail}")


def knockout_chroma(src_path, dst_path):
    """Flood-fill the green key to alpha, protecting interior non-key colors.

    Two passes so ENCLOSED green pockets (e.g. the hollow center of a ring or a
    card frame) also clear, not just the edge-connected background:
      1. seed from the full border and flood at CHROMA_TOL,
      2. re-seed from any *strong* green-key pixel still opaque (tight
         STRICT_TOL so only true chroma green — never legit art tones — starts
         a new fill), then flood at CHROMA_TOL again.
    Returns fraction of pixels made transparent (sanity signal)."""
    from PIL import Image
    from collections import deque

    im = Image.open(src_path).convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = px[2, 2]
    STRICT_TOL = 28  # only unmistakable chroma green seeds an interior fill

    def close(c):
        return (abs(c[0] - bg[0]) <= CHROMA_TOL
                and abs(c[1] - bg[1]) <= CHROMA_TOL
                and abs(c[2] - bg[2]) <= CHROMA_TOL)

    def strict(c):
        return (abs(c[0] - bg[0]) <= STRICT_TOL
                and abs(c[1] - bg[1]) <= STRICT_TOL
                and abs(c[2] - bg[2]) <= STRICT_TOL)

    visited = bytearray(w * h)
    q = deque()
    step = KNOCKOUT_SEED_STEP
    # seed the full border
    for x in range(0, w, step):
        for y in (0, h - 1):
            i = y * w + x
            if not visited[i] and close(px[x, y]):
                visited[i] = 1
                q.append((x, y))
    for y in range(0, h, step):
        for x in (0, w - 1):
            i = y * w + x
            if not visited[i] and close(px[x, y]):
                visited[i] = 1
                q.append((x, y))

    cleared = 0

    def drain():
        nonlocal cleared
        while q:
            x, y = q.popleft()
            px[x, y] = (0, 0, 0, 0)
            cleared += 1
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    i = ny * w + nx
                    if not visited[i] and close(px[nx, ny]):
                        visited[i] = 1
                        q.append((nx, ny))

    # Pass 1: edge-connected background.
    drain()

    # Pass 2: enclosed chroma pockets (ring holes, hollow frame interiors).
    # Only a strict green pixel that survived pass 1 seeds a new fill, so we
    # never eat legitimate art that merely trends greenish.
    for y in range(0, h, step):
        row = y * w
        for x in range(0, w, step):
            i = row + x
            if not visited[i] and px[x, y][3] != 0 and strict(px[x, y]):
                visited[i] = 1
                q.append((x, y))
                drain()

    im.save(dst_path)
    return cleared / float(w * h)


def sips_resize(src_path, dst_path, longest_edge):
    """Resize to a max dimension (aspect preserved) via sips. Copies then resizes."""
    import shutil
    shutil.copyfile(src_path, dst_path)
    proc = subprocess.run(
        ["sips", "--resampleHeightWidthMax", str(longest_edge), dst_path],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"sips resize failed: {proc.stderr.strip()}")


def base_longest_edge(size):
    w, h = (int(v) for v in size.lower().split("x"))
    return max(w, h)


def process_asset(asset, out_dir, force, dry_run):
    """Returns (status, info) where status in ok/skipped/failed/regenerated."""
    aid = asset["id"]
    size = asset["size"]
    needs_t = bool(asset.get("needs_transparency"))
    final_3x = os.path.join(out_dir, f"{aid}@3x.png")
    final_2x = os.path.join(out_dir, f"{aid}@2x.png")
    final_1x = os.path.join(out_dir, f"{aid}.png")

    if not force and all(os.path.exists(p) for p in (final_1x, final_2x, final_3x)):
        return ("skipped", "outputs exist")

    prompt = build_prompt(asset)
    raw_path = os.path.join(RAW_DIR, f"{aid}.png")

    t0 = time.time()
    base_frame = asset.get("base_frame")
    if base_frame:
        base_raw = os.path.join(RAW_DIR, f"{base_frame}.png")
        if not dry_run and not os.path.exists(base_raw):
            raise RuntimeError(
                f"base_frame '{base_frame}' raw not found ({base_raw}); "
                f"generate it in the same run before this frame")
        run_edit(prompt, base_raw, raw_path, size, dry_run=dry_run)
    else:
        run_generate(prompt, raw_path, size, dry_run=dry_run)
    gen_s = time.time() - t0
    if dry_run:
        return ("ok", "dry-run")

    # 1. knockout (transparency assets only) -> full-res master
    master = os.path.join(RAW_DIR, f"{aid}.master.png")
    ko_frac = None
    if needs_t:
        ko_frac = knockout_chroma(raw_path, master)
    else:
        import shutil
        shutil.copyfile(raw_path, master)

    # 2. density set. @3x = generated base, @2x = /1.5, @1x = /3.
    base = base_longest_edge(size)
    sips_resize(master, final_3x, base)
    sips_resize(master, final_2x, max(1, round(base / 1.5)))
    sips_resize(master, final_1x, max(1, round(base / 3.0)))

    info = f"{gen_s:.1f}s"
    if ko_frac is not None:
        info += f", ko {ko_frac*100:.0f}%"
    return ("ok", info, gen_s, ko_frac)


def main():
    ap = argparse.ArgumentParser(description="Queue Kit asset generator")
    ap.add_argument("--only", help="only generate assets for this game batch")
    ap.add_argument("--force", action="store_true", help="regenerate even if outputs exist")
    ap.add_argument("--dry-run", action="store_true", help="print plan, no API calls")
    args = ap.parse_args()

    with open(MANIFEST) as f:
        manifest = json.load(f)
    assets = [a for a in manifest["assets"] if isinstance(a, dict) and "id" in a]
    if args.only:
        assets = [a for a in assets if a["game"] == args.only]
        if not assets:
            log(f"No assets for --only {args.only!r}. Games: "
                f"{sorted({a['game'] for a in manifest['assets'] if 'game' in a})}")
            sys.exit(2)

    os.makedirs(RAW_DIR, exist_ok=True)

    results = []  # (id, game, status, info, gen_s, ko_frac)
    total_gen = 0.0
    for asset in assets:
        game = asset["game"]
        out_dir = os.path.join(OUT_ROOT, game)
        os.makedirs(out_dir, exist_ok=True)
        aid = asset["id"]
        log(f"[{game}/{aid}] ...")
        try:
            res = process_asset(asset, out_dir, args.force, args.dry_run)
            status, info = res[0], res[1]
            gen_s = res[2] if len(res) > 2 else None
            ko = res[3] if len(res) > 3 else None
            if gen_s:
                total_gen += gen_s
            results.append((aid, game, status, info, gen_s, ko))
            log(f"    -> {status} ({info})")
        except Exception as e:  # per-asset isolation: one failure never aborts the batch
            results.append((aid, game, "failed", str(e), None, None))
            log(f"    -> FAILED: {e}")

    # ---- summary table -------------------------------------------------------
    log("\n" + "=" * 72)
    log(f"{'ASSET':30} {'GAME':14} {'STATUS':11} INFO")
    log("-" * 72)
    counts = {}
    for aid, game, status, info, gen_s, ko in results:
        counts[status] = counts.get(status, 0) + 1
        log(f"{aid:30} {game:14} {status:11} {info}")
    log("-" * 72)
    log("  " + "  ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    gen_times = [g for *_, g, _ in results if g]
    if gen_times:
        log(f"  total gen time {total_gen:.0f}s over {len(gen_times)} images "
            f"(avg {total_gen/len(gen_times):.0f}s/img)")

    # ---- lockfile ------------------------------------------------------------
    if not args.dry_run:
        lock = {}
        if os.path.exists(LOCKFILE):
            try:
                with open(LOCKFILE) as f:
                    lock = json.load(f)
            except Exception:
                lock = {}
        now = datetime.now(timezone.utc).isoformat()
        lock.setdefault("assets", {})
        for aid, game, status, info, gen_s, ko in results:
            if status in ("ok", "regenerated"):
                lock["assets"][aid] = {
                    "game": game,
                    "generated_at": now,
                    "gen_seconds": round(gen_s, 1) if gen_s else None,
                    "knockout_fraction": round(ko, 3) if ko is not None else None,
                    "model": MODEL,
                    "quality": QUALITY,
                }
        lock["last_run"] = {
            "at": now,
            "only": args.only,
            "force": args.force,
            "counts": counts,
        }
        with open(LOCKFILE, "w") as f:
            json.dump(lock, f, indent=2)
        log(f"  lockfile -> {os.path.relpath(LOCKFILE, REPO)}")

    failed = counts.get("failed", 0)
    log("=" * 72)
    if failed:
        log(f"FAILED: {failed} asset(s) did not generate.")
        sys.exit(1)
    log("All requested assets OK.")


if __name__ == "__main__":
    main()
