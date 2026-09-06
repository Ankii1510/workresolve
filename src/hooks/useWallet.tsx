"use client";

/**
 * Wallet state provider + hook — the single source of truth for wallet
 * connection state across the app (docs/architecture.md sections 13 & 14).
 *
 * Responsibilities implemented here (Phase 3 wallet foundation only — no
 * milestone transactions are triggered from this file):
 *   - connect / disconnect
 *   - shortened address display (via lib/genlayer/wallet)
 *   - current network detection + "wrong network" detection
 *   - reacting to `accountsChanged` and `chainChanged` wallet events
 *   - exposing a ready-to-use write client once connected
 *
 * This is a React Context provider (not a bare hook) because wallet state
 * is genuinely global — the navbar's connect button and a milestone page's
 * "only the freelancer can submit" check must observe the same state.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getGenLayerConfig } from "@/lib/genlayer/config";
import {
  createWriteClient,
  getReadClient,
  type AppGenLayerClient,
  type EthereumProvider,
} from "@/lib/genlayer/client";
import {
  getAuthorizedAccounts,
  getCurrentChainId,
  getInjectedProvider,
  requestAccounts,
  requireInjectedProvider,
  shortenAddress,
  switchToExpectedNetwork,
} from "@/lib/genlayer/wallet";
import { logDevError, toAppError } from "@/lib/utils/errors";
import type { AppError, WalletConnectionStatus } from "@/types";

interface WalletState {
  address: string | null;
  chainId: number | null;
  isConnecting: boolean;
  error: AppError | null;
}

export interface WalletContextValue extends WalletState {
  isConnected: boolean;
  shortAddress: string | null;
  isCorrectNetwork: boolean;
  expectedChainId: number;
  expectedNetworkName: string;
  hasWallet: boolean;
  /** Explicit 5-state connection status — see docs/frontend.md "Wallet
   * Architecture". Derived from the flags above; prefer this in UI/tests
   * over re-deriving it from isConnecting/isConnected/isCorrectNetwork. */
  status: WalletConnectionStatus;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Prompts the wallet to switch to (or add, if unknown) the expected
   * GenLayer network via EIP-3326/3085. Not all wallets support this — see
   * lib/genlayer/wallet.ts's switchToExpectedNetwork for the fallback. */
  switchNetwork: () => Promise<void>;
  isSwitchingNetwork: boolean;
  /** Read-only client. Always available, even without a wallet connected. */
  readClient: AppGenLayerClient;
  /** Write-capable client. Null until a wallet is connected on the right network. */
  writeClient: AppGenLayerClient | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const initialState: WalletState = {
  address: null,
  chainId: null,
  isConnecting: false,
  error: null,
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(initialState);
  const providerRef = useRef<EthereumProvider | null>(null);
  const { chain } = getGenLayerConfig();

  // Restore an already-authorized connection on mount (no prompt).
  useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider) return;
    providerRef.current = provider;

    let cancelled = false;
    (async () => {
      try {
        const accounts = await getAuthorizedAccounts(provider);
        if (cancelled || accounts.length === 0) return;
        const chainId = await getCurrentChainId(provider);
        if (cancelled) return;
        setState((s) => ({ ...s, address: accounts[0] ?? null, chainId }));
      } catch (err) {
        logDevError("wallet auto-restore failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // React to account/network changes made outside the app (in the wallet UI).
  useEffect(() => {
    const provider = providerRef.current ?? getInjectedProvider();
    if (!provider) return;

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = (args[0] as string[]) ?? [];
      setState((s) => ({ ...s, address: accounts[0] ?? null }));
    };
    const onChainChanged = (...args: unknown[]) => {
      const hex = args[0] as string;
      setState((s) => ({ ...s, chainId: parseInt(hex, 16) }));
    };
    // EIP-1193 "disconnect" — some wallets emit this on lock/revoke. When
    // it fires we clear local state the same way disconnect() does, rather
    // than leaving the UI showing a stale connected address.
    const onDisconnect = () => {
      setState(initialState);
    };

    provider.on("accountsChanged", onAccountsChanged);
    provider.on("chainChanged", onChainChanged);
    provider.on("disconnect", onDisconnect);
    return () => {
      provider.removeListener("accountsChanged", onAccountsChanged);
      provider.removeListener("chainChanged", onChainChanged);
      provider.removeListener("disconnect", onDisconnect);
    };
  }, []);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      const provider = requireInjectedProvider();
      providerRef.current = provider;
      const accounts = await requestAccounts(provider);
      const chainId = await getCurrentChainId(provider);
      setState({ address: accounts[0] ?? null, chainId, isConnecting: false, error: null });
    } catch (err) {
      logDevError("wallet connect failed", err);
      setState((s) => ({ ...s, isConnecting: false, error: toAppError(err) }));
    }
  }, []);

  const disconnect = useCallback(() => {
    // EIP-1193 has no standard programmatic disconnect — we only clear the
    // app's local view of the connection. The wallet extension itself stays
    // authorized until the user revokes it there.
    setState(initialState);
  }, []);

  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const switchNetwork = useCallback(async () => {
    const provider = providerRef.current ?? getInjectedProvider();
    if (!provider) return;
    setIsSwitchingNetwork(true);
    try {
      await switchToExpectedNetwork(provider, chain);
      const chainId = await getCurrentChainId(provider);
      setState((s) => ({ ...s, chainId, error: null }));
    } catch (err) {
      logDevError("network switch failed", err);
      setState((s) => ({ ...s, error: toAppError(err) }));
    } finally {
      setIsSwitchingNetwork(false);
    }
  }, [chain]);

  const readClient = useMemo(() => getReadClient(), []);

  const writeClient = useMemo(() => {
    if (!state.address || !providerRef.current) return null;
    return createWriteClient(state.address as `0x${string}`, providerRef.current);
  }, [state.address]);

  const isCorrectNetwork = state.chainId === null ? false : state.chainId === chain.id;
  const isConnected = !!state.address;
  const status: WalletConnectionStatus = state.error
    ? "ERROR"
    : state.isConnecting
      ? "CONNECTING"
      : !isConnected
        ? "DISCONNECTED"
        : !isCorrectNetwork
          ? "WRONG_NETWORK"
          : "CONNECTED";

  const value: WalletContextValue = {
    ...state,
    isConnected,
    shortAddress: state.address ? shortenAddress(state.address) : null,
    isCorrectNetwork,
    expectedChainId: chain.id,
    expectedNetworkName: chain.name,
    hasWallet: typeof window !== "undefined" && !!getInjectedProvider(),
    status,
    connect,
    disconnect,
    switchNetwork,
    isSwitchingNetwork,
    readClient,
    writeClient,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet() must be called within a <WalletProvider>.");
  }
  return ctx;
}
