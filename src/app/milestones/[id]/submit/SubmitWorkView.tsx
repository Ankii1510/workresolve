"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { useContractRead } from "@/hooks/useContractRead";
import { useTransaction } from "@/hooks/useTransaction";
import { getMilestone, getSubmission, submitWork } from "@/lib/genlayer/milestone";
import { MAX_EVIDENCE_ITEMS, checkSubmitEligibility, validateSubmitWorkForm } from "@/lib/genlayer/submitForm";
import { recordActivity } from "@/lib/activity";
import { describeAction } from "@/lib/notifications";
import { useToast } from "@/components/ui/Toast";
import { WalletStatus } from "@/components/wallet/WalletStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { TransactionStatusBanner } from "@/components/transaction/TransactionStatusBanner";

export function SubmitWorkView({ milestoneId }: { milestoneId: string }) {
  const wallet = useWallet();
  const router = useRouter();
  const toast = useToast();
  const tx = useTransaction("submitWork");

  const milestone = useContractRead(
    () => getMilestone(wallet.readClient, milestoneId),
    [wallet.readClient, milestoneId],
  );
  const existingSubmission = useContractRead(
    () => getSubmission(wallet.readClient, milestoneId),
    [wallet.readClient, milestoneId],
  );

  const [step, setStep] = useState<"form" | "review">("form");
  const [deployedUrl, setDeployedUrl] = useState("");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([""]);
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);

  // Prefill from an existing submission exactly once it loads, so a
  // freelancer resubmitting (see docs/evaluation.md "Submission
  // Immutability") edits their real prior values instead of starting blank.
  // Adjusting state during render (rather than in an effect) is the pattern
  // React itself recommends for "reset/derive state when a fetched value
  // arrives" — see https://react.dev/learn/you-might-not-need-an-effect.
  if (existingSubmission.data && prefilledFor !== milestoneId) {
    const s = existingSubmission.data;
    setPrefilledFor(milestoneId);
    setDeployedUrl(s.deployedUrl);
    setRepositoryUrl(s.repositoryUrl);
    setEvidenceUrls(s.evidenceUrls.length > 0 ? s.evidenceUrls : [""]);
    setDescription(s.description);
  }

  const data = milestone.data;
  const eligibility = data
    ? checkSubmitEligibility({
        walletAddress: wallet.address,
        isCorrectNetwork: wallet.isCorrectNetwork,
        milestoneFreelancer: data.freelancer,
        milestoneState: data.state,
        deadlineUnix: data.deadline,
      })
    : null;

  function updateEvidenceUrl(index: number, value: string) {
    setEvidenceUrls((current) => current.map((u, i) => (i === index ? value : u)));
  }
  function addEvidenceUrl() {
    setEvidenceUrls((current) => (current.length < MAX_EVIDENCE_ITEMS ? [...current, ""] : current));
  }
  function removeEvidenceUrl(index: number) {
    setEvidenceUrls((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : [""]));
  }

  function validate(): string | null {
    return validateSubmitWorkForm({ deployedUrl, repositoryUrl, evidenceUrls, description });
  }

  function handleContinueToReview(e: FormEvent) {
    e.preventDefault();
    const error = validate();
    setFormError(error);
    if (!error) setStep("review");
  }

  async function handleConfirmSubmit() {
    const error = validate();
    if (error) {
      setFormError(error);
      setStep("form");
      return;
    }
    const result = await tx.run(() =>
      submitWork(wallet.writeClient, {
        milestoneId,
        deployedUrl: deployedUrl.trim(),
        repositoryUrl: repositoryUrl.trim(),
        evidenceUrls: evidenceUrls.map((u) => u.trim()).filter(Boolean),
        description: description.trim(),
      }),
    );
    if (result?.txHash) {
      if (wallet.address) {
        recordActivity(wallet.address, { txHash: result.txHash, action: "submitWork", milestoneId });
      }
      const copy = describeAction("submitWork");
      toast.push({ title: copy.title, description: copy.description, tone: "success" });
      milestone.refetch();
      router.push(`/milestones/${milestoneId}`);
    }
  }

  const canSubmitTx = wallet.status === "CONNECTED" && !!eligibility?.eligible;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Milestone #{milestoneId}</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">
        {eligibility?.isResubmission ? "Update Your Submission" : "Submit Work"}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Provide evidence that GenLayer will evaluate against this milestone&rsquo;s original, immutable
        requirements.
      </p>
      <div className="mt-4">
        <WalletStatus />
      </div>

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

      {data && eligibility && !eligibility.eligible && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">You can&rsquo;t submit work here right now.</p>
          <p className="mt-1">{eligibility.reason}</p>
          <Link href={`/milestones/${milestoneId}`} className="mt-2 inline-block text-xs font-medium underline">
            Back to milestone detail
          </Link>
        </div>
      )}

      {data && eligibility?.eligible && (
        <>
          {eligibility.deadlinePassed && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              This milestone&rsquo;s deadline has already passed. The contract does not block a late submission,
              but the client may choose to cancel this milestone once it&rsquo;s past its deadline — see
              docs/contracts.md &ldquo;Deadline &amp; Timeout Handling&rdquo;.
            </div>
          )}
          {eligibility.isResubmission && (
            <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
              You already have a submission for this milestone. Submitting again replaces it entirely — this is
              the contract&rsquo;s real resubmission mechanism (allowed any number of times until evaluation
              starts), not a new, separate record. See docs/evaluation.md &ldquo;Submission Immutability&rdquo;.
            </div>
          )}

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Original Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-medium text-amber-800">
                These requirements were agreed when this milestone was funded and cannot be changed. GenLayer
                evaluates your evidence against exactly these — not against anything typed here.
              </p>
              <ul className="space-y-2">
                {data.requirements.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 text-sm text-slate-700">
                    <span aria-hidden="true">☐</span>
                    <span className="flex-1">{r.description}</span>
                    <span className="shrink-0 font-medium text-slate-500">{r.weight}%</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {step === "form" ? (
            <form onSubmit={handleContinueToReview} className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Evidence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    id="deployedUrl"
                    label="Deployed website URL"
                    value={deployedUrl}
                    onChange={(e) => setDeployedUrl(e.target.value)}
                    placeholder="https://your-demo.example"
                    hint="A live, publicly reachable URL GenLayer's evaluator can fetch. Required if you don't provide a repository URL."
                  />
                  <Input
                    id="repositoryUrl"
                    label="Repository URL"
                    value={repositoryUrl}
                    onChange={(e) => setRepositoryUrl(e.target.value)}
                    placeholder="https://github.com/you/project"
                    hint="A public repository URL (GitHub or similar). Required if you don't provide a deployed URL."
                  />

                  <div>
                    <p className="mb-1.5 text-sm font-medium text-slate-700">Evidence URLs (optional)</p>
                    <p className="mb-2 text-xs text-slate-500">
                      Additional public links — a live demo, documentation, hosted screenshots, a design file,
                      or test results. Up to {MAX_EVIDENCE_ITEMS}. Only URLs are stored on-chain — see
                      docs/evaluation.md &ldquo;Submission Storage&rdquo; for why raw files aren&rsquo;t.
                    </p>
                    <div className="space-y-2">
                      {evidenceUrls.map((url, i) => (
                        <div key={i} className="flex gap-2">
                          <Input
                            id={`evidence-${i}`}
                            aria-label={`Evidence URL ${i + 1}`}
                            value={url}
                            onChange={(e) => updateEvidenceUrl(i, e.target.value)}
                            placeholder="https://…"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label={`Remove evidence URL ${i + 1}`}
                            onClick={() => removeEvidenceUrl(i)}
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                    {evidenceUrls.length < MAX_EVIDENCE_ITEMS && (
                      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addEvidenceUrl}>
                        + Add evidence URL
                      </Button>
                    )}
                  </div>

                  <Textarea
                    id="description"
                    label="Notes for the evaluator (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Anything the evaluator should know that isn't obvious from the URLs above."
                    hint="These are your own notes, not new requirements — GenLayer still evaluates only the original requirements above."
                  />
                  <p className="text-xs text-slate-500">
                    File uploads (screenshots, PDFs, source archives) aren&rsquo;t part of this MVP&rsquo;s storage
                    architecture — see docs/evaluation.md &ldquo;Submission Storage&rdquo;. Use a public URL
                    instead (e.g. an image host or a repository).
                  </p>
                </CardContent>
              </Card>

              {formError && (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {formError}
                </p>
              )}
              <div className="mt-4 flex items-center gap-3">
                <Button type="submit" size="lg">
                  Review Submission
                </Button>
                <Link href={`/milestones/${milestoneId}`}>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </Link>
              </div>
            </form>
          ) : (
            <div className="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Submission Review</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <ReviewField label="Milestone" value={data.title} />
                  <ReviewField label="Freelancer" value={wallet.shortAddress ?? wallet.address ?? "—"} mono />
                  <ReviewField label="Requirements" value={`${data.requirements.length}`} />
                  <ReviewField
                    label="Evidence"
                    value={`${evidenceUrls.filter((u) => u.trim()).length} URL(s)`}
                  />
                  <ReviewField label="Repository" value={repositoryUrl.trim() || "(none provided)"} />
                  <ReviewField label="Deployment" value={deployedUrl.trim() || "(none provided)"} />
                </CardContent>
              </Card>

              <TransactionStatusBanner status={tx.status} hash={tx.hash} error={tx.error} />

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="lg"
                  isLoading={tx.isPending}
                  disabled={!canSubmitTx || tx.isPending}
                  onClick={handleConfirmSubmit}
                >
                  Submit Work
                </Button>
                <Button type="button" variant="ghost" disabled={tx.isPending} onClick={() => setStep("form")}>
                  Back to edit
                </Button>
              </div>
              {!canSubmitTx && (
                <p className="text-xs text-slate-500">
                  {wallet.status === "WRONG_NETWORK"
                    ? `Switch to ${wallet.expectedNetworkName} to submit this transaction.`
                    : "Connect the assigned freelancer's wallet to submit this transaction."}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReviewField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-xs font-medium text-slate-500">{label}</dt>
      <dd className={`text-right text-slate-900 ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</dd>
    </div>
  );
}
