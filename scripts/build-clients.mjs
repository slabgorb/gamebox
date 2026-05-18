import { existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const clientsDir = resolve(process.cwd(), "src/clients");
if (!existsSync(clientsDir)) {
  console.log("[build-clients] no src/clients yet — nothing to build");
  process.exit(0);
}

const plugins = readdirSync(clientsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((id) => existsSync(resolve(clientsDir, id, "main.tsx")));

for (const id of plugins) {
  console.log(`[build-clients] building ${id}`);
  execFileSync("npx", ["vite", "build", "--config", "vite.config.client.js"], {
    stdio: "inherit",
    env: { ...process.env, GAMEBOX_PLUGIN: id },
  });
}
console.log(`[build-clients] done (${plugins.length} plugin(s))`);
