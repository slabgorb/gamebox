// src/clients/risk/colorPicker.ts
// Setup-phase colour-picker view-model. `view.colors` is the seat->slot array
// (E5-3 seam); this inverts it to slot->seat so the picker can show, for each
// of the four palette slots, which seat holds it and whether it is the
// viewer's own. `takenBy` is null for a slot no seat currently holds (possible
// at fewer than four players).
import { SEAT_LABEL, SEAT_HEX } from "./themes";

export interface ColorSlot {
  slot: number;
  label: string;
  hex: string;
  takenBy: number | null;
  isMine: boolean;
}

export function colorSlots(view: {
  colors?: readonly number[];
  youAre: number | null;
}): ColorSlot[] {
  const colors = view.colors ?? [];
  return SEAT_LABEL.map((label, slot) => {
    const seat = colors.indexOf(slot);
    const takenBy = seat === -1 ? null : seat;
    return {
      slot,
      label,
      hex: SEAT_HEX[slot],
      takenBy,
      isMine: takenBy !== null && takenBy === view.youAre,
    };
  });
}
