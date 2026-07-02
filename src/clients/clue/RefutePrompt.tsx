// The async-refute pause card-choice prompt (AC2): shown only to the active
// refuter; picking a card POSTs refute{card} and the engine returns the turn
// to the suggester.
import { refuteChoices } from "./refute-prompt.js";
import type { ClueView, CardId } from "../shared/contracts/clue";

export function RefutePrompt({
  view,
  onShow,
}: {
  view: ClueView;
  onShow: (card: CardId) => void;
}) {
  const choices = refuteChoices(view) as CardId[];
  const s = view.suggestion!;
  return (
    <div className="clue-refute" role="status" data-testid="refute-prompt">
      <p>
        Seat {s.bySeat + 1} suggested <b>{s.suspect}</b> · <b>{s.weapon}</b> ·{" "}
        <b>{s.room}</b>. You must show one card:
      </p>
      <div className="clue-refute-cards">
        {choices.map((card) => (
          <button key={card} type="button" data-card={card} onClick={() => onShow(card)}>
            {card}
          </button>
        ))}
      </div>
    </div>
  );
}
