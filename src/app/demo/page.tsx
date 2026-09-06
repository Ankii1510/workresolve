import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const DEMO_REQUIREMENTS = [
  { description: "Responsive website", weight: 20 },
  { description: "Restaurant menu section", weight: 20 },
  { description: "Contact form", weight: 20 },
  { description: "Mobile-friendly layout", weight: 20 },
  { description: "Working deployed URL + source repository", weight: 20 },
];

/**
 * Phase 7 "Demo Data Rule", relabeled per Phase 9 section 13's exact
 * convention: static sample data (this whole page) must never be mixed
 * with real connected-wallet dashboard data, and must be clearly labeled
 * EXAMPLE (a static illustration) as distinct from TESTNET DEMO (real
 * wallet, real transactions — see docs/demo.md for that script). This page
 * renders no wallet state, no contract reads, and no transactions of its
 * own — it is a fixed illustration of the real flow (see docs/evaluation.md
 * for the actual mechanism), not a second, parallel "fake" implementation
 * of it. The real thing lives at /milestones/new onward.
 */
export default function DemoPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Badge tone="warning">EXAMPLE — a static illustration, not a live transaction</Badge>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900">
        Alice hires Bob to build a restaurant landing page
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        This page illustrates the full WorkResolve flow with a fixed, made-up scenario (Alice and Bob aren&rsquo;t
        real wallets) so you can see the shape of the product without connecting anything. Every number and
        name below is static sample data — it is never mixed with your connected wallet&rsquo;s real
        dashboard, and no transaction happens on this page. For the real, on-chain flow — real wallet, real
        transaction, real GenLayer evaluation — use <Link href="/milestones/new" className="underline">Create
        Milestone</Link> instead.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Milestone: &ldquo;Build Restaurant Landing Page&rdquo;</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-slate-500">Client</dt>
            <dd className="text-slate-900">Alice (illustrative)</dd>
            <dt className="text-slate-500">Freelancer</dt>
            <dd className="text-slate-900">Bob (illustrative)</dd>
            <dt className="text-slate-500">Amount</dt>
            <dd className="text-slate-900">100 GEN (illustrative)</dd>
          </dl>
          <p className="mt-4 text-xs font-medium tracking-wide text-slate-500 uppercase">Requirements</p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
            {DEMO_REQUIREMENTS.map((r) => (
              <li key={r.description} className="flex justify-between">
                <span>{r.description}</span>
                <span className="text-slate-400">weight {r.weight}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>What happens next, for real</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p>
            Bob accepts the funded milestone, submits his deployed URL and repository as evidence, and
            anyone can then trigger GenLayer&rsquo;s real evaluation. Independent validators fetch that
            evidence, judge it against exactly the five requirements above, and must agree on the same
            structured result before it&rsquo;s finalized — see the project&rsquo;s <code>docs/evaluation.md</code>{" "}
            for the full mechanism, including how it resists a submission trying to talk the evaluator into
            approving itself.
          </p>
          <p>
            If the weighted score clears the 70% approval threshold, escrow releases to Bob; otherwise, it
            refunds to Alice. No step in that sentence is simulated on the real app — every one is a signed,
            confirmed transaction.
          </p>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/milestones/new">
          <Button>Try the real flow</Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="outline">Go to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
