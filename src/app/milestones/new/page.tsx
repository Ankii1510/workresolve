"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { useTransaction } from "@/hooks/useTransaction";
import { createMilestone, NATIVE_TOKEN_SYMBOL } from "@/lib/genlayer/milestone";
import { validateMilestoneForm } from "@/lib/genlayer/milestoneForm";
import { recordActivity } from "@/lib/activity";
import { describeAction } from "@/lib/notifications";
import { useToast } from "@/components/ui/Toast";
import { WalletStatus } from "@/components/wallet/WalletStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TransactionStatusBanner } from "@/components/transaction/TransactionStatusBanner";
import type { RequirementInput } from "@/types";

let nextLocalId = 1;

function emptyRequirement(): RequirementInput & { localId: number } {
  return { localId: nextLocalId++, description: "", weight: 20 };
}

const DEFAULT_APPROVAL_THRESHOLD = 70;

export default function CreateMilestonePage() {
  const wallet = useWallet();
  const router = useRouter();
  const toast = useToast();
  const tx = useTransaction<{ txHash: string; milestoneId?: string }>("createMilestone");

  const [step, setStep] = useState<"form" | "review">("form");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [freelancer, setFreelancer] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [approvalThreshold, setApprovalThreshold] = useState(String(DEFAULT_APPROVAL_THRESHOLD));
  const [requirements, setRequirements] = useState<(RequirementInput & { localId: number })[]>([
    emptyRequirement(),
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  const totalWeight = requirements.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);

  function updateRequirement(localId: number, patch: Partial<RequirementInput>) {
    setRequirements((current) => current.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  }

  function addRequirement() {
    setRequirements((current) => [...current, emptyRequirement()]);
  }

  function removeRequirement(localId: number) {
    setRequirements((current) =>
      current.length > 1 ? current.filter((r) => r.localId !== localId) : current,
    );
  }

  /** Delegates to the pure, unit-tested validator in
   * lib/genlayer/milestoneForm.ts — this is UX-only validation. The
   * contract re-validates everything itself (create_milestone in
   * contracts/workresolve.py); frontend validation never substitutes for
   * that — see docs/frontend.md "Security". */
  function validate(): string | null {
    return validateMilestoneForm({
      title,
      description,
      freelancer,
      clientAddress: wallet.address,
      amount,
      deadlineIsoLocal: deadline,
      approvalThreshold,
      requirements: requirements.map((r) => ({ description: r.description, weight: Number(r.weight) })),
    });
  }

  function handleContinueToReview(e: FormEvent) {
    e.preventDefault();
    const error = validate();
    setFormError(error);
    if (!error) setStep("review");
  }

  async function handleConfirmCreate() {
    const error = validate();
    if (error) {
      setFormError(error);
      setStep("form");
      return;
    }
    const result = await tx.run(async () => {
      const { txHash, milestoneId } = await createMilestone(wallet.writeClient, {
        freelancer: freelancer.trim(),
        title: title.trim(),
        description: description.trim(),
        requirementDescriptions: requirements.map((r) => r.description.trim()),
        requirementWeights: requirements.map((r) => Number(r.weight)),
        amount: amount.trim(),
        deadline: Math.floor(new Date(deadline).getTime() / 1000),
        approvalThreshold: Number(approvalThreshold),
      });
      return { txHash, milestoneId: milestoneId ?? undefined };
    });
    if (result?.txHash) {
      if (wallet.address) {
        recordActivity(wallet.address, {
          txHash: result.txHash,
          action: "createMilestone",
          milestoneId: result.milestoneId ?? "unknown",
        });
      }
      const copy = describeAction("createMilestone");
      toast.push({ title: copy.title, description: copy.description, tone: "success" });
      // Real navigation only fires after a confirmed transaction — see
      // docs/frontend.md "Optimistic UI". If the new milestone's id
      // couldn't be resolved (best-effort lookup, see milestone.ts), send
      // the user to the dashboard instead of guessing an id in the URL.
      router.push(result.milestoneId ? `/milestones/${result.milestoneId}` : "/dashboard");
    }
  }

  const canSubmit = wallet.status === "CONNECTED";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold text-slate-900">Create Milestone</h1>
      <p className="mt-1 text-sm text-slate-600">
        Define the work, the payment, and the requirements GenLayer will evaluate against.
      </p>
      <div className="mt-4">
        <WalletStatus />
      </div>

      {step === "form" ? (
        <form onSubmit={handleContinueToReview} className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Project details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                id="title"
                label="Project title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Restaurant Landing Page"
              />
              <Textarea
                id="description"
                label="Description"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short description of the work being commissioned."
              />
              <Input
                id="freelancer"
                label="Freelancer wallet address"
                required
                value={freelancer}
                onChange={(e) => setFreelancer(e.target.value)}
                placeholder="0x…"
                hint="A GenLayer wallet address (any EIP-1193 wallet, 0x + 40 hex characters)."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="amount"
                  label={`Payment amount (${NATIVE_TOKEN_SYMBOL})`}
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="100"
                />
                <Input
                  id="deadline"
                  label="Deadline"
                  required
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
              <Input
                id="approvalThreshold"
                label="Approval threshold (%)"
                type="number"
                min={1}
                max={100}
                value={approvalThreshold}
                onChange={(e) => setApprovalThreshold(e.target.value)}
                hint="Minimum weighted score for GenLayer's evaluation to APPROVE this milestone. Defaults to 70%."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Requirements</CardTitle>
              <span
                className={`text-xs font-medium ${totalWeight === 100 ? "text-emerald-600" : "text-amber-600"}`}
              >
                {totalWeight} / 100 weight
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              {requirements.map((req, i) => (
                <div key={req.localId} className="flex flex-wrap gap-2 sm:flex-nowrap">
                  <div className="w-full flex-1 sm:w-auto">
                    <Input
                      id={`req-${req.localId}`}
                      aria-label={`Requirement ${i + 1} description`}
                      value={req.description}
                      onChange={(e) => updateRequirement(req.localId, { description: e.target.value })}
                      placeholder={`Requirement ${i + 1}, e.g. "Website must be responsive"`}
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      id={`req-${req.localId}-weight`}
                      aria-label={`Requirement ${i + 1} weight`}
                      type="number"
                      min={1}
                      max={100}
                      value={req.weight}
                      onChange={(e) => updateRequirement(req.localId, { weight: Number(e.target.value) })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    aria-label={`Remove requirement ${i + 1}`}
                    onClick={() => removeRequirement(req.localId)}
                    disabled={requirements.length === 1}
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addRequirement}>
                + Add requirement
              </Button>
            </CardContent>
          </Card>

          {formError && (
            <p className="text-sm text-red-600" role="alert">
              {formError}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" size="lg">
              Review Milestone
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push("/dashboard")}>
              Cancel
            </Button>
          </div>
          {!wallet.isConnected && (
            <p className="text-xs text-slate-500">Connect your wallet to create a milestone.</p>
          )}
        </form>
      ) : (
        <div className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Review Milestone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <dl className="grid gap-3 sm:grid-cols-2">
                <ReviewField label="Client (you)" value={wallet.shortAddress ?? wallet.address ?? "—"} mono />
                <ReviewField label="Freelancer" value={freelancer.trim()} mono />
                <ReviewField label="Title" value={title.trim()} />
                <ReviewField label="Amount" value={`${amount.trim()} ${NATIVE_TOKEN_SYMBOL}`} />
                <ReviewField label="Deadline" value={new Date(deadline).toLocaleString()} />
                <ReviewField label="Approval threshold" value={`${approvalThreshold}%`} />
              </dl>
              <div>
                <p className="font-medium text-slate-900">Description</p>
                <p className="mt-1 text-slate-600">{description.trim()}</p>
              </div>
              <div>
                <p className="font-medium text-slate-900">Requirements</p>
                <ul className="mt-2 space-y-1">
                  {requirements.map((r) => (
                    <li key={r.localId} className="flex items-center gap-2 text-slate-700">
                      <span className="text-emerald-600">✓</span>
                      {r.description.trim()} — {r.weight}%
                    </li>
                  ))}
                </ul>
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                  These requirements become immutable once this milestone is funded — see docs/contracts.md
                  &ldquo;Requirement Immutability&rdquo;. Double-check them before continuing.
                </div>
              </div>
            </CardContent>
          </Card>

          <TransactionStatusBanner status={tx.status} hash={tx.hash} error={tx.error} />

          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="lg"
              isLoading={tx.isPending}
              disabled={!canSubmit || tx.isPending}
              onClick={handleConfirmCreate}
            >
              Create Milestone
            </Button>
            <Button type="button" variant="ghost" disabled={tx.isPending} onClick={() => setStep("form")}>
              Back to edit
            </Button>
          </div>
          {!canSubmit && (
            <p className="text-xs text-slate-500">
              {wallet.status === "WRONG_NETWORK"
                ? `Switch to ${wallet.expectedNetworkName} to submit this transaction.`
                : "Connect your wallet to submit this transaction."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-slate-900 ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</dd>
    </div>
  );
}
