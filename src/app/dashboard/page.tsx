"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useContractRead } from "@/hooks/useContractRead";
import {
  formatGenAmount,
  getMilestone,
  getMilestonesByClient,
  getMilestonesByFreelancer,
  NATIVE_TOKEN_SYMBOL,
} from "@/lib/genlayer/milestone";
import { describeEvaluationStage, describeLastAction, hasFundsLocked } from "@/lib/genlayer/milestoneDisplay";
import { describeDeadline } from "@/lib/genlayer/deadline";
import { WalletStatus } from "@/components/wallet/WalletStatus";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Spinner } from "@/components/ui/Spinner";
import { MilestoneStateBadge } from "@/components/ui/StatusBadge";
import { shortenAddress } from "@/lib/genlayer/wallet";
import type { AppGenLayerClient } from "@/lib/genlayer/client";
import type { AppError, Milestone } from "@/types";

/**
 * Event/indexing decision (Phase 5, section 14 of the phase spec): the
 * deployed contract has no confirmed custom-event API (see
 * docs/contracts.md "Known Limitations"), but it doesn't need one for
 * milestone enumeration — `get_milestones_by_client` / `_by_freelancer`
 * are real, on-chain reverse-index view methods, maintained by the
 * contract itself on every `create_milestone` call (contracts/workresolve.py).
 * That's a simpler, more robust source of truth than any client-side
 * indexer or database could be: no separate infrastructure, no risk of the
 * index drifting from chain state. So the dashboard reads those two lists
 * directly, then reads each milestone by id — no database, no event log,
 * no localStorage cache of "known ids" was introduced. See
 * docs/frontend.md "Event/Indexing Approach" for the full writeup.
 */
async function fetchDashboardMilestones(
  client: AppGenLayerClient,
  address: string,
): Promise<{ asClient: Milestone[]; asFreelancer: Milestone[] }> {
  const [clientIds, freelancerIds] = await Promise.all([
    getMilestonesByClient(client, address),
    getMilestonesByFreelancer(client, address),
  ]);
  const [asClient, asFreelancer] = await Promise.all([
    Promise.all(clientIds.map((id) => getMilestone(client, id))),
    Promise.all(freelancerIds.map((id) => getMilestone(client, id))),
  ]);
  return { asClient, asFreelancer };
}

export default function DashboardPage() {
  const wallet = useWallet();

  const dashboard = useContractRead(
    () =>
      wallet.address
        ? fetchDashboardMilestones(wallet.readClient, wallet.address)
        : Promise.resolve({ asClient: [], asFreelancer: [] }),
    [wallet.readClient, wallet.address],
  );

  const asClient = dashboard.data?.asClient ?? [];
  const asFreelancer = dashboard.data?.asFreelancer ?? [];
  const active = [...asClient, ...asFreelancer].filter(
    (m) => m.state !== "RELEASED" && m.state !== "REFUNDED" && m.state !== "CANCELLED",
  );
  const pendingEvaluation = [...asClient, ...asFreelancer].filter((m) => m.state === "SUBMITTED" || m.state === "EVALUATING");
  const completed = [...asClient, ...asFreelancer].filter((m) => m.state === "RELEASED" || m.state === "REFUNDED");
  // Sum only milestones whose funds are genuinely locked right now — never
  // an aggregate across a wallet's full history, and never double-counted
  // (a milestone can only appear in one of asClient/asFreelancer's totals
  // here since a wallet can't be both for the same milestone — see
  // create_milestone's "client and freelancer must be different" guard).
  const totalEscrowedWei = [...asClient, ...asFreelancer]
    .filter(hasFundsLocked)
    .reduce((sum, m) => sum + BigInt(m.amount), BigInt(0));

  const stats = [
    { label: "Total milestones", value: String(asClient.length + asFreelancer.length) },
    { label: "Active milestones", value: String(active.length) },
    { label: "Pending evaluations", value: String(pendingEvaluation.length) },
    { label: "Completed", value: String(completed.length) },
    { label: "Total escrowed", value: `${formatGenAmount(totalEscrowedWei)} ${NATIVE_TOKEN_SYMBOL}` },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <WalletStatus />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent>
              <p className="text-xs font-medium text-slate-500">{stat.label}</p>
              <p className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">
                {/* Never a fake number — em dash while disconnected or loading, a real
                    on-chain value otherwise. See docs/frontend.md "No Fake Data". */}
                {!wallet.isConnected || dashboard.isLoading ? "—" : stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!wallet.isConnected ? (
        <div className="mt-8">
          <EmptyState
            title="Connect your wallet to see your milestones"
            description="Your dashboard will show milestones where you're the client or the freelancer once you connect."
            action={<WalletConnectButton />}
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <MilestoneColumn
            title="As client"
            milestones={asClient}
            isLoading={dashboard.isLoading}
            error={dashboard.error}
            onRetry={dashboard.refetch}
            emptyTitle="You haven't created any milestones yet."
            emptyDescription="Create a milestone to start an escrow with a freelancer."
            emptyAction={
              <Link href="/milestones/new">
                <Button size="sm">Create Milestone</Button>
              </Link>
            }
          />
          <MilestoneColumn
            title="As freelancer"
            milestones={asFreelancer}
            isLoading={dashboard.isLoading}
            error={dashboard.error}
            onRetry={dashboard.refetch}
            emptyTitle="No freelance work assigned to this wallet."
            emptyDescription="Milestones a client assigns to your wallet will appear here."
          />
        </div>
      )}
    </div>
  );
}

function MilestoneColumn({
  title,
  milestones,
  isLoading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  title: string;
  milestones: Milestone[];
  isLoading: boolean;
  error: AppError | null;
  onRetry: () => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner size="sm" /> Loading milestones…
          </div>
        )}
        {error && <ErrorNotice error={error} onRetry={onRetry} />}
        {!isLoading && !error && milestones.length === 0 && (
          <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
        )}
        {!isLoading &&
          !error &&
          milestones.map((m) => <MilestoneCard key={m.milestoneId} milestone={m} />)}
      </div>
    </section>
  );
}

function MilestoneCard({ milestone }: { milestone: Milestone }) {
  const wallet = useWallet();
  const counterparty =
    wallet.address?.toLowerCase() === milestone.client.toLowerCase() ? milestone.freelancer : milestone.client;
  const deadline = describeDeadline(milestone.deadline);
  const isOpen = !["RELEASED", "REFUNDED", "CANCELLED"].includes(milestone.state);

  return (
    <Link href={`/milestones/${milestone.milestoneId}`}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">{milestone.title}</p>
            <MilestoneStateBadge state={milestone.state} />
          </div>
          <p className="font-mono text-xs text-slate-500">Counterparty: {shortenAddress(counterparty)}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>
              {formatGenAmount(milestone.amount)} {NATIVE_TOKEN_SYMBOL}
            </span>
            <span className={deadline.tone === "passed" && isOpen ? "font-medium text-red-600" : undefined}>
              Deadline: {deadline.formatted}
              {isOpen && deadline.label && ` (${deadline.label})`}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
            <span>Evaluation: {describeEvaluationStage(milestone)}</span>
            <span>{describeLastAction(milestone)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
