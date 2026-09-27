import fs from "node:fs";
import { describe, expect, it } from "vitest";

const seed = fs.readFileSync("scripts/seed-repairs-uat.ts", "utf8");

describe("Repairs UAT labor-rate seed", () => {
  it("provides plant trade fallback rates for every UAT technician trade", () => {
    expect(seed).toContain("{ tradeId: tradeMech.id, normalHourlyRate: 50.0, overtimeHourlyRate: 75.0 }");
    expect(seed).toContain("{ tradeId: tradeElec.id, normalHourlyRate: 55.0, overtimeHourlyRate: 82.5 }");
    expect(seed).toContain("userId: null");
    expect(seed).toContain("plantId: plantA.id");
    expect(seed).toContain("tradeId: rate.tradeId");
  });
});