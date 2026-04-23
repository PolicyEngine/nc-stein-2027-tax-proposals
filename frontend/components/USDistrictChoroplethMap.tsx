'use client';

import { useMemo, useState } from 'react';

export interface NCDistrictData {
  district: string;
  district_number: string;
  representative: string;
  party?: 'R' | 'D';
  region: string;
  average_household_income_change: number;
  relative_household_income_change: number;
  winners_share?: number;
  losers_share?: number;
  poverty_pct_change?: number;
  child_poverty_pct_change?: number;
  state?: string;
}

interface Props {
  data: NCDistrictData[];
  selectedDistrict: string | null;
  onSelect: (districtNumber: string) => void;
}

// PolicyEngine diverging color scale (gray -> teal)
const DIVERGING_COLORS = [
  '#475569', // gray-600 (most negative)
  '#94A3B8', // gray-400
  '#E2E8F0', // gray-200 (neutral/zero)
  '#81E6D9', // teal-200
  '#319795', // teal-500 (most positive)
];

// North Carolina has 14 congressional districts (NC-01 through NC-14) with
// state FIPS code 37. True geographic SVG paths for NC districts are not
// bundled in this file; instead we lay out the 14 districts as a labeled
// grid. Consumers that need geographic geometry can read
// `public/data/geojson/congressional_districts.geojson` directly.
// TODO: replace the grid with projected NC district polygons from the
// bundled geojson when geographic fidelity is required.
const NC_DISTRICT_COUNT = 14;
const GRID_COLS = 7;
const GRID_ROWS = 2;
const CELL_W = 54;
const CELL_H = 54;
const CELL_GAP = 6;
const GRID_PAD = 10;

function cellForDistrict(idx: number) {
  const col = idx % GRID_COLS;
  const row = Math.floor(idx / GRID_COLS);
  const x = GRID_PAD + col * (CELL_W + CELL_GAP);
  const y = GRID_PAD + row * (CELL_H + CELL_GAP);
  return {
    x,
    y,
    cx: x + CELL_W / 2,
    cy: y + CELL_H / 2,
  };
}

const NC_DISTRICT_LAYOUT: Record<
  string,
  { x: number; y: number; cx: number; cy: number }
> = Object.fromEntries(
  Array.from({ length: NC_DISTRICT_COUNT }, (_, i) => [
    String(i + 1),
    cellForDistrict(i),
  ]),
);

const VIEWBOX_W =
  GRID_PAD * 2 + GRID_COLS * CELL_W + (GRID_COLS - 1) * CELL_GAP;
const VIEWBOX_H =
  GRID_PAD * 2 + GRID_ROWS * CELL_H + (GRID_ROWS - 1) * CELL_GAP;

const parseHex = (color: string) => ({
  r: parseInt(color.slice(1, 3), 16),
  g: parseInt(color.slice(3, 5), 16),
  b: parseInt(color.slice(5, 7), 16),
});

function interpolateColor(value: number, min: number, max: number): string {
  if (min >= max) return DIVERGING_COLORS[2];
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const segments = DIVERGING_COLORS.length - 1;
  const segPos = t * segments;
  const segIndex = Math.min(Math.floor(segPos), segments - 1);
  const segT = segPos - segIndex;
  const c0 = parseHex(DIVERGING_COLORS[segIndex]);
  const c1 = parseHex(DIVERGING_COLORS[segIndex + 1]);
  const r = Math.round(c0.r + (c1.r - c0.r) * segT);
  const g = Math.round(c0.g + (c1.g - c0.g) * segT);
  const b = Math.round(c0.b + (c1.b - c0.b) * segT);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
};

const formatSignedCurrency = (value: number) => {
  const base = formatCurrency(Math.abs(value));
  if (value > 0) return `+${base}`;
  if (value < 0) return `-${base}`;
  return base;
};

export default function NCDistrictChoroplethMap({
  data,
  selectedDistrict,
  onSelect,
}: Props) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    districtNumber: string;
  } | null>(null);

  const dataByDistrict = useMemo(() => {
    const map = new Map<string, NCDistrictData>();
    data.forEach((d) => map.set(d.district_number, d));
    return map;
  }, [data]);

  const colorRange = useMemo(() => {
    if (data.length === 0) return { min: 0, max: 0 };
    const values = data.map((d) => d.average_household_income_change);
    const maxAbs = Math.max(...values.map(Math.abs));
    return { min: -maxAbs, max: maxAbs };
  }, [data]);

  const tooltipData = tooltip ? dataByDistrict.get(tooltip.districtNumber) : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        style={{ width: '100%', height: 'auto', maxHeight: 260 }}
        role="img"
        aria-label="North Carolina's 14 congressional districts"
      >
        {Object.entries(NC_DISTRICT_LAYOUT).map(([num, cell]) => {
          const districtData = dataByDistrict.get(num);
          const value = districtData?.average_household_income_change ?? 0;
          const fill = districtData
            ? interpolateColor(value, colorRange.min, colorRange.max)
            : '#e5e7eb';
          const isSelected = selectedDistrict === num;

          return (
            <g
              key={num}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(num)}
              onMouseEnter={(evt) =>
                setTooltip({
                  x: evt.clientX,
                  y: evt.clientY,
                  districtNumber: num,
                })
              }
              onMouseMove={(evt) =>
                setTooltip({
                  x: evt.clientX,
                  y: evt.clientY,
                  districtNumber: num,
                })
              }
              onMouseLeave={() => setTooltip(null)}
            >
              <rect
                x={cell.x}
                y={cell.y}
                width={CELL_W}
                height={CELL_H}
                rx={6}
                ry={6}
                fill={fill}
                stroke={isSelected ? '#0f766e' : '#ffffff'}
                strokeWidth={isSelected ? 2.5 : 1}
                style={{
                  transition: 'opacity 0.15s',
                  opacity: tooltip && tooltip.districtNumber !== num ? 0.7 : 1,
                }}
              />
              <text
                x={cell.cx}
                y={cell.cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="14"
                fontWeight="700"
                fill="#ffffff"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {num}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && tooltipData && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 pointer-events-none"
          style={{
            left: tooltip.x + 10,
            top: tooltip.y + 10,
          }}
        >
          <p className="font-semibold text-gray-900">
            NC-{String(tooltipData.district_number).padStart(2, '0')}
          </p>
          {tooltipData.representative && (
            <p className="text-sm text-gray-700">{tooltipData.representative}</p>
          )}
          <p className="text-sm text-gray-600">
            Avg impact: {formatSignedCurrency(tooltipData.average_household_income_change)}
          </p>
          <p className="text-sm text-gray-600">
            ({(tooltipData.relative_household_income_change * 100).toFixed(2)}% of income)
          </p>
        </div>
      )}

      <p className="text-xs text-gray-500 text-center mt-4">
        Average household impact from the Stein FY2026-27 tax proposals, by North Carolina congressional district (state FIPS 37)
      </p>
    </div>
  );
}
