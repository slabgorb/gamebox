#!/usr/bin/env bash
# Risk data-collection pilot wrapper. Runs six pairings × 25 games × Sonnet 4.6
# sequentially. Re-running picks up where it left off (the harness's line-count
# resume + the per-pairing-file layout mean every restart is a no-op for already-
# completed pairings).
#
# Usage:
#   ./scripts/risk-pilot.sh
#
# Output: data/risk-corpus/pilot/<personaA>-<personaB>.jsonl per pairing
#         data/risk-corpus/pilot/pilot-meta.json (rebuilt at the end)

set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUTDIR="$PROJECT_ROOT/data/risk-corpus/pilot"
mkdir -p "$OUTDIR"

PAIRINGS=(
  "admiral-vonnegut:admiral-vonnegut"
  "admiral-vonnegut:colonel-jaune"
  "admiral-vonnegut:major-robert"
  "colonel-jaune:colonel-jaune"
  "colonel-jaune:major-robert"
  "major-robert:major-robert"
)

GAMES=25
MAX_TURNS=500
MODEL="claude:claude-sonnet-4-6"

for i in "${!PAIRINGS[@]}"; do
  IFS=":" read -r A B <<< "${PAIRINGS[$i]}"
  OUT="$OUTDIR/${A}-${B}.jsonl"
  SEED=$((100 * i))
  echo "=== Pairing $((i + 1))/${#PAIRINGS[@]}: $A vs $B (seed $SEED) ==="
  node "$PROJECT_ROOT/scripts/risk-tourney.mjs" \
    --a "$MODEL" \
    --b "$MODEL" \
    --persona-a "$A" \
    --persona-b "$B" \
    --games "$GAMES" \
    --seed "$SEED" \
    --max-turns "$MAX_TURNS" \
    --mode collection \
    --out "$OUT"
done

echo "=== Building pilot-meta.json ==="
node "$PROJECT_ROOT/scripts/risk-pilot-meta.mjs" "$OUTDIR"

echo "Pilot complete. Run the diagnostic with:"
echo "  node scripts/risk-style-diag.mjs $OUTDIR"
