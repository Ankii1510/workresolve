"use client";

/**
 * Minimal read-hook pattern for contract view calls (docs/architecture.md
 * section 13). Wraps any async read (the real `readContract` calls in
 * lib/genlayer/milestone.ts, Phase 4 onward) in the conventional
 * { data, isLoading, error, refetch } shape.
 *
 * `isLoading` is derived by comparing the current request's key (a
 * serialization of `deps` plus a refetch counter) against the key of the
 * last-resolved result, rather than by calling setState synchronously at
 * the top of the effect body — that keeps every state update confined to
 * the async fetch's resolution, which is what
 * react-hooks/set-state-in-effect expects, without losing accurate loading
 * state across both a deps change and a manual refetch().
 *
 * Architecture note (documented, not silent — see docs/architecture.md
 * "Phase 3 implementation notes"): Phase 2 suggested React Query for this.
 * Phase 3's instructions explicitly say not to install unnecessary
 * libraries, and there is no real caching/dedup problem to solve yet since
 * every read currently throws NotImplementedError. This hand-rolled hook
 * covers the actual current need; adopting React Query remains a
 * documented SHOULD-HAVE once there are enough real, concurrent contract
 * reads (dashboard lists, polling after a tx) to justify it.
 */
import { useCallback, useEffect, useState } from "react";
import { toAppError } from "@/lib/utils/errors";
import type { AppError } from "@/types";

interface UseContractReadResult<T> {
  data: T | null;
  isLoading: boolean;
  error: AppError | null;
  refetch: () => void;
}

interface ResolvedResult<T> {
  key: string;
  data: T | null;
  error: AppError | null;
}

export function useContractRead<T>(fetcher: () => Promise<T>, deps: unknown[]): UseContractReadResult<T> {
  const [tick, setTick] = useState(0);
  const requestKey = `${JSON.stringify(deps)}::${tick}`;

  const [resolved, setResolved] = useState<ResolvedResult<T>>({ key: "", data: null, error: null });

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    fetcher()
      .then((data) => {
        if (!cancelled) setResolved({ key: requestKey, data, error: null });
      })
      .catch((err) => {
        if (!cancelled) setResolved({ key: requestKey, data: null, error: toAppError(err) });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return {
    data: resolved.data,
    error: resolved.error,
    isLoading: resolved.key !== requestKey,
    refetch,
  };
}
