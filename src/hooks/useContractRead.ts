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

export interface UseContractReadOptions {
  /**
   * Skip the read entirely when false (default true).
   *
   * REAL BUG THIS FIXES (found live on Studio, 2026-09-11): the milestone
   * detail page called `get_submission` for every milestone regardless of its
   * state. A FUNDED milestone cannot have a submission — work has not been
   * submitted yet — so the contract correctly raised
   * `ValueError("No submission exists yet for milestone 1.")`, and the page
   * rendered that expected, entirely normal situation as a red error box with
   * a "Try again" button, on a milestone where everything had in fact worked.
   *
   * Asking the chain for something that provably cannot exist, then trying to
   * recognize the resulting failure by pattern-matching its message, is the
   * fragile way round: the message arrives wrapped by genlayer-js and viem
   * (the user saw only viem's generic "Missing or invalid parameters"), so
   * the recognition breaks whenever any layer rewords it. The milestone's own
   * state already answers the question locally and for free, so the read is
   * simply not made.
   */
  enabled?: boolean;
}

interface ResolvedResult<T> {
  key: string;
  data: T | null;
  error: AppError | null;
}

export function useContractRead<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  options?: UseContractReadOptions,
): UseContractReadResult<T> {
  const enabled = options?.enabled ?? true;
  const [tick, setTick] = useState(0);
  // `enabled` is part of the key so flipping it re-runs the effect (and so a
  // disabled read never reports the previous enabled read's key as current).
  const requestKey = `${JSON.stringify(deps)}::${tick}::${enabled}`;

  const [resolved, setResolved] = useState<ResolvedResult<T>>({ key: "", data: null, error: null });

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
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

  // A disabled read reports the honest empty state — no data, no error, and
  // NOT loading. Deriving it here (rather than writing state from the effect)
  // keeps the no-setState-in-effect property this hook was built around, and
  // guarantees a previously-enabled read's data can never leak through after
  // it is switched off.
  return {
    data: enabled ? resolved.data : null,
    error: enabled ? resolved.error : null,
    isLoading: enabled && resolved.key !== requestKey,
    refetch,
  };
}
