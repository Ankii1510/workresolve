"use client";

import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/Button";

/**
 * Primary connect/disconnect control. Handles every state the wallet
 * foundation needs to surface (docs/architecture.md section 5 / 14):
 * no wallet installed, disconnected, connecting, connected-wrong-network,
 * connected-correct-network.
 */
export function WalletConnectButton() {
  const wallet = useWallet();

  if (!wallet.hasWallet) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer noopener"
        className="text-sm font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
      >
        Install a wallet
      </a>
    );
  }

  if (!wallet.isConnected) {
    return (
      <Button onClick={wallet.connect} isLoading={wallet.isConnecting} size="sm">
        {wallet.isConnecting ? "Connecting…" : "Connect Wallet"}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!wallet.isCorrectNetwork && (
        <Button
          variant="outline"
          size="sm"
          isLoading={wallet.isSwitchingNetwork}
          onClick={wallet.switchNetwork}
          className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
        >
          {wallet.isSwitchingNetwork ? "Switching…" : `Switch to ${wallet.expectedNetworkName}`}
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={wallet.disconnect} aria-label="Disconnect wallet">
        {wallet.shortAddress}
      </Button>
    </div>
  );
}
