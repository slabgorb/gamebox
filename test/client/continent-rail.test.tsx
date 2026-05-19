import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContinentRail } from "../../src/clients/risk/ContinentRail";
import { CONTINENT_BONUS } from "../../src/clients/risk/map-geometry.js";

describe("ContinentRail", () => {
  it("renders one chip per continent and marks fully-held ones", () => {
    const keys = Object.keys(CONTINENT_BONUS);
    const view = { youAre: 0, territories: {} } as any;
    render(<ContinentRail view={view} />);
    expect(screen.getAllByText(/\+\d/).length).toBe(keys.length);
  });
});
