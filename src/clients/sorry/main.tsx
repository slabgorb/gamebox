// src/clients/sorry/main.tsx
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { SorryApp } from "./SorryApp";

const root = document.getElementById("sorry-root");
if (root) {
  createRoot(root).render(
    <ErrorBoundary>
      <SorryApp />
    </ErrorBoundary>,
  );
}
