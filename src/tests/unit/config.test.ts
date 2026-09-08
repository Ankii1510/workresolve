import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ENV_KEYS = [
  "NEXT_PUBLIC_GENLAYER_NETWORK",
  "NEXT_PUBLIC_GENLAYER_RPC_URL",
  "NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS",
  "NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_STUDIONET",
  "NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_TESTNET_ASIMOV",
  "NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_TESTNET_BRADBURY",
  "NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_LOCALNET",
] as const;
const originalEnv: Record<string, string | undefined> = {};

const STUDIO_ADDRESS = "0x111111111111111111111111111111111111111a";
const ASIMOV_ADDRESS = "0x222222222222222222222222222222222222222b";
const LEGACY_ASIMOV_ADDRESS = "0x333333333333333333333333333333333333333c";

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
  window.localStorage.clear();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("getActiveNetworkName / getGenLayerConfig", () => {
  it("defaults to studionet when nothing is configured or stored", async () => {
    const { getGenLayerConfig } = await import("@/lib/genlayer/config");
    expect(getGenLayerConfig().networkName).toBe("studionet");
  });

  it("uses NEXT_PUBLIC_GENLAYER_NETWORK as the seed default before any browser choice is stored", async () => {
    process.env.NEXT_PUBLIC_GENLAYER_NETWORK = "testnetAsimov";
    const { getGenLayerConfig } = await import("@/lib/genlayer/config");
    expect(getGenLayerConfig().networkName).toBe("testnetAsimov");
  });

  it("a stored browser choice overrides the seed default", async () => {
    process.env.NEXT_PUBLIC_GENLAYER_NETWORK = "testnetAsimov";
    const { getGenLayerConfig, setActiveNetworkName } = await import("@/lib/genlayer/config");
    setActiveNetworkName("studionet");
    expect(getGenLayerConfig().networkName).toBe("studionet");
  });

  it("throws a clear ConfigError for an unrecognized NEXT_PUBLIC_GENLAYER_NETWORK value", async () => {
    process.env.NEXT_PUBLIC_GENLAYER_NETWORK = "mainnet";
    const { getGenLayerConfig } = await import("@/lib/genlayer/config");
    expect(() => getGenLayerConfig()).toThrow(/not a recognized GenLayer network/i);
  });

  it("ignores a corrupted/unrecognized stored value rather than crashing", async () => {
    window.localStorage.setItem("workresolve:network", "not-a-real-network");
    const { getGenLayerConfig } = await import("@/lib/genlayer/config");
    expect(getGenLayerConfig().networkName).toBe("studionet");
  });
});

describe("per-network contract address resolution", () => {
  it("resolves each network's own address from its own env var, independently", async () => {
    process.env.NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_STUDIONET = STUDIO_ADDRESS;
    process.env.NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_TESTNET_ASIMOV = ASIMOV_ADDRESS;
    const { getGenLayerConfig, setActiveNetworkName } = await import("@/lib/genlayer/config");

    setActiveNetworkName("studionet");
    expect(getGenLayerConfig().contractAddress).toBe(STUDIO_ADDRESS);

    setActiveNetworkName("testnetAsimov");
    expect(getGenLayerConfig().contractAddress).toBe(ASIMOV_ADDRESS);
  });

  it("falls back to the legacy unsuffixed var for testnetAsimov only", async () => {
    process.env.NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS = LEGACY_ASIMOV_ADDRESS;
    const { getGenLayerConfig, setActiveNetworkName } = await import("@/lib/genlayer/config");

    setActiveNetworkName("testnetAsimov");
    expect(getGenLayerConfig().contractAddress).toBe(LEGACY_ASIMOV_ADDRESS);

    // The legacy var must NOT leak into any other network's address.
    setActiveNetworkName("studionet");
    expect(getGenLayerConfig().contractAddress).toBeNull();
  });

  it("prefers the network-suffixed testnetAsimov var over the legacy unsuffixed one", async () => {
    process.env.NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS = LEGACY_ASIMOV_ADDRESS;
    process.env.NEXT_PUBLIC_WORKRESOLVE_CONTRACT_ADDRESS_TESTNET_ASIMOV = ASIMOV_ADDRESS;
    const { getGenLayerConfig, setActiveNetworkName } = await import("@/lib/genlayer/config");
    setActiveNetworkName("testnetAsimov");
    expect(getGenLayerConfig().contractAddress).toBe(ASIMOV_ADDRESS);
  });

  it("requireContractAddress throws a network-specific ConfigError, not a generic one", async () => {
    const { requireContractAddress, setActiveNetworkName } = await import("@/lib/genlayer/config");
    setActiveNetworkName("studionet");
    expect(() => requireContractAddress()).toThrow(/Genlayer Studio Network/);
  });
});
