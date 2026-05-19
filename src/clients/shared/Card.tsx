import { cardImageUrl, backImageUrl } from "./card-assets";

const SUIT_NAME: Record<string, string> = {
  S: "Spades",
  H: "Hearts",
  D: "Diamonds",
  C: "Clubs",
};
const RANK_NAME: Record<string, string> = {
  A: "Ace",
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
  T: "Ten",
  J: "Jack",
  Q: "Queen",
  K: "King",
};

interface CardData {
  suit?: string;
  rank?: string;
  kind?: "joker";
  color?: string;
}

interface Props {
  card: CardData;
  faceDown?: boolean;
  className?: string;
}

function altText(card: CardData, faceDown: boolean | undefined): string {
  if (faceDown) return "Face-down card";
  if (card.kind === "joker") return `${card.color} joker`;
  const rank = card.rank ? RANK_NAME[card.rank] ?? card.rank : "";
  const suit = card.suit ? SUIT_NAME[card.suit] ?? card.suit : "";
  return `${rank} of ${suit}`;
}

export function Card({ card, faceDown, className }: Props) {
  const src = faceDown ? backImageUrl() : cardImageUrl(card);
  const cls = ["card", className].filter(Boolean).join(" ");
  return <img src={src} alt={altText(card, faceDown)} className={cls} />;
}
