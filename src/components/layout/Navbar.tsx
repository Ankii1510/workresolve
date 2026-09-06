"use client";

import Link from "next/link";
import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";

/** Deliberately minimal — see Phase 7 "do not create unnecessary navigation
 * items". "How It Works" links to the landing page's existing explainer
 * section rather than duplicating a new page; the scripted demo and profile
 * are one click away from the dashboard/landing page instead of taking a
 * primary nav slot. */
const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/milestones/new", label: "Create Milestone" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/profile", label: "Profile" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const wallet = useWallet();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-sm font-bold text-white">
            W
          </span>
          WorkResolve
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {wallet.isConnected && (
            <Badge tone={wallet.isCorrectNetwork ? "neutral" : "warning"} className="hidden sm:inline-flex">
              {wallet.expectedNetworkName}
            </Badge>
          )}
          <WalletConnectButton />
          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
          >
            <span className="sr-only">Toggle menu</span>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M2 4h14M2 9h14M2 14h14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <nav
        className={cn(
          "flex flex-col gap-1 border-t border-slate-200 px-4 py-3 md:hidden",
          mobileOpen ? "block" : "hidden",
        )}
      >
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMobileOpen(false)}
            className="rounded-md px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
