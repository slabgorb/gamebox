// src/clients/risk/themes.ts
export const SIDE_LABEL: Record<string, string> = {
  "0": "Red",
  "1": "Blue",
  null: "Neutral",
};
export function sideClass(owner: number | null): string {
  return owner === 0 ? "p0" : owner === 1 ? "p1" : "";
}
