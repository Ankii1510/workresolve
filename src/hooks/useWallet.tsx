"use client";

/**
 * Wallet state provider + hook — the single source of truth for wallet
 * connection state across the app (docs/architecture.md sections 13 & 14).
 *
 * Responsibilities implemented here:
 *   - discovering every installed wallet extension (EIP-6963), not just
 *     whichever one happens to occupy `window.ethereum`, so a user with
 *     multiple wallets installed can choose which one to connect with (see
 *     lib/genlayer/eip6963.ts for why this exists and how discovery works)
 *   - connect (to a chosen wallet, or the only one available) / disconnect
 *   - shortened address display (via lib/genlayer/wallet)
 *   - current network detection + "wrong network" detection
 *   - reacting to `accountsChanged` and `chainChanged` events from whichever
 *     wallet is actually connected
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
import { useNetwork } from "@/hooks/useNetwork";
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
  shortenAddress,
  switchToExpectedNetwork,
} from "@/lib/genlayer/wallet";
import { subscribeToAnnouncedProviders, type EIP6963ProviderDetail } from "@/lib/genlayer/eip6963";
import { logDevError, toAppError } from "@/lib/utils/errors";
import { ConfigError } from "@/lib/genlayer/config";
import type { AppError, WalletConnectionStatus } from "@/types";

/** A stable id for the legacy `window.ethereum` slot, used as a picker entry
 * only when no EIP-6963-compliant wallet has announced itself — some older
 * or non-compliant extensions still only work this way. */
const LEGACY_PROVIDER_RDNS = "legacy.window.ethereum";

/** One selectable entry in the "choose a wallet" list — deliberately just
 * enough to render a picker (name + icon) and to reconnect to it later. */
export interface WalletOption {
  rdns: string;
  name: string;
  icon: string | null;
}

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
  /** Every wallet currently available to connect to (via EIP-6963
   * discovery, or the single legacy `window.ethereum` slot as a fallback
   * when no wallet announces itself). Render this as a picker whenever it
   * has more than one entry — see components/wallet/WalletConnectButton. */
  walletOptions: WalletOption[];
  /** Explicit 5-state connection status — see docs/frontend.md "Wallet
   * Architecture". Derived from the flags above; prefer this in UI/tests
   * over re-deriving it from isConnecting/isConnected/isCorrectNetwork. */
  status: WalletConnectionStatus;
  /** Connects to the wallet identified by `rdns` (a `walletOptions[].rdns`
   * value). Omit `rdns` only when `walletOptions.length <= 1` — with zero
   * it reports "no wallet installed", with exactly one it connects to it
   * directly; with more than one, omitting it fails with an AppError
   * asking the caller to let the user pick, rather than guessing. */
  connect: (rdns?: string) => Promise<void>;
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
  const [announcedWallets, setAnnouncedWallets] = useState<EIP6963ProviderDetail[]>([]);
  // The provider actually connected right now (auto-restored or explicitly
  // chosen). Kept in state, not only a ref, so the event-listener effect
  // below can depend on it and rebind to whichever wallet the user actually
  // picked — with a plain ref it would silently keep listening to whatever
  // was around at mount, which breaks the moment there's more than one
  // wallet to choose between.
  const [activeProvider, setActiveProvider] = useState<EthereumProvider | null>(null);
  const restoredRef = useRef(false);
  // Sourced from NetworkContext (not lib/genlayer/config.ts directly) so
  // that switching networks in the UI (see NetworkSwitcher) immediately
  // updates the expected chain here, and therefore the read/write clients
  // and "wrong network" detection below.
  const { networkName, chain } = useNetwork();

  // Discover every EIP-6963-announcing wallet. Kept subscribed for the
  // component's lifetime, not just at mount, since some extensions inject
  // and announce themselves slightly after initial page load.
  useEffect(() => {
    return subscribeToAnnouncedProviders(setAnnouncedWallets);
  }, []);

  const resolveProvider = useCallback(
    (rdns?: string): EthereumProvider | null => {
      if (rdns === LEGACY_PROVIDER_RDNS) return getInjectedProvider();
      if (rdns) return announcedWallets.find((d) => d.info.rdns === rdns)?.provider ?? null;
      // No explicit choice: only safe to guess when there's exactly one
      // candidate. Zero or many must be handled by the caller (surfaced as
      // "no wallet" / "ambiguous, please choose" respectively).
      if (announcedWallets.length === 1) return announcedWallets[0].provider;
      if (announcedWallets.length === 0) return getInjectedProvider();
      return null;
    },
    [announcedWallets],
  );

  const walletOptions: WalletOption[] = useMemo(() => {
    if (announcedWallets.length > 0) {
      return announcedWallets.map((d) => ({ rdns: d.info.rdns, name: d.info.name, icon: d.info.icon }));
    }
    if (typeof window !== "undefined" && getInjectedProvider()) {
      return [{ rdns: LEGACY_PROVIDER_RDNS, name: "Browser Wallet", icon: null }];
    }
    return [];
  }, [announcedWallets]);

  // Restore an already-authorized connection on mount (no prompt), trying
  // every known wallet (not just one) since the user may have last
  // connected with any of them. Re-attempted whenever the set of announced
  // wallets grows, but only until the first successful restore.
  useEffect(() => {
    if (restoredRef.current || state.address) return;
    const candidates: EthereumProvider[] =
      announcedWallets.length > 0
        ? announcedWallets.map((d) => d.provider)
        : (() => {
            const legacy = getInjectedProvider();
            return legacy ? [legacy] : [];
          })();
    if (candidates.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const provider of candidates) {
        try {
          const accounts = await getAuthorizedAccounts(provider);
          if (cancelled) return;
          if (accounts.length > 0) {
            const chainId = await getCurrentChainId(provider);
            if (cancelled) return;
            restoredRef.current = true;
            setActiveProvider(provider);
            setState((s) => ({ ...s, address: accounts[0] ?? null, chainId }));
            return;
          }
        } catch (err) {
          logDevError("wallet auto-restore failed", err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [announcedWallets, state.address]);

  // React to account/network changes made outside the app (in the wallet
  // UI), always bound to whichever provider is actually connected.
  useEffect(() => {
    if (!activeProvider) return;

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
      setActiveProvider(null);
    };

    activeProvider.on("accountsChanged", onAccountsChanged);
    activeProvider.on("chainChanged", onChainChanged);
    activeProvider.on("disconnect", onDisconnect);
    return () => {
      activeProvider.removeListener("accountsChanged", onAccountsChanged);
      activeProvider.removeListener("chainChanged", onChainChanged);
      activeProvider.removeListener("disconnect", onDisconnect);
    };
  }, [activeProvider]);

  const connect = useCallback(
    async (rdns?: string) => {
      setState((s) => ({ ...s, isConnecting: true, error: null }));
      try {
        const provider = resolveProvider(rdns);
        if (!provider) {
          throw new ConfigError(
            announcedWallets.length > 1
              ? "Multiple wallets detected — choose one to connect."
              : "No wallet extension detected. Install a browser wallet to connect.",
          );
        }
        const accounts = await requestAccounts(provider);
        const chainId = await getCurrentChainId(provider);
        // Mark auto-restore as already settled for this page load. Without
        // this, an explicit connect() here still leaves restoredRef false,
        // so the very next disconnect() would make the auto-restore effect
        // (which re-runs whenever state.address changes) immediately see
        // the wallet extension still authorizes this site and silently
        // reconnect — the exact "disconnect does nothing" bug this guards.
        restoredRef.current = true;
        setActiveProvider(provider);
        setState({ address: accounts[0] ?? null, chainId, isConnecting: false, error: null });
      } catch (err) {
        logDevError("wallet connect failed", err);
        setState((s) => ({ ...s, isConnecting: false, error: toAppError(err) }));
      }
    },
    [resolveProvider, announcedWallets.length],
  );

  const disconnect = useCallback(() => {
    // EIP-1193 has no standard programmatic disconnect — we only clear the
    // app's local view of the connection. The wallet extension itself stays
    // authorized until the user revokes it there, which means eth_accounts
    // would still return it. Deliberately NOT resetting restoredRef here:
    // doing so used to make the auto-restore effect (which re-runs whenever
    // state.address changes) immediately see that same authorization and
    // silently reconnect right after this call, so clicking "disconnect"
    // appeared to do nothing. Leaving restoredRef at whatever it already is
    // means this session won't auto-restore again after an explicit
    // disconnect — the user has to click "Connect Wallet" again, which is
    // the whole point of the button.
    setState(initialState);
    setActiveProvider(null);
  }, []);

  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const switchNetwork = useCallback(async () => {
    if (!activeProvider) return;
    setIsSwitchingNetwork(true);
    try {
      await switchToExpectedNetwork(activeProvider, chain);
      const chainId = await getCurrentChainId(activeProvider);
      setState((s) => ({ ...s, chainId, error: null }));
    } catch (err) {
      logDevError("network switch failed", err);
      setState((s) => ({ ...s, error: toAppError(err) }));
    } finally {
      setIsSwitchingNetwork(false);
    }
  }, [activeProvider, chain]);

  // `getReadClient()`/`createWriteClient()` both resolve the *currently
  // active* network internally (lib/genlayer/config.ts), so `networkName`
  // must be a dependency here even though it isn't passed as an argument —
  // otherwise React would keep serving whichever client was memoized for
  // the network active at first render, silently ignoring a network switch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const readClient = useMemo(() => getReadClient(), [networkName]);

  const writeClient = useMemo(() => {
    if (!state.address || !activeProvider) return null;
    return createWriteClient(state.address as `0x${string}`, activeProvider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.address, activeProvider, networkName]);

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
    hasWallet: walletOptions.length > 0,
    walletOptions,
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
