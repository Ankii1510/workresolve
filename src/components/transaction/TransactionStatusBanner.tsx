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
  const tone = status === "SUCCESS" ? "success" : status === "FAILED" ? "danger" : "neutral";

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
        <p className="font-medium">{STATUS_COPY[status]}</p>
        {status === "FAILED" && error && <p className="mt-0.5 break-words">{error.message}</p>}
        {hash && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs break-all opacity-75">tx: {hash}</p>
            <ExplorerLink />
          </div>
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
