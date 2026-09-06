import { describe, expect, it } from "vitest";
import { DUE_SOON_WINDOW_SECONDS, describeDeadline } from "@/lib/genlayer/deadline";

describe("describeDeadline", () => {
  const NOW_MS = new Date("2026-09-01T00:00:00Z").getTime();

  it("is 'normal' with no label for a deadline well in the future", () => {
    const deadlineUnix = Math.floor(NOW_MS / 1000) + DUE_SOON_WINDOW_SECONDS * 10;
    const result = describeDeadline(deadlineUnix, NOW_MS);
    expect(result.tone).toBe("normal");
    expect(result.label).toBe("");
  });

  it("is 'soon' with a 'Due soon' label just inside the due-soon window", () => {
    const deadlineUnix = Math.floor(NOW_MS / 1000) + DUE_SOON_WINDOW_SECONDS - 60;
    const result = describeDeadline(deadlineUnix, NOW_MS);
    expect(result.tone).toBe("soon");
    expect(result.label).toBe("Due soon");
  });

  it("is 'normal' just outside the due-soon window", () => {
    const deadlineUnix = Math.floor(NOW_MS / 1000) + DUE_SOON_WINDOW_SECONDS + 60;
    const result = describeDeadline(deadlineUnix, NOW_MS);
    expect(result.tone).toBe("normal");
  });

  it("is 'passed' with a 'Deadline passed' label once the deadline is behind now", () => {
    const deadlineUnix = Math.floor(NOW_MS / 1000) - 60;
    const result = describeDeadline(deadlineUnix, NOW_MS);
    expect(result.tone).toBe("passed");
    expect(result.label).toBe("Deadline passed");
  });

  it("treats a deadline exactly at now as passed (boundary)", () => {
    const deadlineUnix = Math.floor(NOW_MS / 1000);
    const result = describeDeadline(deadlineUnix, NOW_MS);
    expect(result.tone).toBe("passed");
  });

  it("formats the date as a readable long-form string", () => {
    const deadlineUnix = Math.floor(new Date("2026-09-12T00:00:00Z").getTime() / 1000);
    const result = describeDeadline(deadlineUnix, NOW_MS);
    expect(result.formatted).toMatch(/September/);
    expect(result.formatted).toMatch(/2026/);
  });
});
