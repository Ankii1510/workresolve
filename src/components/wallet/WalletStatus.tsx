"use client";

import { useWallet } from "@/hooks/useWallet";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

/** A fuller status readout used on pages that require a connected wallet
 * (e.g. Create Milestone, Submit Work) — distinct from the compact navbar
 * WalletConnectButton. Switches on the explicit WalletConnectionStatus
 * (DISCONNECTED/CONNECTING/CONNECTED/WRONG_NETWORK/ERROR) rather than
 * re-deriving it, so this stays in sync with what useWallet() considers
 * authoritative — see docs/frontend.md "Wallet Architecture". */
export function WalletStatus() {
  const wallet = useWallet();

  if (!wallet.hasWallet) {
    return (
      <Badge tone="warning">No wallet detected — install an EIP-1193 browser wallet to continue.</Badge>
    );
  }

  switch (wallet.status) {
    case "DISCONNECTED":
      return <Badge tone="neutral">Wallet not connected</Badge>;
    case "CONNECTING":
      return <Badge tone="info">Connecting wallet…</Badge>;
    case "ERROR":
      return <Badge tone="danger">{wallet.error?.message ?? "Wallet error"}</Badge>;
    case "WRONG_NETWORK":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">
            Wrong network — WorkResolve requires {wallet.expectedNetworkName} (chain id{" "}
            {wallet.expectedChainId}).
          </Badge>
          <Button size="sm" variant="outline" isLoading={wallet.isSwitchingNetwork} onClick={wallet.switchNetwork}>
            Switch network
          </Button>
        </div>
      );
    case "CONNECTED":
      return (
        <Badge tone="success">
          Connected as {wallet.shortAddress} on {wallet.expectedNetworkName}
        </Badge>
      );
    default:
      return null;
  }
}
