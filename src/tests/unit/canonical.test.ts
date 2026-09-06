import { describe, expect, it } from "vitest";
import {
  canonicalizeRequirements,
  hashRequirements,
  requirementWeightsSumTo100,
} from "@/lib/genlayer/canonical";
import type { Requirement } from "@/types";

const REQUIREMENTS: Requirement[] = [
  { id: 2, description: "Contact form", weight: 20 },
  { id: 1, description: "Responsive website", weight: 20 },
  { id: 3, description: "Menu section", weight: 60 },
];

describe("canonicalizeRequirements", () => {
  it("sorts by id ascending regardless of input order", () => {
    const canonical = canonicalizeRequirements(REQUIREMENTS);
    const lines = canonical.split("\n");
    expect(lines[0]).toBe("1|Responsive website|20");
    expect(lines[1]).toBe("2|Contact form|20");
    expect(lines[2]).toBe("3|Menu section|60");
  });

  it("is deterministic across differently-ordered input arrays", () => {
    const shuffled = [...REQUIREMENTS].reverse();
    expect(canonicalizeRequirements(REQUIREMENTS)).toBe(canonicalizeRequirements(shuffled));
  });
});

describe("hashRequirements", () => {
  it("produces the same hash for the same requirements regardless of array order", async () => {
    const shuffled = [...REQUIREMENTS].reverse();
    const [hashA, hashB] = await Promise.all([hashRequirements(REQUIREMENTS), hashRequirements(shuffled)]);
    expect(hashA).toBe(hashB);
  });

  it("produces a different hash when a requirement changes", async () => {
    const mutated = REQUIREMENTS.map((r) => (r.id === 1 ? { ...r, description: "Changed" } : r));
    const [original, changed] = await Promise.all([
      hashRequirements(REQUIREMENTS),
      hashRequirements(mutated),
    ]);
    expect(original).not.toBe(changed);
  });

  it("returns a 0x-prefixed 64-character hex string (SHA-256)", async () => {
    const hash = await hashRequirements(REQUIREMENTS);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("requirementWeightsSumTo100", () => {
  it("accepts weights that sum to exactly 100", () => {
    expect(requirementWeightsSumTo100(REQUIREMENTS)).toBe(true);
  });

  it("rejects weights that do not sum to 100", () => {
    const invalid: Requirement[] = [{ id: 1, description: "Only one", weight: 50 }];
    expect(requirementWeightsSumTo100(invalid)).toBe(false);
  });
});
