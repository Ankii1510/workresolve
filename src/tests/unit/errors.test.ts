import { describe, expect, it } from "vitest";
import { toAppError } from "@/lib/utils/errors";
import { ConfigError } from "@/lib/genlayer/config";
import { NotImplementedError } from "@/lib/genlayer/milestone";

describe("toAppError", () => {
  it("maps ConfigError to MISSING_ENV_VAR", () => {
    const result = toAppError(new ConfigError("NEXT_PUBLIC_X is not set."));
    expect(result.code).toBe("MISSING_ENV_VAR");
    expect(result.message).toContain("NEXT_PUBLIC_X");
  });

  it("maps NotImplementedError to NOT_IMPLEMENTED with a user-safe message", () => {
    const result = toAppError(new NotImplementedError("fundMilestone"));
    expect(result.code).toBe("NOT_IMPLEMENTED");
    expect(result.message).not.toContain("fundMilestone()"); // no raw internal detail leaked
  });

  it("maps a wallet user-rejection error code to USER_REJECTED", () => {
    const result = toAppError({ code: 4001, message: "User rejected the request." });
    expect(result.code).toBe("USER_REJECTED");
  });

  it("maps a generic Error to UNKNOWN with a truncated, single-line message", () => {
    const longMessage = "boom\nsecond line".padEnd(300, "x");
    const result = toAppError(new Error(longMessage));
    expect(result.code).toBe("UNKNOWN");
    expect(result.message).not.toContain("\n");
    expect(result.message.length).toBeLessThanOrEqual(161);
  });

  it("passes an already-shaped AppError through unchanged", () => {
    const appError = { code: "INVALID_INPUT" as const, message: "Bad input." };
    expect(toAppError(appError)).toBe(appError);
  });

  it("falls back to a generic UNKNOWN error for non-Error throwables", () => {
    const result = toAppError("just a string");
    expect(result.code).toBe("UNKNOWN");
  });

  it("maps an insufficient-balance provider error to INSUFFICIENT_BALANCE", () => {
    const result = toAppError(new Error("insufficient funds for gas * price + value"));
    expect(result.code).toBe("INSUFFICIENT_BALANCE");
  });

  it("maps a known contract revert reason to a friendly CONTRACT_ERROR message", () => {
    const result = toAppError(new Error('revert: ValueError("Payment has already been released for this milestone.")'));
    expect(result.code).toBe("CONTRACT_ERROR");
    expect(result.message).toBe("Payment has already been released for this milestone.");
  });

  it("maps an unsupported wallet method error to UNSUPPORTED_WALLET", () => {
    const result = toAppError({ code: 4200, message: "Unsupported Method" });
    expect(result.code).toBe("UNSUPPORTED_WALLET");
  });

  it("maps a network fetch failure to RPC_ERROR", () => {
    const result = toAppError(new TypeError("Failed to fetch"));
    expect(result.code).toBe("RPC_ERROR");
  });
});
