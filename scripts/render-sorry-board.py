#!/usr/bin/env python3
"""Render a baked Sorry! board: a 60-cell track ring of marble tiles inlaid
into a wood field, with the two players' Start pens, Safety lanes, Homes and
colour Slides printed in.

Usage:
  scripts/render-sorry-board.py
  scripts/render-sorry-board.py --out preview.png
  scripts/render-sorry-board.py --style walnut-marble --list-styles

Patterned on scripts/render-board.py (the backgammon parquet maker): textures
are `cover`-fit, tiles are composited onto a tinted wood field through
supersampled (anti-aliased) masks, and a normal-map bevel + inner shadow give
the inlay depth.

The geometry here is the 1:1 contract with src/clients/sorry/board-geometry.js
— GRID, CELL and the track-index→cell mapping MUST match that module so the
React overlay lands on the printed cells.
"""

from __future__ import annotations
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


# ── Repo-relative paths ──────────────────────────────────────────────────

REPO = Path(__file__).resolve().parent.parent
WORDS_ASSETS = REPO / "plugins/words/client/assets"
SORRY_ASSETS = REPO / "plugins/sorry/client/assets"


# ── Geometry (must match board-geometry.js) ──────────────────────────────

GRID = 16
CELL = 100
BOARD = GRID * CELL  # 1600

# Player colours: side a warm red, side b cool blue (matches the risk palette).
SIDE_RGB = {"a": (168, 67, 43), "b": (44, 100, 127)}

SAFETY_ENTRY = {"a": 1, "b": 31}
SLIDES = {
    "a": [{"start": 9, "length": 4}, {"start": 34, "length": 5}],
    "b": [{"start": 39, "length": 4}, {"start": 4, "length": 5}],
}


def track_cell(index: int) -> tuple[int, int]:
    """Absolute track index (0..59) → (row, col) on the perimeter ring."""
    i = index % 60
    if i <= 15:
        return (0, i)
    if i <= 30:
        return (i - 15, GRID - 1)
    if i <= 45:
        return (GRID - 1, 45 - i)
    return (60 - i, 0)


def safety_cell(side: str, idx: int) -> tuple[int, int]:
    if side == "a":
        return (1 + idx, 1)
    return (GRID - 2 - idx, GRID - 2)


HOME_CELL = {"a": (6, 1), "b": (9, GRID - 2)}
START_CENTER = {"a": (2.5, 3.5), "b": (13.5, 12.5)}


def center(row: float, col: float, s: int) -> tuple[float, float]:
    return ((col + 0.5) * CELL * s, (row + 0.5) * CELL * s)


# ── Style presets ────────────────────────────────────────────────────────

STYLES: dict[str, dict] = {
    "marble-wood": {
        "description": "Cream marble tiles inlaid on warm wood",
        "field": WORDS_ASSETS / "board-wood.jpg",
        "tile": WORDS_ASSETS / "tile-marble.png",
        "field_tint": 0.18,
    },
    "walnut-marble": {
        "description": "Pale marble tiles on dark walnut",
        "field": WORDS_ASSETS / "board-wood.jpg",
        "tile": WORDS_ASSETS / "board-marble.jpg",
        "field_tint": 0.10,
    },
}


# ── Texture helpers (from render-board.py) ───────────────────────────────

def cover(img: Image.Image, w: int, h: int) -> Image.Image:
    sw, sh = img.size
    sc = max(w / sw, h / sh)
    nw, nh = int(round(sw * sc)), int(round(sh * sc))
    img = img.resize((nw, nh), Image.LANCZOS)
    x, y = (nw - w) // 2, (nh - h) // 2
    return img.crop((x, y, x + w, y + h))


def darken_field(field: Image.Image, amount: float) -> Image.Image:
    """Deepen the wood field so the bright marble tiles read as inlay."""
    arr = np.asarray(field, dtype=np.float32) / 255.0
    arr = arr * (1.0 - amount)
    return Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8), "RGB")


def bevel_overlay(mask: Image.Image, *, blur: float = 2.4, strength: float = 6.0) -> Image.Image:
    m = np.asarray(mask.filter(ImageFilter.GaussianBlur(radius=blur)), dtype=np.float32) / 255.0
    gx = np.gradient(m, axis=1)
    gy = np.gradient(m, axis=0)
    shading = np.tanh((-0.6 * gx + -0.6 * gy) * strength)
    return Image.fromarray(np.clip((0.5 + 0.5 * shading) * 255, 0, 255).astype(np.uint8), "L")


def overlay_blend(base: Image.Image, gray_top: Image.Image, alpha: float) -> Image.Image:
    a = np.asarray(base, dtype=np.float32) / 255.0
    g = np.asarray(gray_top, dtype=np.float32) / 255.0
    g3 = np.stack([g, g, g], axis=-1)
    blend = np.where(a < 0.5, 2 * a * g3, 1 - 2 * (1 - a) * (1 - g3))
    out = (1 - alpha) * a + alpha * blend
    return Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8), "RGB")


def add_inner_shadow(img: Image.Image, mask: Image.Image, *, radius: int, darken: float) -> Image.Image:
    blurred = mask.filter(ImageFilter.GaussianBlur(radius=radius))
    m = np.asarray(mask, dtype=np.float32) / 255.0
    b = np.asarray(blurred, dtype=np.float32) / 255.0
    shadow = m * (1 - b) * darken
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = arr * (1 - shadow[..., None])
    return Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8), "RGB")


# ── Drawing primitives ───────────────────────────────────────────────────

def rounded_cell(draw: ImageDraw.ImageDraw, row: int, col: int, s: int, *, inset: float, fill) -> None:
    pad = CELL * inset * s
    x0, y0 = col * CELL * s + pad, row * CELL * s + pad
    x1, y1 = (col + 1) * CELL * s - pad, (row + 1) * CELL * s - pad
    draw.rounded_rectangle([x0, y0, x1, y1], radius=int(CELL * 0.16 * s), fill=fill)


def disc(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, fill) -> None:
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


# ── Compose ──────────────────────────────────────────────────────────────

def render(*, field_path: Path, tile_path: Path, field_tint: float, out_path: Path,
           supersample: int = 2) -> None:
    s = max(1, int(supersample))
    W = BOARD * s

    field = darken_field(cover(Image.open(field_path).convert("RGB"), W, W), field_tint)
    tile = cover(Image.open(tile_path).convert("RGB"), W, W)

    # 1) Track-ring tile mask (the inlaid marble squares).
    track_mask = Image.new("L", (W, W), 0)
    td = ImageDraw.Draw(track_mask)
    for idx in range(60):
        r, c = track_cell(idx)
        rounded_cell(td, r, c, s, inset=0.06, fill=255)

    board = Image.composite(tile, field, track_mask)

    # 2) Bevel + inner shadow give the marble tiles inlay depth.
    board = overlay_blend(board, bevel_overlay(track_mask), alpha=0.45)
    board = add_inner_shadow(board, track_mask, radius=int(6 * s), darken=0.22)

    # 3) Colour layers (safety lanes, homes, starts, slides) drawn on an RGBA
    #    overlay and alpha-composited so the marble grain shows through.
    overlay = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)

    for side, rgb in SIDE_RGB.items():
        soft = (*rgb, 150)
        strong = (*rgb, 235)

        # Slides: a coloured band along the slide cells with an arrowhead.
        for sl in SLIDES[side]:
            cells = [track_cell(sl["start"] + k) for k in range(sl["length"] + 1)]
            pts = [center(r, c, s) for (r, c) in cells]
            od.line(pts, fill=(*rgb, 210), width=int(CELL * 0.30 * s), joint="curve")
            for (r, c) in cells:
                disc(od, *center(r, c, s), CELL * 0.12 * s, (*rgb, 235))
            # arrowhead at the slide end
            er, ec = cells[-1]
            disc(od, *center(er, ec, s), CELL * 0.26 * s, strong)

        # Safety lane (5 cells) in the owning colour.
        for i in range(5):
            r, c = safety_cell(side, i)
            rounded_cell(od, r, c, s, inset=0.10, fill=soft)

        # Home — a bold disc just past the safety lane.
        hr, hc = HOME_CELL[side]
        disc(od, *center(hr, hc, s), CELL * 0.42 * s, strong)

        # Start pen — a ringed cluster the four pawns launch from.
        scr, scc = START_CENTER[side]
        cx, cy = center(scr, scc, s)
        pen_r = CELL * 1.05 * s
        od.ellipse([cx - pen_r, cy - pen_r, cx + pen_r, cy + pen_r],
                   outline=strong, width=int(CELL * 0.10 * s))
        od.ellipse([cx - pen_r, cy - pen_r, cx + pen_r, cy + pen_r], fill=soft)

    board = Image.alpha_composite(board.convert("RGBA"), overlay).convert("RGB")

    # 4) Centre medallion.
    od2 = ImageDraw.Draw(board)
    mc = BOARD * s / 2
    disc(od2, mc, mc, CELL * 1.6 * s, (24, 20, 14))
    disc(od2, mc, mc, CELL * 1.45 * s, (212, 196, 168))
    try:
        from PIL import ImageFont
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia Bold.ttf", int(CELL * 0.7 * s))
    except Exception:
        font = None
    od2.text((mc, mc), "SORRY!", fill=(120, 30, 20), anchor="mm", font=font)

    if s > 1:
        board = board.resize((BOARD, BOARD), Image.LANCZOS)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    board.save(out_path)
    print(f"wrote {out_path} ({BOARD}x{BOARD})")


# ── CLI ──────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Bake a Sorry! board (marble tiles on wood).")
    ap.add_argument("--list-styles", action="store_true")
    ap.add_argument("--style", choices=sorted(STYLES.keys()), default="marble-wood")
    ap.add_argument("--field", type=Path, help="Field (wood) texture override.")
    ap.add_argument("--tile", type=Path, help="Tile (marble) texture override.")
    ap.add_argument("--field-tint", type=float, help="Field darkening 0..1.")
    ap.add_argument("--supersample", type=int, default=2)
    ap.add_argument("--out", type=Path, default=SORRY_ASSETS / "sorry-board.png")
    args = ap.parse_args()

    if args.list_styles:
        for name, cfg in sorted(STYLES.items()):
            print(f"  {name:16s} {cfg.get('description', '')}")
        return

    preset = STYLES[args.style]
    render(
        field_path=args.field or preset["field"],
        tile_path=args.tile or preset["tile"],
        field_tint=args.field_tint if args.field_tint is not None else preset["field_tint"],
        out_path=args.out,
        supersample=args.supersample,
    )


if __name__ == "__main__":
    main()
