// src/clients/clue/main.tsx
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { ClueApp } from "./ClueApp";

const root = document.getElementById("clue-root");
if (root) {
  createRoot(root).render(
    <ErrorBoundary>
      <ClueApp />
    </ErrorBoundary>,
  );
}
