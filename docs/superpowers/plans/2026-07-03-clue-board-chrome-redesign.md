# Clue board + chrome re-theme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the Clue client (board SVG + page chrome) to the Claude Design "parlour mystery" handoff — green felt in a walnut frame, parchment rooms, brass weapon medallions, checker-token pawns, wood-plank header — with zero engine changes.

**Architecture:** Pure presentation. `Board.tsx` is rewritten as a self-contained themed SVG driven by the same server `view`; a new `board-art.js` holds skin constants; `style.css` (scoped `#clue-root`, high specificity, wins over the bundled `app.css`) carries all chrome; `ClueApp.tsx` gets a minor header-markup change. The design grid is byte-identical to `server/geometry.js`, so geometry, view, reachability, and their drift guards are untouched.

**Tech Stack:** React 18 + TSX (Vite bundle via `npm run build:client`), vitest + @testing-library/react (jsdom) for client tests, SVG for the board.

## Global Constraints

- **No engine/geometry/view changes.** Do not touch `plugins/clue/server/**`, `src/clients/clue/board-geometry.js`, or `src/clients/shared/contracts/clue.ts`. All geometry/reachability/drift tests must stay green untouched.
- **Cards are out of scope.** Do not modify `ClueCard.tsx`, `card-art.js`, `test/client/clue-card.test.tsx`, or `test/client/clue-refute-prompt.test.tsx`. Portrait cards and `/shared/portraits/*` stay in use by the hand/ledger/refute UI.
- **Preserve behavior + hooks:** keep every `data-testid` (`turn-status`, `roster`, `dice-tray`, `suggest-panel`, `pass-panel`, `accuse-panel`, `hand`, `ledger`, `log`, `end-banner`, `{verb}-form`) and the board data-attrs (`data-room`, `data-weapon`, `data-pawn`, `data-square`). `test/client/clue-app-bot-roll.test.tsx` must stay green.
- **Room style:** parchment variant only.
- **Bundle is inert until rebuilt:** `.tsx`/`.css` changes require `npm run build:client` (+ server restart for the live app).
- **Pawn colour → checker file:** `scarlett→red, mustard→orange, white→white, green→green, peacock→blue, plum→pink`. Assets already exist at `plugins/clue/client/assets/checker-{color}.png`.

---

## File Structure

- **Create** `src/clients/clue/board-art.js` — board skin constants (`SUSPECT_CHECKER`, `WEAPON_ICONS`). Keeps geometry-only `board-geometry.js` clean; parallel to `card-art.js`.
- **Create** `test/client/clue-board-art.test.ts` — pins board-art coverage.
- **Rewrite** `src/clients/clue/Board.tsx` — themed self-contained SVG, same props.
- **Create** `test/client/clue-board.test.tsx` — pins the board port.
- **Rewrite** `plugins/clue/client/style.css` — chrome re-theme (keeps card/refute blocks verbatim).
- **Modify** `plugins/clue/client/index.html` — add Google Fonts link (Playfair Display, Source Serif 4, JetBrains Mono).
- **Modify** `src/clients/clue/ClueApp.tsx` — header nameplate markup + walnut board-frame wrapper only.

---

## Task 1: Board skin constants (`board-art.js`)

**Files:**
- Create: `src/clients/clue/board-art.js`
- Test: `test/client/clue-board-art.test.ts`

**Interfaces:**
- Produces: `SUSPECT_CHECKER: Record<SuspectId, string>` (checker colour file basename) and `WEAPON_ICONS: Record<WeaponId, { icon: string; sw: number }>` (SVG path + stroke-width, drawn centered in a 24px medallion).

- [ ] **Step 1: Write the failing test**

Create `test/client/clue-board-art.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SUSPECT_CHECKER, WEAPON_ICONS } from "../../src/clients/clue/board-art.js";

const SUSPECTS = ["scarlett", "mustard", "white", "green", "peacock", "plum"];
const WEAPONS = ["candlestick", "knife", "leadpipe", "revolver", "rope", "wrench"];
const COLORS = ["red", "orange", "white", "green", "blue", "pink"];

describe("board-art skin constants", () => {
  it("maps every suspect to a known checker colour file", () => {
    expect(Object.keys(SUSPECT_CHECKER).sort()).toEqual([...SUSPECTS].sort());
    for (const s of SUSPECTS) expect(COLORS).toContain(SUSPECT_CHECKER[s]);
  });

  it("gives every weapon an icon path and a positive stroke-width", () => {
    expect(Object.keys(WEAPON_ICONS).sort()).toEqual([...WEAPONS].sort());
    for (const w of WEAPONS) {
      expect(typeof WEAPON_ICONS[w].icon).toBe("string");
      expect(WEAPON_ICONS[w].icon.length).toBeGreaterThan(0);
      expect(WEAPON_ICONS[w].sw).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/client/clue-board-art.test.ts`
Expected: FAIL — cannot resolve `../../src/clients/clue/board-art.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/clients/clue/board-art.js`:

```js
// Presentation art for the board (parallel to card-art.js). Pure data so it can
// be imported under vitest/node. board-geometry.js stays geometry-only (it is
// drift-guarded against the server); this file holds board *skin* constants
// ported from the Claude Design handoff (2026-07-03).

/**
 * Suspect id -> checker token colour file, served as
 * plugins/clue/client/assets/checker-{colour}.png.
 * @type {Record<string, string>}
 */
export const SUSPECT_CHECKER = {
  scarlett: "red",
  mustard: "orange",
  white: "white",
  green: "green",
  peacock: "blue",
  plum: "pink",
};

/**
 * @typedef {Object} WeaponIcon
 * @property {string} icon  SVG path, drawn centered in a 24px brass medallion
 * @property {number} sw    stroke-width
 */
/** @type {Record<string, WeaponIcon>} */
export const WEAPON_ICONS = {
  candlestick: { sw: 1.5, icon: "M0 -7 V4 M-3.6 4 H3.6 M-1.3 4 V6.6 H1.3 V4 M0 -7 c2.4 -1.8 1 -4.6 -1.4 -5.4" },
  knife:       { sw: 1.5, icon: "M-6 6 L1.5 -1.5 M-6 6 L-4.2 6.6 L2 0.4 M2 0.4 L6.6 -4.2 L5 -5.8 L0.4 -1.4 Z" },
  leadpipe:    { sw: 2.8, icon: "M-6 5 L4 -5 M4 -5 q2.4 -1 3 1.4" },
  revolver:    { sw: 1.5, icon: "M-7 -2 H2 V-4 H6 V-1 H2 V0 L-0.5 0 L-2.5 5 V0 H-6 Z" },
  rope:        { sw: 1.5, icon: "M-1.5 -4 a4.4 4.4 0 1 0 0.1 0 M2.6 0.6 q3.6 3 5 6.6" },
  wrench:      { sw: 1.5, icon: "M-6 -6 a3.4 3.4 0 1 0 3 4.2 L4.4 4.6 M2.8 6.6 a3 3 0 1 0 1.4 -3.6" },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/client/clue-board-art.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/clients/clue/board-art.js test/client/clue-board-art.test.ts
git commit -m "feat(clue): board skin constants (checker map + weapon icons)"
```

---

## Task 2: Themed board (`Board.tsx`)

**Files:**
- Rewrite: `src/clients/clue/Board.tsx`
- Test: `test/client/clue-board.test.tsx`

**Interfaces:**
- Consumes: `SUSPECT_CHECKER`, `WEAPON_ICONS` (Task 1); `ROOMS_GEO`, `DOORS`, `CELLAR_POLY`, `GRID`, `CELL`, `SECRET_PASSAGES` from `board-geometry.js`; `ClueView` from contracts.
- Produces: `Board({ view, onPickSquare, onPickRoom })` — unchanged signature. Emits `data-room`, `data-weapon`, `data-pawn`, `data-square`; pawn `<image href="assets/checker-{colour}.png">`; no `/shared/portraits` `<image>`.

- [ ] **Step 1: Write the failing test**

Create `test/client/clue-board.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Board } from "../../src/clients/clue/Board";
import type { ClueView } from "../../src/clients/shared/contracts/clue";

function baseView(overrides: Partial<ClueView> = {}): ClueView {
  return {
    youAreSeat: 0,
    seats: [0, 1],
    phase: "move",
    currentSeat: 0,
    activeUserId: 100,
    pawns: {
      scarlett: { square: [8, 20] },
      mustard: { room: "ballroom" },
      white: { room: "ballroom" },
      green: { room: "billiardroom" },
      peacock: { square: [16, 6] },
      plum: { room: "study" },
    },
    weapons: {
      candlestick: "kitchen", knife: "diningroom", leadpipe: "ballroom",
      revolver: "library", rope: "conservatory", wrench: "lounge",
    },
    seatSuspect: ["scarlett", "mustard"],
    eliminated: [false, false],
    log: [], suggestion: null, hand: [], ledger: [],
    winnerSeat: null, pendingRoll: null,
    movement: { needsRoll: false, pendingRoll: 7, squares: [[8, 19]], rooms: ["hall"] },
    ...overrides,
  } as ClueView;
}

function renderBoard(view: ClueView, onPickRoom = vi.fn(), onPickSquare = vi.fn()) {
  const utils = render(<Board view={view} onPickRoom={onPickRoom} onPickSquare={onPickSquare} />);
  return { ...utils, onPickRoom, onPickSquare };
}

const ROOMS = ["kitchen","ballroom","conservatory","diningroom","billiardroom","library","lounge","hall","study"];
const WEAPONS = ["candlestick","knife","leadpipe","revolver","rope","wrench"];

describe("Board (parlour re-theme)", () => {
  it("renders every room with a data-room hook", () => {
    const { container } = renderBoard(baseView());
    for (const id of ROOMS) expect(container.querySelector(`[data-room="${id}"]`)).not.toBeNull();
  });

  it("renders pawns as checker token images by suspect colour", () => {
    const { container } = renderBoard(baseView());
    expect(container.querySelector('[data-pawn="scarlett"]')!.getAttribute("href")).toBe("assets/checker-red.png");
    expect(container.querySelector('[data-pawn="peacock"]')!.getAttribute("href")).toBe("assets/checker-blue.png");
    expect(container.querySelector('[data-pawn="plum"]')!.getAttribute("href")).toBe("assets/checker-pink.png");
  });

  it("places no /shared/portraits image on the board", () => {
    const { container } = renderBoard(baseView());
    const imgs = Array.from(container.querySelectorAll("image"));
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs.every((i) => !(i.getAttribute("href") ?? "").includes("/shared/portraits"))).toBe(true);
  });

  it("renders a brass medallion with an icon path per weapon", () => {
    const { container } = renderBoard(baseView());
    for (const w of WEAPONS) {
      const g = container.querySelector(`[data-weapon="${w}"]`);
      expect(g).not.toBeNull();
      expect(g!.querySelector("path")).not.toBeNull();
    }
  });

  it("rings the viewer's own pawn only", () => {
    const { container } = renderBoard(baseView());
    const you = container.querySelector('[data-pawn="scarlett"]')!.closest("g")!;
    expect(you.querySelector("circle")).not.toBeNull();
    const other = container.querySelector('[data-pawn="plum"]')!.closest("g")!;
    expect(other.querySelector("circle")).toBeNull();
  });

  it("fires onPickRoom / onPickSquare for reachable targets", () => {
    const { container, onPickRoom, onPickSquare } = renderBoard(baseView());
    fireEvent.click(container.querySelector('[data-room="hall"]')!);
    expect(onPickRoom).toHaveBeenCalledWith("hall");
    fireEvent.click(container.querySelector('[data-square="8,19"]')!);
    expect(onPickSquare).toHaveBeenCalledWith([8, 19]);
  });

  it("does not wire clicks on unreachable rooms", () => {
    const { container, onPickRoom } = renderBoard(baseView());
    fireEvent.click(container.querySelector('[data-room="kitchen"]')!);
    expect(onPickRoom).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/client/clue-board.test.tsx`
Expected: FAIL — the current board renders `<circle class="clue-pawn">` and `/shared/portraits` room `<image>`s, so the pawn-href and no-portraits assertions fail.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/clients/clue/Board.tsx`:

```tsx
// SVG board rendered from the geometry mirror + the server view, re-themed to the
// Claude Design "parlour mystery" handoff (2026-07-03): green felt in a walnut
// frame, parchment rooms, brass weapon medallions, checker-token pawns. No rule
// logic here — reachability (active viewer only) and token positions come from
// `view`; the server stays authoritative.
import {
  ROOMS_GEO, DOORS, CELLAR_POLY, GRID, CELL, SECRET_PASSAGES,
} from "./board-geometry.js";
import { SUSPECT_CHECKER, WEAPON_ICONS } from "./board-art.js";
import type { ClueView, RoomId, SuspectId, WeaponId } from "../shared/contracts/clue";

// Axis-aligned bounding box of a room polygon, in board pixels. Every Clue room
// is a rectangle, so the bbox rect IS the room shape.
function bbox(poly: number[][]) {
  const cs = poly.map((p) => p[0]);
  const rs = poly.map((p) => p[1]);
  const minC = Math.min(...cs);
  const minR = Math.min(...rs);
  return {
    x: minC * CELL,
    y: minR * CELL,
    w: (Math.max(...cs) - minC) * CELL,
    h: (Math.max(...rs) - minR) * CELL,
  };
}

export function Board({
  view,
  onPickSquare,
  onPickRoom,
}: {
  view: ClueView;
  onPickSquare: (sq: [number, number]) => void;
  onPickRoom: (room: RoomId) => void;
}) {
  const W = GRID.cols * CELL;
  const H = GRID.rows * CELL;
  const canMove = view.movement != null && view.movement.needsRoll === false;
  const reachRooms = new Set<RoomId>(canMove ? view.movement!.rooms : []);
  const reachSquares: [number, number][] = canMove ? view.movement!.squares : [];
  const youSuspect: SuspectId | null =
    view.youAreSeat != null ? view.seatSuspect[view.youAreSeat] : null;

  // Weapon medallions: per-room slot offset so two weapons in one room don't
  // overlap (the design mock assumed one weapon per room).
  const weaponSlot = new Map<RoomId, number>();
  const weaponTokens = (Object.entries(view.weapons) as [WeaponId, RoomId][]).map(
    ([w, room]) => {
      const b = bbox(ROOMS_GEO[room].poly);
      const n = weaponSlot.get(room) ?? 0;
      weaponSlot.set(room, n + 1);
      return { w, x: b.x + 22 + n * 22, y: b.y + b.h * 0.3 };
    },
  );

  // Pawns clustered in a room get a centered horizontal spread.
  const roomPawns: Partial<Record<RoomId, SuspectId[]>> = {};
  for (const [id, loc] of Object.entries(view.pawns) as [SuspectId, { room?: RoomId }][]) {
    if (loc.room) (roomPawns[loc.room] ||= []).push(id);
  }
  const roomIndex = new Map<RoomId, number>();

  return (
    <svg className="clue-board" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Clue mansion board">
      <defs>
        <radialGradient id="clue-feltGrad" cx="50%" cy="34%" r="75%">
          <stop offset="0%" stopColor="#2f7d50" />
          <stop offset="60%" stopColor="#1b4d33" />
          <stop offset="100%" stopColor="#0c2a1c" />
        </radialGradient>
        <linearGradient id="clue-parchGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#efe4c2" />
          <stop offset="100%" stopColor="#ddcb9c" />
        </linearGradient>
        <linearGradient id="clue-brassStrip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbe79a" />
          <stop offset="55%" stopColor="#c9a14e" />
          <stop offset="100%" stopColor="#8a6a24" />
        </linearGradient>
        <radialGradient id="clue-brassMed" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#fbe79a" />
          <stop offset="55%" stopColor="#c9a14e" />
          <stop offset="100%" stopColor="#6a4a14" />
        </radialGradient>
        <filter id="clue-tokShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" floodColor="#000" floodOpacity="0.5" />
        </filter>
        <filter id="clue-feltN">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .05 0" />
        </filter>
      </defs>

      {/* felt */}
      <rect x={0} y={0} width={W} height={H} fill="url(#clue-feltGrad)" />
      <rect x={0} y={0} width={W} height={H} fill="#000" filter="url(#clue-feltN)" />

      {/* corridor grid */}
      {Array.from({ length: GRID.cols + 1 }, (_, c) => (
        <line key={`gc${c}`} x1={c * CELL} y1={0} x2={c * CELL} y2={H} stroke="rgba(240,235,215,0.07)" strokeWidth={1} />
      ))}
      {Array.from({ length: GRID.rows + 1 }, (_, r) => (
        <line key={`gr${r}`} x1={0} y1={r * CELL} x2={W} y2={r * CELL} stroke="rgba(240,235,215,0.07)" strokeWidth={1} />
      ))}

      {/* rooms (parchment) */}
      {(Object.entries(ROOMS_GEO) as [RoomId, { poly: number[][]; label: number[] }][]).map(
        ([id, g]) => {
          const b = bbox(g.poly);
          const reachable = reachRooms.has(id);
          return (
            <g key={id}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={5} fill="url(#clue-parchGrad)" stroke="#8a6234" strokeWidth={2} />
              <rect
                data-room={id}
                className={`clue-room${reachable ? " is-reachable" : ""}`}
                x={b.x} y={b.y} width={b.w} height={b.h} rx={5}
                fill={reachable ? "rgba(200,147,46,.3)" : "transparent"}
                stroke={reachable ? "#e6b652" : "transparent"}
                strokeWidth={2.5}
                onClick={reachable ? () => onPickRoom(id) : undefined}
              />
              <text className="clue-room-label" x={g.label[0] * CELL} y={g.label[1] * CELL} textAnchor="middle">
                {id}
              </text>
              {SECRET_PASSAGES[id as keyof typeof SECRET_PASSAGES] && (
                <text className="clue-secret" x={b.x + b.w - 15} y={b.y + 16}>⤢</text>
              )}
            </g>
          );
        },
      )}

      {/* cellar / accusation envelope */}
      {(() => {
        const b = bbox(CELLAR_POLY);
        const cx = b.x + b.w / 2;
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={7} fill="#16281d" stroke="#3a2606" strokeWidth={2} />
            <rect x={b.x + 7} y={b.y + 7} width={b.w - 14} height={b.h - 14} rx={4} fill="none" stroke="rgba(217,178,90,.32)" strokeWidth={1} />
            <text className="clue-envelope-title" x={cx} y={b.y + 66} textAnchor="middle">CLUE</text>
            <text className="clue-envelope-sub" x={cx} y={b.y + 85} textAnchor="middle">THE ACCUSATION</text>
            <circle cx={cx} cy={b.y + 132} r={16} fill="#6e1f18" stroke="#37100b" strokeWidth={1.5} />
            <circle cx={cx} cy={b.y + 132} r={16} fill="none" stroke="rgba(255,220,180,.25)" strokeWidth={1} />
            <text className="clue-envelope-q" x={cx} y={b.y + 138} textAnchor="middle">?</text>
          </g>
        );
      })()}

      {/* door thresholds (brass bars) */}
      {DOORS.map((d, i) => {
        const b = bbox(ROOMS_GEO[d.room].poly);
        const [c, r] = d.square;
        const bx = c * CELL;
        const by = r * CELL;
        const onVertEdge = (c + 1) * CELL <= b.x || c * CELL >= b.x + b.w;
        const transform = onVertEdge ? `rotate(90 ${bx + CELL / 2} ${by + CELL / 2})` : undefined;
        return (
          <rect
            key={i}
            data-door={d.room}
            x={bx + 4} y={by + CELL / 2 - 3} width={18} height={6} rx={2}
            fill="url(#clue-brassStrip)" stroke="#2a1608" strokeWidth={0.6}
            transform={transform}
          />
        );
      })}

      {/* reachable corridor squares (active viewer only) */}
      {reachSquares.map(([c, r]) => (
        <rect
          key={`sq-${c}-${r}`}
          data-square={`${c},${r}`}
          className="clue-reach"
          x={c * CELL + 2} y={r * CELL + 2} width={22} height={22} rx={3}
          fill="rgba(200,147,46,.55)" stroke="#e6b652" strokeWidth={1.5}
          onClick={() => onPickSquare([c, r])}
        />
      ))}

      {/* weapons: brass medallions */}
      {weaponTokens.map(({ w, x, y }) => (
        <g key={w} data-weapon={w} transform={`translate(${x},${y})`}>
          <circle r={12} fill="url(#clue-brassMed)" stroke="#2a1608" strokeWidth={1.4} filter="url(#clue-tokShadow)" />
          <circle r={9} fill="none" stroke="rgba(58,33,4,.5)" strokeWidth={1} />
          <path d={WEAPON_ICONS[w].icon} fill="none" stroke="#3a2606" strokeWidth={WEAPON_ICONS[w].sw} strokeLinecap="round" strokeLinejoin="round" />
          <title>{w}</title>
        </g>
      ))}

      {/* pawns: checker tokens (gold ring on your own) */}
      {(Object.entries(view.pawns) as [SuspectId, { room?: RoomId; square?: [number, number] }][]).map(
        ([suspect, loc]) => {
          let cx: number;
          let cy: number;
          let sz: number;
          if (loc.square) {
            cx = loc.square[0] * CELL + CELL / 2;
            cy = loc.square[1] * CELL + CELL / 2;
            sz = 24;
          } else if (loc.room) {
            const b = bbox(ROOMS_GEO[loc.room].poly);
            const list = roomPawns[loc.room]!;
            const idx = (roomIndex.get(loc.room) ?? -1) + 1;
            roomIndex.set(loc.room, idx);
            const n = list.length;
            cx = b.x + b.w / 2 + (idx - (n - 1) / 2) * 26;
            cy = b.y + b.h * 0.68;
            sz = 25;
          } else {
            return null;
          }
          return (
            <g key={suspect}>
              {suspect === youSuspect && (
                <circle
                  cx={cx} cy={cy} r={sz / 2 + 3} fill="none" stroke="#e6b652" strokeWidth={2}
                  style={{ filter: "drop-shadow(0 0 3px rgba(230,182,82,.8))" }}
                />
              )}
              <image
                data-pawn={suspect}
                href={`assets/checker-${SUSPECT_CHECKER[suspect]}.png`}
                x={cx - sz / 2} y={cy - sz / 2} width={sz} height={sz}
                filter="url(#clue-tokShadow)"
              />
              <title>{suspect}</title>
            </g>
          );
        },
      )}
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/client/clue-board.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Guard the untouched neighbours + typecheck**

Run: `npx vitest run test/client/clue-app-bot-roll.test.tsx test/client/clue-card.test.tsx test/client/clue-refute-prompt.test.tsx && npx tsc -p tsconfig.json --noEmit`
Expected: all PASS, no type errors. (Board is mocked to `null` in clue-app-bot-roll, so it stays green.)

- [ ] **Step 6: Commit**

```bash
git add src/clients/clue/Board.tsx test/client/clue-board.test.tsx
git commit -m "feat(clue): re-theme board — felt, parchment rooms, brass weapons, checker pawns"
```

---

## Task 3: Chrome re-theme (`style.css` + fonts + `ClueApp.tsx` header)

**Files:**
- Modify: `plugins/clue/client/index.html` (add font link)
- Rewrite: `plugins/clue/client/style.css`
- Modify: `src/clients/clue/ClueApp.tsx:172-189` (header markup) + wrap `<Board>` in a frame

**Interfaces:**
- Consumes: existing class hooks (`clue-header`, `clue-roster`, `clue-seat`, `clue-board`, `clue-dice`, `clue-panel`, `clue-tray`, `clue-log`). Adds `clue-header-brand`, `clue-turnpill`, `clue-nameplate`, `clue-nameplate-name`, `clue-lobby-link`, `clue-board-frame`, and the board SVG label/envelope classes emitted by Task 2.
- Produces: styled chrome. No behavior/testid changes.

- [ ] **Step 1: Add the fonts** — edit `plugins/clue/client/index.html`, insert into `<head>` after the `<meta name="viewport" ...>` line:

```html
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />
```

(Fonts are progressive enhancement — every rule keeps a `Georgia, serif` / `monospace` fallback, so a blocked font request degrades gracefully.)

- [ ] **Step 2: Update the ClueApp header markup** — in `src/clients/clue/ClueApp.tsx`, replace the `<header>` block (currently lines ~174-189) with:

```tsx
      <header className="clue-header">
        <div className="clue-header-brand">
          <span className="clue-title">CLUE</span>
          <span className="clue-sub">a Gamebox parlour mystery · game {ctx.gameId}</span>
        </div>
        <div className="clue-header-meta">
          <em className="clue-turnpill" data-testid="turn-status">
            {view.phase === "ended"
              ? "case closed"
              : myTurn
                ? "your move"
                : `waiting for ${name(view.currentSeat)}`}
          </em>
          {view.youAreSeat != null ? (
            <span className="clue-nameplate">
              <span className="clue-nameplate-name">{view.seatSuspect[view.youAreSeat]}</span>
              <a className="clue-nameplate-leave" href="/">leave the table ›</a>
            </span>
          ) : (
            <a className="clue-lobby-link" href="/">↩ Lobby</a>
          )}
        </div>
      </header>
```

Then wrap the board: replace the `<Board ... />` element (currently lines ~237-241) with:

```tsx
      <div className="clue-board-frame">
        <Board
          view={view}
          onPickSquare={(sq) => post({ type: "move", payload: { square: sq } }).catch(() => {})}
          onPickRoom={(room) => post({ type: "move", payload: { room } }).catch(() => {})}
        />
      </div>
```

- [ ] **Step 3: Rewrite `plugins/clue/client/style.css`** with the full contents below (chrome re-theme; the `clue-refute*` and `clue-card*` blocks at the end are preserved verbatim — cards are out of scope):

```css
/* plugins/clue/client/style.css — "parlour mystery" chrome (Claude Design
   handoff 2026-07-03), scoped under #clue-root. The board SVG is drawn by
   Board.tsx (felt + rooms + tokens live there); this file is page frame,
   header, roster, panels, tray, and typography. Portrait cards (.clue-card*)
   and the refute block are intentionally UNCHANGED. */
* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100dvh;
  background: radial-gradient(ellipse at 50% 0%, #2c7a4e 0%, #1b4d33 48%, #0f3322 100%) fixed;
  color: #f0e8d4;
  font-family: "Source Serif 4", Georgia, "Times New Roman", serif;
}

@keyframes reachPulse { 0%, 100% { opacity: .85; } 50% { opacity: .45; } }
@keyframes turnGlow {
  0%, 100% { box-shadow: 0 0 0 1px rgba(230, 182, 82, .5), 0 0 10px rgba(200, 147, 46, .55); }
  50%      { box-shadow: 0 0 0 1px rgba(230, 182, 82, .85), 0 0 16px rgba(200, 147, 46, .85); }
}

#clue-root { max-width: 820px; margin: 0 auto; padding: 0 14px 44px; }

/* ---- header: wood plank + brass nameplate ---- */
#clue-root .clue-header {
  position: relative;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 15px 26px; margin: 0 -14px 6px;
  border-bottom: 3px solid #2a1608;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .18), inset 0 -3px 8px rgba(0, 0, 0, .35), 0 12px 26px rgba(0, 0, 0, .42);
  background-image:
    radial-gradient(circle at 35% 30%, #d9c088, #6a4a14 70%, #2a1608),
    radial-gradient(circle at 35% 30%, #d9c088, #6a4a14 70%, #2a1608),
    radial-gradient(circle at 35% 30%, #d9c088, #6a4a14 70%, #2a1608),
    radial-gradient(circle at 35% 30%, #d9c088, #6a4a14 70%, #2a1608),
    linear-gradient(180deg, #6b3e22, #4a2810 60%, #3c2109);
  background-repeat: no-repeat;
  background-size: 9px 9px, 9px 9px, 9px 9px, 9px 9px, auto;
  background-position: 11px 9px, right 11px top 9px, 11px bottom 9px, right 11px bottom 9px, center;
}
#clue-root .clue-header-brand { display: flex; align-items: center; gap: 16px; min-width: 0; }
#clue-root .clue-title {
  font-family: "Playfair Display", Georgia, serif; font-weight: 800; font-size: 25px;
  letter-spacing: .3em; color: #2a1808;
  background: linear-gradient(180deg, #fbe79a, #c9a14e 55%, #8a6a24);
  padding: 8px 20px 8px 24px; border-radius: 5px; border: 1px solid #2a1608;
  box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, .6), inset 0 -1.5px 0 rgba(58, 33, 4, .55), 0 3px 9px rgba(0, 0, 0, .4);
  text-shadow: 0 1px 0 rgba(255, 238, 180, .5), 0 -1px 0 rgba(40, 20, 4, .35);
}
#clue-root .clue-sub { font-style: italic; font-size: 13px; color: #e7d3ad; opacity: .9; font-family: Georgia, serif; }
#clue-root .clue-header-meta { display: flex; align-items: center; gap: 14px; }
#clue-root .clue-turnpill {
  font-family: "Playfair Display", serif; font-weight: 700; font-size: 12px; font-style: normal;
  letter-spacing: .14em; text-transform: uppercase; color: #2a1808;
  background: linear-gradient(180deg, #fbe79a, #c9a14e 60%, #8a6a24);
  padding: 6px 13px; border-radius: 4px; border: 1px solid #2a1608; transform: rotate(-2deg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .55), 0 2px 6px rgba(0, 0, 0, .4);
}
#clue-root .clue-nameplate {
  display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
  background: linear-gradient(180deg, #d4986a, #a9713f); border: 1px solid #2a1608; border-radius: 6px; padding: 5px 13px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .12), inset 0 1px 0 rgba(255, 255, 255, .25), 0 2px 6px rgba(0, 0, 0, .4);
}
#clue-root .clue-nameplate-name {
  font-family: "Playfair Display", serif; font-weight: 700; font-size: 13px; color: #2a1206; text-transform: capitalize;
}
#clue-root .clue-nameplate-leave {
  font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: #5a2f12; text-decoration: none;
  border-top: 1px dashed rgba(42, 18, 6, .5); padding-top: 1px; text-align: right;
}
#clue-root .clue-lobby-link { color: #e7d3ad; text-decoration: none; font-size: 13px; }

/* ---- roster chips ---- */
#clue-root .clue-roster { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 18px 0 6px; }
#clue-root .clue-seat {
  display: inline-flex; align-items: center; gap: 8px; padding: 5px 13px 5px 12px;
  border-radius: 999px; border: 1.5px solid rgba(224, 200, 140, .28);
  background: rgba(255, 255, 255, .05); box-shadow: 0 1px 3px rgba(0, 0, 0, .25);
  font-size: .82rem; color: #f4ead2;
}
#clue-root .clue-seat.is-turn { border-color: #e6b652; background: rgba(200, 147, 46, .16); animation: turnGlow 2.2s ease-in-out infinite; }
#clue-root .clue-seat.is-you { background: rgba(200, 147, 46, .12); }
#clue-root .clue-seat.is-out { opacity: .45; text-decoration: line-through; }
#clue-root .clue-seat-pip {
  width: 15px; height: 15px; border-radius: 50%; display: inline-block; border: 1px solid rgba(0, 0, 0, .45);
  box-shadow: inset 0 1.5px 1px rgba(255, 255, 255, .45), inset 0 -1px 1px rgba(0, 0, 0, .35);
}
#clue-root .clue-seat em { font-size: .72rem; opacity: .75; font-style: italic; }

/* ---- board frame (walnut) ---- */
#clue-root .clue-board-frame {
  margin: 12px auto 0; padding: 13px;
  background: linear-gradient(160deg, #6b4423, #3d2410 55%, #2e1a0c);
  border-radius: 12px; border: 1px solid #1c1206;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .13), inset 0 -3px 9px rgba(0, 0, 0, .5), 0 20px 44px rgba(0, 0, 0, .5);
}
#clue-root .clue-board {
  width: 100%; height: auto; display: block; border-radius: 5px;
  box-shadow: inset 0 0 60px rgba(0, 0, 0, .55), inset 0 0 0 2px rgba(20, 40, 28, .6);
}
#clue-root .clue-room-label {
  font-family: "Playfair Display", Georgia, serif; font-weight: 700; font-size: 13px;
  fill: #3a2510; letter-spacing: .02em; text-transform: capitalize; pointer-events: none;
}
#clue-root .clue-room.is-reachable { cursor: pointer; }
#clue-root .clue-room.is-reachable:hover { fill: rgba(200, 147, 46, .5); }
#clue-root .clue-secret { fill: #8a6234; font-size: 12px; pointer-events: none; }
#clue-root .clue-reach { cursor: pointer; animation: reachPulse 1.6s ease-in-out infinite; }
#clue-root .clue-reach:hover { fill: rgba(200, 147, 46, .85); }
#clue-root .clue-envelope-title { font-family: "Playfair Display", serif; font-weight: 800; font-size: 23px; fill: #d9b25a; letter-spacing: 6px; }
#clue-root .clue-envelope-sub { font-family: "JetBrains Mono", monospace; font-size: 8.5px; fill: rgba(217, 178, 90, .72); letter-spacing: 2.5px; }
#clue-root .clue-envelope-q { font-family: "Playfair Display", serif; font-weight: 800; font-size: 15px; fill: #e8c9a0; }

/* ---- dice tray ---- */
#clue-root .clue-dice {
  display: flex; flex-direction: column; align-items: center; gap: 9px;
  margin: 16px 0 4px; padding: 14px 16px;
  background: linear-gradient(180deg, #173d29, #0f2c1e);
  border: 1px solid #0a2016; border-radius: 9px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .08), 0 3px 10px rgba(0, 0, 0, .35);
}
#clue-root .clue-roll, #clue-root .clue-passage {
  font: inherit; font-weight: 700; padding: 7px 16px; border-radius: 6px; cursor: pointer;
  border: 1px solid #2a1608; color: #2a1808;
  background: linear-gradient(180deg, #fbe79a, #c9a14e 60%, #8a6a24);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .55), 0 2px 6px rgba(0, 0, 0, .3);
}
#clue-root .clue-roll[disabled] { opacity: .55; cursor: not-allowed; }
#clue-root .clue-roll-status { font-style: italic; color: #d9cba8; }

/* ---- action panels (parchment) ---- */
#clue-root .clue-panel {
  margin: 12px 0; padding: 14px 16px; color: #2a1810;
  background: linear-gradient(180deg, #fffbe9, #f4ead0);
  border: 1px solid rgba(80, 50, 20, .3); border-radius: 9px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .6), 0 3px 12px rgba(0, 0, 0, .28);
}
#clue-root .clue-panel h3 { margin: 0 0 8px; font-family: "Playfair Display", serif; font-weight: 700; font-size: 16px; color: #2a1810; }
#clue-root .clue-picker { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
#clue-root .clue-picker-room { text-transform: capitalize; }
#clue-root .clue-panel select {
  font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 6px; cursor: pointer;
  border: 1px solid #8a6a3b; background: #fffbe9; color: #2a1810; text-transform: capitalize;
}
#clue-root .clue-panel button {
  font: inherit; font-weight: 700; font-size: 13px; padding: 7px 16px; border-radius: 6px; cursor: pointer;
  border: 1px solid #2a1608; color: #2a1808;
  background: linear-gradient(180deg, #fbe79a, #c9a14e 60%, #8a6a24);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .55), 0 2px 6px rgba(0, 0, 0, .3);
}
#clue-root .clue-panel button:hover { filter: brightness(1.05); }
#clue-root .clue-accuse button:first-of-type,
#clue-root .clue-pass {
  background: #fbeee7; color: #8a2a1c; border-color: #a13b2a; box-shadow: 0 0 0 2px rgba(161, 59, 42, .16);
}

/* ---- error / banner ---- */
#clue-root .clue-error { background: #5a1f24; color: #f4ead2; padding: 6px 10px; border-radius: 6px; margin: 6px 0; }
#clue-root .clue-banner { font-style: italic; color: #d9cba8; margin: 8px 0; }

/* ---- hand + ledger: section headers restyled; portrait cards below UNCHANGED ---- */
#clue-root .clue-tray { display: flex; gap: 24px; flex-wrap: wrap; margin: 14px 0; }
#clue-root .clue-tray h4 {
  margin: 0 0 8px; font-family: "JetBrains Mono", monospace; font-size: 10px; font-weight: 600;
  letter-spacing: .16em; text-transform: uppercase; color: #bcd8c5;
}

/* ---- log: parlour ledger ---- */
#clue-root .clue-log {
  margin-top: 16px; padding-top: 12px; font-size: 13px; color: #d9cba8;
  border-top: 1px dashed rgba(224, 200, 140, .35);
}
#clue-root .clue-log p { margin: 3px 0; font-style: italic; line-height: 1.4; }

/* ---- endbanner (behavior unchanged) ---- */
#clue-root .clue-endbanner { position: sticky; bottom: 12px; margin-top: 14px; padding: 14px; text-align: center; font-size: 1.2rem; border-radius: 8px; }
#clue-root .clue-endbanner.win { background: #2e5a24; }
#clue-root .clue-endbanner.lose { background: #5a1f24; }

/* ================= UNCHANGED: refute prompt ================= */
#clue-root .clue-refute {
  margin: 10px 0; padding: 12px; border: 2px solid #e0b23c; border-radius: 8px;
  background: rgba(224, 178, 60, 0.1);
}
#clue-root .clue-refute-cards { display: flex; gap: 8px; flex-wrap: wrap; }

/* ================= UNCHANGED: portrait cards (E7-1) ================= */
#clue-root .clue-card {
  display: inline-flex; flex-direction: column; align-items: stretch;
  width: 88px; margin: 0 6px 6px 0; padding: 0;
  background: #efe6d8; color: #2a1a22;
  border: 2px solid #8a6d5a; border-radius: 8px; overflow: hidden;
  font: inherit; font-size: 0.8rem; text-align: center;
  appearance: none; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
#clue-root .clue-card__portrait {
  position: relative; display: flex; align-items: center; justify-content: center;
  width: 100%; height: 88px; background: #1f2937; overflow: hidden;
}
#clue-root .clue-card__glyph { font-size: 40px; line-height: 1; }
#clue-root .clue-card__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
#clue-root .clue-card__label { padding: 4px 6px; font-weight: 600; text-transform: capitalize; line-height: 1.2; }
#clue-root .clue-card__caption { display: block; padding: 0 6px 4px; font-size: 0.7rem; font-style: italic; opacity: 0.7; }
#clue-root .clue-card--suspect { border-color: #c0392b; }
#clue-root .clue-card--weapon  { border-color: #8a6d5a; }
#clue-root .clue-card--room    { border-color: #2980b9; }
#clue-root .clue-card--pickable { cursor: pointer; transition: transform 0.08s ease, box-shadow 0.08s ease; }
#clue-root .clue-card--pickable:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0, 0, 0, 0.45); }
#clue-root .clue-card--pickable:focus-visible,
#clue-root .clue-card.is-selected { outline: 2px solid #e0b23c; outline-offset: 2px; }
```

- [ ] **Step 4: Verify behavioral tests + typecheck still pass**

Run: `npx vitest run test/client/clue-app-bot-roll.test.tsx test/client/clue-card.test.tsx test/client/clue-refute-prompt.test.tsx && npx tsc -p tsconfig.json --noEmit`
Expected: all PASS, no type errors (header markup change adds a nameplate but keeps `data-testid="turn-status"` and touches no dice/roll logic).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/client/index.html plugins/clue/client/style.css src/clients/clue/ClueApp.tsx
git commit -m "feat(clue): re-theme chrome — wood header, roster chips, felt tray, parchment panels"
```

---

## Task 4: Build, track assets, verify live

**Files:**
- Track: `plugins/clue/client/assets/checker-{red,orange,white,green,blue,pink}.png`

- [ ] **Step 1: Full test suite (nothing regressed)**

Run: `npm test`
Expected: PASS. Engine/geometry/drift/AI suites untouched; new board + board-art suites green; existing client suites green.

- [ ] **Step 2: Build the client bundle**

Run: `npm run build:client`
Expected: `[build-clients] building clue` succeeds; `plugins/clue/client/app.js` + `app.css` rebuilt.

- [ ] **Step 3: Track the pawn assets** (currently untracked)

```bash
git add plugins/clue/client/assets/checker-red.png plugins/clue/client/assets/checker-orange.png \
        plugins/clue/client/assets/checker-white.png plugins/clue/client/assets/checker-green.png \
        plugins/clue/client/assets/checker-blue.png plugins/clue/client/assets/checker-pink.png
```

(The `checker-stone-*` and other unused variants stay untracked — add only the six the board references.)

- [ ] **Step 4: Live smoke + screenshot**

Use the `/run` skill to launch the server, open a Clue game in the browser (via claude-in-chrome), and confirm: felt board in the walnut frame renders; parchment rooms + labels; brass weapon medallions; checker pawns with a gold ring on your own; wood header + brass nameplate; roster chips glow on turn; a move onto a reachable room/square still posts and updates. Screenshot the board and eyeball it against the design. Also verify `assets/checker-*.png` load with 200s (no 404 in the network panel) — this confirms the relative href resolves under the `${base}/:gameId/` static mount.

- [ ] **Step 5: Commit the tracked assets**

```bash
git add plugins/clue/client/assets/checker-*.png
git commit -m "chore(clue): track checker pawn assets used by the re-themed board"
```

---

## Self-Review

**Spec coverage:**
- Board re-theme (felt/parchment/brass/checker/envelope) → Task 2. ✓
- Board art constants → Task 1. ✓
- Chrome (page bg, header, roster, dice frame, panels, log, keyframes) → Task 3. ✓
- Cards untouched → enforced by Global Constraints + Task 3 preserves `.clue-card*`/`.clue-refute*` verbatim. ✓
- New `clue-board.test.tsx` → Task 2. ✓
- Verification (build, asset tracking, live smoke, 404 check) → Task 4. ✓
- Two-stylesheet cascade → `style.css` is `#clue-root`-scoped (wins over `app.css`); live smoke confirms. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete content. ✓

**Type/name consistency:** `SUSPECT_CHECKER`/`WEAPON_ICONS` defined in Task 1 and consumed with matching shape in Task 2; `bbox`, `youSuspect`, `weaponTokens`, `roomPawns`/`roomIndex` are internally consistent; data-attrs (`data-room/-weapon/-pawn/-square/-door`) match between Board and its test. ✓

## Execution Handoff — deferred to the caller (see chat).
