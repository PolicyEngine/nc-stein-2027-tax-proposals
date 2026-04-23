/**
 * Household impact via the PolicyEngine API.
 *
 * Calls https://api.policyengine.org/us/calculate directly —
 * no backend server required.
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
  HouseholdRequest,
  HouseholdImpactResponse,
} from "./types";
import {
  buildBaselinePolicy,
  buildHouseholdSituation,
  buildReformPolicy,
  interpolate,
} from "./household";

const PE_API_URL = "https://api.policyengine.org";

class ApiError extends Error {
  status: number;
  response: unknown;
  constructor(message: string, status: number, response?: unknown) {
    super(message);
    this.status = status;
    this.response = response;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = 120000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

interface PEApiResponse {
  result: {
    households: Record<string, Record<string, Record<string, number[]>>>;
    people: Record<string, Record<string, Record<string, number[]>>>;
    tax_units: Record<string, Record<string, Record<string, number[]>>>;
  };
}

async function peCalculate(body: Record<string, unknown>): Promise<PEApiResponse> {
  const response = await fetchWithTimeout(
    `${PE_API_URL}/us/calculate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    const errorMessage = typeof errorBody === 'object' && errorBody?.message
      ? errorBody.message
      : typeof errorBody === 'string'
        ? errorBody
        : JSON.stringify(errorBody);
    throw new ApiError(
      `PolicyEngine API error: ${response.status} - ${errorMessage}`,
      response.status,
      errorBody
    );
  }
  return response.json();
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
      peCalculate({ household, policy: baselinePolicy }),
      peCalculate({ household, policy: reformPolicy }),
    ]);

    // Extract arrays from PE API response.
    const baselineNetIncome: number[] =
      baselineResult.result.households["your household"][
        "household_net_income"
      ][yearStr];
    const reformNetIncome: number[] =
      reformResult.result.households["your household"][
        "household_net_income"
      ][yearStr];
    const incomeRange: number[] =
      baselineResult.result.people["you"][
        "employment_income"
      ][yearStr];

    // Extract NC state income tax arrays.
    const baselineStateTax: number[] =
      baselineResult.result.tax_units["your tax unit"]["nc_income_tax"][
        yearStr
      ];
    const reformStateTax: number[] =
      reformResult.result.tax_units["your tax unit"]["nc_income_tax"][
        yearStr
      ];

    // Extract federal income tax arrays.
    const baselineFederalTax: number[] =
      baselineResult.result.tax_units["your tax unit"]["income_tax"][yearStr];
    const reformFederalTax: number[] =
      reformResult.result.tax_units["your tax unit"]["income_tax"][yearStr];

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
        // EITC fields retained for backward compatibility with ImpactAnalysis.
        federal_eitc_change: 0,
        state_eitc_change: 0,
        federal_tax_change: federalTaxChangeAtIncome,
        state_tax_change: stateTaxChangeAtIncome,
        net_income_change: netIncomeChangeAtIncome,
      },
      x_axis_max: request.max_earnings,
    };
  },
};
