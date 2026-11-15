import { describe, it, expect } from "vitest";
import { cubicRegression, removeOutliersIQR, solveLinearSystem } from "../../analytics/phaseCoefficients.js";

describe("cubicRegression", () => {
  it("fits perfect cubic data exactly", () => {
    const points = [
      { x: 1, y: 1 },
      { x: 2, y: 8 },
      { x: 3, y: 27 },
      { x: 4, y: 64 },
      { x: 5, y: 125 },
    ];

    const result = cubicRegression(points);

    expect(result.V).toBeCloseTo(1, 5);
    expect(result.T).toBeCloseTo(0, 5);
    expect(result.U).toBeCloseTo(0, 5);
    expect(result.W).toBeCloseTo(0, 5);
    expect(result.rSquared).toBeCloseTo(1, 5);
  });

  it("fits quadratic data with V=0", () => {
    const points = [
      { x: 1, y: 1 },
      { x: 2, y: 4 },
      { x: 3, y: 9 },
      { x: 4, y: 16 },
      { x: 5, y: 25 },
    ];

    const result = cubicRegression(points);

    expect(result.T).toBeCloseTo(1, 3);
    expect(result.V).toBeCloseTo(0, 3);
    expect(result.rSquared).toBeCloseTo(1, 3);
  });

  it("fits linear data with T=V=0", () => {
    const points = [
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 },
      { x: 4, y: 9 },
      { x: 5, y: 11 },
    ];

    const result = cubicRegression(points);

    expect(result.U).toBeCloseTo(2, 3);
    expect(result.W).toBeCloseTo(1, 3);
    expect(result.T).toBeCloseTo(0, 3);
    expect(result.V).toBeCloseTo(0, 3);
    expect(result.rSquared).toBeCloseTo(1, 3);
  });

  it("handles noisy data with reasonable R²", () => {
    const points = [
      { x: 1, y: 1.1 },
      { x: 2, y: 7.9 },
      { x: 3, y: 27.2 },
      { x: 4, y: 63.8 },
      { x: 5, y: 124.5 },
      { x: 6, y: 216.3 },
      { x: 7, y: 343.1 },
      { x: 8, y: 511.8 },
      { x: 9, y: 729.2 },
      { x: 10, y: 999.5 },
    ];

    const result = cubicRegression(points);

    expect(result.V).toBeCloseTo(1, 1);
    expect(result.rSquared).toBeGreaterThan(0.99);
  });

  it("returns zeros for insufficient points", () => {
    const result = cubicRegression([{ x: 1, y: 1 }, { x: 2, y: 2 }]);

    expect(result.T).toBe(0);
    expect(result.U).toBe(0);
    expect(result.V).toBe(0);
    expect(result.W).toBe(0);
    expect(result.rSquared).toBe(0);
    expect(result.sampleSize).toBe(2);
  });
});

describe("removeOutliersIQR", () => {
  it("removes outliers beyond 1.5*IQR", () => {
    const points = [
      { x: 1, y: 10 },
      { x: 2, y: 12 },
      { x: 3, y: 11 },
      { x: 4, y: 13 },
      { x: 5, y: 12 },
      { x: 6, y: 100 }, // outlier
      { x: 7, y: -50 }, // outlier
    ];

    const clean = removeOutliersIQR(points);

    expect(clean.length).toBe(5);
    expect(clean.every(p => p.y <= 15 && p.y >= 8)).toBe(true);
  });

  it("returns all points when no outliers", () => {
    const points = [
      { x: 1, y: 10 },
      { x: 2, y: 12 },
      { x: 3, y: 11 },
    ];

    const clean = removeOutliersIQR(points);

    expect(clean.length).toBe(3);
  });

  it("returns all points when less than 4 points", () => {
    const points = [{ x: 1, y: 10 }, { x: 2, y: 100 }];

    const clean = removeOutliersIQR(points);

    expect(clean.length).toBe(2);
  });
});

describe("solveLinearSystem", () => {
  it("solves 2x2 system", () => {
    const A = [[2, 1], [1, 3]];
    const b = [8, 13];

    const result = solveLinearSystem(A, b);

    expect(result).not.toBeNull();
    expect(result![0]).toBeCloseTo(11/5, 5);
    expect(result![1]).toBeCloseTo(18/5, 5);
  });

  it("solves 4x4 system", () => {
    const A = [
      [1, 2, 3, 4],
      [2, 5, 6, 7],
      [3, 6, 10, 11],
      [4, 7, 11, 15],
    ];
    const b = [1, 2, 3, 4];

    const result = solveLinearSystem(A, b);

    expect(result).not.toBeNull();
    expect(result!.length).toBe(4);
  });

  it("returns null for singular matrix", () => {
    const A = [[1, 2], [2, 4]];
    const b = [3, 6];

    const result = solveLinearSystem(A, b);

    expect(result).toBeNull();
  });
});