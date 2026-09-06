import { describe, expect, it } from "vitest";
import { shortenAddress } from "@/lib/genlayer/wallet";

describe("shortenAddress", () => {
  it("shortens a valid 20-byte address to 0x1234…abcd form", () => {
    const address = "0x1234567890abcdef1234567890abcdef12345678";
    expect(shortenAddress(address)).toBe("0x1234…5678");
  });

  it("respects a custom character count", () => {
    const address = "0x1234567890abcdef1234567890abcdef12345678";
    expect(shortenAddress(address, 6)).toBe("0x123456…345678");
  });

  it("returns the input unchanged if it is not a valid address", () => {
    expect(shortenAddress("not-an-address")).toBe("not-an-address");
  });
});
