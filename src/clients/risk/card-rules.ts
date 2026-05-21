// src/clients/risk/card-rules.ts
// Client mirror of the server's card-set rule (plugins/risk/server/validate.js
// isValidCardSet). Kept as a pure helper so the trade-in control can enable
// its submit button without a round-trip — the server still re-validates.
import type { Card, CardType } from "../shared/contracts/risk";
import { TERRITORIES } from "./map-geometry.js";

const T = TERRITORIES as Record<string, { name: string }>;

const TYPE_LABEL: Record<CardType, string> = {
  infantry: "Infantry",
  cavalry: "Cavalry",
  artillery: "Artillery",
  wild: "Wild",
};

export function cardTypeLabel(type: CardType): string {
  return TYPE_LABEL[type] ?? type;
}

/** Human label for a card: territory name + troop type, or just "Wild". */
export function cardLabel(card: Card): string {
  if (card.type === "wild" || card.territory === null) return "Wild";
  return `${T[card.territory]?.name ?? card.territory} · ${cardTypeLabel(card.type)}`;
}

/**
 * A valid trade-in is exactly three cards forming a set: any set containing a
 * wild, three of a kind, or three distinct troop types. Mirrors the server's
 * isValidCardSet so the UI and engine agree on what "enable submit" means.
 */
export function isValidCardSet(cards: Card[]): boolean {
  if (cards.length !== 3) return false;
  if (cards.some((c) => c.type === "wild")) return true;
  const types = new Set(cards.map((c) => c.type));
  return types.size === 1 || types.size === 3;
}
