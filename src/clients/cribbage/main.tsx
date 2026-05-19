import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { CribbageApp } from "./CribbageApp";

const root = document.getElementById("cribbage-root");
if (root) {
  createRoot(root).render(
    <ErrorBoundary>
      <CribbageApp />
    </ErrorBoundary>,
  );
}
