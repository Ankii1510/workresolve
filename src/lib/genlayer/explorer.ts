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
import { getGenLayerConfig } from "./config";

export interface ExplorerInfo {
  name: string;
  /** The explorer's real base URL — never a guessed deep-link path. */
  baseUrl: string;
}

/** Returns the currently-configured network's block explorer, or null if
 * the chain definition doesn't expose one (never fabricated). */
export function getExplorer(): ExplorerInfo | null {
  const { chain } = getGenLayerConfig();
  const explorer = chain.blockExplorers?.default;
  if (!explorer) return null;
  return { name: explorer.name, baseUrl: explorer.url };
}

/** Human-readable network name shown alongside explorer links and in the
 * transaction modal, so "which network was this on?" is never ambiguous. */
export function getNetworkName(): string {
  return getGenLayerConfig().chain.name;
}
