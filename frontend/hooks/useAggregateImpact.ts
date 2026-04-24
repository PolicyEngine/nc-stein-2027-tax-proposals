import { useQuery } from "@tanstack/react-query";
import parseCSV from "@/lib/parseCSV";
import { AggregateImpactResponse, IntraDecileAll, IntraDecileDeciles } from "@/lib/types";

// NC Stein FY2026-27 tax proposals dashboard. The reform covers 2026, 2027,
// and 2028; 2027 is the default displayed year (first year the rate-
// maintenance and standard-deduction provisions apply).
export const NC_DASHBOARD_DEFAULT_YEAR = 2027;
export const NC_DASHBOARD_YEARS = [2026, 2027, 2028] as const;

async function fetchCSV(filename: string): Promise<Record<string, string | number>[]> {
  // Use same default as next.config.js
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH !== undefined
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : "/us/nc-stein-2027-tax-proposals";
  const res = await fetch(`${basePath}/data/${filename}`);
  if (!res.ok) throw new Error(`Failed to load ${filename}`);
  const text = await res.text();
  return parseCSV(text);
}

// Fetch the national congressional_districts.csv and filter to North Carolina
// (state="NC"). Shared by components that need district-level numbers for the
// NC Stein FY2026-27 tax proposals dashboard.
export function useNCDistrictImpact(enabled: boolean, year: number = NC_DASHBOARD_DEFAULT_YEAR) {
  return useQuery<Record<string, string | number>[]>({
    queryKey: ["ncDistrictImpact", year],
    queryFn: async () => {
      const rows = await fetchCSV("congressional_districts.csv");
      return rows.filter(
        (r) => r.state === "NC" && Number(r.year) === year,
      );
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

function buildAggregateResponse(year: number): Promise<AggregateImpactResponse> {
  return Promise.all([
    fetchCSV("distributional_impact.csv"),
    fetchCSV("metrics.csv"),
    fetchCSV("winners_losers.csv"),
    fetchCSV("income_brackets.csv"),
  ]).then(([distributional, metrics, winnersLosers, incomeBrackets]) => {
    // Filter by year
    const dist = distributional.filter((r) => r.year === year);
    const met = metrics.filter((r) => r.year === year);
    const wl = winnersLosers.filter((r) => r.year === year);
    const ib = incomeBrackets.filter((r) => r.year === year);

    // Build metrics lookup
    const m = Object.fromEntries(met.map((r) => [r.metric, r.value as number]));

    // Build decile objects
    const decileAverage: Record<string, number> = {};
    const decileRelative: Record<string, number> = {};
    for (const row of dist) {
      decileAverage[row.decile as string] = row.average_change as number;
      decileRelative[row.decile as string] = row.relative_change as number;
    }

    // Build intra-decile
    const allRow = wl.find((r) => r.decile === "All")!;
    const intraAll: IntraDecileAll = {
      gain_more_than_5pct: allRow.gain_more_5pct as number,
      gain_less_than_5pct: allRow.gain_less_5pct as number,
      no_change: allRow.no_change as number,
      lose_less_than_5pct: allRow.lose_less_5pct as number,
      lose_more_than_5pct: allRow.lose_more_5pct as number,
    };

    const decileRows = wl.filter((r) => r.decile !== "All").sort(
      (a, b) => Number(a.decile) - Number(b.decile)
    );
    const intraDeciles: IntraDecileDeciles = {
      gain_more_than_5pct: decileRows.map((r) => r.gain_more_5pct as number),
      gain_less_than_5pct: decileRows.map((r) => r.gain_less_5pct as number),
      no_change: decileRows.map((r) => r.no_change as number),
      lose_less_than_5pct: decileRows.map((r) => r.lose_less_5pct as number),
      lose_more_than_5pct: decileRows.map((r) => r.lose_more_5pct as number),
    };

    return {
      budget: {
        baseline_net_income: m.baseline_net_income,
        budgetary_impact: m.budgetary_impact,
        federal_tax_revenue_impact: m.federal_tax_revenue_impact,
        state_tax_revenue_impact: m.state_tax_revenue_impact,
        tax_revenue_impact: m.tax_revenue_impact,
        benefit_spending_impact: m.benefit_spending_impact,
        households: m.households,
      },
      decile: { average: decileAverage, relative: decileRelative },
      intra_decile: { all: intraAll, deciles: intraDeciles },
      poverty: {
        poverty: {
          all: { baseline: m.poverty_baseline_rate, reform: m.poverty_reform_rate },
          child: { baseline: m.child_poverty_baseline_rate, reform: m.child_poverty_reform_rate },
        },
        deep_poverty: {
          all: { baseline: m.deep_poverty_baseline_rate, reform: m.deep_poverty_reform_rate },
          child: { baseline: m.deep_child_poverty_baseline_rate, reform: m.deep_child_poverty_reform_rate },
        },
      },
      inequality: {
        gini: { baseline: m.gini_baseline, reform: m.gini_reform },
        top_10_share: { baseline: m.top_10_share_baseline, reform: m.top_10_share_reform },
        top_1_share: { baseline: m.top_1_share_baseline, reform: m.top_1_share_reform },
      },
      total_cost: m.total_cost,
      beneficiaries: m.beneficiaries,
      avg_benefit: m.avg_benefit,
      winners: m.winners,
      losers: m.losers,
      winners_rate: m.winners_rate,
      losers_rate: m.losers_rate,
      poverty_baseline_rate: m.poverty_baseline_rate,
      poverty_reform_rate: m.poverty_reform_rate,
      poverty_rate_change: m.poverty_rate_change,
      poverty_percent_change: m.poverty_percent_change,
      child_poverty_baseline_rate: m.child_poverty_baseline_rate,
      child_poverty_reform_rate: m.child_poverty_reform_rate,
      child_poverty_rate_change: m.child_poverty_rate_change,
      child_poverty_percent_change: m.child_poverty_percent_change,
      deep_poverty_baseline_rate: m.deep_poverty_baseline_rate,
      deep_poverty_reform_rate: m.deep_poverty_reform_rate,
      deep_poverty_rate_change: m.deep_poverty_rate_change,
      deep_poverty_percent_change: m.deep_poverty_percent_change,
      deep_child_poverty_baseline_rate: m.deep_child_poverty_baseline_rate,
      deep_child_poverty_reform_rate: m.deep_child_poverty_reform_rate,
      deep_child_poverty_rate_change: m.deep_child_poverty_rate_change,
      deep_child_poverty_percent_change: m.deep_child_poverty_percent_change,
      by_income_bracket: ib.map((r) => ({
        bracket: r.bracket as string,
        beneficiaries: r.beneficiaries as number,
        total_cost: r.total_cost as number,
        avg_benefit: r.avg_benefit as number,
      })),
    };
  });
}

export function useAggregateImpact(
  enabled: boolean,
  year: number = NC_DASHBOARD_DEFAULT_YEAR,
) {
  return useQuery<AggregateImpactResponse>({
    queryKey: ["aggregateImpact", year],
    queryFn: () => buildAggregateResponse(year),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useTenYearTotal(enabled: boolean) {
  return useQuery<number>({
    queryKey: ["tenYearTotal"],
    queryFn: async () => {
      const rows = await fetchCSV("metrics.csv");
      const years = Array.from({ length: 10 }, (_, i) => 2026 + i);
      return years.reduce((sum, year) => {
        const row = rows.find(
          (r) => r.year === year && r.metric === "budgetary_impact"
        );
        return sum + (row ? (row.value as number) : 0);
      }, 0);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useTenYearFederalTotal(enabled: boolean) {
  return useQuery<number>({
    queryKey: ["tenYearFederalTotal"],
    queryFn: async () => {
      const rows = await fetchCSV("metrics.csv");
      const years = Array.from({ length: 10 }, (_, i) => 2026 + i);
      return years.reduce((sum, year) => {
        const row = rows.find(
          (r) => r.year === year && r.metric === "federal_tax_revenue_impact"
        );
        return sum + (row ? (row.value as number) : 0);
      }, 0);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export interface ProvisionBreakdownRow {
  year: number;
  provision: string;
  provision_label: string;
  state_tax_revenue_impact: number;
  federal_tax_revenue_impact: number;
  budgetary_impact: number;
  households_affected: number;
}

export function useProvisionBreakdown(
  enabled: boolean,
  year: number = NC_DASHBOARD_DEFAULT_YEAR,
) {
  return useQuery<ProvisionBreakdownRow[]>({
    queryKey: ["provisionBreakdown", year],
    queryFn: async () => {
      const rows = await fetchCSV("provision_breakdown.csv");
      return rows
        .filter((r) => Number(r.year) === year)
        .map(
          (r) =>
            ({
              year: Number(r.year),
              provision: String(r.provision),
              provision_label: String(r.provision_label),
              state_tax_revenue_impact: Number(r.state_tax_revenue_impact),
              federal_tax_revenue_impact: Number(
                r.federal_tax_revenue_impact,
              ),
              budgetary_impact: Number(r.budgetary_impact),
              households_affected: Number(r.households_affected),
            }) as ProvisionBreakdownRow,
        );
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useTenYearStateTotal(enabled: boolean) {
  return useQuery<number>({
    queryKey: ["tenYearStateTotal"],
    queryFn: async () => {
      const rows = await fetchCSV("metrics.csv");
      const years = Array.from({ length: 10 }, (_, i) => 2026 + i);
      return years.reduce((sum, year) => {
        const row = rows.find(
          (r) => r.year === year && r.metric === "state_tax_revenue_impact"
        );
        return sum + (row ? (row.value as number) : 0);
      }, 0);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
