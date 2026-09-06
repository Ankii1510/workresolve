"use client";

import Link from "next/link";
import { useWallet } from "@/hooks/useWallet";
import { useContractRead } from "@/hooks/useContractRead";
import { useTransaction } from "@/hooks/useTransaction";
import {
  canReleasePayment,
  canRefundClient,
  canTriggerEvaluation,
  evaluateAndFinalize,
  formatGenAmount,
  getEvaluation,
  getMilestone,
  getSubmission,
  NATIVE_TOKEN_SYMBOL,
  refundClient,
  releasePayment,
} from "@/lib/genlayer/milestone";
import { deriveEvaluationStatus, requirementPoints, type EvaluationUiStatus } from "@/lib/genlayer/evaluationStatus";
import { recordActivity } from "@/lib/activity";
import { describeAction } from "@/lib/notifications";
import { EvidenceList } from "@/components/evidence/EvidenceList";
import { useToast } from "@/components/ui/Toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { RequirementStatusBadge } from "@/components/ui/StatusBadge";
import { TransactionStatusBanner } from "@/components/transaction/TransactionStatusBanner";

const STATUS_COPY: Record<EvaluationUiStatus, string> = {
  NOT_STARTED: "Not started",
  EVALUATING: "Evaluation starting…",
  CONSENSUS_PENDING: "GenLayer consensus in progress",
  FINALIZED: "Consensus finalized",
  FAILED: "Evaluation attempt failed",
};

const STATUS_TONE: Record<EvaluationUiStatus, "neutral" | "warning" | "success" | "danger"> = {
  NOT_STARTED: "neutral",
  EVALUATING: "warning",
  CONSENSUS_PENDING: "warning",
  FINALIZED: "success",
  FAILED: "danger",
};

export function EvaluationView({ milestoneId }: { milestoneId: string }) {
  const wallet = useWallet();

  const milestone = useContractRead(
    () => getMilestone(wallet.readClient, milestoneId),
    [wallet.readClient, milestoneId],
  );
  const submission = useContractRead(
    () => getSubmission(wallet.readClient, milestoneId),
    [wallet.readClient, milestoneId],
  );
  const evaluation = useContractRead(
    () => getEvaluation(wallet.readClient, milestoneId),
    [wallet.readClient, milestoneId],
  );

  const evalTx = useTransaction("evaluateAndFinalize");
  const releaseTx = useTransaction("releasePayment");
  const refundTx = useTransaction("refundClient");
  const toast = useToast();

  const data = milestone.data;
  const status = deriveEvaluationStatus(data, evalTx.status);

  function notify(action: Parameters<typeof describeAction>[0], txHash: string) {
    if (wallet.address) recordActivity(wallet.address, { txHash, action, milestoneId });
    const copy = describeAction(action);
    toast.push({ title: copy.title, description: copy.description, tone: "success" });
  }

  async function handleStartEvaluation() {
    const result = await evalTx.run(() => evaluateAndFinalize(wallet.writeClient, milestoneId));
    if (result?.txHash) {
      milestone.refetch();
      evaluation.refetch();
      notify("evaluateAndFinalize", result.txHash);
    }
  }

  async function handleReleasePayment() {
    const result = await releaseTx.run(() => releasePayment(wallet.writeClient, milestoneId));
    if (result?.txHash) {
      milestone.refetch();
      notify("releasePayment", result.txHash);
    }
  }

  async function handleRefundClient() {
    const result = await refundTx.run(() => refundClient(wallet.writeClient, milestoneId));
    if (result?.txHash) {
      milestone.refetch();
      notify("refundClient", result.txHash);
    }
  }

  const requirementsById = new Map((data?.requirements ?? []).map((r) => [r.id, r]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Milestone #{milestoneId}</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">GenLayer Evaluation</h1>
      <p className="mt-1 text-sm text-slate-600">
        Every requirement is judged independently against the submitted evidence, then GenLayer&rsquo;s
        validators must reach consensus on the combined result before anything is finalized on-chain.
      </p>

      {milestone.isLoading && (
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
          <Spinner size="sm" /> Loading milestone…
        </div>
      )}
      {milestone.error && (
        <div className="mt-6">
          <ErrorNotice error={milestone.error} onRetry={milestone.refetch} />
        </div>
      )}

      {data && (
        <>
          <Card className="mt-6">
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Evaluation Status</CardTitle>
              <Badge tone={STATUS_TONE[status]}>{STATUS_COPY[status]}</Badge>
            </CardHeader>
            <CardContent>
              <ConsensusTimeline
                hasSubmission={!!submission.data}
                status={status}
                hasEvaluation={!!evaluation.data}
              />

              {status === "NOT_STARTED" && data.state === "SUBMITTED" && (
                <div className="mt-4 space-y-3 rounded-lg border border-slate-200 p-3">
                  <p className="text-sm text-slate-700">
                    Anyone can trigger evaluation once work has been submitted — this is intentionally
                    permissionless (see docs/contracts.md) so neither the client nor the freelancer can block
                    the other by disappearing.
                  </p>
                  <TransactionStatusBanner status={evalTx.status} hash={evalTx.hash} error={evalTx.error} />
                  <Button
                    size="sm"
                    isLoading={evalTx.isPending}
                    disabled={evalTx.isPending || wallet.status !== "CONNECTED" || !canTriggerEvaluation(data)}
                    onClick={handleStartEvaluation}
                  >
                    Start Evaluation
                  </Button>
                  {wallet.status !== "CONNECTED" && (
                    <p className="text-xs text-slate-500">Connect a wallet to trigger evaluation.</p>
                  )}
                </div>
              )}

              {data.state !== "SUBMITTED" && status !== "FINALIZED" && (
                <TransactionStatusBanner status={evalTx.status} hash={evalTx.hash} error={evalTx.error} />
              )}

              {data.state === "ACCEPTED" && (
                <p className="mt-4 text-sm text-slate-500">
                  Waiting for the freelancer to{" "}
                  <Link href={`/milestones/${milestoneId}/submit`} className="underline">
                    submit work
                  </Link>{" "}
                  before evaluation can start.
                </p>
              )}
            </CardContent>
          </Card>

          {submission.data && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Submitted Evidence</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <EvidenceList submission={submission.data} />
                <p className="text-xs text-slate-400">
                  This is the only submission on record for this milestone — the contract supports exactly
                  one immutable submission per evaluation (a resubmission before evaluation starts replaces
                  it in place rather than keeping a history; see docs/evaluation.md &ldquo;Submission
                  Immutability&rdquo;).
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Result</CardTitle>
            </CardHeader>
            <CardContent>
              {evaluation.isLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Spinner size="sm" /> Loading evaluation…
                </div>
              )}
              {evaluation.error && <ErrorNotice error={evaluation.error} onRetry={evaluation.refetch} />}

              {!evaluation.isLoading && !evaluation.error && !evaluation.data && (
                <p className="text-sm text-slate-500">
                  No finalized result yet — this milestone hasn&rsquo;t reached a consensus-finalized evaluation.
                </p>
              )}

              {evaluation.data && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-6">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Overall Score</p>
                      <p className="mt-0.5 text-2xl font-semibold text-slate-900">{evaluation.data.score} / 100</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Decision</p>
                      <p
                        className={`mt-0.5 text-2xl font-semibold ${
                          evaluation.data.decision === "APPROVE" ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {evaluation.data.decision === "APPROVE" ? "APPROVED" : "REJECTED"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Approval threshold</p>
                      <p className="mt-0.5 text-2xl font-semibold text-slate-900">{data.approvalThreshold}%</p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-900">Requirement Results</p>
                    <ul className="space-y-3">
                      {evaluation.data.requirementResults.map((rr) => {
                        const req = requirementsById.get(rr.requirementId);
                        const weight = req?.weight ?? 0;
                        return (
                          <li key={rr.requirementId} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium text-slate-800">
                                {req?.description ?? `Requirement #${rr.requirementId}`}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">weight {weight}%</span>
                                <RequirementStatusBadge status={rr.status} />
                                <span className="text-xs font-medium text-slate-500">
                                  +{requirementPoints(rr.status, weight)} pts
                                </span>
                              </div>
                            </div>
                            {rr.reason && <p className="mt-1.5 text-sm text-slate-600">{rr.reason}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {evaluation.data.summary && (
                    <p className="text-sm text-slate-500 italic">{evaluation.data.summary}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {evaluation.data && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Settlement</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {canReleasePayment(data) && (
                  <>
                    <p className="text-sm text-slate-700">
                      This milestone was approved. Anyone can trigger the release now — it pays the freelancer
                      exactly the escrowed amount, once.
                    </p>
                    <TransactionStatusBanner
                      status={releaseTx.status}
                      hash={releaseTx.hash}
                      error={releaseTx.error}
                      context={{
                        action: "Release Payment",
                        amount: `${formatGenAmount(data.amount)} ${NATIVE_TOKEN_SYMBOL}`,
                        wallet: wallet.shortAddress,
                      }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      isLoading={releaseTx.isPending}
                      disabled={releaseTx.isPending || wallet.status !== "CONNECTED"}
                      onClick={handleReleasePayment}
                    >
                      Release Payment
                    </Button>
                  </>
                )}
                {canRefundClient(data) && (
                  <>
                    <p className="text-sm text-slate-700">
                      This milestone was rejected. Anyone can trigger the refund now — it returns the escrowed
                      amount to the client, once.
                    </p>
                    <TransactionStatusBanner
                      status={refundTx.status}
                      hash={refundTx.hash}
                      error={refundTx.error}
                      context={{
                        action: "Refund Client",
                        amount: `${formatGenAmount(data.amount)} ${NATIVE_TOKEN_SYMBOL}`,
                        wallet: wallet.shortAddress,
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={refundTx.isPending}
                      disabled={refundTx.isPending || wallet.status !== "CONNECTED"}
                      onClick={handleRefundClient}
                    >
                      Refund Client
                    </Button>
                  </>
                )}
                {data.state === "RELEASED" && (
                  <p className="text-sm font-medium text-emerald-700">Payment has been released to the freelancer.</p>
                )}
                {data.state === "REFUNDED" && (
                  <p className="text-sm font-medium text-amber-700">The client has been refunded.</p>
                )}
              </CardContent>
            </Card>
          )}

          <p className="mt-6 text-xs text-slate-500">
            Evaluation reasoning shown here is the concise, structured explanation GenLayer&rsquo;s consensus
            process produced — never a raw model transcript or hidden chain-of-thought. Submitted evidence
            (the deployed URL, repository, and any evidence links) is treated by the evaluator as untrusted
            data, never as instructions — see docs/evaluation.md &ldquo;Prompt Injection Defense&rdquo;.
          </p>
        </>
      )}
    </div>
  );
}

function ConsensusTimeline({
  hasSubmission,
  status,
  hasEvaluation,
}: {
  hasSubmission: boolean;
  status: EvaluationUiStatus;
  hasEvaluation: boolean;
}) {
  const steps = [
    { label: "Submission Received", reached: hasSubmission },
    { label: "Evaluation Started", reached: status !== "NOT_STARTED" },
    {
      label: "GenLayer Validators Evaluating",
      reached: status === "EVALUATING" || status === "CONSENSUS_PENDING" || status === "FINALIZED",
    },
    { label: "Consensus Reached", reached: status === "FINALIZED" || hasEvaluation },
    { label: "Evaluation Finalized", reached: status === "FINALIZED" && hasEvaluation },
  ];

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3 text-xs">
      {steps.map((step, i) => (
        <li key={step.label} className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${
              step.reached
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-slate-200 text-slate-400"
            }`}
          >
            {step.reached ? "✓" : "•"} {step.label}
          </span>
          {i < steps.length - 1 && <span className="text-slate-300">→</span>}
        </li>
      ))}
    </ol>
  );
}
