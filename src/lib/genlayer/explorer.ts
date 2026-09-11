/**
 * Centralized block-explorer URL generation (Phase 7, section 14) — the ONE
 * place that turns a chain + transaction hash into an explorer link, so
 * every surface that shows a transaction (the transaction banner, the
 * milestone timeline, the transaction history view) links to the same,
 * correctly-sourced place instead of each hand-rolling its own URL.
 *
 * `chain.blockExplorers.default` comes directly from genlayer-js's own
 * chain definitions (inspected in node_modules/genlayer-js — see
 * src/lib/genlayer/config.ts's module docstring), never hardcoded here.
 *
 * IMPORTANT — the exact per-transaction deep-link path (e.g. "/tx/<hash>")
 * was never confirmed against a live explorer instance in this environment
 * (no network egress to any genlayer.com domain — see docs/contracts.md
 * "Known Limitations"). Rather than guess a path that might 404, every
 * function here returns the explorer's real base URL; callers that want a
 * human next to it show the hash as separate, copyable text (as
 * TransactionStatusBanner already did in Phase 5). If a live explorer's URL
 * scheme is confirmed later, only this file needs to change.
 */
import { getGenLayerConfig, type GenLayerNetworkName } from "./config";

export interface ExplorerInfo {
  name: string;
  /** The explorer's real base URL — never a guessed deep-link path. */
  baseUrl: string;
}

/**
 * Corrections to genlayer-js's own `blockExplorers.default`, for the networks
 * where that field does not point at a usable explorer.
 *
 * REAL BUG THIS FIXES (reported from the live app, 2026-09-11): after a
 * successful transaction on Studio, the "View on GenLayer Explorer" link went
 * to `https://genlayer-explorer.vercel.app` — a generic site that knows
 * nothing about the Studio network, so the transaction could not be found
 * there at all. That URL is what genlayer-js@1.1.8 ships in its `studionet`
 * chain definition; `localnet`'s is worse still (`http://127.0.0.1:4000/api`,
 * which is the RPC endpoint, not an explorer).
 *
 * The real Studio explorer is `explorer-studio.genlayer.com` — confirmed
 * first-hand by loading this project's own deployed contract there
 * (0xdD0b1E30…A83a2e resolves; see docs/limitations.md), and independently by
 * BrickProof, another GenLayer app, which applies the same override in its
 * own source rather than trusting the chain definition.
 *
 * Only networks that are actually wrong are listed. testnetAsimov and
 * testnetBradbury ship correct explorer URLs and are deliberately left to
 * come from genlayer-js, so a future correction upstream is picked up for
 * free.
 *
 * DEEP LINKS, DELIBERATELY NOT ADDED: `explorer-asimov.genlayer.com/tx/<hash>`
 * is a real route (its page title carries the hash). The same path on
 * `explorer-studio.genlayer.com` renders the homepage instead, so Studio's
 * per-transaction route is NOT confirmed and is not guessed here — callers
 * keep showing the hash as copyable text next to the explorer link, which is
 * why this module returns a base URL rather than a deep link.
 */
const EXPLORER_OVERRIDES: Partial<Record<GenLayerNetworkName, ExplorerInfo>> = {
  studionet: { name: "GenLayer Studio Explorer", baseUrl: "https://explorer-studio.genlayer.com" },
  // localnet runs entirely on the developer's own machine; GenLayer Studio's
  // local UI is the closest thing it has to an explorer, and it is definitely
  // not the RPC URL the chain definition points at.
  localnet: { name: "GenLayer Studio (local)", baseUrl: "http://localhost:8080" },
};

/** Returns the currently-configured network's block explorer, or null if
 * neither an override nor the chain definition exposes one (never
 * fabricated). */
export function getExplorer(): ExplorerInfo | null {
  const { chain, networkName } = getGenLayerConfig();
  const override = EXPLORER_OVERRIDES[networkName];
  if (override) return override;
  const explorer = chain.blockExplorers?.default;
  if (!explorer) return null;
  // Trailing slashes vary between genlayer-js's own entries (Asimov's has
  // one, Studio's does not); normalize so callers can append a path later
  // without producing "//".
  return { name: explorer.name, baseUrl: explorer.url.replace(/\/$/, "") };
}

/** Human-readable network name shown alongside explorer links and in the
 * transaction modal, so "which network was this on?" is never ambiguous. */
export function getNetworkName(): string {
  return getGenLayerConfig().chain.name;
}
