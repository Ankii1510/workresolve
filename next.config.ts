import type { NextConfig } from "next";

/**
 * Phase 8 hardening (docs/security.md finding H1): this file was previously
 * empty, so the app shipped with no CSP or hardening headers at all — pure
 * defense-in-depth on top of the app-level fixes (no dangerouslySetInnerHTML,
 * no iframe, safe rel="noreferrer noopener" links, http(s)-only evidence
 * URLs enforced in EvidenceList.tsx and the contract's submit_work). A
 * static CSP (rather than a nonce-based one) is used deliberately: a nonce
 * requires a Proxy/middleware layer forcing every route into dynamic
 * rendering, which would be an architecture change this release-candidate
 * phase was explicitly told not to make for no concrete reason.
 *
 * `script-src` includes 'unsafe-inline', verified necessary by actually
 * running the production build (`npm run build && npm start`) and
 * inspecting the served HTML: the App Router injects its own inline RSC
 * bootstrap scripts (`<script>(self.__next_f=...).push(...)</script>`) with
 * no `nonce` attribute, on every route, by design — a strict `script-src
 * 'self'` with no 'unsafe-inline' silently breaks hydration on every page,
 * caught here by curling the running production server rather than assumed
 * to work. This does weaken the CSP's own protection against inline-script
 * injection, but that was never this app's actual XSS defense — the real
 * defense is structural (no dangerouslySetInnerHTML anywhere, no iframe,
 * every evidence URL scheme-checked before use — see docs/security.md
 * F1/F2). The other directives below (frame-ancestors, object-src,
 * base-uri, form-action, connect-src scoping) still do real work regardless
 * of this exception.
 *
 * connect-src is deliberately wide (`*`) for http(s)/ws(s): the app talks to
 * whichever GenLayer RPC endpoint `NEXT_PUBLIC_GENLAYER_RPC_URL`/the selected
 * network resolves to, plus the injected wallet's own RPC calls — both are
 * environment-configured, not hardcodable here without breaking network
 * switching (see src/lib/genlayer/config.ts).
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'", // Tailwind's compiled CSS is a same-origin stylesheet; 'unsafe-inline' here covers React/Next's own style attributes, not third-party script
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:", // GenLayer RPC + injected wallet endpoints are user/env-configured, not a fixed origin
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
