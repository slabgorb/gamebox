// Cribbage peg board. Standard 121-hole horizontal layout, two pegs per
// player. The trailing peg crawls hole-by-hole past the front peg whenever
// the score increases — same physical motion as the real game.

import { useEffect, useRef, useState } from "react";

const HOLES_PER_GROUP = 5;
const GROUPS_PER_ROW = 12;
const HOLES_PER_ROW = HOLES_PER_GROUP * GROUPS_PER_ROW;
const HOLE_PX = 9;
const HOLE_GAP_PX = 4;
const GROUP_GAP_PX = 9;
const ROW_GAP_PX = 6;
const PLAYER_GAP_PX = 14;
const SIDE_PAD_PX = 18;
const PEG_PX = 13;
const SKUNK_AT = 91;
const MATCH_TARGET = 121;

function holeXOffsetWithinRow(holeIndex: number) {
  const groupIdx = Math.floor(holeIndex / HOLES_PER_GROUP);
  const inGroup = holeIndex % HOLES_PER_GROUP;
  return (
    groupIdx *
      (HOLES_PER_GROUP * HOLE_PX +
        (HOLES_PER_GROUP - 1) * HOLE_GAP_PX +
        GROUP_GAP_PX) +
    inGroup * (HOLE_PX + HOLE_GAP_PX)
  );
}

function rowWidth() {
  return (
    GROUPS_PER_ROW * HOLES_PER_GROUP * HOLE_PX +
    GROUPS_PER_ROW * (HOLES_PER_GROUP - 1) * HOLE_GAP_PX +
    (GROUPS_PER_ROW - 1) * GROUP_GAP_PX
  );
}

function pegPosition(score: number, playerLaneTop: number) {
  const outerY = playerLaneTop + HOLE_PX / 2;
  const innerY = playerLaneTop + HOLE_PX + ROW_GAP_PX + HOLE_PX / 2;
  if (score <= 0) {
    return { x: SIDE_PAD_PX - HOLE_PX - HOLE_GAP_PX, y: outerY };
  }
  if (score >= MATCH_TARGET) {
    return {
      x: SIDE_PAD_PX + rowWidth() + HOLE_GAP_PX + HOLE_PX,
      y: (outerY + innerY) / 2,
    };
  }
  if (score <= 60) {
    return {
      x: SIDE_PAD_PX + holeXOffsetWithinRow(score - 1) + HOLE_PX / 2,
      y: outerY,
    };
  }
  const innerHole = 120 - score;
  return {
    x: SIDE_PAD_PX + holeXOffsetWithinRow(innerHole) + HOLE_PX / 2,
    y: innerY,
  };
}

function laneTopForPlayer(playerIdx: number) {
  return playerIdx === 0 ? 0 : HOLE_PX * 2 + ROW_GAP_PX + PLAYER_GAP_PX;
}
function totalHeight() {
  return 2 * (HOLE_PX * 2 + ROW_GAP_PX) + PLAYER_GAP_PX;
}
function totalWidth() {
  return SIDE_PAD_PX * 2 + rowWidth() + HOLE_PX * 2 + HOLE_GAP_PX;
}

// usePegPair owns the two physical pegs for one player.
// On a score increase, only the back peg moves: it crawls hole-by-hole past
// the stationary front peg and lands at the new score. The old front then
// becomes the new back.
function usePegPair(score: number, speedMs = 60) {
  const [pair, setPair] = useState(() => ({
    back: Math.max(0, score - 4),
    front: score,
  }));
  const lastScoreRef = useRef(score);

  useEffect(() => {
    if (score === lastScoreRef.current) return;
    const oldFront = lastScoreRef.current;
    const newFront = score;
    lastScoreRef.current = score;

    let cur = Math.min(pair.back, oldFront);
    setPair({ back: cur, front: oldFront });
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function step() {
      if (cancelled) return;
      cur += 1;
      if (cur >= newFront) {
        setPair({ back: oldFront, front: newFront });
        return;
      }
      setPair({ back: cur, front: oldFront });
      timers.push(setTimeout(step, speedMs));
    }
    timers.push(setTimeout(step, speedMs));
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  return pair;
}

function HoleRow({ yTop }: { yTop: number }) {
  return (
    <g>
      {Array.from({ length: HOLES_PER_ROW }, (_, i) => (
        <circle
          key={i}
          cx={SIDE_PAD_PX + holeXOffsetWithinRow(i) + HOLE_PX / 2}
          cy={yTop + HOLE_PX / 2}
          r={HOLE_PX / 2 - 1}
          className="peg-hole"
        />
      ))}
    </g>
  );
}

function StartHole({ yTop }: { yTop: number }) {
  return (
    <circle
      cx={SIDE_PAD_PX - HOLE_PX - HOLE_GAP_PX}
      cy={yTop + HOLE_PX / 2}
      r={HOLE_PX / 2 - 1}
      className="peg-hole peg-hole--start"
    />
  );
}

function GameHole({ laneTop }: { laneTop: number }) {
  const outerY = laneTop + HOLE_PX / 2;
  const innerY = laneTop + HOLE_PX + ROW_GAP_PX + HOLE_PX / 2;
  return (
    <circle
      cx={SIDE_PAD_PX + rowWidth() + HOLE_GAP_PX + HOLE_PX}
      cy={(outerY + innerY) / 2}
      r={HOLE_PX / 2 + 1}
      className="peg-hole peg-hole--game"
    />
  );
}

function SkunkLine({ yTop }: { yTop: number }) {
  const innerHole = 120 - SKUNK_AT;
  const x = SIDE_PAD_PX + holeXOffsetWithinRow(innerHole) - HOLE_GAP_PX / 2;
  return (
    <line
      x1={x}
      x2={x}
      y1={yTop - 2}
      y2={yTop + HOLE_PX * 2 + ROW_GAP_PX + 2}
      className="peg-skunk"
    />
  );
}

function Lane({ laneTop }: { laneTop: number }) {
  return (
    <g>
      <HoleRow yTop={laneTop} />
      <HoleRow yTop={laneTop + HOLE_PX + ROW_GAP_PX} />
      <StartHole yTop={laneTop} />
      <SkunkLine yTop={laneTop} />
    </g>
  );
}

function Peg({
  x,
  y,
  color,
  kind,
}: {
  x: number;
  y: number;
  color: string;
  kind: "front" | "back";
}) {
  return (
    <g className={`peg peg--${kind}`} transform={`translate(${x.toFixed(2)}, ${y.toFixed(2)})`}>
      <circle r={PEG_PX / 2} fill={color} className="peg-head" />
    </g>
  );
}

interface ChipProps {
  label: string;
  score: number;
  color: string;
  active: boolean;
}
function PegChip({ label, score, color, active }: ChipProps) {
  return (
    <span
      className={`peg-chip ${active ? "is-active" : ""}`}
      style={{ ["--peg-color" as string]: color }}
    >
      <i className="peg-chip__dot" />
      <span className="peg-chip__label">{label}</span>
      <span className="peg-chip__num">{score}</span>
    </span>
  );
}

interface Props {
  scores: [number, number];
  prevScores: [number, number];
  matchTarget: number;
  myColor: string;
  opponentColor: string;
  mySide: 0 | 1;
  activeSide?: 0 | 1 | null;
  myLabel?: string;
  opponentLabel?: string;
}

export function PegBoard({
  scores,
  matchTarget,
  myColor,
  opponentColor,
  mySide,
  activeSide = null,
  myLabel = "You",
  opponentLabel = "Opp",
}: Props) {
  const w = totalWidth();
  const h = totalHeight();
  const colorBySide: Record<0 | 1, string> = {
    0: mySide === 0 ? myColor : opponentColor,
    1: mySide === 1 ? myColor : opponentColor,
  };
  const labelBySide: Record<0 | 1, string> = {
    0: mySide === 0 ? myLabel : opponentLabel,
    1: mySide === 1 ? myLabel : opponentLabel,
  };
  const topPlayer = mySide;
  const bottomPlayer = (1 - mySide) as 0 | 1;

  const pairBySide: Record<0 | 1, ReturnType<typeof usePegPair>> = {
    0: usePegPair(scores[0]),
    1: usePegPair(scores[1]),
  };

  return (
    <div className="peg-board">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="peg-board-svg"
        role="img"
        aria-label={`Cribbage peg board. Score ${scores[0]} to ${scores[1]} of ${matchTarget}.`}
      >
        <Lane laneTop={laneTopForPlayer(0)} />
        <Lane laneTop={laneTopForPlayer(1)} />
        <GameHole laneTop={0} />
        {[
          [0, topPlayer] as const,
          [1, bottomPlayer] as const,
        ].map(([laneIdx, side]) => {
          const laneTop = laneTopForPlayer(laneIdx);
          const pair = pairBySide[side];
          const back = pegPosition(pair.back, laneTop);
          const front = pegPosition(pair.front, laneTop);
          return (
            <g key={laneIdx}>
              <Peg x={back.x} y={back.y} color={colorBySide[side]} kind="back" />
              <Peg x={front.x} y={front.y} color={colorBySide[side]} kind="front" />
            </g>
          );
        })}
      </svg>
      <div className="peg-board__meta">
        <PegChip
          label={labelBySide[mySide]}
          score={scores[mySide]}
          color={colorBySide[mySide]}
          active={activeSide === mySide}
        />
        <span className="peg-chip peg-chip--target">to {matchTarget}</span>
        <PegChip
          label={labelBySide[(1 - mySide) as 0 | 1]}
          score={scores[(1 - mySide) as 0 | 1]}
          color={colorBySide[(1 - mySide) as 0 | 1]}
          active={activeSide === ((1 - mySide) as 0 | 1)}
        />
      </div>
    </div>
  );
}
