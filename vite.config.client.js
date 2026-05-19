import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const plugin = process.env.GAMEBOX_PLUGIN;
if (!plugin) {
  throw new Error("GAMEBOX_PLUGIN env var is required (e.g. GAMEBOX_PLUGIN=risk)");
}

export default defineConfig({
  publicDir: false,
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "three",
      "@react-three/fiber",
      "@react-three/drei",
      "@react-three/rapier",
    ],
  },
  build: {
    target: "es2022",
    outDir: `plugins/${plugin}/client`,
    emptyOutDir: false, // preserve index.html, style.css, assets/
    sourcemap: true,
    lib: {
      entry: resolve(process.cwd(), `src/clients/${plugin}/main.tsx`),
      formats: ["es"],
      fileName: () => "app.js",
    },
    rollupOptions: {
      external: ["/shared/cards/card-element.js"],
      output: { codeSplitting: false },
    },
  },
});
