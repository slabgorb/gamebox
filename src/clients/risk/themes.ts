// src/clients/risk/themes.ts
// Seat palette: index = seat (turn order). CSS custom properties --p0-* ..
// --p3-* are defined in style.css.
export const SEAT_LABEL = ["Red", "Blue", "Green", "Yellow"];

const PALETTE_SIZE = 4;

// Resolve a seat to the palette slot it occupies. `colors` is `view.colors`
// (E5-3 server seam): a per-seat slot index, so a seat may render a slot other
// than its own. Falls back to the seat's identity slot when `colors` is unset
// or the pick is out of range. Uses an explicit numeric check (not `|| owner`)
// so slot 0 (Red) is a legitimate, non-falsy choice.
function paletteSlot(owner: number, colors?: readonly number[]): number {
  const pick = colors?.[owner];
  if (typeof pick === "number" && Number.isInteger(pick) && pick >= 0 && pick < PALETTE_SIZE) {
    return pick;
  }
  return owner;
}

export function seatLabel(
  owner: number | null | undefined,
  colors?: readonly number[],
): string {
  if (owner == null) return "Neutral";
  return SEAT_LABEL[paletteSlot(owner, colors)] ?? `Player ${owner + 1}`;
}

export function seatClass(
  owner: number | null | undefined,
  colors?: readonly number[],
): string {
  if (owner == null || owner < 0 || owner > 3) return "";
  return `p${paletteSlot(owner, colors)}`;
}

export function seatFill(
  owner: number | null | undefined,
  colors?: readonly number[],
): string {
  if (owner == null || owner < 0 || owner > 3) return "var(--neutral)";
  return `var(--p${paletteSlot(owner, colors)}-1)`;
}

export function seatInk(
  owner: number | null | undefined,
  colors?: readonly number[],
): string {
  if (owner == null || owner < 0 || owner > 3) return "var(--neutral)";
  return `var(--p${paletteSlot(owner, colors)}-ink)`;
}

// Legacy 2P exports.
export const SIDE_LABEL: Record<string, string> = {
  "0": "Red",
  "1": "Blue",
  "2": "Green",
  "3": "Yellow",
  null: "Neutral",
};
export function sideClass(owner: number | null): string {
  return seatClass(owner);
}

// Concrete hexes (mirror style.css --pN-1) for contexts that can't resolve
// CSS custom properties (e.g. WebGL dice materials).
export const SEAT_HEX = ["#b04030", "#2a5d80", "#3e7a44", "#c09030"];
export function seatHex(
  owner: number | null | undefined,
  colors?: readonly number[],
): string {
  if (owner == null) return "#8a7c5c";
  return SEAT_HEX[paletteSlot(owner, colors)] ?? "#8a7c5c";
}
