/**
 * Canonical serialization + commitment hash for a milestone's requirements.
 *
 * Mirrors docs/architecture.md section 6 (Requirement Immutability): the
 * contract computes `requirementsHash` from a fixed canonical string at
 * creation time, and anyone can independently recompute it from
 * `getRequirements()`'s return value to verify the requirements used by the
 * evaluator are exactly the ones agreed at funding time.
 *
 * This client-side implementation MUST stay byte-for-byte identical to the
 * contract's Python implementation once Phase 4 writes it — the exact
 * hashing primitive (`gl.hash` or equivalent) is one of the `[TBD-confirm]`
 * items from Phase 2, so this uses SHA-256 (via the standard Web Crypto
 * API) as the working default. src/tests/unit/canonical.test.ts pins the
 * canonical string format so a Phase 4 mismatch is caught immediately by
 * the test suite rather than discovered as a silent verification failure.
 */
import type { Requirement } from "@/types";

/** Deterministic, sorted, pipe-delimited canonical form. */
export function canonicalizeRequirements(requirements: Requirement[]): string {
  return [...requirements]
    .sort((a, b) => a.id - b.id)
    .map((r) => `${r.id}|${r.description}|${r.weight}`)
    .join("\n");
}

/** SHA-256 hash of the canonical requirement string, as a 0x-prefixed hex string. */
export async function hashRequirements(requirements: Requirement[]): Promise<string> {
  const canonical = canonicalizeRequirements(requirements);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

export function requirementWeightsSumTo100(requirements: Requirement[]): boolean {
  const total = requirements.reduce((sum, r) => sum + r.weight, 0);
  return total === 100;
}
