/**
 * Household impact via www.policyengine.org's dashboard API.
 *
 * The page never calls the PolicyEngine Public API itself: the dashboard
 * API's server adds PolicyEngine's credential and forwards each household
 * to the Public API's /us/calculate.
 *
 * For the NC Gov. Stein FY2026-27 Tax Proposals dashboard, two policy
 * overrides are sent: a "baseline" policy encoding the rate-reduction
 * triggers under current NC law (3.49% in 2027, 2.99% in 2028) and a
 * "reform" policy encoding the Stein package (maintain 3.99% rate, raise
 * standard deduction in 2027, enable the 10% EITC match and 30% CDCC
 * match starting 2026). The displayed impact is:
 *
 *   impact = reform (Stein) - baseline (expected current law)
 *
 * so positive values mean the household gains net income under the Stein
 * proposal; negative values mean the household pays more in taxes.
 */

import {
  createPolicyEngineApiClient,
  DEFAULT_BASE_URL,
  PolicyEngineApiError,
  RATE_LIMIT_WAIT_MILLISECONDS,
} from "@policyengine/api-client";

import {
  HouseholdRequest,
  HouseholdImpactResponse,
} from "./types";
import {
  buildBaselinePolicy,
  buildHouseholdSituation,
  buildReformPolicy,
  interpolate,
} from "./household";

const policyengine = createPolicyEngineApiClient();

/** How long a calculation may take before the page gives up on it. */
const CALCULATION_TIMEOUT_MILLISECONDS = 120_000;

/**
 * Statuses after which a household calculation is tried once more, following
 * the errors table of the policyengine-api-access skill. A 502 (the dashboard
 * API could not get its token or reach the Public API), or a 503 from the
 * Public API (it could not check the token), is worth one more try. A 503
 * from the dashboard API itself (its settings are missing) fails the same way
 * on that one retry and is then shown. A 504 is not retried: the dashboard API
 * has already waited 750 s for the household.
 */
const RETRYABLE_STATUSES = new Set([502, 503]);

/** The shortest wait before the one retry of a household calculation. */
const SHORTEST_RETRY_WAIT_MILLISECONDS = 2_000;

/**
 * The longest wait the page retries after. A failure whose Retry-After asks
 * for longer is shown instead.
 */
const LONGEST_RETRY_WAIT_MILLISECONDS = 60_000;

/**
 * What the page says about the firewall's limit, which everyone behind one
 * address shares.
 */
export const SHARED_LIMIT_EXPLANATION =
  "Everyone on your network, such as a workshop or an office, shares a " +
  "limit on calculations a minute";

const RATE_LIMIT_REFUSAL_MESSAGE = `${SHARED_LIMIT_EXPLANATION}, and it has been reached.`;

/**
 * When the page may send household calculations again after a refusal for
 * the firewall's limit, in `Date.now()` milliseconds. Every household
 * calculation checks it when it is sent.
 */
let householdCalculationsPausedUntil = 0;
const pauseListeners = new Set<() => void>();

/**
 * Stops the page from sending household calculations for `milliseconds`
 * (the firewall's minute unless given); 0 ends a pause.
 */
export function pauseHouseholdCalculations(
  milliseconds: number = RATE_LIMIT_WAIT_MILLISECONDS,
): void {
  householdCalculationsPausedUntil = Date.now() + milliseconds;
  pauseListeners.forEach((listener) => listener());
}

/** Milliseconds until the page may send household calculations again; 0 when it may now. */
export function householdCalculationPauseRemaining(): number {
  return Math.max(0, householdCalculationsPausedUntil - Date.now());
}

/** Calls `listener` whenever a pause starts or is ended early; returns the unsubscribe. */
export function onHouseholdCalculationPause(listener: () => void): () => void {
  pauseListeners.add(listener);
  return () => {
    pauseListeners.delete(listener);
  };
}

/**
 * Whether the page is served from the dashboard API's own origin
 * (www.policyengine.org), where the firewall's 429 is readable.
 */
function pageSharesDashboardApiOrigin(): boolean {
  return globalThis.location?.origin === new URL(DEFAULT_BASE_URL).origin;
}

/** A household calculation failed; `message` is written for the user. */
export class HouseholdCalculationError extends Error {
  override name = "HouseholdCalculationError";

  constructor(
    message: string,
    /** The dashboard API's HTTP status, or null when no answer was read. */
    readonly status: number | null,
    /** Whether one more try, after a short wait, could succeed. */
    readonly retryable: boolean,
    /**
     * Whether the firewall's limit may have refused it: a 429, no readable
     * answer on another origin (which is how such a page sees a 429), or a
     * calculation held back during the pause after a refusal.
     */
    readonly rateLimited: boolean = false,
    /** The answer's Retry-After in seconds, or null when it named none. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}

/**
 * How long React Query waits before retrying a failed household calculation:
 * the failure's Retry-After, but never less than two seconds.
 */
export function householdRetryDelay(
  failureCount: number,
  error: unknown,
): number {
  const retryAfterMilliseconds =
    error instanceof HouseholdCalculationError &&
    error.retryAfterSeconds !== null
      ? error.retryAfterSeconds * 1000
      : 0;
  return Math.max(SHORTEST_RETRY_WAIT_MILLISECONDS, retryAfterMilliseconds);
}

/**
 * Whether React Query should retry a failed household calculation: once,
 * only after a 502 or a 503, and only when the wait before it is a minute or
 * less. Each attempt sends two calculations, and the firewall allows 30 a
 * minute.
 */
export function shouldRetryHouseholdCalculation(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    failureCount < 1 &&
    error instanceof HouseholdCalculationError &&
    error.retryable &&
    householdRetryDelay(failureCount, error) <= LONGEST_RETRY_WAIT_MILLISECONDS
  );
}

function dashboardApiMessage(body: unknown): string | null {
  if (typeof body === "object" && body !== null) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return null;
}

/** Turns a failure of the dashboard API client into a message for the user. */
function calculationError(error: PolicyEngineApiError): HouseholdCalculationError {
  if (error.status === null) {
    if (pageSharesDashboardApiOrigin()) {
      // The firewall's 429 would be readable here, so this is a network
      // failure.
      return new HouseholdCalculationError(
        "PolicyEngine's calculation service could not be reached. Check " +
          "your connection and try again.",
        null,
        false,
      );
    }
    // On another origin, such as the dashboard's own host, the firewall's
    // 429 has no CORS headers, so the browser reports a network failure.
    // So does the dashboard API's 403 for an origin it does not allow.
    return new HouseholdCalculationError(
      "PolicyEngine's calculation service could not be reached. " +
        `${SHARED_LIMIT_EXPLANATION}, which may have been reached.`,
      null,
      false,
      true,
    );
  }
  if (error.status === 429) {
    return new HouseholdCalculationError(
      RATE_LIMIT_REFUSAL_MESSAGE,
      429,
      false,
      true,
      error.retryAfterSeconds,
    );
  }
  const detail =
    dashboardApiMessage(error.body) ?? "Try again in a few minutes.";
  return new HouseholdCalculationError(
    `PolicyEngine could not calculate this household (HTTP ${error.status}): ${detail}`,
    error.status,
    RETRYABLE_STATUSES.has(error.status),
    false,
    error.retryAfterSeconds,
  );
}

/** Values over the income axis, keyed by year. */
type ValuesByYear = Record<string, number[]>;

/** The parts of a calculated household this page reads. */
interface CalculatedHousehold {
  people: Record<string, Record<string, ValuesByYear>>;
  households: Record<string, Record<string, ValuesByYear>>;
  tax_units: Record<string, Record<string, ValuesByYear>>;
}

async function calculateHousehold(
  household: Record<string, unknown>,
  policy?: Record<string, unknown>
): Promise<CalculatedHousehold> {
  if (householdCalculationPauseRemaining() > 0) {
    // Held back during the pause after a refusal, so never sent. The pause
    // may have started from a request with no answer, which only may have
    // met the limit.
    throw new HouseholdCalculationError(
      `${SHARED_LIMIT_EXPLANATION}, which may have been reached.`,
      null,
      false,
      true,
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    CALCULATION_TIMEOUT_MILLISECONDS
  );
  try {
    return await policyengine.calculateHousehold<CalculatedHousehold>(
      { country: "us", household, policy },
      { signal: controller.signal }
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HouseholdCalculationError(
        "The calculation took longer than two minutes. Try again.",
        null,
        false,
      );
    }
    if (error instanceof PolicyEngineApiError) {
      const failure = calculationError(error);
      if (failure.rateLimited) {
        // Pause at once, even if the household's other calculation has
        // already failed and the caller never sees this refusal.
        pauseHouseholdCalculations();
      }
      throw failure;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  async calculateHouseholdImpact(
    request: HouseholdRequest
  ): Promise<HouseholdImpactResponse> {
    const household = buildHouseholdSituation(request);
    const baselinePolicy = buildBaselinePolicy();
    const reformPolicy = buildReformPolicy();
    const yearStr = String(request.year);

    // Run baseline (expected current law) and reform (Stein) in parallel.
    const [baselineResult, reformResult] = await Promise.all([
      calculateHousehold(household, baselinePolicy),
      calculateHousehold(household, reformPolicy),
    ]);

    // Extract arrays from PE API response.
    const baselineNetIncome: number[] =
      baselineResult.households["your household"][
        "household_net_income"
      ][yearStr];
    const reformNetIncome: number[] =
      reformResult.households["your household"][
        "household_net_income"
      ][yearStr];
    const incomeRange: number[] =
      baselineResult.people["you"][
        "employment_income"
      ][yearStr];

    // Extract NC state income tax arrays.
    const baselineStateTax: number[] =
      baselineResult.tax_units["your tax unit"]["nc_income_tax"][
        yearStr
      ];
    const reformStateTax: number[] =
      reformResult.tax_units["your tax unit"]["nc_income_tax"][
        yearStr
      ];

    // Extract federal income tax arrays.
    const baselineFederalTax: number[] =
      baselineResult.tax_units["your tax unit"]["income_tax"][yearStr];
    const reformFederalTax: number[] =
      reformResult.tax_units["your tax unit"]["income_tax"][yearStr];

    // Impact = reform (Stein) - baseline (expected current law).
    const netIncomeChange = reformNetIncome.map(
      (val, i) => val - baselineNetIncome[i]
    );
    const federalTaxChange = reformFederalTax.map(
      (val, i) => val - baselineFederalTax[i]
    );
    const stateTaxChange = reformStateTax.map(
      (val, i) => val - baselineStateTax[i]
    );

    // Interpolate at the user's income for scalar metric cards.
    const baselineAtIncome = interpolate(
      incomeRange,
      baselineNetIncome,
      request.income
    );
    const reformAtIncome = interpolate(
      incomeRange,
      reformNetIncome,
      request.income
    );
    const baselineFederalTaxAtIncome = interpolate(
      incomeRange,
      baselineFederalTax,
      request.income
    );
    const reformFederalTaxAtIncome = interpolate(
      incomeRange,
      reformFederalTax,
      request.income
    );
    const baselineStateTaxAtIncome = interpolate(
      incomeRange,
      baselineStateTax,
      request.income
    );
    const reformStateTaxAtIncome = interpolate(
      incomeRange,
      reformStateTax,
      request.income
    );

    // Scalar differences at the user's income (reform - baseline).
    // Positive => household pays less tax / nets more income under the
    // Stein reform; negative => household pays more.
    const federalTaxChangeAtIncome =
      reformFederalTaxAtIncome - baselineFederalTaxAtIncome;
    const stateTaxChangeAtIncome =
      reformStateTaxAtIncome - baselineStateTaxAtIncome;
    const netIncomeChangeAtIncome = reformAtIncome - baselineAtIncome;

    return {
      income_range: incomeRange,
      net_income_change: netIncomeChange,
      federalTaxChange,
      stateTaxChange,
      netIncomeChange,
      benefit_at_income: {
        baseline: baselineAtIncome,
        reform: reformAtIncome,
        difference: netIncomeChangeAtIncome,
        federal_tax_change: federalTaxChangeAtIncome,
        state_tax_change: stateTaxChangeAtIncome,
        net_income_change: netIncomeChangeAtIncome,
      },
      x_axis_max: request.max_earnings,
    };
  },
};
