// src/clients/risk/History.tsx
import type { RiskLogEntry } from "../shared/contracts/risk";

function line(e: RiskLogEntry): string {
  if (e.kind === "attack")
    return `P${e.player} attacked ${e.from}→${e.to} (${e.captured ? "captured" : "repulsed"})`;
  if (e.kind === "deploy" || e.kind === "setup-deploy")
    return `P${e.player} deployed`;
  if (e.kind === "fortify")
    return `P${e.player} fortified ${e.from}→${e.to} ×${e.count}`;
  if (e.kind === "end-turn") return `— turn to P${e.next} —`;
  return "";
}

export function History({ log = [] }: { log?: RiskLogEntry[] }) {
  const items = log.slice(-12).map(line).filter(Boolean);
  return (
    <div className="log">
      {items.map((s, i) => (
        <div key={i}>{s}</div>
      ))}
    </div>
  );
}
