import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../../src/clients/shared/ErrorBoundary";

function Boom(): React.JSX.Element {
  throw new Error("Cannot read properties of undefined");
}

describe("ErrorBoundary", () => {
  it("renders an alert, the error detail, and exactly one Lobby link to /", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/went wrong/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Cannot read properties of undefined/),
    ).toBeInTheDocument();
    const lobby = screen.getAllByRole("link").filter(
      (a) => a.getAttribute("href") === "/",
    );
    expect(lobby).toHaveLength(1);
    expect(lobby[0]).toHaveTextContent(/lobby/i);
    expect(
      screen.getByRole("button", { name: /reload/i }),
    ).toBeInTheDocument();
    spy.mockRestore();
  });

  it("renders children unchanged when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div data-testid="ok">fine</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("ok")).toHaveTextContent("fine");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
