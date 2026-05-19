import { useState } from "react";
import { Card as CardImg } from "../shared/Card";
import { isPlayable } from "./Pegging";
import type { Card, PeggingState } from "../shared/contracts/cribbage";

interface OpponentProps {
  mode: "opponent";
  cards: null;
  count: number;
}

interface ViewProps {
  mode: "view";
  cards: Card[];
}

interface DiscardProps {
  mode: "discard";
  cards: Card[];
  onSelectionChange?: (selected: Card[]) => void;
}

interface PeggingProps {
  mode: "pegging";
  cards: Card[];
  pegging: PeggingState;
  isMyTurn: boolean;
  onPlay: (card: Card) => void;
}

type Props = OpponentProps | ViewProps | DiscardProps | PeggingProps;

function sameCard(a: Card, b: Card) {
  return a.rank === b.rank && a.suit === b.suit;
}

export function Hand(props: Props) {
  const [selected, setSelected] = useState<Card[]>([]);

  if (props.mode === "opponent") {
    return (
      <>
        {Array.from({ length: props.count }, (_, i) => (
          <CardImg key={i} card={{}} faceDown />
        ))}
      </>
    );
  }

  if (props.mode === "view") {
    return (
      <>
        {props.cards.map((c, i) => (
          <CardImg key={c.id ?? i} card={c} />
        ))}
      </>
    );
  }

  if (props.mode === "discard") {
    return (
      <>
        {props.cards.map((c, i) => {
          const isSelected = selected.some((s) => sameCard(s, c));
          const cls = isSelected ? "is-selected" : undefined;
          return (
            <CardImg
              key={c.id ?? i}
              card={c}
              className={cls}
              onClick={() => {
                let next: Card[];
                if (isSelected) {
                  next = selected.filter((s) => !sameCard(s, c));
                } else if (selected.length < 2) {
                  next = [...selected, c];
                } else {
                  return; // third click ignored
                }
                setSelected(next);
                props.onSelectionChange?.(next);
              }}
            />
          );
        })}
      </>
    );
  }

  // pegging
  return (
    <>
      {props.cards.map((c, i) => {
        const playable = isPlayable(c, props.pegging) && props.isMyTurn;
        const cls = playable ? undefined : "is-disabled";
        return (
          <CardImg
            key={c.id ?? i}
            card={c}
            className={cls}
            onClick={playable ? () => props.onPlay(c) : undefined}
          />
        );
      })}
    </>
  );
}
