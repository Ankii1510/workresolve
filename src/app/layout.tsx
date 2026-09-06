import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/hooks/useWallet";
import { ToastProvider } from "@/components/ui/Toast";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

// Deliberately using the system font stack (defined in globals.css) rather
// than next/font/google: this build environment has no outbound network
// access to fonts.googleapis.com, and a foundation that only builds when a
// specific external host is reachable is a fragile one. A system stack also
// means zero font-loading flash and no extra network request at runtime.
export const metadata: Metadata = {
  title: "WorkResolve — Decentralized Freelance Escrow",
  description:
    "Escrow for freelance milestones, evaluated by GenLayer's decentralized validator consensus instead of a single centralized approval button.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900">
        <ToastProvider>
          <WalletProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </WalletProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
