import { Badge } from "./Badge";
import type { MilestoneState, RequirementStatus, TransactionStatus } from "@/types";

const milestoneToneMap: Record<MilestoneState, "neutral" | "info" | "success" | "warning" | "danger"> = {
  CREATED: "neutral",
  FUNDED: "info",
  ACCEPTED: "info",
  SUBMITTED: "info",
  EVALUATING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  RELEASED: "success",
  REFUNDED: "warning",
  CANCELLED: "neutral",
};

export function MilestoneStateBadge({ state }: { state: MilestoneState }) {
  return <Badge tone={milestoneToneMap[state]}>{formatLabel(state)}</Badge>;
}

const requirementToneMap: Record<RequirementStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  PASS: "success",
  FAIL: "danger",
  PARTIAL: "warning",
  UNVERIFIABLE: "neutral",
};

export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  return <Badge tone={requirementToneMap[status]}>{formatLabel(status)}</Badge>;
}

const transactionToneMap: Record<TransactionStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  IDLE: "neutral",
  WAITING_FOR_SIGNATURE: "info",
  SUBMITTING: "info",
  CONFIRMING: "warning",
  SUCCESS: "success",
  FAILED: "danger",
};

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  return <Badge tone={transactionToneMap[status]}>{formatLabel(status)}</Badge>;
}

function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}
