import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useContractRead } from "@/hooks/useContractRead";

describe("useContractRead", () => {
  it("starts in a loading state and resolves to the fetched data", async () => {
    const { result } = renderHook(() => useContractRead(() => Promise.resolve("hello"), []));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBe("hello");
    expect(result.current.error).toBeNull();
  });

  it("surfaces a rejected fetch as a classified error, not a thrown exception", async () => {
    const { result } = renderHook(() =>
      useContractRead<string>(() => Promise.reject(new Error("Milestone 999 does not exist.")), []),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toContain("does not exist");
  });

  it("re-enters a loading state and refetches when deps change", async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useContractRead(() => Promise.resolve(`data-for-${id}`), [id]),
      { initialProps: { id: "1" } },
    );
    await waitFor(() => expect(result.current.data).toBe("data-for-1"));

    rerender({ id: "2" });
    await waitFor(() => expect(result.current.data).toBe("data-for-2"));
  });
});

/**
 * The `enabled` option, added 2026-09-11. It is what stops the milestone
 * detail page asking the chain for a submission that provably cannot exist
 * yet — the read that turned a healthy, successfully funded FUNDED milestone
 * into a red "Missing or invalid parameters / Try again" box. See
 * UseContractReadOptions' docstring in src/hooks/useContractRead.ts.
 */
describe("useContractRead — enabled", () => {
  it("does not call the fetcher at all when disabled, and reports an honest empty state", () => {
    const fetcher = vi.fn().mockResolvedValue("data");
    const { result } = renderHook(() => useContractRead(fetcher, ["k"], { enabled: false }));

    expect(fetcher).not.toHaveBeenCalled();
    // Critically NOT loading: a skipped read that claims to be loading leaves
    // a permanent spinner, which is just a quieter version of the same bug.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("starts fetching once it becomes enabled — the real sequence when the milestone loads", async () => {
    const fetcher = vi.fn().mockResolvedValue("late");
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useContractRead(fetcher, ["k"], { enabled }),
      { initialProps: { enabled: false } },
    );

    expect(fetcher).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toBe("late"));
  });

  it("hides an earlier result once it is switched off, rather than leaking stale data", async () => {
    const fetcher = vi.fn().mockResolvedValue("stale");
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useContractRead(fetcher, ["k"], { enabled }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(result.current.data).toBe("stale"));
    rerender({ enabled: false });
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });
});
