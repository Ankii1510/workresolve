import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/genlayer/config", () => ({
  getGenLayerConfig: () => ({
    networkName: "testnetAsimov",
    chain: {
      id: 4221,
      name: "GenLayer Asimov Testnet",
      blockExplorers: { default: { name: "GenLayer Explorer", url: "https://explorer-asimov.genlayer.com/" } },
    },
    endpointOverride: null,
    contractAddress: null,
  }),
}));

import { getExplorer, getNetworkName } from "@/lib/genlayer/explorer";

describe("getExplorer", () => {
  it("uses the chain definition for networks whose explorer URL is correct, normalizing the trailing slash", () => {
    // Asimov's genlayer-js entry ships a trailing slash and Studio's does not;
    // normalizing here keeps callers from producing "//" if they ever append
    // a path.
    expect(getExplorer()).toEqual({
      name: "GenLayer Explorer",
      baseUrl: "https://explorer-asimov.genlayer.com",
    });
  });
});

describe("getNetworkName", () => {
  it("returns the configured chain's real name", () => {
    expect(getNetworkName()).toBe("GenLayer Asimov Testnet");
  });
});

describe("getExplorer with a chain that has no explorer configured", () => {
  it("returns null rather than fabricating a URL", async () => {
    vi.resetModules();
    vi.doMock("@/lib/genlayer/config", () => ({
      getGenLayerConfig: () => ({
        networkName: "testnetBradbury", // a network with no override…
        chain: { id: 4221, name: "GenLayer Bradbury Testnet" }, // …and no blockExplorers field at all
        endpointOverride: null,
        contractAddress: null,
      }),
    }));
    const { getExplorer: getExplorerFresh } = await import("@/lib/genlayer/explorer");
    expect(getExplorerFresh()).toBeNull();
    vi.doUnmock("@/lib/genlayer/config");
  });
});

describe("getExplorer overrides for networks genlayer-js points at the wrong place", () => {
  // Reported from the live app on 2026-09-11: after a successful Studio
  // transaction, "View on GenLayer Explorer" opened
  // https://genlayer-explorer.vercel.app — a generic site that knows nothing
  // about Studio, so the transaction was simply not there. That URL is what
  // genlayer-js@1.1.8's studionet chain definition contains.
  it("sends studionet to the real Studio explorer, not genlayer-js's generic URL", async () => {
    vi.resetModules();
    vi.doMock("@/lib/genlayer/config", () => ({
      getGenLayerConfig: () => ({
        networkName: "studionet",
        chain: {
          id: 61999,
          name: "Genlayer Studio Network",
          // Exactly what genlayer-js ships — the value being corrected.
          blockExplorers: { default: { name: "GenLayer Explorer", url: "https://genlayer-explorer.vercel.app" } },
        },
        endpointOverride: null,
        contractAddress: null,
      }),
    }));
    const { getExplorer: getExplorerFresh } = await import("@/lib/genlayer/explorer");
    const explorer = getExplorerFresh();
    expect(explorer?.baseUrl).toBe("https://explorer-studio.genlayer.com");
    expect(explorer?.baseUrl).not.toContain("vercel.app");
    vi.doUnmock("@/lib/genlayer/config");
  });

  it("never points localnet at its own RPC endpoint, which is what the chain definition does", async () => {
    vi.resetModules();
    vi.doMock("@/lib/genlayer/config", () => ({
      getGenLayerConfig: () => ({
        networkName: "localnet",
        chain: {
          id: 61127,
          name: "Genlayer Localnet",
          blockExplorers: { default: { name: "GenLayer Explorer", url: "http://127.0.0.1:4000/api" } },
        },
        endpointOverride: null,
        contractAddress: null,
      }),
    }));
    const { getExplorer: getExplorerFresh } = await import("@/lib/genlayer/explorer");
    expect(getExplorerFresh()?.baseUrl).not.toBe("http://127.0.0.1:4000/api");
    vi.doUnmock("@/lib/genlayer/config");
  });
});
