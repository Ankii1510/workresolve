import { describe, expect, it } from "vitest";
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
