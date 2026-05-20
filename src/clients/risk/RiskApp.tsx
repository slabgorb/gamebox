// src/clients/risk/RiskApp.tsx
import { useState, useRef } from "react";
import { useGameState } from "../shared/useGameState";
import type { RiskView, RiskAction } from "../shared/contracts/risk";
import { adjust } from "./deploy-plan";
import { shouldReplay } from "./combat-signature";
import { Board } from "./Board";
import { ActionBar, type Pending } from "./ActionBar";
import { ContinentRail } from "./ContinentRail";
import { History } from "./History";
import { EndScreen } from "./EndScreen";
import { ExitControls } from "./ExitControls";
import { CombatReveal } from "./CombatReveal";
import { OpponentCard } from "../shared/OpponentCard";
import { OpponentBanter } from "../shared/OpponentBanter";

export function RiskApp() {
  const { view, post, ctx } = useGameState<RiskView, RiskAction>();
  const [pending, setPending] = useState<Pending>({});
  const [live, setLive] = useState<{ from: string; to: string; force: number } | null>(
    null,
  );
  const seenSig = useRef<string | null | undefined>(undefined);

  if (!view) return <div className="banner">Loading…</div>;
  if (view.phase === "gameover") return <EndScreen view={view} />;

  const attackerColor = ctx.yourColor ?? "#c33";
  const defenderColor = ctx.opponentColor ?? "#36c";

  function pick(id: string) {
    const ph = view!.phase;
    if (ph === "setup" || ph === "reinforce") {
      if (view!.territories[id]?.owner === view!.youAre) {
        const pool =
          ph === "setup"
            ? view!.setupPools[view!.youAre as 0 | 1]
            : view!.reinforcePool;
        setPending({
          plan: adjust(pending.plan ?? {}, id, 1, pool),
          deployTarget: id,
        });
      }
    } else if (ph === "attack" || ph === "fortify") {
      if (!pending.from) setPending({ from: id });
      else if (!pending.to) setPending({ ...pending, to: id });
      else setPending({ from: id });
    }
  }

  // Bot-attack replay: a new lastCombat the player did not just cause.
  const { signature, replay } = shouldReplay(seenSig.current, view.lastCombat);
  seenSig.current = signature;

  return (
    <div>
      <div className="banner">
        {`Phase: ${view.phase} · ${
          view.youAre === view.currentPlayer ? "Your move" : "Opponent"
        }`}
        <ExitControls
          onResign={() => {
            if (
              window.confirm(
                "Resign this game? You forfeit — your opponent wins.",
              )
            ) {
              post({ type: "resign" });
            }
          }}
        />
      </div>

      <ContinentRail view={view} />

      <OpponentCard
        personaId={ctx.opponentPersonaId ?? null}
        friendlyName={ctx.opponentFriendlyName ?? "Opponent"}
        color={ctx.opponentColor}
        glyph={ctx.opponentGlyph}
      >
        <OpponentBanter
          gameId={ctx.gameId}
          userId={ctx.userId}
          sseUrl={ctx.sseUrl}
          friendlyName={ctx.opponentFriendlyName ?? "Opponent"}
        />
      </OpponentCard>

      <Board
        view={view}
        onPick={pick}
        selected={pending.from ?? pending.deployTarget ?? null}
        plan={pending.plan}
        to={pending.to ?? null}
      />

      {live && (
        <CombatReveal
          mode="live"
          from={live.from}
          to={live.to}
          force={live.force}
          defenders={view.territories[live.to].armies}
          attackerColor={attackerColor}
          defenderColor={defenderColor}
          onResolved={(resolved) => {
            setLive(null);
            setPending({});
            post({
              type: "attack",
              payload: { from: live.from, to: live.to, resolved },
            });
          }}
        />
      )}

      {!live && view.pendingCombat &&
        view.pendingCombat.defenderIdx === view.youAre && (
        <CombatReveal
          mode="live"
          from={view.pendingCombat.from}
          to={view.pendingCombat.to}
          force={view.pendingCombat.force}
          defenders={view.territories[view.pendingCombat.to].armies}
          // Defender's perspective: the attacker is the opponent.
          attackerColor={defenderColor}
          defenderColor={attackerColor}
          onResolved={(resolved) => {
            const pc = view.pendingCombat!;
            post({
              type: "attack",
              payload: {
                from: pc.from,
                to: pc.to,
                force: pc.force,
                resolved,
              },
            });
          }}
        />
      )}

      {!live && !view.pendingCombat && replay && view.lastCombat && (
        <CombatReveal
          mode="replay"
          from={view.lastCombat.from}
          to={view.lastCombat.to}
          attackerColor={attackerColor}
          defenderColor={defenderColor}
          rounds={view.lastCombat.rounds}
          captured={view.lastCombat.captured}
        />
      )}

      <ActionBar
        view={view}
        pending={pending}
        post={post}
        setPending={setPending}
        onAttack={(from, to) => {
          const f = view.territories[from];
          setLive({ from, to, force: f.armies - 1 });
        }}
      />

      <History log={view.log} />
    </div>
  );
}
