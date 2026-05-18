// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["test/client/setup.ts"],
    include: ["test/client/**/*.test.{ts,tsx}"],
  },
});
