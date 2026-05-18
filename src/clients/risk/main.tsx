// src/clients/risk/main.tsx
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { RiskApp } from "./RiskApp";

const root = document.getElementById("risk-root");
if (root) {
  createRoot(root).render(
    <ErrorBoundary>
      <RiskApp />
    </ErrorBoundary>,
  );
}
