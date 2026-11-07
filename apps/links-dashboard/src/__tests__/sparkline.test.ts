import { describe, it, expect } from "vitest";
import { calculateTrend, generateSvgPath } from "../components/analytics/InlineSparkline";

describe("InlineSparkline logic", () => {
  it("correctly identifies upward trend", () => {
    expect(calculateTrend([1, 3, 5, 10])).toBe("upward");
  });

  it("correctly identifies downward trend", () => {
    expect(calculateTrend([10, 8, 4, 1])).toBe("downward");
  });

  it("correctly identifies flat / inactive trend", () => {
    expect(calculateTrend([5, 5, 5, 5])).toBe("flat");
    expect(calculateTrend([2])).toBe("flat");
    expect(calculateTrend([])).toBe("flat");
  });

  it("generates valid SVG path and area geometry", () => {
    const { pathString, areaString } = generateSvgPath([0, 5, 10], 64, 18, 2);
    expect(pathString).toContain("M ");
    expect(pathString).toContain("L ");
    expect(areaString).toContain("Z");
  });

  it("handles single-point data gracefully", () => {
    const { pathString } = generateSvgPath([10], 64, 18, 2);
    expect(pathString).toContain("M ");
    expect(pathString).toContain("L ");
  });
});
