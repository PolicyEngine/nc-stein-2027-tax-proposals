import {
  QueryClient,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  api,
  HouseholdCalculationError,
  householdCalculationPauseRemaining,
  onHouseholdCalculationPause,
  pauseHouseholdCalculations,
  shouldRetryHouseholdCalculation,
} from "@/lib/api";
import { HouseholdRequest, HouseholdImpactResponse } from "@/lib/types";

export { householdCalculationPauseRemaining, pauseHouseholdCalculations };

const HOUSEHOLD_IMPACT_KEY = "householdImpact";

function householdImpactQueryKey(request: HouseholdRequest | null) {
  return [HOUSEHOLD_IMPACT_KEY, request];
}

/**
 * Whole seconds until the page may calculate again after a refusal for the
 * firewall's limit, 0 when it may now. Counts down once a second during a
 * pause.
 */
export function useHouseholdCalculationPause(): number {
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    Math.ceil(householdCalculationPauseRemaining() / 1000)
  );
  useEffect(() => {
    let countdown: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      const seconds = Math.ceil(householdCalculationPauseRemaining() / 1000);
      setSecondsRemaining(seconds);
      if (seconds > 0 && countdown === undefined) {
        countdown = setInterval(update, 1000);
      } else if (seconds === 0 && countdown !== undefined) {
        clearInterval(countdown);
        countdown = undefined;
      }
    };
    update();
    const unsubscribe = onHouseholdCalculationPause(update);
    return () => {
      unsubscribe();
      if (countdown !== undefined) {
        clearInterval(countdown);
      }
    };
  }, []);
  return secondsRemaining;
}

/**
 * Clears a failed calculation of this household, so that submitting the
 * same household again runs it again instead of showing the stored failure.
 * A calculation that succeeded stays cached.
 */
export function resetFailedHouseholdImpact(
  queryClient: QueryClient,
  request: HouseholdRequest
): Promise<void> {
  const filters = { queryKey: householdImpactQueryKey(request), exact: true };
  // Check the status first: resetQueries applies its filters again when it
  // refetches, and by then the reset query no longer counts as failed.
  if (queryClient.getQueryCache().find(filters)?.state.status !== "error") {
    return Promise.resolve();
  }
  // Resets the query and, while the page shows it, fetches it again.
  return queryClient.resetQueries(filters);
}

/**
 * Submits a household for calculation. Every control that submits one goes
 * through this, so a failed calculation of the same household runs again,
 * while one that succeeded is shown from the cache. Submits nothing, and
 * returns false, while calculations are paused after a refusal for the
 * firewall's limit.
 */
export function submitHouseholdRequest(
  queryClient: QueryClient,
  request: HouseholdRequest,
  setSubmittedRequest: (request: HouseholdRequest) => void
): boolean {
  if (householdCalculationPauseRemaining() > 0) {
    return false;
  }
  void resetFailedHouseholdImpact(queryClient, request);
  setSubmittedRequest(request);
  return true;
}

export function householdImpactQueryOptions(
  request: HouseholdRequest | null,
  enabled: boolean
) {
  return queryOptions<HouseholdImpactResponse, Error>({
    queryKey: householdImpactQueryKey(request),
    queryFn: () => api.calculateHouseholdImpact(request!),
    enabled: enabled && request !== null,
    // Retry only brief gateway failures: a rate-limited calculation would be
    // refused again until the firewall's one-minute window ends.
    retry: shouldRetryHouseholdCalculation,
    // A household's answer does not change, so the page keeps every answer
    // and calculates a household only when it is submitted: never when an
    // answer gets old, the window regains focus, the network reconnects, or
    // the page shows a failed household again.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retryOnMount: false,
  });
}

/** A household whose answer the page showed. */
interface ShownHouseholdAnswer {
  request: HouseholdRequest;
  /**
   * The answer itself when it was a precomputed example household's, which
   * is not in the query cache.
   */
  precomputedAnswer?: HouseholdImpactResponse;
}

/**
 * The household whose answer each query client's page showed last. After a
 * refusal for the firewall's limit, that answer is shown again.
 */
const shownHouseholdAnswers = new WeakMap<QueryClient, ShownHouseholdAnswer>();

/**
 * Records that the page shows `request`'s answer: its calculated answer in
 * the query cache, or `precomputedAnswer` for an example household. Null
 * forgets it.
 */
export function rememberShownHouseholdRequest(
  queryClient: QueryClient,
  request: HouseholdRequest | null,
  precomputedAnswer?: HouseholdImpactResponse
): void {
  if (request === null) {
    shownHouseholdAnswers.delete(queryClient);
  } else {
    shownHouseholdAnswers.set(queryClient, { request, precomputedAnswer });
  }
}

/** What the results area shows. */
export interface HouseholdImpactToShow {
  data: HouseholdImpactResponse | undefined;
  /** The household whose answer `data` is. */
  shownRequest: HouseholdRequest | null;
  isLoading: boolean;
  /** A failure to show in place of the results. */
  error: Error | null;
  /**
   * Set when the submitted household was refused for the firewall's limit
   * and `data` is the answer the page showed before: why, to show above it.
   */
  rateLimitNotice: string | null;
}

/**
 * After a refusal for the firewall's limit, the answer the page showed
 * before, calculated or a precomputed example, stays on screen with the
 * reason; any other failure, or a refusal with nothing shown before, is
 * shown in place of the results.
 */
export function householdImpactToShow(
  queryClient: QueryClient,
  request: HouseholdRequest | null,
  current: {
    data: HouseholdImpactResponse | undefined;
    error: Error | null;
    isLoading: boolean;
  }
): HouseholdImpactToShow {
  if (
    current.error instanceof HouseholdCalculationError &&
    current.error.rateLimited
  ) {
    const shown = shownHouseholdAnswers.get(queryClient);
    const shownAnswer =
      shown === undefined
        ? undefined
        : shown.precomputedAnswer ??
          queryClient.getQueryData<HouseholdImpactResponse>(
            householdImpactQueryKey(shown.request)
          );
    if (shown !== undefined && shownAnswer !== undefined) {
      return {
        data: shownAnswer,
        shownRequest: shown.request,
        isLoading: false,
        error: null,
        rateLimitNotice: current.error.message,
      };
    }
  }
  return {
    data: current.data,
    shownRequest: request,
    isLoading: current.isLoading,
    error: current.error,
    rateLimitNotice: null,
  };
}

/**
 * What the results area shows for `request`. With `precomputed`, an example
 * household's answer, that answer is shown and nothing is calculated.
 */
export function useHouseholdImpact(
  request: HouseholdRequest | null,
  enabled: boolean,
  precomputed: HouseholdImpactResponse | null = null
): HouseholdImpactToShow {
  const queryClient = useQueryClient();
  const query = useQuery(
    householdImpactQueryOptions(request, enabled && precomputed === null)
  );
  const calculatedData = query.data;
  useEffect(() => {
    // The page now shows this household's own answer.
    if (!enabled || request === null) {
      return;
    }
    if (precomputed !== null) {
      rememberShownHouseholdRequest(queryClient, request, precomputed);
    } else if (calculatedData !== undefined) {
      rememberShownHouseholdRequest(queryClient, request);
    }
  }, [queryClient, request, enabled, precomputed, calculatedData]);
  if (precomputed !== null) {
    return {
      data: precomputed,
      shownRequest: request,
      isLoading: false,
      error: null,
      rateLimitNotice: null,
    };
  }
  return householdImpactToShow(queryClient, request, query);
}
