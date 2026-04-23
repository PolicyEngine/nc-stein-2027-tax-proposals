/**
 * Build a PolicyEngine household situation for the PE API.
 *
 * NC Gov. Stein FY2026-27 tax proposals dashboard. Two policy overrides
 * are sent to the PE API /us/calculate endpoint:
 *
 *   baseline policy = expected current-law rate-reduction triggers
 *                     (3.49% in 2027, 2.99% in 2028).
 *   reform policy   = full Stein package: maintains 3.99% rate, raises
 *                     standard deductions in 2027, enables the 10% EITC
 *                     match and 30% CDCC match starting 2026.
 *
 * Impact = reform - baseline (positive => household gains; negative =>
 * cost to government).
 */

import type { HouseholdRequest } from "./types";

const GROUP_UNITS = ["families", "spm_units", "tax_units", "households"] as const;

/**
 * Expected current-law NC tax parameters — the PE-US baseline does not
 * yet include the rate-reduction triggers that would drop the NC rate to
 * 3.49% in 2027 and 2.99% in 2028 under the consensus forecast. Applied
 * as the "baseline" policy so the dashboard's baseline matches expected
 * current law.
 */
const BASELINE_POLICY: Record<string, Record<string, number>> = {
  "gov.states.nc.tax.income.rate": {
    "2027-01-01.2027-12-31": 0.0349,
    "2028-01-01.2100-12-31": 0.0299,
  },
};

/**
 * Governor Stein's FY2026-27 Budget tax proposals. Applied as the
 * "reform" policy.
 *
 * - Maintain 3.99% individual income tax rate (2027+) -- repeals triggered
 *   reductions.
 * - Raise standard deduction starting 2027: +$1,000 JOINT/SURVIVING_SPOUSE,
 *   +$750 HEAD_OF_HOUSEHOLD, +$500 SINGLE/SEPARATE.
 * - Refundable Working Families Tax Credit = 10% of federal EITC (2026+).
 * - Refundable child and dependent care tax credit = 30% of federal
 *   CDCC (2026+).
 *
 * ``nc_eitc`` and ``nc_cdcc`` contributed reforms are auto-applied by
 * PolicyEngine-US when their ``in_effect`` parameters flip to true.
 */
const REFORM_POLICY: Record<string, Record<string, number | boolean>> = {
  "gov.states.nc.tax.income.rate": {
    "2027-01-01.2100-12-31": 0.0399,
  },
  "gov.states.nc.tax.income.deductions.standard.amount.JOINT": {
    "2027-01-01.2100-12-31": 26500,
  },
  "gov.states.nc.tax.income.deductions.standard.amount.SURVIVING_SPOUSE": {
    "2027-01-01.2100-12-31": 26500,
  },
  "gov.states.nc.tax.income.deductions.standard.amount.HEAD_OF_HOUSEHOLD": {
    "2027-01-01.2100-12-31": 19875,
  },
  "gov.states.nc.tax.income.deductions.standard.amount.SINGLE": {
    "2027-01-01.2100-12-31": 13250,
  },
  "gov.states.nc.tax.income.deductions.standard.amount.SEPARATE": {
    "2027-01-01.2100-12-31": 13250,
  },
  "gov.contrib.states.nc.eitc.in_effect": {
    "2026-01-01.2100-12-31": true,
  },
  "gov.contrib.states.nc.eitc.match": {
    "2026-01-01.2100-12-31": 0.1,
  },
  "gov.contrib.states.nc.cdcc.in_effect": {
    "2026-01-01.2100-12-31": true,
  },
  "gov.contrib.states.nc.cdcc.match": {
    "2026-01-01.2100-12-31": 0.3,
  },
};

function addMemberToUnits(
  situation: Record<string, unknown>,
  memberId: string
): void {
  for (const unit of GROUP_UNITS) {
    const unitObj = situation[unit] as Record<string, { members: string[] }>;
    const key = Object.keys(unitObj)[0];
    unitObj[key].members.push(memberId);
  }
}

export function buildHouseholdSituation(
  params: HouseholdRequest
): Record<string, unknown> {
  const {
    age_head,
    age_spouse,
    dependent_ages,
    income,
    year,
    max_earnings,
    state_code,
    childcare_expenses,
  } = params;
  const effectiveStateCode = state_code || "NC";
  const yearStr = String(year);
  const axisMax = Math.max(max_earnings, income);

  const situation: Record<string, unknown> = {
    people: {
      you: {
        age: { [yearStr]: age_head },
        employment_income: { [yearStr]: null },
      },
    },
    families: { "your family": { members: ["you"] } },
    marital_units: { "your marital unit": { members: ["you"] } },
    spm_units: { "your household": { members: ["you"] } },
    tax_units: {
      "your tax unit": {
        members: ["you"],
        adjusted_gross_income: { [yearStr]: null },
        income_tax: { [yearStr]: null },
        nc_income_tax: { [yearStr]: null },
        tax_unit_childcare_expenses: { [yearStr]: childcare_expenses ?? 0 },
      },
    },
    households: {
      "your household": {
        members: ["you"],
        state_code: { [yearStr]: effectiveStateCode },
        household_net_income: { [yearStr]: null },
      },
    },
    axes: [
      [
        {
          name: "employment_income",
          min: 0,
          max: axisMax,
          count: Math.min(4001, Math.max(501, Math.floor(axisMax / 500))),
          period: yearStr,
          target: "person",
        },
      ],
    ],
  };

  if (age_spouse != null) {
    const people = situation.people as Record<string, Record<string, unknown>>;
    people["your partner"] = { age: { [yearStr]: age_spouse } };
    addMemberToUnits(situation, "your partner");
    const maritalUnits = situation.marital_units as Record<string, { members: string[] }>;
    maritalUnits["your marital unit"].members.push("your partner");
  }

  for (let i = 0; i < dependent_ages.length; i++) {
    const childId =
      i === 0
        ? "your first dependent"
        : i === 1
          ? "your second dependent"
          : `dependent_${i + 1}`;

    const people = situation.people as Record<string, Record<string, unknown>>;
    people[childId] = { age: { [yearStr]: dependent_ages[i] } };
    addMemberToUnits(situation, childId);
    const maritalUnits = situation.marital_units as Record<string, { members: string[] }>;
    maritalUnits[`${childId}'s marital unit`] = {
      members: [childId],
    };
  }

  return situation;
}

/** Expected current-law baseline policy (triggered rate cuts). */
export function buildBaselinePolicy(): Record<string, Record<string, number>> {
  return BASELINE_POLICY;
}

/** Stein FY2026-27 reform policy. */
export function buildReformPolicy(): Record<string, Record<string, number | boolean>> {
  return REFORM_POLICY;
}

/**
 * Linear interpolation helper — find the value at `x` in sorted arrays.
 */
export function interpolate(
  xs: number[],
  ys: number[],
  x: number
): number {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] >= x) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[ys.length - 1];
}
