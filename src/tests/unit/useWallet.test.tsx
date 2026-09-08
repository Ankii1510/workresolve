import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { WalletProvider, useWallet } from "@/hooks/useWallet";
import { NetworkProvider } from "@/hooks/useNetwork";
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
  return (
    <NetworkProvider>
      <WalletProvider>{children}</WalletProvider>
    </NetworkProvider>
  );
}

/** Simulates a real EIP-6963-compliant wallet extension: listens for the
 * app's discovery request and announces itself in response, exactly like
 * lib/genlayer/eip6963.ts expects. Returns a cleanup function. */
function announceEip6963Wallet(rdns: string, name: string, provider: unknown) {
  const onRequest = () => {
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: { info: { uuid: rdns, name, icon: "", rdns }, provider },
      }),
    );
  };
  window.addEventListener("eip6963:requestProvider", onRequest);
  // The real flow: an extension also announces proactively on load, not
  // only in response to a request event that may have already fired before
  // it was ready — fire once immediately too.
  onRequest();
  return () => window.removeEventListener("eip6963:requestProvider", onRequest);
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

  it("stays disconnected after disconnect() even though the wallet still authorizes the site (eth_accounts still returns it)", async () => {
    // Regression test: EIP-1193 has no real programmatic disconnect, so
    // eth_accounts legitimately keeps returning the account after our own
    // disconnect() clears local state — same as a real wallet extension
    // behaves when the app calls disconnect() without the user revoking
    // the site's permission in the extension itself. The auto-restore
    // effect must not treat that as "please reconnect me".
    const provider = makeFakeProvider({ accounts: ["0x1234567890abcdef1234567890abcdef12345678"] });
    // @ts-expect-error assigning a test fake to the injected wallet global
    window.ethereum = provider;

    const { result } = renderHook(() => useWallet(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.isConnected).toBe(false);
    // Give any stray async auto-restore effect a chance to (incorrectly)
    // fire before asserting it didn't.
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeNull();
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

  describe("EIP-6963 multi-wallet discovery", () => {
    it("lists every announced wallet as a walletOption, not just window.ethereum", async () => {
      const providerA = makeFakeProvider();
      const providerB = makeFakeProvider();
      const cleanupA = announceEip6963Wallet("com.example.walleta", "Wallet A", providerA);
      const cleanupB = announceEip6963Wallet("com.example.walletb", "Wallet B", providerB);

      const { result } = renderHook(() => useWallet(), { wrapper });

      await waitFor(() => expect(result.current.walletOptions).toHaveLength(2));
      expect(result.current.walletOptions.map((w) => w.name).sort()).toEqual(["Wallet A", "Wallet B"]);
      expect(result.current.hasWallet).toBe(true);

      cleanupA();
      cleanupB();
    });

    it("connects to the specific wallet chosen by rdns, not an arbitrary one", async () => {
      const providerA = makeFakeProvider({ accounts: ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] });
      const providerB = makeFakeProvider({ accounts: ["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"] });
      const cleanupA = announceEip6963Wallet("com.example.walleta", "Wallet A", providerA);
      const cleanupB = announceEip6963Wallet("com.example.walletb", "Wallet B", providerB);

      const { result } = renderHook(() => useWallet(), { wrapper });
      await waitFor(() => expect(result.current.walletOptions).toHaveLength(2));

      await act(async () => {
        await result.current.connect("com.example.walletb");
      });

      await waitFor(() => expect(result.current.isConnected).toBe(true));
      expect(result.current.address?.toLowerCase()).toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
      // Only the chosen wallet should have been asked to connect.
      expect(providerA.request).not.toHaveBeenCalledWith(
        expect.objectContaining({ method: "eth_requestAccounts" }),
      );

      cleanupA();
      cleanupB();
    });

    it("fails with a clear error when connect() is called with no choice and multiple wallets are available", async () => {
      const providerA = makeFakeProvider();
      const providerB = makeFakeProvider();
      const cleanupA = announceEip6963Wallet("com.example.walleta", "Wallet A", providerA);
      const cleanupB = announceEip6963Wallet("com.example.walletb", "Wallet B", providerB);

      const { result } = renderHook(() => useWallet(), { wrapper });
      await waitFor(() => expect(result.current.walletOptions).toHaveLength(2));

      await act(async () => {
        await result.current.connect();
      });

      await waitFor(() => expect(result.current.status).toBe("ERROR"));
      expect(result.current.error?.message).toMatch(/choose one/i);
      expect(result.current.isConnected).toBe(false);

      cleanupA();
      cleanupB();
    });

    it("falls back to the legacy window.ethereum slot as a single option when no wallet announces via EIP-6963", () => {
      const provider = makeFakeProvider();
      // @ts-expect-error assigning a test fake to the injected wallet global
      window.ethereum = provider;

      const { result } = renderHook(() => useWallet(), { wrapper });
      expect(result.current.walletOptions).toHaveLength(1);
      expect(result.current.walletOptions[0].name).toBe("Browser Wallet");
      expect(result.current.hasWallet).toBe(true);
    });
  });
});
