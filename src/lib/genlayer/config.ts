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
 * testnetAsimov is used as the default public testnet per the Phase 1
 * research ("Testnet Asimov is Live" — genlayer.com/news). Both Asimov and
 * Bradbury ship in the SDK; which one is "current" can change, so the
 * network is selectable via NEXT_PUBLIC_GENLAYER_NETWORK rather than
 * hardcoded, and this should be re-verified against
 * https://docs.genlayer.com before a real testnet deployment (Phase 4+).
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

function readNetworkName(): GenLayerNetworkName {
  const raw = process.env.NEXT_PUBLIC_GENLAYER_NETWORK?.trim();
  if (!raw) return "studionet"; // safest default: hosted simulator, no local setup required
  if (raw in NETWORKS) return raw as GenLayerNetworkName;
  throw new ConfigError(
    `NEXT_PUBLIC_GENLAYER_NETWORK is set to "${raw}", which is not a recognized GenLayer network. ` +
      `Valid values: ${Object.keys(NETWORKS).join(", ")}.`,
  );
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
  /** Deployed WorkResolve contract address. Null until Phase 4 deploys it. */
  contractAddress: `0x${string}` | null;
}

let cachedConfig: GenLayerConfig | null = null;

/**
 * Resolve and cache the GenLayer configuration from environment variables.
 * Does NOT throw for a missing contract address — the app must run (and be
 * browsable) before a contract exists; callers that need the address use
 * `requireContractAddress()` below, which fails loudly and specifically.
 */
export function getGenLayerConfig(): GenLayerConfig {
  if (cachedConfig) return cachedConfig;

  const networkName = readNetworkName();
  const chain = NETWORKS[networkName];
  const endpointOverride = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL?.trim() || null;
  const rawAddress = process.env.NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS?.trim();
  const contractAddress = isAddress(rawAddress) ? (rawAddress as `0x${string}`) : null;

  cachedConfig = { networkName, chain, endpointOverride, contractAddress };
  return cachedConfig;
}

/** Use inside any hook/service that actually needs to call the deployed
 * contract. Throws a clear ConfigError (never a generic undefined-address
 * crash) when the contract hasn't been configured yet — expected throughout
 * Phase 3, since the contract isn't written until Phase 4. */
export function requireContractAddress(): `0x${string}` {
  const { contractAddress } = getGenLayerConfig();
  if (!contractAddress) {
    throw new ConfigError(
      "NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS is not set. The WorkResolve " +
        "Intelligent Contract has not been deployed yet (or its address " +
        "hasn't been configured). See .env.example.",
    );
  }
  return contractAddress;
}

function isAddress(value: string | undefined): value is string {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
}
