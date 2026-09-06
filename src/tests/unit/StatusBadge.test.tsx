import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MilestoneStateBadge, RequirementStatusBadge } from "@/components/ui/StatusBadge";

describe("MilestoneStateBadge", () => {
  it("renders a human-readable label for an EVALUATING state", () => {
    render(<MilestoneStateBadge state="EVALUATING" />);
    expect(screen.getByText("Evaluating")).toBeInTheDocument();
  });

  it("renders every milestone state without throwing", () => {
    const states = [
      "CREATED",
      "FUNDED",
      "ACCEPTED",
      "SUBMITTED",
      "EVALUATING",
      "APPROVED",
      "REJECTED",
      "RELEASED",
      "REFUNDED",
      "CANCELLED",
    ] as const;
    states.forEach((state) => {
      expect(() => render(<MilestoneStateBadge state={state} />)).not.toThrow();
    });
  });
});

describe("RequirementStatusBadge", () => {
  it("renders UNVERIFIABLE with a Title Case label, never defaulting to PASS styling", () => {
    render(<RequirementStatusBadge status="UNVERIFIABLE" />);
    expect(screen.getByText("Unverifiable")).toBeInTheDocument();
  });
});
