"use client";

import { useWallet } from "@/hooks/useWallet";
import { useContractRead } from "@/hooks/useContractRead";
import {
  getMilestone,
  getMilestonesByClient,
  getMilestonesByFreelancer,
  getReputation,
} from "@/lib/genlayer/milestone";
import { describeAction } from "@/lib/notifications";
import { readActivity } from "@/lib/activity";
import { getExplorer } from "@/lib/genlayer/explorer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import type { AppGenLayerClient } from "@/lib/genlayer/client";
import type { Milestone } from "@/types";

/**
 * Reputation Integrity (Phase 7, section 12): everything on this page is
 * either a real `get_reputation` view read, or derived by re-reading each
 * of the connected wallet's own milestones and counting real, on-chain
 * `state` values — never a manually-entered or frontend-computed score.
 * `get_reputation`'s four counters (jobs_created / jobs_completed /
 * jobs_funded / reputation_score) are exactly what
 * contracts/workresolve.py's `_record_reputation` increments on
 * `release_payment` / `refund_client` — see "Reputation formula" below and
 * docs/evaluation.md.
 */
async function fetchProfileData(client: AppGenLayerClient, address: string) {
  const [reputation, clientIds, freelancerIds] = await Promise.all([
    getReputation(client, address),
    getMilestonesByClient(client, address),
    getMilestonesByFreelancer(client, address),
  ]);
  const [asClient, asFreelancer] = await Promise.all([
    Promise.all(clientIds.map((id) => getMilestone(client, id))),
    Promise.all(freelancerIds.map((id) => getMilestone(client, id))),
  ]);
  return { reputation, asClient, asFreelancer };
}

function countBy(milestones: Milestone[], state: Milestone["state"]): number {
  return milestones.filter((m) => m.state === state).length;
}

export default function ProfilePage() {
  const wallet = useWallet();

  const profile = useContractRead(
    () =>
      wallet.address
        ? fetchProfileData(wallet.readClient, wallet.address)
        : Promise.resolve(null),
    [wallet.readClient, wallet.address],
  );

  const activity = wallet.address ? readActivity(wallet.address) : [];
  const explorer = getExplorer();

  const asClient = profile.data?.asClient ?? [];
  const asFreelancer = profile.data?.asFreelancer ?? [];
  const rep = profile.data?.reputation ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>
      <p className="mt-1 text-sm text-slate-600">
        Reputation is built entirely from objective on-chain outcomes — completed milestones and released
        payments — never from a manually-entered score or from an evaluation score directly.
      </p>

      {!wallet.isConnected ? (
        <div className="mt-8">
          <EmptyState
            title="Connect your wallet to view your profile"
            action={<Button onClick={wallet.connect}>Connect Wallet</Button>}
          />
        </div>
      ) : (
        <>
          {profile.isLoading && (
            <div className="mt-8 flex items-center gap-2 text-sm text-slate-500">
              <Spinner size="sm" /> Loading profile…
            </div>
          )}
          {profile.error && (
            <div className="mt-8">
              <ErrorNotice error={profile.error} onRetry={profile.refetch} />
            </div>
          )}

          {!profile.isLoading && !profile.error && (
            <>
              <Card className="mt-8">
                <CardContent>
                  <p className="text-xs font-medium text-slate-500">Wallet address</p>
                  <p className="mt-1 break-all font-mono text-sm text-slate-900">{wallet.address}</p>
                </CardContent>
              </Card>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Reputation score" value={rep?.reputationScore ?? 0} />
                <Stat label="Milestones created" value={rep?.jobsCreated ?? 0} />
                <Stat label="Jobs completed (as freelancer)" value={rep?.jobsCompleted ?? 0} />
                <Stat label="Jobs settled (as client)" value={rep?.jobsFunded ?? 0} />
              </div>

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Milestone outcomes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-xs text-slate-500">
                    Derived by reading every milestone this wallet is party to and counting real{" "}
                    <code>state</code> values — not a separate stored counter.
                  </p>
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Metric label="As client — released" value={countBy(asClient, "RELEASED")} />
                    <Metric label="As client — refunded" value={countBy(asClient, "REFUNDED")} />
                    <Metric label="As freelancer — released" value={countBy(asFreelancer, "RELEASED")} />
                    <Metric label="As freelancer — rejected" value={countBy(asFreelancer, "REJECTED")} />
                  </dl>
                </CardContent>
              </Card>

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Reputation formula</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm text-slate-600">
                  <p>A freelancer&rsquo;s payment being released: <strong>+10</strong> reputation, +1 completed job.</p>
                  <p>A client&rsquo;s milestone being released (their freelancer succeeded): <strong>+2</strong> reputation.</p>
                  <p>A client&rsquo;s milestone being refunded (the work didn&rsquo;t meet the bar): <strong>+1</strong> reputation — participating honestly in the process still counts for something, just less than a successful outcome.</p>
                  <p className="text-xs text-slate-400">
                    Exactly what <code>contracts/workresolve.py</code>&rsquo;s <code>release_payment</code>/
                    <code>refund_client</code> record via <code>_record_reputation</code> — see
                    docs/evaluation.md &ldquo;Reputation&rdquo; for the full writeup.
                  </p>
                </CardContent>
              </Card>

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Recent activity (this browser)</CardTitle>
                </CardHeader>
                <CardContent>
                  {activity.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No transactions recorded yet in this browser. This log only tracks confirmed
                      transactions you&rsquo;ve submitted from here — not your wallet&rsquo;s full on-chain
                      history (see docs/evaluation.md &ldquo;Transaction History&rdquo;).
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {activity.map((entry) => {
                        const copy = describeAction(entry.action);
                        return (
                          <li
                            key={entry.txHash}
                            className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0 last:pb-0"
                          >
                            <div>
                              <p className="font-medium text-slate-900">{copy.title}</p>
                              <p className="text-xs text-slate-500">
                                Milestone #{entry.milestoneId} · {new Date(entry.recordedAt).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-slate-400">
                                {entry.txHash.slice(0, 10)}…
                              </span>
                              {explorer && (
                                <a
                                  href={explorer.baseUrl}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="text-xs font-medium underline underline-offset-2"
                                >
                                  View on {explorer.name} ↗
                                </a>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
