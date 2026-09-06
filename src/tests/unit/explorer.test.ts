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
  it("returns the configured chain's real explorer name and base URL", () => {
    expect(getExplorer()).toEqual({
      name: "GenLayer Explorer",
      baseUrl: "https://explorer-asimov.genlayer.com/",
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
        networkName: "localnet",
        chain: { id: 61127, name: "GenLayer Localnet" }, // no blockExplorers field at all
        endpointOverride: null,
        contractAddress: null,
      }),
    }));
    const { getExplorer: getExplorerFresh } = await import("@/lib/genlayer/explorer");
    expect(getExplorerFresh()).toBeNull();
    vi.doUnmock("@/lib/genlayer/config");
  });
});
