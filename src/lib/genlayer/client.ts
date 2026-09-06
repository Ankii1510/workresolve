/**
 * GenLayer client factory — the ONLY place `genlayer-js`'s `createClient` is
 * called. Every hook and component gets its GenLayer client through here,
 * never by importing `genlayer-js` directly (see docs/architecture.md
 * section 13, "Blockchain interaction layer discipline").
 *
 * genlayer-js exposes one client shape for both reading and writing — a
 * read-only client omits `account`/`provider`; a write-capable client adds
 * them. This matches the pattern confirmed directly from the installed
 * SDK's type definitions (genlayer-js@1.1.8): `createClient({ chain,
 * endpoint?, account?, provider? })` returns a `GenLayerClient` whose
 * `readContract` works regardless of whether an account is attached, and
 * whose `writeContract` requires one.
 */
import { createClient } from "genlayer-js";
import type { GenLayerClient, GenLayerChain } from "genlayer-js/types";
import type { Account, Address } from "viem";
import { getGenLayerConfig } from "./config";

export type AppGenLayerClient = GenLayerClient<GenLayerChain>;

/** Minimal shape of an EIP-1193 browser wallet provider (e.g. window.ethereum). */
export interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

let readClientSingleton: AppGenLayerClient | null = null;

/**
 * A read-only client, safe to use with no wallet connected. Cached as a
 * singleton per network config since it carries no per-user state.
 */
export function getReadClient(): AppGenLayerClient {
  if (readClientSingleton) return readClientSingleton;
  const { chain, endpointOverride } = getGenLayerConfig();
  readClientSingleton = createClient({
    chain,
    ...(endpointOverride ? { endpoint: endpointOverride } : {}),
  });
  return readClientSingleton;
}

/**
 * A write-capable client bound to a specific connected account and wallet
 * provider. Intentionally NOT cached/singleton — it must be rebuilt whenever
 * the connected account or network changes (see useWallet), so this factory
 * is called fresh by the wallet hook rather than memoized here.
 */
export function createWriteClient(account: Account | Address, provider: EthereumProvider): AppGenLayerClient {
  const { chain, endpointOverride } = getGenLayerConfig();
  return createClient({
    chain,
    account,
    provider,
    ...(endpointOverride ? { endpoint: endpointOverride } : {}),
  });
}
