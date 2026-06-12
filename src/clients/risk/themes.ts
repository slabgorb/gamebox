// src/clients/risk/themes.ts
// Seat palette: index = seat (turn order). CSS custom properties --p0-* ..
// --p3-* are defined in style.css.
export const SEAT_LABEL = ["Red", "Blue", "Green", "Yellow"];

export function seatLabel(owner: number | null | undefined): string {
  return owner == null ? "Neutral" : SEAT_LABEL[owner] ?? `Player ${owner + 1}`;
}

export function seatClass(owner: number | null | undefined): string {
  return owner == null || owner < 0 || owner > 3 ? "" : `p${owner}`;
}

export function seatFill(owner: number | null | undefined): string {
  return owner == null || owner < 0 || owner > 3 ? "var(--neutral)" : `var(--p${owner}-1)`;
}

export function seatInk(owner: number | null | undefined): string {
  return owner == null || owner < 0 || owner > 3 ? "var(--neutral)" : `var(--p${owner}-ink)`;
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
export function seatHex(owner: number | null | undefined): string {
  return owner == null ? "#8a7c5c" : SEAT_HEX[owner] ?? "#8a7c5c";
}
