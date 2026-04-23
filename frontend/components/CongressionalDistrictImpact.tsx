'use client';

import { useState, useEffect } from 'react';
import NCDistrictMap, { NCDistrictData } from './DynamicDistrictMap';
import ChartWatermark from './ChartWatermark';
import { NC_DASHBOARD_DEFAULT_YEAR, NC_DASHBOARD_YEARS } from '@/hooks/useAggregateImpact';

interface Props {
  year?: number;
}

// North Carolina representatives (119th Congress, NC-01..NC-14).
// TODO: confirm representative names and party affiliations against the
// current House roster; values below reflect the 119th Congress as seated.
const NC_REPRESENTATIVES: Record<string, { name: string; party: 'R' | 'D' }> = {
  '1': { name: 'Don Davis', party: 'D' },
  '2': { name: 'Deborah Ross', party: 'D' },
  '3': { name: 'Greg Murphy', party: 'R' },
  '4': { name: 'Valerie Foushee', party: 'D' },
  '5': { name: 'Virginia Foxx', party: 'R' },
  '6': { name: 'Addison McDowell', party: 'R' },
  '7': { name: 'David Rouzer', party: 'R' },
  '8': { name: 'Mark Harris', party: 'R' },
  '9': { name: 'Richard Hudson', party: 'R' },
  '10': { name: 'Pat Harrigan', party: 'R' },
  '11': { name: 'Chuck Edwards', party: 'R' },
  '12': { name: 'Alma Adams', party: 'D' },
  '13': { name: 'Brad Knott', party: 'R' },
  '14': { name: 'Tim Moore', party: 'R' },
};

function partyColor(party: 'R' | 'D' | undefined) {
  if (party === 'R') return '#dc2626'; // red-600
  if (party === 'D') return '#2563eb'; // blue-600
  return '#6b7280'; // gray-500
}

// Broad regional labels for context in the all-districts table.
const NC_DISTRICT_REGIONS: Record<string, string> = {
  '1': 'Northeastern NC',
  '2': 'Raleigh / Wake County',
  '3': 'Eastern NC / Outer Banks',
  '4': 'Durham / Orange / Granville',
  '5': 'Northwestern NC / Foothills',
  '6': 'Piedmont Triad',
  '7': 'Southeastern NC / Wilmington',
  '8': 'South-Central NC / Sandhills',
  '9': 'Fayetteville / Southern Piedmont',
  '10': 'Western Piedmont / Hickory',
  '11': 'Western NC / Asheville',
  '12': 'Charlotte / Mecklenburg',
  '13': 'Central NC / Johnston',
  '14': 'Greater Charlotte / Gaston',
};

export default function CongressionalDistrictImpact({ year }: Props) {
  const [selectedYear, setSelectedYear] = useState<number>(
    year ?? NC_DASHBOARD_DEFAULT_YEAR,
  );
  const [data, setData] = useState<NCDistrictData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);

  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH !== undefined
      ? process.env.NEXT_PUBLIC_BASE_PATH
      : '/us/nc-stein-2027-tax-proposals';

    setLoading(true);
    fetch(`${basePath}/data/congressional_districts.csv`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load district data');
        return res.text();
      })
      .then((text) => {
        const lines = text.trim().split(/\r?\n/);
        const headers = lines[0].split(',').map((h) => h.trim());
        const rows = lines.slice(1).map((line) => {
          const values = line.split(',').map((v) => v.trim());
          const row: Record<string, string | number> = {};
          headers.forEach((h, i) => {
            const val = values[i];
            row[h] = isNaN(Number(val)) ? val : Number(val);
          });
          return row as unknown as NCDistrictData & { state: string; year: number };
        });
        // Filter to North Carolina only (state code "NC") and selected year.
        const ncRows = rows
          .filter((r) => r.state === 'NC' && r.year === selectedYear)
          .map((r) => {
            const districtNum = String(r.district).split('-')[1] || '';
            const districtId = districtNum.replace(/^0+/, '') || districtNum;
            const rep = NC_REPRESENTATIVES[districtId];
            return {
              ...r,
              district_number: districtId,
              representative: rep?.name || '',
              party: rep?.party,
              region: NC_DISTRICT_REGIONS[districtId] || '',
            } as NCDistrictData;
          })
          .sort((a, b) =>
            Number(a.district_number) - Number(b.district_number)
          );
        setData(ncRows);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [selectedYear]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading North Carolina district data...</p>
        </div>
      </div>
    );
  }

  if (error || data.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h2 className="text-yellow-800 font-semibold mb-2">
          North Carolina district data not yet available
        </h2>
        <p className="text-yellow-700">
          {error || 'North Carolina district-level impact data has not been generated yet.'}
        </p>
        <p className="text-yellow-700 mt-2">
          Run: <code className="bg-yellow-100 px-2 py-1 rounded">modal run scripts/modal_district_pipeline.py</code>
        </p>
      </div>
    );
  }

  const selectedData = selectedDistrict
    ? data.find((d) => d.district_number === selectedDistrict) || null
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          North Carolina congressional district impacts ({selectedYear})
        </h3>
        <p className="text-gray-600">
          Average household impact by congressional district under Governor
          Stein&apos;s FY2026-27 tax proposals, relative to expected current
          law (which reflects the triggered individual income tax rate cuts).
          Hover over a district for details and click to pin.
        </p>
      </div>

      {/* Year selector */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
        <span>Tax year:</span>
        {NC_DASHBOARD_YEARS.map((y) => (
          <button
            key={y}
            onClick={() => setSelectedYear(y)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedYear === y
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <NCDistrictMap
          data={data}
          selectedDistrict={selectedDistrict}
          onSelect={(districtNum) =>
            setSelectedDistrict((prev) =>
              prev === districtNum ? null : districtNum
            )
          }
        />
        <ChartWatermark />
      </div>

      {/* Detail card below map */}
      {selectedData ? (
        <DistrictDetailCard
          district={selectedData}
          onClose={() => setSelectedDistrict(null)}
        />
      ) : (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-6 text-center">
          <p className="text-gray-500 text-sm">
            Click a district on the map to see detailed impact analysis.
          </p>
        </div>
      )}

      {/* All districts table */}
      <div>
        <h4 className="text-lg font-semibold text-gray-900 mb-3">
          All North Carolina districts
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-900">District</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-900">Representative</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-900">Average change</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-900">Relative change</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-900">Winners</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr
                  key={d.district_number}
                  className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                    selectedDistrict === d.district_number ? 'bg-teal-50' : ''
                  }`}
                  onClick={() =>
                    setSelectedDistrict((prev) =>
                      prev === d.district_number ? null : d.district_number
                    )
                  }
                >
                  <td className="py-3 px-4 text-gray-700 font-medium">
                    NC-{String(d.district_number).padStart(2, '0')}
                    <span className="block text-xs text-gray-500 font-normal">{d.region}</span>
                  </td>
                  <td className="py-3 px-4" style={{ color: partyColor(d.party) }}>
                    {d.representative}
                    {d.party ? <span className="ml-1 text-xs">({d.party})</span> : null}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {d.average_household_income_change >= 0 ? '+' : ''}
                    ${d.average_household_income_change.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {(d.relative_household_income_change * 100).toFixed(2)}%
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {d.winners_share !== undefined
                      ? `${(d.winners_share * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DistrictDetailCard({
  district,
  onClose,
}: {
  district: NCDistrictData;
  onClose: () => void;
}) {
  const avgChange = district.average_household_income_change;
  const isPositive = avgChange > 0;
  const isNegative = avgChange < 0;
  const winnersShare = district.winners_share ?? 0;
  const losersShare = district.losers_share ?? 0;
  // "No change" is the residual after winners + losers.
  const noChangeShare = Math.max(0, 1 - winnersShare - losersShare);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-white font-bold text-lg"
            style={{ backgroundColor: isPositive ? '#319795' : isNegative ? '#dc2626' : '#475569' }}
          >
            {district.district_number}
          </span>
          <div>
            <h4 className="text-lg font-semibold text-gray-900">
              North Carolina District {district.district_number}
            </h4>
            <p className="text-sm text-gray-500">
              <span style={{ color: partyColor(district.party) }}>
                {district.representative}
                {district.party ? ` (${district.party})` : ''}
              </span>
              {district.region ? ` — ${district.region}` : ''}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1"
          title="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Average household impact
          </p>
          <p
            className={`text-xl font-bold ${
              isPositive ? 'text-teal-700' : isNegative ? 'text-red-700' : 'text-gray-700'
            }`}
          >
            {isPositive ? '+' : ''}
            ${avgChange.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {(district.relative_household_income_change * 100).toFixed(2)}% of income
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Winners</p>
          <p className="text-xl font-bold text-teal-600">
            {(winnersShare * 100).toFixed(1)}%
          </p>
          <p className="text-xs text-gray-500 mt-1">of households gain</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Losers</p>
          <p className="text-xl font-bold text-red-600">
            {(losersShare * 100).toFixed(1)}%
          </p>
          <p className="text-xs text-gray-500 mt-1">of households lose</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">No change</p>
          <p className="text-xl font-bold text-gray-600">
            {(noChangeShare * 100).toFixed(1)}%
          </p>
          <p className="text-xs text-gray-500 mt-1">of households</p>
        </div>
      </div>
    </div>
  );
}
