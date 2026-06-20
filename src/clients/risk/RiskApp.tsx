// src/clients/risk/RiskApp.tsx
import { useState, useRef, useEffect } from "react";
import { useGameState } from "../shared/useGameState";
import type { RiskView, RiskAction } from "../shared/contracts/risk";
import { adjust } from "./deploy-plan";
import { combatSignature, shouldReplay } from "./combat-signature";
import { Board } from "./Board";
import { ActionBar, type Pending } from "./ActionBar";
import { ContinentRail } from "./ContinentRail";
import { CardTray } from "./CardTray";
import { History } from "./History";
import { EndScreen } from "./EndScreen";
import { Header } from "./Header";
import { CombatReveal } from "./CombatReveal";
import { AiRoster, type BotSeat } from "../shared/AiRoster";
import { play, primeAudio } from "./sounds";
import { seatHex } from "./themes";

export function RiskApp() {
  const { view, post, ctx } = useGameState<RiskView, RiskAction>();
  const [pending, setPending] = useState<Pending>({});
  const [live, setLive] = useState<{ from: string; to: string; force: number } | null>(
    null,
  );
  const seenSig = useRef<string | null | undefined>(undefined);
  // Track turn ownership so we can chime when control flips to us.
  const wasMyTurn = useRef<boolean | null>(null);

  // Browsers gate Audio.play() until the user interacts; warm the cache
  // on the first pointer/key event so the bot's move actually plays.
  useEffect(() => {
    const prime = () => {
      primeAudio();
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

  // "Your turn" chime when control flips to the local player.
  useEffect(() => {
    if (!view) return;
    const isMyTurn =
      view.youAre != null && view.currentPlayer === view.youAre;
    if (wasMyTurn.current === false && isMyTurn) play("your-turn");
    wasMyTurn.current = isMyTurn;
  }, [view?.currentPlayer, view?.youAre]);

  // Capture/repulsed chime on every new resolved combat (including the
  // bot's attacks — shouldReplay tracks the signature for us).
  const lastCombatSig = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const lc = view?.lastCombat;
    if (!lc) {
      lastCombatSig.current = null;
      return;
    }
    const sig = `${lc.from}|${lc.to}|${lc.captured ? "1" : "0"}|${lc.rounds?.length ?? 0}`;
    if (sig !== lastCombatSig.current) {
      lastCombatSig.current = sig;
      // Skip the chime on the very first render (initial state load) —
      // wasMyTurn starts null and lastCombatSig starts undefined, so we
      // only chime once the user has actually participated.
      if (wasMyTurn.current !== null) {
        play(lc.captured ? "capture" : "repulsed");
      }
    }
  }, [view?.lastCombat]);

  // Victory cue when the phase transitions into gameover.
  const wasGameOver = useRef<boolean>(false);
  useEffect(() => {
    if (!view) return;
    const isGameOver = view.phase === "gameover";
    if (isGameOver && !wasGameOver.current && view.winner === view.youAre) {
      play("victory");
    }
    wasGameOver.current = isGameOver;
  }, [view?.phase, view?.winner, view?.youAre]);

  if (!view) return <div className="banner">Loading…</div>;

  // Roster: display names by seat (multiplayer). view.seats maps seat → userId;
  // ctx.players maps userId → friendlyName.
  const nPlayers = view.seats?.length ?? 2;
  const seatNames = view.seats?.map(
    (uid, seat) => ctx.players?.find((p) => p.userId === uid)?.friendlyName ?? `Player ${seat + 1}`,
  );

  // Bots to surface in the AI roster. A bot's userId is its botUserId.
  // personaId comes from the enriched roster; for a legacy 2P game that
  // predates the server change, fall back to the singular overlay.
  const bots: BotSeat[] = (ctx.players ?? [])
    .filter((p) => p.isBot && p.userId !== ctx.userId)
    .map((p) => {
      const personaId =
        p.personaId ?? (nPlayers === 2 ? ctx.opponentPersonaId ?? null : null);
      if (!personaId) return null;
      return {
        seat: p.seat,
        userId: p.userId,
        personaId,
        friendlyName: nPlayers === 2 ? ctx.opponentFriendlyName ?? p.friendlyName : p.friendlyName,
        color: nPlayers > 2 ? seatHex(p.seat) : ctx.opponentColor ?? p.color,
        glyph: nPlayers === 2 ? ctx.opponentGlyph ?? p.glyph : p.glyph,
      } satisfies BotSeat;
    })
    .filter((b): b is BotSeat => b !== null);

  if (view.phase === "gameover") return <EndScreen view={view} seatNames={seatNames} />;

  const attackerColor =
    nPlayers > 2 ? seatHex(view.youAre) : ctx.yourColor ?? "#c33";
  const defenderColor =
    nPlayers > 2
      ? seatHex(
          view.pendingCombat
            ? view.pendingCombat.attackerIdx
            : (pending.to != null ? view.territories[pending.to]?.owner : null) ?? null,
        )
      : ctx.opponentColor ?? "#36c";

  function pick(id: string) {
    const ph = view!.phase;
    if (ph === "setup" || ph === "reinforce") {
      if (view!.territories[id]?.owner === view!.youAre) {
        const pool =
          ph === "setup"
            ? view!.setupPools[view!.youAre ?? 0]
            : view!.reinforcePool;
        setPending({
          plan: adjust(pending.plan ?? {}, id, 1, pool),
          deployTarget: id,
        });
        play("place");
      }
    } else if (ph === "attack" || ph === "fortify") {
      if (!pending.from) setPending({ from: id });
      else if (!pending.to) setPending({ ...pending, to: id });
      else setPending({ from: id });
      play("click");
    }
  }

  // Bot-attack replay: a new lastCombat the player did not just cause.
  const { signature, replay } = shouldReplay(seenSig.current, view.lastCombat);
  seenSig.current = signature;

  return (
    <div>
      <Header
        view={view}
        seatNames={seatNames}
        factionName={ctx.yourFriendlyName ?? "You"}
        factionColor={nPlayers > 2 ? seatHex(view.youAre) : ctx.yourColor}
        onResign={() => {
          if (nPlayers > 2) {
            window.alert(
              "Resigning isn't supported in multiplayer games — fight to the end.",
            );
            return;
          }
          if (
            window.confirm(
              "Resign this game? You forfeit — your opponent wins.",
            )
          ) {
            post({ type: "resign" });
          }
        }}
      />

      <ContinentRail view={view} />

      <CardTray view={view} post={post} />

      <AiRoster
        bots={bots}
        gameId={ctx.gameId}
        userId={ctx.userId}
        sseUrl={ctx.sseUrl}
      />

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
            // Pre-seed the replay-suppression signature: the lastCombat the
            // server is about to store has these exact fields, and we just
            // drove the dice live — a replay mount would re-render with
            // random-faced 3D dice (replay has no throwParams) and the
            // user would see numbers that don't match the chronicle.
            seenSig.current = combatSignature({
              from: live.from,
              to: live.to,
              force: live.force,
              captured: !!resolved.captured,
              rounds: resolved.rounds,
              attackerSurvivors: resolved.attackerSurvivors,
              defenderSurvivors: resolved.defenderSurvivors,
            });
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
            // Same replay-suppression seed as the attacker path — the
            // server uses pc.force as the committed force.
            seenSig.current = combatSignature({
              from: pc.from,
              to: pc.to,
              force: pc.force,
              captured: !!resolved.captured,
              rounds: resolved.rounds,
              attackerSurvivors: resolved.attackerSurvivors,
              defenderSurvivors: resolved.defenderSurvivors,
            });
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
          play("cannon");
        }}
      />

      <History
        log={view.log}
        youAre={view.youAre}
        yourName={ctx.yourFriendlyName}
        opponentName={ctx.opponentFriendlyName}
        seatNames={seatNames}
      />
    </div>
  );
}
