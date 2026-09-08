"use client";

/**
 * GenLayer network selection — lets a person switch which GenLayer network
 * WorkResolve talks to, from the UI, at runtime.
 *
 * WHY THIS EXISTS: added after a real, confirmed GenLayer Asimov Testnet
 * liveness incident (2026-09-08) — transactions against WorkResolve's
 * genuinely-fixed, genuinely-live contract finalized as NOT_VOTED with zero
 * validators ever voting, confirmed directly via `genlayer receipt`/
 * `genlayer trace` run against the network itself (not this app). Asimov is
 * GenLayer's real, decentralized public testnet, so it is subject to actual
 * validator/consensus liveness; GenLayer's own hosted Studio network is a
 * centrally-operated simulator that stays reliable through exactly this
 * kind of incident. Rather than lock every visitor to whichever network a
 * given build happened to be compiled for, this lets a person pick — see
 * docs/limitations.md for the full incident writeup.
 *
 * `WalletProvider` (useWallet.tsx) reads the active network from this
 * context (not directly from lib/genlayer/config.ts) so that switching
 * networks here immediately updates the wallet's expected chain, its
 * read/write clients, and the "wrong network" banner/switch button that
 * already existed in WalletConnectButton.
 */
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  getActiveNetworkName,
  readSeedNetworkName,
  setActiveNetworkName,
  SELECTABLE_NETWORKS,
  type GenLayerNetworkName,
} from "@/lib/genlayer/config";
import type { GenLayerChain } from "genlayer-js/types";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";

const CHAINS_BY_NAME: Record<GenLayerNetworkName, GenLayerChain> = {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
};

export interface NetworkOption {
  name: GenLayerNetworkName;
  /** Human label straight from genlayer-js's own chain definition (e.g.
   * "Genlayer Studio Network") — never invented copy. */
  label: string;
}

export interface NetworkContextValue {
  networkName: GenLayerNetworkName;
  chain: GenLayerChain;
  /** Every network offered in the switcher UI, in display order — see
   * SELECTABLE_NETWORKS for why `localnet` is excluded. */
  options: NetworkOption[];
  setNetworkName: (name: GenLayerNetworkName) => void;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

/**
 * A tiny same-tab pub/sub layered on top of lib/genlayer/config.ts's
 * localStorage persistence, wired into React via `useSyncExternalStore` —
 * the pattern React itself recommends for reading a mutable value that
 * lives outside React state (here: localStorage), without a server/client
 * hydration mismatch and without a useState+useEffect version's "setState
 * synchronously inside an effect" anti-pattern.
 *
 * A same-tab `localStorage.setItem` call does NOT fire the native `storage`
 * event (only OTHER tabs observe that) — so `notify()` is called explicitly
 * right after this app's own writes (see `setNetworkName` below); the
 * native `storage` listener registered in `subscribe` covers the
 * other-tab-changed-it case for free, on top of that.
 */
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  if (typeof window !== "undefined") window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") window.removeEventListener("storage", callback);
  };
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  // REAL, CONFIRMED BUG (found live, 2026-09-08) — DO NOT pass
  // getActiveNetworkName as the THIRD (getServerSnapshot) argument again.
  //
  // getServerSnapshot must return the exact same value the server rendered,
  // every time it's called — including when React calls it on the CLIENT
  // during hydration, purely to check the DOM for a mismatch. This file
  // used to pass getActiveNetworkName for both the second AND third
  // arguments. getActiveNetworkName() reads localStorage whenever `window`
  // exists — which is true on the client even during that hydration check —
  // so a person with a previously-stored network choice got a
  // getServerSnapshot() that returned their STORED network, while the
  // actual server-rendered HTML was built from the seed default
  // (readSeedNetworkName()), since the server has no `window`/localStorage
  // at all. That mismatch is exactly what React's hydration algorithm
  // exists to catch: it threw "Minified React error #418" (hydration
  // failed) in production, which forces a full client-side remount of the
  // tree — discarding wallet/provider state mid-flight and surfacing as
  // unrelated-looking failures elsewhere (e.g. a wallet write request
  // failing with a generic "internal error" right after signing, reported
  // against a live Studio deployment).
  //
  // Fix: getServerSnapshot is now readSeedNetworkName, which NEVER touches
  // localStorage — it only reads the build's env var, so it is
  // deterministic across server and client and matches the actual
  // server-rendered HTML every time. getActiveNetworkName (the real,
  // localStorage-aware value) remains the second argument, so the person's
  // stored choice still applies — just correctly, in a post-hydration
  // client re-render rather than baked into the hydration check itself.
  const networkName = useSyncExternalStore(subscribe, getActiveNetworkName, readSeedNetworkName);

  const setNetworkName = useCallback((name: GenLayerNetworkName) => {
    setActiveNetworkName(name);
    notify();
  }, []);

  const options: NetworkOption[] = useMemo(
    () => SELECTABLE_NETWORKS.map((name) => ({ name, label: CHAINS_BY_NAME[name].name })),
    [],
  );

  const value: NetworkContextValue = {
    networkName,
    chain: CHAINS_BY_NAME[networkName],
    options,
    setNetworkName,
  };

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) {
    throw new Error("useNetwork() must be called within a <NetworkProvider>.");
  }
  return ctx;
}
