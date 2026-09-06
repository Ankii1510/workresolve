import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { WalletProvider, useWallet } from "@/hooks/useWallet";
import type { ReactNode } from "react";

/**
 * A minimal fake EIP-1193 provider — see lib/genlayer/client.ts's
 * EthereumProvider interface, the exact shape useWallet talks to. Real
 * MetaMask-compatible wallets implement this same shape (request/on/
 * removeListener), so exercising useWallet against a fake with the same
 * interface is a faithful test of the real integration surface, not a
 * simulation of blockchain behavior.
 */
function makeFakeProvider(opts: { chainIdHex?: string; accounts?: string[] } = {}) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const chainIdHex = opts.chainIdHex ?? "0x1";
  let accounts = opts.accounts ?? [];

  return {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") {
        accounts = accounts.length > 0 ? accounts : ["0x1234567890abcdef1234567890abcdef12345678"];
        return accounts;
      }
      if (method === "eth_accounts") return accounts;
      if (method === "eth_chainId") return chainIdHex;
      throw new Error(`unexpected method in test fake: ${method}`);
    }),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    }),
    removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(handler);
    }),
    // test-only helper to simulate the wallet emitting an event
    __emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach((h) => h(...args));
    },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}

describe("useWallet", () => {
  afterEach(() => {
    // @ts-expect-error test cleanup of a test-only global
    delete window.ethereum;
  });

  it("reports DISCONNECTED with no injected wallet", () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    expect(result.current.hasWallet).toBe(false);
    expect(result.current.status).toBe("DISCONNECTED");
    expect(result.current.isConnected).toBe(false);
  });

  it("connects successfully and reports CONNECTED on the expected network", async () => {
    // The app's default network (no NEXT_PUBLIC_GENLAYER_NETWORK override,
    // per lib/genlayer/config.ts) is studionet, chain id 61999 = 0xf22f.
    const provider = makeFakeProvider({ chainIdHex: "0xf22f" });
    // @ts-expect-error assigning a test fake to the injected wallet global
    window.ethereum = provider;

    const { result } = renderHook(() => useWallet(), { wrapper });
    expect(result.current.hasWallet).toBe(true);
    expect(result.current.expectedChainId).toBe(61999);

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(result.current.shortAddress).toMatch(/^0x1234…5678$/);
    expect(result.current.isCorrectNetwork).toBe(true);
    expect(result.current.status).toBe("CONNECTED");
  });

  it("reports WRONG_NETWORK when connected to an unexpected chain id", async () => {
    const provider = makeFakeProvider({ chainIdHex: "0x1" }); // mainnet, not a GenLayer chain
    // @ts-expect-error assigning a test fake to the injected wallet global
    window.ethereum = provider;

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(result.current.isCorrectNetwork).toBe(false);
    expect(result.current.status).toBe("WRONG_NETWORK");
    expect(result.current.writeClient).not.toBeNull(); // a client still exists — the UI, not the client, gates writes
  });

  it("updates the connected address when the wallet emits accountsChanged", async () => {
    const provider = makeFakeProvider({ accounts: ["0x1234567890abcdef1234567890abcdef12345678"] });
    // @ts-expect-error assigning a test fake to the injected wallet global
    window.ethereum = provider;

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => {
      provider.__emit("accountsChanged", ["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);
    });

    await waitFor(() =>
      expect(result.current.address?.toLowerCase()).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    );
  });

  it("disconnects (clears local state) when the wallet emits accountsChanged with an empty list", async () => {
    const provider = makeFakeProvider();
    // @ts-expect-error assigning a test fake to the injected wallet global
    window.ethereum = provider;

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => {
      provider.__emit("accountsChanged", []);
    });

    await waitFor(() => expect(result.current.isConnected).toBe(false));
  });

  it("surfaces a user-rejected connect() call as a USER_REJECTED AppError, not a thrown exception", async () => {
    const provider = makeFakeProvider();
    provider.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") {
        const err = new Error("User rejected the request.") as Error & { code: number };
        err.code = 4001;
        throw err;
      }
      return "0x1";
    });
    // @ts-expect-error assigning a test fake to the injected wallet global
    window.ethereum = provider;

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => expect(result.current.error?.code).toBe("USER_REJECTED"));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.status).toBe("ERROR");
  });
});
