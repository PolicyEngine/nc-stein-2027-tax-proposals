import { afterEach, describe, expect, it, vi } from "vitest";

import {
  api,
  HouseholdCalculationError,
  householdCalculationPauseRemaining,
  pauseHouseholdCalculations,
  shouldRetryHouseholdCalculation,
} from "@/lib/api";
import {
  buildBaselinePolicy,
  buildHouseholdSituation,
  buildReformPolicy,
} from "@/lib/household";
import type { HouseholdRequest } from "@/lib/types";

const DASHBOARD_API_CALCULATE_URL =
  "https://www.policyengine.org/api/household/calculate";

const householdRequest: HouseholdRequest = {
  age_head: 35,
  age_spouse: null,
  dependent_ages: [5],
  income: 75000,
  year: 2026,
  max_earnings: 500000,
  state_code: "NC",
};

interface RecordedRequest {
  url: string;
  method: string | undefined;
  body: Record<string, unknown>;
}

type Respond = (
  body: Record<string, unknown>,
  init: RequestInit,
) => Response | Promise<Response>;

/** Replaces the global fetch; returns the requests it receives. */
function stubFetch(respond: Respond): RecordedRequest[] {
  const recordedRequests: RecordedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      recordedRequests.push({ url: String(input), method: init.method, body });
      return respond(body, init);
    }),
  );
  return recordedRequests;
}

/** The Public API's calculated household, with values over the income axis. */
function calculatedHousehold(
  incomes: number[],
  netIncomes: number[],
  federalIncomeTaxes: number[],
  northCarolinaIncomeTaxes: number[],
) {
  return {
    people: { you: { employment_income: { "2026": incomes } } },
    tax_units: {
      "your tax unit": {
        income_tax: { "2026": federalIncomeTaxes },
        nc_income_tax: { "2026": northCarolinaIncomeTaxes },
      },
    },
    households: {
      "your household": { household_net_income: { "2026": netIncomes } },
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okAnswer(result: unknown): Response {
  return jsonResponse(200, { status: "ok", message: null, result });
}

async function calculationFailure(): Promise<unknown> {
  try {
    await api.calculateHouseholdImpact(householdRequest);
  } catch (error) {
    return error;
  }
  throw new Error("The calculation did not fail.");
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Real time first, so that ending the pause ends it in real time.
  vi.useRealTimers();
  pauseHouseholdCalculations(0);
});

describe("calculateHouseholdImpact", () => {
  it("sends the baseline and reform households to the dashboard API", async () => {
    const recordedRequests = stubFetch(() =>
      okAnswer(calculatedHousehold([0, 100000], [0, 90000], [0, 9000], [0, 4000])),
    );

    await api.calculateHouseholdImpact(householdRequest);

    expect(recordedRequests.map((request) => request.url)).toEqual([
      DASHBOARD_API_CALCULATE_URL,
      DASHBOARD_API_CALCULATE_URL,
    ]);
    expect(recordedRequests.map((request) => request.method)).toEqual([
      "POST",
      "POST",
    ]);
    // The baseline is expected current law (the triggered rate cuts); the
    // reform is the Stein package.
    const household = buildHouseholdSituation(householdRequest);
    expect(recordedRequests.map((request) => request.body)).toEqual([
      { country: "us", household, policy: buildBaselinePolicy() },
      { country: "us", household, policy: buildReformPolicy() },
    ]);
  });

  it("reads net income and both income taxes as before", async () => {
    const incomes = [0, 50000, 100000];
    const reformPolicy = JSON.stringify(buildReformPolicy());
    stubFetch((body) =>
      okAnswer(
        JSON.stringify(body.policy) === reformPolicy
          ? // The Stein package.
            calculatedHousehold(
              incomes,
              [110, 40500, 70200],
              [0, 3000, 9100],
              [0, 1500, 4600],
            )
          : // Expected current law.
            calculatedHousehold(
              incomes,
              [10, 40000, 70000],
              [0, 3000, 9000],
              [0, 2000, 5000],
            ),
      ),
    );

    const impact = await api.calculateHouseholdImpact(householdRequest);

    // At 75,000: net income 55,000 before and 55,350 after; federal income
    // tax 6,000 and 6,050; North Carolina income tax 3,500 and 3,050.
    expect(impact).toEqual({
      income_range: incomes,
      net_income_change: [100, 500, 200],
      federalTaxChange: [0, 0, 100],
      stateTaxChange: [0, -500, -400],
      netIncomeChange: [100, 500, 200],
      benefit_at_income: {
        baseline: 55000,
        reform: 55350,
        difference: 350,
        federal_tax_change: 50,
        state_tax_change: -450,
        net_income_change: 350,
      },
      x_axis_max: 500000,
    });
  });

  it("explains the shared limit after the firewall's rate limit", async () => {
    stubFetch(
      () =>
        new Response("Too Many Requests", {
          status: 429,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    expect(await calculationFailure()).toMatchObject({
      // The countdown beside the button says when the page can calculate
      // again, so the message stays true after the minute.
      message:
        "Everyone on your network, such as a workshop or an office, shares " +
        "a limit on calculations a minute, and it has been reached.",
      status: 429,
      retryable: false,
      rateLimited: true,
    });
  });

  it("explains the shared limit when no answer could be read", async () => {
    // A page on another origin cannot read the firewall's 429, which has no
    // CORS headers: the browser reports a network failure instead.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    expect(await calculationFailure()).toMatchObject({
      message:
        "PolicyEngine's calculation service could not be reached. Everyone " +
        "on your network, such as a workshop or an office, shares a limit " +
        "on calculations a minute, which may have been reached.",
      status: null,
      retryable: false,
      rateLimited: true,
    });
  });

  it("reports a network failure on www.policyengine.org without pausing", async () => {
    // There the page and the dashboard API share an origin, so the
    // firewall's 429 is readable: no answer means a network failure.
    vi.stubGlobal("location", { origin: "https://www.policyengine.org" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    expect(await calculationFailure()).toMatchObject({
      message:
        "PolicyEngine's calculation service could not be reached. Check " +
        "your connection and try again.",
      status: null,
      rateLimited: false,
    });
    expect(householdCalculationPauseRemaining()).toBe(0);
  });

  it("pauses household calculations for a minute after a refusal", async () => {
    vi.useFakeTimers();
    stubFetch(
      () =>
        new Response("Too Many Requests", {
          status: 429,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    await calculationFailure();

    expect(householdCalculationPauseRemaining()).toBe(60_000);
    vi.advanceTimersByTime(60_000);
    expect(householdCalculationPauseRemaining()).toBe(0);
  });

  it("does not pause after other failures", async () => {
    stubFetch(
      () =>
        new Response("Service Unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    await calculationFailure();

    expect(householdCalculationPauseRemaining()).toBe(0);
  });

  it("says a calculation held back during a pause may have met the limit", async () => {
    // The pause may have started from a request with no answer, which
    // only may have met the limit.
    stubFetch(() => okAnswer(calculatedHousehold([0], [0], [0], [0])));
    pauseHouseholdCalculations();

    expect(await calculationFailure()).toMatchObject({
      message:
        "Everyone on your network, such as a workshop or an office, shares " +
        "a limit on calculations a minute, which may have been reached.",
      rateLimited: true,
    });
  });

  it("sends no household calculation while calculations are paused", async () => {
    const recordedRequests = stubFetch(() =>
      okAnswer(calculatedHousehold([0], [0], [0], [0])),
    );
    pauseHouseholdCalculations();

    expect(await calculationFailure()).toMatchObject({ rateLimited: true });
    expect(recordedRequests).toEqual([]);
  });

  it("starts the pause when either calculation of a household is refused", async () => {
    // Expected current law fails at once for another reason; the firewall
    // refuses the Stein package a moment later, after the calculation has
    // already failed.
    const baselinePolicy = JSON.stringify(buildBaselinePolicy());
    stubFetch(async (body) => {
      if (JSON.stringify(body.policy) === baselinePolicy) {
        return jsonResponse(500, {
          status: "error",
          message: "Internal error",
          result: null,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response("Too Many Requests", {
        status: 429,
        headers: { "Content-Type": "text/plain" },
      });
    });

    expect(await calculationFailure()).toMatchObject({ status: 500 });
    await vi.waitFor(() =>
      expect(householdCalculationPauseRemaining()).toBeGreaterThan(0),
    );
  });

  it("shows the server's message for a 403 the page can read", async () => {
    // A refused origin never reaches this: that 403 has no CORS headers, so
    // the browser reports a network failure. A page can read only a 403 the
    // dashboard API passes on from the Public API.
    stubFetch(() =>
      jsonResponse(403, {
        status: "error",
        message: "Forbidden by the Public API.",
        result: null,
      }),
    );

    expect(await calculationFailure()).toMatchObject({
      message: expect.stringMatching(/HTTP 403.*Forbidden by the Public API\./),
      status: 403,
      retryable: false,
    });
  });

  it("shows the dashboard API's own message for a refused request", async () => {
    stubFetch(() =>
      jsonResponse(400, {
        status: "error",
        message: "Unknown fields: households.",
        result: null,
      }),
    );

    expect(await calculationFailure()).toMatchObject({
      message: expect.stringContaining("Unknown fields: households."),
      status: 400,
      retryable: false,
    });
  });

  it("keeps the status and the Public API's text in a calculation failure", async () => {
    // ImpactAnalysis shows its "temporarily unavailable" note when the
    // message contains "500" or "too many values".
    stubFetch(() =>
      jsonResponse(500, {
        status: "error",
        message: "too many values to unpack",
        result: null,
      }),
    );

    expect(await calculationFailure()).toMatchObject({
      message: expect.stringMatching(/500.*too many values to unpack/),
    });
  });

  it("lets a brief gateway failure be retried", async () => {
    stubFetch(
      () =>
        new Response("Service Unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
    );

    expect(await calculationFailure()).toMatchObject({
      message: expect.stringContaining("HTTP 503"),
      status: 503,
      retryable: true,
      rateLimited: false,
    });
  });

  it("lets a 502 or a 503 be retried, but not a 504", async () => {
    const retryableByStatus: Record<number, boolean> = {};
    for (const gatewayStatus of [502, 503, 504]) {
      stubFetch(
        () =>
          new Response("Gateway failure", {
            status: gatewayStatus,
            headers: { "Content-Type": "text/plain" },
          }),
      );
      const failure = (await calculationFailure()) as HouseholdCalculationError;
      retryableByStatus[gatewayStatus] = failure.retryable;
    }

    // A 504 means the dashboard API has already waited 750 seconds for the
    // household, so the page shows it instead.
    expect(retryableByStatus).toEqual({ 502: true, 503: true, 504: false });
  });

  it("says the calculation service did not answer in time after a 504", async () => {
    // The page now waits longer than the dashboard API, so the dashboard
    // API's own answer to a household that took too long reaches it. Its
    // message names an internal service, so the page says what to do.
    stubFetch(() =>
      jsonResponse(504, {
        status: "error",
        message: "The Public API did not answer in time.",
        result: null,
      }),
    );

    expect(await calculationFailure()).toMatchObject({
      message:
        "PolicyEngine's calculation service did not answer in time " +
        "(HTTP 504). Try again in a few minutes.",
      status: 504,
      retryable: false,
      rateLimited: false,
    });
  });

  it("carries the failure's Retry-After, or null without one", async () => {
    stubFetch(
      () =>
        new Response("Service Unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain", "Retry-After": "30" },
        }),
    );
    const failureWithRetryAfter = await calculationFailure();
    stubFetch(
      () =>
        new Response("Service Unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
    );
    const failureWithoutRetryAfter = await calculationFailure();

    expect(failureWithRetryAfter).toMatchObject({ retryAfterSeconds: 30 });
    expect(failureWithoutRetryAfter).toMatchObject({ retryAfterSeconds: null });
  });

  it("gives up after 13 minutes without an answer", async () => {
    // 30 seconds more than the dashboard API's 750-second wait for a
    // household, so the dashboard API's own 504 arrives first.
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init: RequestInit = {}) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );

    let gaveUp = false;
    const failure = calculationFailure().finally(() => {
      gaveUp = true;
    });
    await vi.advanceTimersByTimeAsync(779_999);
    const gaveUpBeforeThirteenMinutes = gaveUp;
    await vi.advanceTimersByTimeAsync(1);

    expect(gaveUpBeforeThirteenMinutes).toBe(false);
    expect(await failure).toMatchObject({
      message: "The calculation took longer than 13 minutes. Try again.",
      status: null,
      retryable: false,
      rateLimited: false,
    });
  });
});

describe("shouldRetryHouseholdCalculation", () => {
  it("retries a retryable failure once, and nothing else", () => {
    // Each attempt sends two calculations, against 30 a minute.
    const gatewayFailure = new HouseholdCalculationError("", 503, true);
    const rateLimited = new HouseholdCalculationError("", 429, false);

    expect(
      [0, 1].map((failureCount) =>
        shouldRetryHouseholdCalculation(failureCount, gatewayFailure),
      ),
    ).toEqual([true, false]);
    expect(shouldRetryHouseholdCalculation(0, rateLimited)).toBe(false);
    expect(shouldRetryHouseholdCalculation(0, new Error("other"))).toBe(false);
  });

  it("does not retry a failure whose Retry-After asks for over a minute", async () => {
    const failureAfterRetryAfter = async (retryAfterSeconds: number) => {
      stubFetch(
        () =>
          new Response("Service Unavailable", {
            status: 503,
            headers: {
              "Content-Type": "text/plain",
              "Retry-After": String(retryAfterSeconds),
            },
          }),
      );
      return calculationFailure();
    };
    const failureAskingForAMinute = await failureAfterRetryAfter(60);
    const failureAskingForLonger = await failureAfterRetryAfter(61);

    expect(shouldRetryHouseholdCalculation(0, failureAskingForAMinute)).toBe(
      true,
    );
    expect(shouldRetryHouseholdCalculation(0, failureAskingForLonger)).toBe(
      false,
    );
  });
});
