import { beforeEach, describe, expect, it } from "vitest";
import { readActivity, recordActivity } from "@/lib/activity";

const WALLET_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const WALLET_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

describe("activity log", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns an empty log for a wallet with no recorded activity", () => {
    expect(readActivity(WALLET_A)).toEqual([]);
  });

  it("records and reads back an entry, newest first", () => {
    recordActivity(WALLET_A, { txHash: "0x1", action: "fundMilestone", milestoneId: "1" });
    recordActivity(WALLET_A, { txHash: "0x2", action: "acceptMilestone", milestoneId: "1" });

    const entries = readActivity(WALLET_A);
    expect(entries).toHaveLength(2);
    expect(entries[0].txHash).toBe("0x2"); // most recent first
    expect(entries[1].txHash).toBe("0x1");
    expect(entries[0].recordedAt).toBeGreaterThan(0);
  });

  it("keeps each wallet's log separate", () => {
    recordActivity(WALLET_A, { txHash: "0x1", action: "fundMilestone", milestoneId: "1" });
    recordActivity(WALLET_B, { txHash: "0x2", action: "acceptMilestone", milestoneId: "5" });

    expect(readActivity(WALLET_A)).toHaveLength(1);
    expect(readActivity(WALLET_B)).toHaveLength(1);
    expect(readActivity(WALLET_A)[0].txHash).toBe("0x1");
  });

  it("is case-insensitive for wallet address keys", () => {
    recordActivity(WALLET_A, { txHash: "0x1", action: "fundMilestone", milestoneId: "1" });
    expect(readActivity(WALLET_A.toLowerCase())).toHaveLength(1);
  });

  it("deduplicates by transaction hash rather than appending a repeat", () => {
    recordActivity(WALLET_A, { txHash: "0x1", action: "fundMilestone", milestoneId: "1" });
    recordActivity(WALLET_A, { txHash: "0x1", action: "fundMilestone", milestoneId: "1" });
    expect(readActivity(WALLET_A)).toHaveLength(1);
  });

  it("never throws even if localStorage.setItem fails", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error("quota exceeded");
    };
    expect(() => recordActivity(WALLET_A, { txHash: "0x1", action: "fundMilestone", milestoneId: "1" })).not.toThrow();
    window.localStorage.setItem = original;
  });

  it("never throws and returns [] if localStorage holds malformed JSON", () => {
    window.localStorage.setItem(`workresolve:activity:${WALLET_A.toLowerCase()}`, "{not json");
    expect(readActivity(WALLET_A)).toEqual([]);
  });
});
