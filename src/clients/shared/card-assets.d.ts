declare module "/shared/cards/card-element.js" {
  export function cardImageUrl(card: {
    suit?: string;
    rank?: string;
    kind?: "joker";
    color?: string;
  }): string;
  export function backImageUrl(n?: number): string;
}
