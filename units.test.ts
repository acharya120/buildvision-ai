import { describe, expect, it } from "vitest";
import {
  M_PER_FT,
  formatArea,
  formatLength,
  fromMeters,
  lengthToInput,
  parseLength,
  sqftToSqm,
  sqmToSqft,
  toMeters,
} from "@/lib/model/units";

describe("unit conversion", () => {
  it("converts feet to meters exactly", () => {
    expect(toMeters(1, "ft")).toBeCloseTo(0.3048, 10);
    expect(toMeters(10, "ft")).toBeCloseTo(3.048, 10);
  });
  it("converts inches, cm and mm", () => {
    expect(toMeters(12, "in")).toBeCloseTo(0.3048, 10);
    expect(toMeters(350, "cm")).toBeCloseTo(3.5, 10);
    expect(toMeters(2500, "mm")).toBeCloseTo(2.5, 10);
  });
  it("round-trips through meters", () => {
    for (const u of ["m", "cm", "mm", "ft", "in"] as const) {
      expect(fromMeters(toMeters(7.25, u), u)).toBeCloseTo(7.25, 9);
    }
  });
  it("converts areas both ways (25 gaj = 225 sq ft)", () => {
    expect(sqmToSqft(1)).toBeCloseTo(10.7639, 3);
    expect(sqftToSqm(225)).toBeCloseTo(20.903, 2);
    expect(sqmToSqft(sqftToSqm(225))).toBeCloseTo(225, 9);
  });
});

describe("parseLength", () => {
  it("uses the unit system for bare numbers", () => {
    expect(parseLength("12", "imperial")).toBeCloseTo(12 * M_PER_FT, 9);
    expect(parseLength("12", "metric")).toBeCloseTo(12, 9);
  });
  it("understands feet and inches", () => {
    expect(parseLength("12'6\"", "metric")).toBeCloseTo(12.5 * M_PER_FT, 9);
    expect(parseLength("12 ft 6 in", "metric")).toBeCloseTo(12.5 * M_PER_FT, 9);
    expect(parseLength("40in", "metric")).toBeCloseTo(1.016, 9);
    expect(parseLength("15ft", "metric")).toBeCloseTo(4.572, 9);
  });
  it("understands metric suffixes", () => {
    expect(parseLength("3.5m", "imperial")).toBeCloseTo(3.5, 9);
    expect(parseLength("350 cm", "imperial")).toBeCloseTo(3.5, 9);
    expect(parseLength("2500mm", "imperial")).toBeCloseTo(2.5, 9);
  });
  it("rejects invalid input", () => {
    for (const bad of ["", "   ", "abc", "-3", "12 parsecs", "1..2", "NaN", "Infinity"]) {
      expect(parseLength(bad, "metric")).toBeNull();
    }
  });
});

describe("formatting", () => {
  it("formats metric and imperial lengths", () => {
    expect(formatLength(3.5, "metric")).toBe("3.50 m");
    expect(formatLength(12.5 * M_PER_FT, "imperial")).toBe("12' 6\"");
  });
  it("carries 12 inches into the next foot", () => {
    expect(formatLength(0.3047, "imperial")).toBe("1' 0\"");
  });
  it("formats areas", () => {
    expect(formatArea(10, "metric")).toBe("10.00 m²");
    expect(formatArea(10, "imperial")).toBe("107.6 sq ft");
  });
  it("gives a numeric string for input boxes", () => {
    expect(lengthToInput(4.572, "imperial")).toBe("15");
    expect(lengthToInput(3.5, "metric")).toBe("3.5");
  });
});
