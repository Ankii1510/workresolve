/**
 * Low-level EIP-1193 wallet helpers. This module talks to `window.ethereum`
 * directly; it is the one place that does so. `useWallet` (src/hooks) is the
 * only consumer — components should use that hook, never these functions
 * directly.
 *
 * Why EIP-1193 / MetaMask-compatible rather than a GenLayer-specific wallet:
 * confirmed in Phase 1 and re-confirmed against the installed SDK's own
 * `ClientConfig` type (see client.ts) — `createClient` accepts a plain
 * `provider: EthereumProvider` and drives signing/network switching through
 * it, which is exactly the `window.ethereum` shape. A dedicated
 * `genlayer-wallet` package exists (genlayerlabs/genlayer-wallet) as a
 * possible future enhancement, but the SDK does not require it, so it is
 * out of scope for the Phase 3 wallet foundation (see docs/architecture.md
 * section 14 and the Phase 2 "SHOULD HAVE" list).
 */
import type { GenLayerChain } from "genlayer-js/types";
import type { EthereumProvider } from "./client";
import { ConfigError } from "./config";

export function getInjectedProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  return eth ?? null;
}

export function hasInjectedWallet(): boolean {
  return getInjectedProvider() !== null;
}

/** Requests account access. Throws a plain Error with the wallet's own
 * rejection message on user decline — callers map this to AppError. */
export async function requestAccounts(provider: EthereumProvider): Promise<string[]> {
  const result = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error("No accounts returned by wallet.");
  }
  return result as string[];
}

/** Reads currently-authorized accounts without prompting the user. */
export async function getAuthorizedAccounts(provider: EthereumProvider): Promise<string[]> {
  const result = await provider.request({ method: "eth_accounts" });
  return Array.isArray(result) ? (result as string[]) : [];
}

/** Returns the wallet's current chain id as a number (converted from hex). */
export async function getCurrentChainId(provider: EthereumProvider): Promise<number> {
  const hex = await provider.request({ method: "eth_chainId" });
  if (typeof hex !== "string") throw new Error("Wallet returned an invalid chain id.");
  return parseInt(hex, 16);
}

export function shortenAddress(address: string, chars = 4): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function requireInjectedProvider(): EthereumProvider {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new ConfigError(
      "No wallet extension detected. Install a MetaMask-compatible browser wallet to connect.",
    );
  }
  return provider;
}

/**
 * Prompts the connected wallet to switch to `chain` via the standard
 * EIP-3326 `wallet_switchEthereumChain` request; if the wallet doesn't
 * recognize the chain (error code 4902, per EIP-3326), falls back to
 * EIP-3085 `wallet_addEthereumChain` using the exact chain data
 * genlayer-js itself ships (`chain.rpcUrls`, `chain.nativeCurrency`,
 * `chain.blockExplorers` — inspected directly from the installed SDK, see
 * lib/genlayer/config.ts) rather than any invented network details.
 *
 * Not every EIP-1193 wallet implements either method (see
 * docs/frontend.md "Network Handling") — callers should catch a failure
 * here and fall back to showing manual switch instructions rather than
 * assuming this always works.
 */
export async function switchToExpectedNetwork(provider: EthereumProvider, chain: GenLayerChain): Promise<void> {
  const chainIdHex = `0x${chain.id.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (err) {
    const code = (err as { code?: unknown } | undefined)?.code;
    if (code !== 4902) throw err; // 4902 = chain not added to the wallet yet
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: chain.name,
          rpcUrls: [...chain.rpcUrls.default.http],
          nativeCurrency: chain.nativeCurrency,
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : [],
        },
      ],
    });
  }
}
