/**
 * Centralized GenLayer network configuration.
 *
 * This is the ONLY file that should read GenLayer-related environment
 * variables. Every other module (client.ts, wallet.ts, contract hooks)
 * imports the resolved config from here, so there is exactly one place to
 * update if a network endpoint or contract address changes.
 *
 * Confirmed against genlayer-js@1.1.8's published chain definitions
 * (inspected directly from the installed package — not assumed):
 *   - localnet         : chain id 61127, GenLayer Studio local simulator
 *   - studionet        : chain id 61999, hosted GenLayer Studio
 *   - testnetAsimov    : chain id 4221,  https://rpc-asimov.genlayer.com
 *   - testnetBradbury   : chain id 4221,  https://rpc-bradbury.genlayer.com
 *
 * RUNTIME NETWORK SWITCHING (added after a real, confirmed GenLayer Asimov
 * Testnet liveness incident — 2026-09-08, see docs/limitations.md): Asimov
 * is the "real" public decentralized testnet, so it's subject to actual
 * validator/consensus liveness, and it genuinely went unresponsive for a
 * stretch (transactions finalizing as NOT_VOTED with zero validators ever
 * voting — confirmed directly via `genlayer receipt`/`genlayer trace`, not
 * an app-side bug). GenLayer's own hosted Studio network, by contrast, is a
 * centrally-operated simulator and stays reliable through exactly this kind
 * of incident. Rather than being locked to whichever network a build was
 * compiled with, the app now lets a person choose their network from the UI
 * (see `useNetwork()` / `NetworkSwitcher`), persisted per-browser in
 * localStorage — same pattern as `src/lib/activity.ts`. `studionet` is the
 * hardcoded, always-first default (see `SELECTABLE_NETWORKS` below) for
 * exactly this reliability reason, regardless of what
 * `NEXT_PUBLIC_GENLAYER_NETWORK` resolves to — that env var still exists as
 * the *build's* seed default (used only until a person picks something
 * different in this browser), not as an override of the person's choice.
 */
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import type { GenLayerChain } from "genlayer-js/types";

export type GenLayerNetworkName = "localnet" | "studionet" | "testnetAsimov" | "testnetBradbury";

const NETWORKS: Record<GenLayerNetworkName, GenLayerChain> = {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
};

/** Networks offered in the UI's network switcher, in display order. Studio
 * is deliberately first/default (see module docstring). `localnet` is
 * excluded here — it means a locally-running GenVM Studio/Docker instance,
 * which only makes sense for someone developing this repo directly, never
 * for a visitor to the deployed app; it remains fully supported via
 * NEXT_PUBLIC_GENLAYER_NETWORK for that use case. */
export const SELECTABLE_NETWORKS: GenLayerNetworkName[] = ["studionet", "testnetAsimov", "testnetBradbury"];

/** Hardcoded product default — see module docstring for why this no longer
 * defers to NEXT_PUBLIC_GENLAYER_NETWORK as the *effective* default a
 * person sees. */
const DEFAULT_NETWORK_NAME: GenLayerNetworkName = "studionet";

const NETWORK_STORAGE_KEY = "workresolve:network";

function isNetworkName(value: string): value is GenLayerNetworkName {
  return value in NETWORKS;
}

/** The build's seed default, from NEXT_PUBLIC_GENLAYER_NETWORK — only used
 * before a person has ever picked a network in this browser. Throws for an
 * unrecognized value so a typo in deployment config fails loudly rather
 * than silently falling back. */
function readSeedNetworkName(): GenLayerNetworkName {
  const raw = process.env.NEXT_PUBLIC_GENLAYER_NETWORK?.trim();
  if (!raw) return DEFAULT_NETWORK_NAME;
  if (isNetworkName(raw)) return raw;
  throw new ConfigError(
    `NEXT_PUBLIC_GENLAYER_NETWORK is set to "${raw}", which is not a recognized GenLayer network. ` +
      `Valid values: ${Object.keys(NETWORKS).join(", ")}.`,
  );
}

/** Reads the network this person has explicitly chosen in this browser, if
 * any — never throws (a corrupted/unrecognized stored value is treated the
 * same as "nothing stored yet", not a crash). Server-side (no `window`),
 * there is no such thing as "this browser's choice", so this always returns
 * null there and the seed default applies. */
function readStoredNetworkName(): GenLayerNetworkName | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NETWORK_STORAGE_KEY);
    return raw && isNetworkName(raw) ? raw : null;
  } catch {
    return null; // private browsing / storage disabled — fall through to the seed default
  }
}

/** The network actually in effect right now: this browser's explicit choice
 * if one has been made, else the build's seed default (see module
 * docstring). This is what `getGenLayerConfig()` resolves against — call it
 * directly only if you need the name without the rest of the config. */
export function getActiveNetworkName(): GenLayerNetworkName {
  return readStoredNetworkName() ?? readSeedNetworkName();
}

/** Persists a person's network choice for this browser (see
 * `useNetwork()`/`NetworkSwitcher` for the UI that calls this). Never
 * throws — a localStorage failure must not break the ability to switch
 * networks for the current page load, it just won't survive a refresh. */
export function setActiveNetworkName(name: GenLayerNetworkName): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NETWORK_STORAGE_KEY, name);
  } catch {
    // ignored — see docstring
  }
}

/** Thrown when required GenLayer configuration is missing or invalid. Callers
 * should catch this at the UI boundary and render a graceful, actionable
 * message instead of letting the app crash (see AppError in src/types). */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface GenLayerConfig {
  networkName: GenLayerNetworkName;
  chain: GenLayerChain;
  /** Optional override RPC endpoint. Falls back to the chain's default. */
  endpointOverride: string | null;
  /** Deployed WorkResolve contract address for `networkName`. Null until a
   * real deployment on that specific network has its address configured
   * (each network has its own contract address — see
   * `readContractAddressForNetwork` below). */
  contractAddress: `0x${string}` | null;
}

/**
 * Resolves the GenLayer configuration currently in effect — the active
 * network (this browser's choice, or the build's seed default) plus that
 * network's endpoint override and contract address.
 *
 * Deliberately NOT cached: which network is "active" can change at runtime
 * now (see module docstring), so a value cached from the first call would
 * go stale the moment someone switches networks. The computation itself is
 * a few env var reads and a localStorage read — cheap enough to redo on
 * every call rather than manage cache invalidation for it.
 *
 * Does NOT throw for a missing contract address — the app must run (and be
 * browsable) before a contract exists on a given network; callers that need
 * the address use `requireContractAddress()` below, which fails loudly and
 * specifically.
 */
export function getGenLayerConfig(): GenLayerConfig {
  const networkName = getActiveNetworkName();
  const chain = NETWORKS[networkName];
  const endpointOverride = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL?.trim() || null;
  const contractAddress = readContractAddressForNetwork(networkName);

  return { networkName, chain, endpointOverride, contractAddress };
}

/**
 * Each GenLayer network this app can point at has its OWN deployed contract
 * address — a contract deployed on Asimov and one deployed on Studio are
 * unrelated addresses on unrelated networks, never the same deployment (see
 * docs/limitations.md's note on why this app now supports more than one
 * network at all). Every branch below reads a literal
 * `process.env.NEXT_PUBLIC_...` expression — NOT a dynamically-constructed
 * key — because Next.js inlines `NEXT_PUBLIC_*` variables at build time via
 * static analysis of the literal expression; a computed/templated lookup
 * would not be replaced and would read as `undefined` in the browser bundle
 * (see docs/release-notes.md's note on this exact inlining behavior, learned
 * the hard way with the Vercel contract-address update).
 *
 * `NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS` (no network suffix) is kept as
 * a legacy fallback for `testnetAsimov` specifically, since that's the name
 * already configured for this project's existing Vercel deployment — so
 * adding the other networks' address variables below doesn't require
 * renaming or re-entering that one.
 */
function readContractAddressForNetwork(name: GenLayerNetworkName): `0x${string}` | null {
  let raw: string | undefined;
  switch (name) {
    case "studionet":
      raw = process.env.NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_STUDIONET?.trim();
      break;
    case "testnetAsimov":
      raw =
        process.env.NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_TESTNET_ASIMOV?.trim() ||
        process.env.NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS?.trim(); // legacy fallback — see docstring
      break;
    case "testnetBradbury":
      raw = process.env.NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_TESTNET_BRADBURY?.trim();
      break;
    case "localnet":
      raw = process.env.NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_LOCALNET?.trim();
      break;
  }
  return isAddress(raw) ? (raw as `0x${string}`) : null;
}

/** Use inside any hook/service that actually needs to call the deployed
 * contract. Throws a clear ConfigError (never a generic undefined-address
 * crash) when the contract hasn't been configured yet for the currently
 * active network — expected for any network that hasn't been deployed to
 * yet. */
export function requireContractAddress(): `0x${string}` {
  const { contractAddress, chain } = getGenLayerConfig();
  if (!contractAddress) {
    throw new ConfigError(
      `No WorkResolve contract address is configured for ${chain.name}. Either this network hasn't ` +
        "been deployed to yet, or its address env var isn't set. See .env.example.",
    );
  }
  return contractAddress;
}

function isAddress(value: string | undefined): value is string {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
}
