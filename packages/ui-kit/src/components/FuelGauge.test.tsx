import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FuelGauge } from "./FuelGauge";

describe("FuelGauge", () => {
    it("renders RBTC balance text", () => {
        render(<FuelGauge balance={0n} />);
        expect(screen.getByText(/RBTC/)).toBeDefined();
    });
});

