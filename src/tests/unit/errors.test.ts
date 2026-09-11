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

  it("maps genlayer-js's raw 'Requested resource not found.' RPC error to a friendly GENLAYER_UNAVAILABLE message", () => {
    // This is viem's ResourceNotFoundRpcError shortMessage, surfaced verbatim by
    // genlayer-js's gen_call-based readContract when the RPC node hasn't caught up
    // on a contract yet (commonly right after a fresh deployment). Regression
    // coverage for the dashboard showing this raw string instead of an explanation.
    const result = toAppError(new Error("Requested resource not found."));
    expect(result.code).toBe("GENLAYER_UNAVAILABLE");
    expect(result.message).not.toBe("Requested resource not found.");
    expect(result.message).toMatch(/deployment/i);
  });

  it("maps a -32001 coded RPC error object to GENLAYER_UNAVAILABLE even without the exact message", () => {
    const result = toAppError({ code: -32001, message: "some other wording" });
    expect(result.code).toBe("GENLAYER_UNAVAILABLE");
  });

  it("maps GenLayer's 'failed to get contract state / latest accepted transaction' RPC error to a friendly, non-misleading GENLAYER_UNAVAILABLE message", () => {
    // Reproduced verbatim via `npx genlayer call <address> get_milestone --args 1`
    // directly (no frontend involved) on 2026-09-08 while GenLayer's Asimov testnet
    // had stuck/idle transactions against this contract — a real node-side liveness
    // issue, not anything wrong with the request. Before this was recognized here,
    // the dashboard showed viem's raw shortMessage verbatim ("Missing or invalid
    // parameters. Double check you have provided the correct parameters."), which
    // is actively misleading since no parameter was ever wrong.
    const result = toAppError(
      new Error(
        "Missing or invalid parameters.\nDouble check you have provided the correct parameters.\n" +
          "Details: execution failed: failed to get contract state: getting latest accepted transaction: " +
          "failed to get latest accepted transactions: caller error\nexecution reverted",
      ),
    );
    expect(result.code).toBe("GENLAYER_UNAVAILABLE");
    expect(result.message).not.toContain("Missing or invalid parameters");
    expect(result.message).toMatch(/not.{0,20}problem with anything you entered|not.{0,10}app-side/i);
  });
});

describe('GenLayer\'s "Contract not found" (wrong network\'s address)', () => {
  // The real incident these pin: WorkResolve's Studio address env var held
  // 0x941F3904…, a contract that had actually been deployed to ASIMOV (the
  // deploying terminal's CLI was still on testnet-asimov). Every write with
  // the switcher on Studio therefore asked Studio's consensus contract for a
  // contract that only exists on Asimov. See isContractNotFoundError's
  // docstring in lib/genlayer/errors.ts for the full writeup.
  const ADDRESS = "0x941F3904D19b39113d82AA3dC8942966b33fCB64";

  it("classifies the node's structured -32001 reply and names the missing address", () => {
    const result = toAppError({
      code: -32001,
      message: "Contract not found",
      data: { address: ADDRESS },
    });
    expect(result.code).toBe("GENLAYER_UNAVAILABLE");
    expect(result.message).toContain(ADDRESS);
    expect(result.message).toMatch(/different.{0,20}GenLayer network/i);
  });

  it("finds the reason inside an ethers-style wrapper that stringifies the node's JSON into its own message", () => {
    // Verbatim shape from the wallet that did surface the real reason.
    const result = toAppError(
      new Error(
        `could not coalesce error (error={ "code": -32001, "data": { "address": "${ADDRESS}" }, ` +
          `"message": "Contract not found" }, payload={ "id": 8, "jsonrpc": "2.0", ` +
          `"method": "eth_sendRawTransaction", "params": [ "0xf901c9..." ] }, ` +
          `code=UNKNOWN_ERROR, version=6.14.0)`,
      ),
    );
    expect(result.code).toBe("GENLAYER_UNAVAILABLE");
    expect(result.message).toContain(ADDRESS);
  });

  it("still classifies the error when the wallet nests it and gives no address", () => {
    const result = toAppError({
      code: -32603,
      message: "Transaction failed",
      data: { originalError: { message: "Contract not found" } },
    });
    expect(result.code).toBe("GENLAYER_UNAVAILABLE");
    expect(result.message).toContain("the configured address");
    expect(result.message).toMatch(/different.{0,20}GenLayer network/i);
  });

  it("takes precedence over the generic -32001 'deployment hasn't caught up' message, which is wrong for this case", () => {
    const result = toAppError({ code: -32001, message: "Contract not found", data: { address: ADDRESS } });
    expect(result.message).not.toMatch(/hasn't caught up/i);
    expect(result.message).not.toMatch(/deployment itself never finished/i);
  });

  it("does not hang or throw on a self-referencing error object", () => {
    const cyclic: Record<string, unknown> = { message: "Contract not found" };
    cyclic.cause = cyclic;
    expect(() => toAppError(cyclic)).not.toThrow();
    expect(toAppError(cyclic).code).toBe("GENLAYER_UNAVAILABLE");
  });
});
