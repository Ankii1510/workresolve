"use client";

import type { ChangeEvent } from "react";
import { useNetwork } from "@/hooks/useNetwork";
import { useWallet } from "@/hooks/useWallet";
import { logDevError } from "@/lib/utils/errors";

/**
 * Lets a person pick which GenLayer network WorkResolve talks to — added
 * after a real, confirmed GenLayer Asimov Testnet liveness incident
 * (2026-09-08, see docs/limitations.md): Asimov is GenLayer's real
 * decentralized public testnet, so it's subject to actual validator
 * liveness, while GenLayer's own hosted Studio network is a
 * centrally-operated simulator that stays reliable through exactly that
 * kind of incident. Studio is the default (see
 * lib/genlayer/config.ts's getSelectableNetworks) for that reliability
 * reason, but the choice is always the person's — this is a plain,
 * always-visible `<select>`, not a setting buried in a menu.
 *
 * A network switch here does not itself move a connected wallet's chain —
 * EIP-1193 wallets don't allow a page to force that silently, only to
 * prompt for it (see lib/genlayer/wallet.ts's switchToExpectedNetwork). So
 * when a wallet is already connected, picking a new network here also
 * fires that prompt immediately (best-effort: if the wallet declines or
 * doesn't support it, the existing "Switch to <network>" button in
 * WalletConnectButton still covers it — this is a convenience, not the only
 * path).
 */
export function NetworkSwitcher() {
  const { networkName, options, setNetworkName } = useNetwork();
  const wallet = useWallet();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as typeof networkName;
    setNetworkName(next);
    if (wallet.isConnected) {
      // Best-effort — see docstring. switchNetwork() already manages its
      // own loading/error state, surfaced elsewhere (WalletConnectButton),
      // so a failure here doesn't need its own handling beyond not crashing.
      wallet.switchNetwork().catch((err) => logDevError("network switcher: wallet switch prompt failed", err));
    }
  };

  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="sr-only">GenLayer network</span>
      <select
        value={networkName}
        onChange={handleChange}
        aria-label="GenLayer network"
        className="rounded-full border-0 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
      >
        {options.map((option) => (
          <option key={option.name} value={option.name}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
