/**
 * Notification copy for confirmed transactions (Phase 7, section 15/16).
 *
 * WorkResolve's notifications are deliberately simple: an in-app toast
 * (`src/components/ui/Toast.tsx`, already built in an earlier phase but
 * never wired up until now) fired exactly once, at the moment a
 * transaction *this browser* just confirmed. That single rule is what
 * prevents spam without any de-duplication bookkeeping: a page refresh
 * re-reads state but never re-runs a `useTransaction().run()` call, so it
 * can never re-fire a notification for something that already happened.
 * There is no polling-driven "did something change since last time I
 * looked" notifier — GenLayer exposes no confirmed subscription/event
 * mechanism to drive one reliably (see docs/contracts.md "Known
 * Limitations"), and building an aggressive poll loop just to fake one
 * would violate section 16's own "do not poll aggressively" rule. A
 * visitor who didn't trigger a transaction themselves (e.g. someone
 * watching a milestone another wallet is evaluating) sees the same honest
 * gap documented in docs/evaluation.md "Evaluation Status" — refreshing the
 * page is how they see the new state, with no live push notification
 * invented to paper over that.
 */
import type { ContractAction } from "@/types";

export interface ActionCopy {
  title: string;
  description: string;
}

const ACTION_COPY: Record<ContractAction, ActionCopy> = {
  createMilestone: {
    title: "Milestone created",
    description: "Your milestone is live on-chain and ready to be funded.",
  },
  fundMilestone: {
    title: "Milestone funded",
    description: "Escrow is now locked for this milestone.",
  },
  acceptMilestone: {
    title: "Milestone accepted",
    description: "You've accepted this milestone — you can submit work when it's ready.",
  },
  submitWork: {
    title: "Work submitted",
    description: "Your submission is on-chain and ready for GenLayer evaluation.",
  },
  evaluateAndFinalize: {
    title: "Evaluation finalized",
    description: "GenLayer's consensus result is now on-chain.",
  },
  releasePayment: {
    title: "Payment released",
    description: "Escrow has been released to the freelancer.",
  },
  refundClient: {
    title: "Client refunded",
    description: "Escrow has been returned to the client.",
  },
  cancelMilestone: {
    title: "Milestone cancelled",
    description: "This milestone has been cancelled.",
  },
};

export function describeAction(action: ContractAction): ActionCopy {
  return ACTION_COPY[action];
}
