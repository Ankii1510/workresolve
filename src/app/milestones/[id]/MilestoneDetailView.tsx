"use client";

import Link from "next/link";
import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useContractRead } from "@/hooks/useContractRead";
import { useTransaction } from "@/hooks/useTransaction";
import {
  acceptMilestone,
  canAcceptMilestone,
  canHaveSubmission,
  formatGenAmount,
  fundMilestone,
  getMilestone,
  getSubmission,
  NATIVE_TOKEN_SYMBOL,
} from "@/lib/genlayer/milestone";
import { describeDeadline } from "@/lib/genlayer/deadline";
import { recordActivity } from "@/lib/activity";
import { describeAction } from "@/lib/notifications";
import { EvidenceList } from "@/components/evidence/EvidenceList";
import { useToast } from "@/components/ui/Toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Spinner } from "@/components/ui/Spinner";
import { MilestoneStateBadge } from "@/components/ui/StatusBadge";
import { TransactionStatusBanner } from "@/components/transaction/TransactionStatusBanner";
import type { Milestone } from "@/types";

/** One real on-chain timestamp field mapped to a human label. `at: 0` means
 * "hasn't happened yet" (contracts/workresolve.py's default), never
 * fabricated. See docs/frontend.md "Data Fetching" — this timeline is built
 * entirely from Milestone struct fields, not a synthesized/guessed event
 * log, since no confirmed contract-event API exists (docs/contracts.md
 * "Known Limitations"). The final "Settled" step has no dedicated on-chain
 * timestamp at all (release_payment/refund_client don't record one) — it is
 * shown reached-or-not from `state` alone, deliberately with no time shown,
 * rather than reusing finalizedAt and misrepresenting when settlement
 * actually happened. See docs/evaluation.md "Timeline Integration". */
function buildTimeline(milestone: Milestone) {
  const decided = new Set(["APPROVED", "REJECTED", "RELEASED", "REFUNDED"]).has(milestone.state);
  const rejectedOutcome = milestone.state === "REJECTED" || milestone.state === "REFUNDED";
  const settled = milestone.state === "RELEASED" || milestone.state === "REFUNDED";
  return [
    { label: "Created", at: milestone.createdAt, timeUnknown: false },
    { label: "Funded", at: milestone.fundedAt, timeUnknown: false },
    { label: "Accepted", at: milestone.acceptedAt, timeUnknown: false },
    { label: "Submitted", at: milestone.submittedAt, timeUnknown: false },
    {
      label: decided ? (rejectedOutcome ? "Evaluated — Rejected" : "Evaluated — Approved") : "Evaluated",
      at: milestone.finalizedAt,
      timeUnknown: false,
    },
    {
      label: milestone.state === "REFUNDED" ? "Refunded" : "Payment Released",
      at: settled ? milestone.finalizedAt : 0,
      // release_payment/refund_client don't record their own timestamp —
      // reusing finalizedAt here would misrepresent when settlement
      // actually happened, so the time is deliberately hidden for this step.
      timeUnknown: settled,
    },
  ];
}

export function MilestoneDetailView({ milestoneId }: { milestoneId: string }) {
  const wallet = useWallet();
  const milestone = useContractRead(
    () => getMilestone(wallet.readClient, milestoneId),
    [wallet.readClient, milestoneId],
  );
  // Only ask the chain for a submission once the milestone's state says one
  // can exist — see canHaveSubmission()'s docstring for the live bug this
  // fixes (a FUNDED milestone rendered a red error box for the contract's
  // entirely correct "no submission yet").
  const submission = useContractRead(
    () => getSubmission(wallet.readClient, milestoneId),
    [wallet.readClient, milestoneId],
    { enabled: !!milestone.data && canHaveSubmission(milestone.data) },
  );

  const toast = useToast();
  const [fundStep, setFundStep] = useState<"idle" | "review">("idle");
  const fundTx = useTransaction("fundMilestone");
  const acceptTx = useTransaction("acceptMilestone");

  const data = milestone.data;
  const isClient = !!(data && wallet.address && data.client.toLowerCase() === wallet.address.toLowerCase());
  const isFreelancer = !!(
    data &&
    wallet.address &&
    data.freelancer.toLowerCase() === wallet.address.toLowerCase()
  );

  async function handleConfirmFund() {
    if (!data) return;
    const result = await fundTx.run(() => fundMilestone(wallet.writeClient, milestoneId, BigInt(data.amount)));
    if (result) {
      setFundStep("idle");
      milestone.refetch(); // authoritative refresh — never optimistically flip state before confirmation
      if (wallet.address) {
        recordActivity(wallet.address, { txHash: result.txHash, action: "fundMilestone", milestoneId });
      }
      const copy = describeAction("fundMilestone");
      toast.push({ title: copy.title, description: copy.description, tone: "success" });
    }
  }

  async function handleAccept() {
    const result = await acceptTx.run(() => acceptMilestone(wallet.writeClient, milestoneId));
    if (result) {
      milestone.refetch(); // never show ACCEPTED before this confirms
      if (wallet.address) {
        recordActivity(wallet.address, { txHash: result.txHash, action: "acceptMilestone", milestoneId });
      }
      const copy = describeAction("acceptMilestone");
      toast.push({ title: copy.title, description: copy.description, tone: "success" });
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Milestone #{milestoneId}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{data?.title ?? "Milestone Detail"}</h1>
        </div>
        {data && <MilestoneStateBadge state={data.state} />}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {milestone.isLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Spinner size="sm" /> Loading milestone…
                </div>
              )}
              {milestone.error && <ErrorNotice error={milestone.error} />}
              {!milestone.isLoading && !milestone.error && !data && (
                <p className="text-sm text-slate-500">No data.</p>
              )}
              {data && (
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Field label="Client" value={data.client} mono />
                  <Field label="Freelancer" value={data.freelancer} mono />
                  <Field label="Amount" value={`${formatGenAmount(data.amount)} ${NATIVE_TOKEN_SYMBOL}`} />
                  <Field label="Approval threshold" value={`${data.approvalThreshold}%`} />
                  <DeadlineField deadlineUnix={data.deadline} milestoneState={data.state} />
                  <Field label="State" value={data.state} />
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-slate-500">Description</dt>
                    <dd className="mt-0.5 text-sm text-slate-900">{data.description}</dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              {data && data.requirements.length > 0 ? (
                <ul className="space-y-2">
                  {data.requirements.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-800">{r.description}</span>
                      <span className="shrink-0 font-medium text-slate-500">{r.weight}%</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">
                  Requirements will appear here once this milestone is loaded from the deployed contract.
                </p>
              )}
              {data?.requirementsHash && (
                <p className="mt-3 truncate font-mono text-xs text-slate-400" title={data.requirementsHash}>
                  commitment hash: {data.requirementsHash}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Escrow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data && (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-slate-600">
                    Escrow amount: <strong className="text-slate-900">{formatGenAmount(data.amount)} {NATIVE_TOKEN_SYMBOL}</strong>
                  </span>
                  <span className="text-slate-600">
                    Funded: <strong className="text-slate-900">{data.fundedAt > 0 ? "Yes" : "No"}</strong>
                  </span>
                  <span className="text-slate-600">
                    Paid out: <strong className="text-slate-900">{data.paid ? "Yes" : data.refunded ? "Refunded" : "No"}</strong>
                  </span>
                </div>
              )}

              {data?.state === "CREATED" && isClient && fundStep === "idle" && (
                <Button size="sm" onClick={() => setFundStep("review")}>
                  Fund Escrow
                </Button>
              )}

              {data?.state === "CREATED" && isClient && fundStep === "review" && (
                <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                  <p className="text-sm text-slate-700">
                    You&rsquo;re about to send{" "}
                    <strong>{formatGenAmount(data.amount)} {NATIVE_TOKEN_SYMBOL}</strong> into escrow for
                    this milestone.
                  </p>
                  <TransactionStatusBanner
                    status={fundTx.status}
                    hash={fundTx.hash}
                    error={fundTx.error}
                    context={{
                      action: "Fund Escrow",
                      amount: `${formatGenAmount(data.amount)} ${NATIVE_TOKEN_SYMBOL}`,
                      wallet: wallet.shortAddress,
                    }}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" isLoading={fundTx.isPending} onClick={handleConfirmFund}>
                      Confirm &amp; Fund
                    </Button>
                    <Button size="sm" variant="ghost" disabled={fundTx.isPending} onClick={() => setFundStep("idle")}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {data?.state === "CREATED" && !isClient && (
                <p className="text-xs text-slate-500">Only the client who created this milestone can fund it.</p>
              )}
              {data?.state === "FUNDED" && (
                <p className="text-xs font-medium text-emerald-700">Escrow funded.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Submission</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {submission.isLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Spinner size="sm" /> Loading submission…
                </div>
              )}
              {submission.error && <ErrorNotice error={submission.error} onRetry={submission.refetch} />}
              {!submission.isLoading && !submission.error && submission.data && (
                <div className="space-y-3">
                  <EvidenceList submission={submission.data} />
                  {submission.data.description && (
                    <p className="text-sm text-slate-600 italic">&ldquo;{submission.data.description}&rdquo;</p>
                  )}
                  <p className="text-xs text-slate-400">
                    {data?.state === "SUBMITTED"
                      ? "This is the freelancer's current submission — the contract allows one submission per milestone, replaced in place on resubmission (no separate history is kept on-chain)."
                      : "This was the submission evaluated below."}
                  </p>
                </div>
              )}
              {!submission.isLoading && !submission.error && !submission.data && (
                <p className="text-sm text-slate-500">No work has been submitted for this milestone yet.</p>
              )}
              {data && data.state !== "CREATED" && data.state !== "FUNDED" && (
                <Link href={`/milestones/${milestoneId}/evaluation`}>
                  <Button variant="outline" size="sm">
                    {data.state === "SUBMITTED" ? "Start / View Evaluation" : "View Evaluation"}
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Freelancer Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data && canAcceptMilestone(data, wallet.address) && (
                <div className="space-y-2">
                  <p className="text-sm text-slate-700">
                    This milestone is funded and assigned to you. Accept it to begin work.
                  </p>
                  <TransactionStatusBanner status={acceptTx.status} hash={acceptTx.hash} error={acceptTx.error} />
                  <Button
                    size="sm"
                    isLoading={acceptTx.isPending}
                    disabled={acceptTx.isPending || wallet.status !== "CONNECTED"}
                    onClick={handleAccept}
                  >
                    Accept Milestone
                  </Button>
                </div>
              )}
              {data && isFreelancer && (data.state === "ACCEPTED" || data.state === "SUBMITTED") && (
                <Link href={`/milestones/${milestoneId}/submit`}>
                  <Button variant="outline" size="sm">
                    {data.state === "SUBMITTED" ? "Update Submission" : "Submit Work"}
                  </Button>
                </Link>
              )}
              {data && !isFreelancer && (
                <p className="text-xs text-slate-500">
                  Actions here are only available to this milestone&rsquo;s assigned freelancer.
                </p>
              )}
              {data && isFreelancer && data.state !== "FUNDED" && data.state !== "ACCEPTED" && data.state !== "SUBMITTED" && (
                <p className="text-xs text-slate-500">No freelancer action is available in the current state.</p>
              )}
            </CardContent>
          </Card>

          {data && (data.state === "APPROVED" || data.state === "REJECTED") && (
            <Card>
              <CardHeader>
                <CardTitle>Client Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-slate-700">
                  {data.state === "APPROVED"
                    ? "GenLayer approved this milestone. Payment can now be released to the freelancer."
                    : "GenLayer rejected this milestone. The client can now be refunded."}
                </p>
                <Link href={`/milestones/${milestoneId}/evaluation`}>
                  <Button size="sm" variant={data.state === "APPROVED" ? "secondary" : "outline"}>
                    {data.state === "APPROVED" ? "Release Payment" : "Refund Client"}
                  </Button>
                </Link>
                <p className="text-xs text-slate-500">
                  This is permissionless on-chain — the client, freelancer, or anyone else can trigger it, but
                  your wallet must sign the transaction.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {data ? (
                <ol className="space-y-3">
                  {buildTimeline(data).map((step) => {
                    const trulyReached = step.at > 0;
                    return (
                      <li key={step.label} className="flex items-start gap-2 text-sm">
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium ${
                            trulyReached
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : "border-slate-300 text-slate-400"
                          }`}
                        >
                          {trulyReached ? "✓" : "•"}
                        </span>
                        <span className={trulyReached ? "text-slate-900" : "text-slate-400"}>
                          {step.label}
                          {trulyReached && !step.timeUnknown && (
                            <span className="ml-1.5 text-xs text-slate-400">
                              {new Date(step.at * 1000).toLocaleString()}
                            </span>
                          )}
                          {trulyReached && step.timeUnknown && (
                            <span className="ml-1.5 text-xs text-slate-400">(time not recorded on-chain)</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-slate-500">Timeline will appear once the milestone loads.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-sm text-slate-900 ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</dd>
    </div>
  );
}

/** Deadline UX (Phase 7, section 17/18) — cosmetic only. A milestone that's
 * already settled (RELEASED/REFUNDED/CANCELLED) never shows "due soon" or
 * "deadline passed" styling, since the deadline is no longer operative for
 * it. See src/lib/genlayer/deadline.ts's module docstring for why this can
 * never disable/enable a contract action on its own. */
function DeadlineField({ deadlineUnix, milestoneState }: { deadlineUnix: number; milestoneState: Milestone["state"] }) {
  const deadline = describeDeadline(deadlineUnix);
  const settled = ["RELEASED", "REFUNDED", "CANCELLED"].includes(milestoneState);
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">Deadline</dt>
      <dd className="mt-0.5 text-sm text-slate-900">
        {deadline.formatted}
        {!settled && deadline.label && (
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
              deadline.tone === "passed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
            }`}
          >
            {deadline.label}
          </span>
        )}
      </dd>
    </div>
  );
}
