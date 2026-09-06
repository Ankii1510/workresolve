"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/Button";

/**
 * Primary connect/disconnect control. Handles every state the wallet
 * foundation needs to surface (docs/architecture.md section 5 / 14):
 * no wallet installed, disconnected, connecting, connected-wrong-network,
 * connected-correct-network — plus, since useWallet added EIP-6963
 * discovery, choosing between multiple installed wallets rather than
 * silently connecting to whichever one occupies `window.ethereum`.
 */
export function WalletConnectButton() {
  const wallet = useWallet();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close the picker on an outside click, same convention as any other
  // lightweight dropdown in this codebase would use.
  useEffect(() => {
    if (!pickerOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [pickerOpen]);

  if (!wallet.hasWallet) {
    return (
      <a
        href="https://ethereum.org/en/wallets/find-wallet/"
        target="_blank"
        rel="noreferrer noopener"
        className="text-sm font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
      >
        Install a wallet
      </a>
    );
  }

  if (!wallet.isConnected) {
    // Exactly one wallet installed: connect straight to it, no picker —
    // matching the old one-click behavior when there's nothing to choose
    // between.
    if (wallet.walletOptions.length <= 1) {
      const only = wallet.walletOptions[0];
      return (
        <Button onClick={() => wallet.connect(only?.rdns)} isLoading={wallet.isConnecting} size="sm">
          {wallet.isConnecting ? "Connecting…" : "Connect Wallet"}
        </Button>
      );
    }

    // Two or more wallets installed: let the user pick which one.
    return (
      <div className="relative" ref={pickerRef}>
        <Button
          onClick={() => setPickerOpen((open) => !open)}
          isLoading={wallet.isConnecting}
          size="sm"
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
        >
          {wallet.isConnecting ? "Connecting…" : "Connect Wallet"}
        </Button>
        {pickerOpen && (
          <div
            role="listbox"
            aria-label="Choose a wallet"
            className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {wallet.walletOptions.map((option) => (
              <button
                key={option.rdns}
                role="option"
                aria-selected="false"
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  void wallet.connect(option.rdns);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {option.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element -- wallet-supplied data: URI icons, not a project asset Next's image optimizer should handle
                  <img src={option.icon} alt="" aria-hidden="true" className="h-5 w-5 shrink-0 rounded" />
                ) : (
                  <span className="h-5 w-5 shrink-0 rounded bg-slate-200" aria-hidden="true" />
                )}
                <span className="truncate">{option.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
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
