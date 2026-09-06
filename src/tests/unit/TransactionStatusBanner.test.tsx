import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransactionStatusBanner } from "@/components/transaction/TransactionStatusBanner";
import type { AppError } from "@/types";

/**
 * Regression coverage for the "Transaction failed" false-alarm bug: a
 * client-side timeout waiting for GenLayer's FINALIZED status (see
 * lib/genlayer/transactions.ts) is not evidence the transaction actually
 * failed — GenLayer's own explorer can still show it processing well after
 * this app gives up checking. Telling the user "failed" here risks a
 * panicked, uncertain re-submission (docs/security.md: "never auto-resend
 * uncertain transactions"), so a TRANSACTION_TIMEOUT error must render
 * distinctly from a real failure, even though useTransaction reports both
 * as status "FAILED".
 */
describe("TransactionStatusBanner", () => {
  it("does not say 'Transaction failed' for a TRANSACTION_TIMEOUT error", () => {
    const timeoutError: AppError = {
      code: "TRANSACTION_TIMEOUT",
      message: "The transaction is taking longer than expected to confirm. It may still complete — check back shortly.",
    };
    render(<TransactionStatusBanner status="FAILED" hash="0xabc123" error={timeoutError} />);

    expect(screen.queryByText("Transaction failed.")).not.toBeInTheDocument();
    expect(screen.getByText(/still confirming/i)).toBeInTheDocument();
    expect(screen.getByText(/may still be processing on genlayer/i)).toBeInTheDocument();
  });

  it("still says 'Transaction failed' for a real, non-timeout error", () => {
    const revertError: AppError = { code: "CONTRACT_ERROR", message: "Milestone is not in the FUNDED state." };
    render(<TransactionStatusBanner status="FAILED" hash={null} error={revertError} />);

    expect(screen.getByText("Transaction failed.")).toBeInTheDocument();
    expect(screen.getByText("Milestone is not in the FUNDED state.")).toBeInTheDocument();
  });

  it("renders nothing for IDLE", () => {
    const { container } = render(<TransactionStatusBanner status="IDLE" hash={null} error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
