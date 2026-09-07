import Link from "next/link";
import { Spinner } from "@/components/ui/Spinner";
import { getExplorer, getNetworkName } from "@/lib/genlayer/explorer";
import type { AppError, TransactionStatus } from "@/types";

const STATUS_COPY: Record<TransactionStatus, string> = {
  IDLE: "",
  WAITING_FOR_SIGNATURE: "Waiting for signature in your wallet…",
  SUBMITTING: "Submitting transaction…",
  CONFIRMING: "Confirming on GenLayer…",
  SUCCESS: "Transaction confirmed.",
  FAILED: "Transaction failed.",
};

/** A client-side timeout waiting for GenLayer's FINALIZED status is not
 * evidence the transaction failed — see lib/genlayer/transactions.ts's
 * WAIT_FOR_RECEIPT_* constants and errors.ts's TRANSACTION_TIMEOUT code.
 * useTransaction still reports this as status "FAILED" (it genuinely
 * doesn't know the outcome), but this banner must not tell the user their
 * transaction failed when it may well still finalize — that's exactly the
 * kind of false alarm that risks a panicked, uncertain re-submission this
 * project's own transaction-safety rules (docs/security.md, "never
 * auto-resend uncertain transactions") exist to prevent.
 *
 * A real, on-chain FAILED result (a genuine ContractRevertError — the
 * contract actually finished executing and rejected the call) is different
 * and is NOT covered by this: that means nothing was created/changed, and
 * the "Transaction failed." heading + red styling is correct for it. This
 * flag exists to separate the two cases, not to soften every failure. */
function isUnresolvedTimeout(status: TransactionStatus, error: AppError | null): boolean {
  return status === "FAILED" && error?.code === "TRANSACTION_TIMEOUT";
}

export interface TransactionContext {
  /** Human label for what this transaction does, e.g. "Fund Escrow". */
  action: string;
  /** Formatted amount + symbol, e.g. "100 GEN" — omit for actions that move no value. */
  amount?: string;
  /** The signing wallet's short address, e.g. "0x1234…abcd". */
  wallet?: string | null;
}

/**
 * Reusable transaction status UI, driven by useTransaction() (see
 * docs/architecture.md section 13). Every write action — funding,
 * accepting, submitting, evaluating, release, refund — renders its status
 * through this one component so the "did my transaction happen?" question
 * always has the same clear answer.
 *
 * Phase 7 "Transaction Modal": this stays an inline panel rather than a
 * floating dialog — every write flow in this app already funnels through a
 * full review step (Review Milestone / Submission Review / the fund-escrow
 * confirm card) before a transaction is even started, so a second modal
 * layer on top would duplicate that review UI rather than add safety. The
 * optional `context` prop instead adds the modal's requested content
 * (action, network, amount, wallet) as a compact header on the same panel,
 * so every write surfaces the same fields in the same place. Never renders
 * SUCCESS before `status` says so — that discipline lives in
 * useTransaction(), not here.
 */
export function TransactionStatusBanner({
  status,
  hash,
  error,
  context,
}: {
  status: TransactionStatus;
  hash: string | null;
  error: AppError | null;
  context?: TransactionContext;
}) {
  if (status === "IDLE") return null;

  const isPending = status === "WAITING_FOR_SIGNATURE" || status === "SUBMITTING" || status === "CONFIRMING";
  const unresolvedTimeout = isUnresolvedTimeout(status, error);
  const tone = status === "SUCCESS" ? "success" : status === "FAILED" && !unresolvedTimeout ? "danger" : "neutral";

  const toneClasses = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    danger: "border-red-200 bg-red-50 text-red-800",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  } as const;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${toneClasses[tone]}`}
      role="status"
    >
      {isPending && <Spinner size="sm" className="mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1">
        {context && (
          <dl className="mb-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs opacity-75 sm:grid-cols-4">
            <Item label="Action" value={context.action} />
            <Item label="Network" value={getNetworkName()} />
            {context.amount && <Item label="Amount" value={context.amount} />}
            {context.wallet && <Item label="Wallet" value={context.wallet} />}
          </dl>
        )}
        <p className="font-medium">
          {unresolvedTimeout ? "Still confirming — didn't hear back in time." : STATUS_COPY[status]}
        </p>
        {status === "FAILED" && error && <p className="mt-0.5 break-words">{error.message}</p>}
        {hash && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs break-all opacity-75">tx: {hash}</p>
            <ExplorerLink />
          </div>
        )}
        {unresolvedTimeout && hash && (
          <p className="mt-1 text-xs opacity-75">
            This app stopped checking, but the transaction itself may still be processing on GenLayer
            — check its status on the explorer above before assuming it needs to be redone. If it
            does succeed, it will appear automatically on your{" "}
            <Link href="/dashboard" className="font-medium underline underline-offset-2">
              Dashboard
            </Link>{" "}
            next time you open or refresh it — the dashboard always reads the current on-chain state,
            not a cached copy, so nothing further needs to be done here to make it show up.
          </p>
        )}
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline font-medium">{label}: </dt>
      <dd className="inline">{value}</dd>
    </div>
  );
}

/**
 * Links to the connected network's block explorer — its base URL is read
 * directly from `chain.blockExplorers.default` (genlayer-js's own chain
 * definition, inspected in node_modules/genlayer-js), never invented. The
 * exact per-transaction URL path (e.g. "/tx/<hash>") was not confirmed
 * against a live explorer instance in this environment (see
 * docs/contracts.md "Known Limitations"), so this links to the explorer's
 * base URL with the hash shown as text to search, rather than guessing a
 * deep-link path that might 404.
 */
export function ExplorerLink({ className }: { className?: string }) {
  const explorer = getExplorer();
  if (!explorer) return null;
  return (
    <a
      href={explorer.baseUrl}
      target="_blank"
      rel="noreferrer noopener"
      className={
        className ?? "text-xs font-medium underline underline-offset-2 opacity-75 hover:opacity-100"
      }
    >
      View on {explorer.name} ↗
    </a>
  );
}
