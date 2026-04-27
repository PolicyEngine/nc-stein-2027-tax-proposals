'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useHouseholdImpact } from '@/hooks/useHouseholdImpact';
import type { HouseholdRequest } from '@/lib/types';
import ChartWatermark from './ChartWatermark';

interface Props {
  request: HouseholdRequest | null;
  triggered: boolean;
  maxEarnings?: number;
}

export default function ImpactAnalysis({ request, triggered, maxEarnings }: Props) {
  const { data, isLoading, error } = useHouseholdImpact(request, triggered);

  if (!triggered) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Calculating impact...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const errorMessage = (error as Error).message;
    const isApiNotUpdated = errorMessage.includes('500') || errorMessage.includes('too many values');
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h2 className="text-yellow-800 font-semibold mb-2">Household calculator temporarily unavailable</h2>
        {isApiNotUpdated ? (
          <p className="text-yellow-700">
            The PolicyEngine API is being updated to reflect the North Carolina
            Stein FY2026-27 tax proposals. Please check back soon, or view the
            <strong> Statewide impact</strong> tab for precomputed results.
          </p>
        ) : (
          <p className="text-yellow-700">{errorMessage}</p>
        )}
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (value: number) =>
    `$${Math.round(value).toLocaleString('en-US')}`;
  const formatCurrencyWithSign = (value: number) => {
    const formatted = formatCurrency(Math.abs(value));
    if (value > 0) return `+${formatted}`;
    if (value < 0) return `-${formatted}`;
    return formatted;
  };
  const formatIncome = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    return `$${(value / 1000).toFixed(0)}k`;
  };

  const benefitData = data.benefit_at_income;

  // Prefer explicit fields added by the API client. Fall back to EITC-derived
  // values if the API client hasn't been updated yet.
  // TODO: remove fallback once api.ts populates federal_tax_change /
  // state_tax_change / net_income_change on benefit_at_income.
  const federalTaxChangePoint =
    benefitData.federal_tax_change ?? -benefitData.federal_eitc_change;
  const stateTaxChangePoint =
    benefitData.state_tax_change ?? -benefitData.state_eitc_change;
  const netIncomeChangePoint =
    benefitData.net_income_change ?? benefitData.difference;

  const xMax = maxEarnings ?? data.x_axis_max;

  // Build chart data. Keep single net-income-change line, but enrich each
  // point with the per-component deltas so the tooltip can show all three.
  // TODO: remove fallbacks once api.ts populates federalTaxChange /
  // stateTaxChange / netIncomeChange arrays on HouseholdImpactResponse.
  const federalTaxChangeSeries: number[] =
    data.federalTaxChange ?? data.net_income_change.map(() => 0);
  const stateTaxChangeSeries: number[] =
    data.stateTaxChange ?? data.net_income_change.map(() => 0);
  const netIncomeChangeSeries: number[] =
    data.netIncomeChange ?? data.net_income_change;

  const chartData = data.income_range
    .map((inc, i) => ({
      income: inc,
      benefit: netIncomeChangeSeries[i],
      federalTaxChange: federalTaxChangeSeries[i],
      stateTaxChange: stateTaxChangeSeries[i],
      netIncomeChange: netIncomeChangeSeries[i],
    }))
    .filter((d) => d.income <= xMax);

  // For tax-change metrics (federal, state), a REDUCTION (negative) is good
  // for the household, so we flip the color sign. For net income change,
  // a positive value is good for the household (no flip).
  const metricCard = (label: string, value: number, lowerIsBetter = false) => {
    const beneficial = lowerIsBetter ? value < 0 : value > 0;
    const harmful = lowerIsBetter ? value > 0 : value < 0;
    return (
      <div
        className={`rounded-lg p-6 border ${
          beneficial
            ? 'bg-green-50 border-success'
            : harmful
            ? 'bg-red-50 border-red-300'
            : 'bg-gray-50 border-gray-300'
        }`}
      >
        <p className="text-sm text-gray-700 mb-2">{label}</p>
        <p
          className={`text-3xl font-bold ${
            beneficial ? 'text-green-600' : harmful ? 'text-red-600' : 'text-gray-600'
          }`}
        >
          {value !== 0 ? `${formatCurrencyWithSign(value)}/year` : '$0/year'}
        </p>
      </div>
    );
  };

  // Custom tooltip that shows all three deltas at the hovered income point.
  const HoverTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ payload: {
      income: number;
      federalTaxChange: number;
      stateTaxChange: number;
      netIncomeChange: number;
    } }>;
    label?: number;
  }) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload;
    const incomeLabel = typeof label === 'number' ? label : p.income;
    return (
      <div
        style={{
          background: 'var(--chart-tooltip-bg, #fff)',
          border: '1px solid var(--chart-tooltip-border, #e5e7eb)',
          borderRadius: 4,
          padding: '8px 12px',
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
        }}
      >
        <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
          Income: {formatCurrency(Math.round(incomeLabel / 100) * 100)}
        </p>
        <p style={{ margin: 0 }}>
          Federal tax change: {formatCurrencyWithSign(p.federalTaxChange)}
        </p>
        <p style={{ margin: 0 }}>
          North Carolina state tax change: {formatCurrencyWithSign(p.stateTaxChange)}
        </p>
        <p style={{ margin: 0, fontWeight: 600 }}>
          Net income change: {formatCurrencyWithSign(p.netIncomeChange)}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-primary">Impact analysis</h2>

      {/* Personal impact */}
      <div>
        <h3 className="text-xl font-bold text-gray-800 mb-4">
          Your personal impact from the Stein FY2026-27 tax proposals ({request?.year ?? 2027})
        </h3>
        <p className="text-gray-600 mb-4">
          Based on your employment income of <strong>{formatCurrency(request?.income ?? 0)}</strong>,
          comparing the Stein reform ({request?.year ?? 2027}) to expected
          current law (which reflects the triggered rate cuts).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {metricCard('Federal tax change', federalTaxChangePoint, true)}
          {metricCard('North Carolina state tax change', stateTaxChangePoint, true)}
          {metricCard('Net income change', netIncomeChangePoint)}
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Chart */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-1 text-gray-800">
          Change in net income under the Stein reform ({request?.year ?? 2027})
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Stein FY2026-27 reform vs. expected current law, by employment income
        </p>
        <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="income"
                type="number"
                tickFormatter={formatIncome}
                stroke="var(--chart-reference)"
                domain={[0, xMax]}
                allowDataOverflow={false}
              />
              <YAxis tickFormatter={formatCurrency} stroke="var(--chart-reference)" width={80} />
              <Tooltip content={<HoverTooltip />} />
              <Legend />
              <ReferenceLine y={0} stroke="var(--chart-reference)" strokeWidth={2} />
              <Line
                type="monotone"
                dataKey="benefit"
                stroke="var(--chart-positive)"
                strokeWidth={3}
                name="Net income change"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        <ChartWatermark />
      </div>
    </div>
  );
}
