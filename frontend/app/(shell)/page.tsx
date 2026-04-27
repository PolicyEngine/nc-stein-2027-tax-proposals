'use client';

import { useState, useEffect, useCallback } from 'react';
import ImpactAnalysis from '@/components/ImpactAnalysis';
import AggregateImpact from '@/components/AggregateImpact';
import PolicyOverview from '@/components/PolicyOverview';
import CongressionalDistrictImpact from '@/components/CongressionalDistrictImpact';
import type { HouseholdRequest } from '@/lib/types';
import { parseHashParams } from '@/lib/embedding';

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<'policy' | 'impact' | 'aggregate' | 'districts'>('policy');

  const TAB_CONFIG = [
    { id: 'policy' as const, label: 'Policy overview' },
    { id: 'impact' as const, label: 'Household impact' },
    { id: 'aggregate' as const, label: 'Statewide impact' },
    { id: 'districts' as const, label: 'Congressional districts' },
  ];

  // Simple tab change handler
  const handleTabChange = useCallback((tab: 'policy' | 'impact' | 'aggregate' | 'districts') => {
    setActiveTab(tab);
  }, []);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary-500 text-white py-8 px-4 shadow-md">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">
            North Carolina Stein FY2026-27 Tax Proposals Calculator
          </h1>
          <p className="text-lg opacity-90">
            See the impact of Governor Josh Stein&apos;s FY2026-27 budget tax proposals on North Carolina households
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex space-x-1 mb-4" role="tablist">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => handleTabChange(tab.id)}
              className={`px-6 py-3 rounded-t-lg font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-primary-600 border-t-4 border-primary-500'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          className="bg-white rounded-lg shadow-md p-6"
        >
          {activeTab === 'policy' ? (
            <PolicyOverview />
          ) : activeTab === 'impact' ? (
            <HouseholdImpactTab />
          ) : activeTab === 'aggregate' ? (
            <AggregateImpactTab />
          ) : (
            <CongressionalDistrictImpact />
          )}
        </div>
      </div>
    </main>
  );
}

/** Household impact tab */
function HouseholdImpactTab() {
  // Initialize state from hash parameters if present
  const getInitialValues = () => {
    if (typeof window === 'undefined') {
      return { income: 50000, age: 35, state: 'NC', married: false, dependents: [5] };
    }
    const params = parseHashParams(window.location.hash);
    return {
      income: params.income ?? 50000,
      age: params.age ?? 35,
      state: params.state ?? 'NC',
      married: params.married ?? false,
      dependents: params.dependents ?? [5],
    };
  };

  const initialValues = getInitialValues();
  const [ageHead, setAgeHead] = useState(initialValues.age);
  const [ageHeadRaw, setAgeHeadRaw] = useState(String(initialValues.age));
  const [ageSpouse, setAgeSpouse] = useState<number | null>(initialValues.married ? 35 : null);
  const [ageSpouseRaw, setAgeSpouseRaw] = useState('35');
  const [married, setMarried] = useState(initialValues.married);
  const [dependentAges, setDependentAges] = useState<number[]>(initialValues.dependents);
  const [income, setIncome] = useState(initialValues.income);
  const [childcareExpenses, setChildcareExpenses] = useState(0);
  const [stateCode, setStateCode] = useState(initialValues.state);
  const [year, setYear] = useState<number>(2027);
  const [maxEarnings, setMaxEarnings] = useState(100000);
  const [triggered, setTriggered] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<HouseholdRequest | null>(null);

  // Listen for hash changes to update form values
  useEffect(() => {
    const handleHashChange = () => {
      const params = parseHashParams(window.location.hash);
      if (params.income !== undefined) setIncome(params.income);
      if (params.age !== undefined) {
        setAgeHead(params.age);
        setAgeHeadRaw(String(params.age));
      }
      if (params.state) setStateCode(params.state);
      if (params.married !== undefined) {
        setMarried(params.married);
        if (params.married) {
          setAgeSpouse(35);
          setAgeSpouseRaw('35');
        } else {
          setAgeSpouse(null);
        }
      }
      if (params.dependents) setDependentAges(params.dependents);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleMarriedChange = (value: boolean) => {
    setMarried(value);
    if (!value) {
      setAgeSpouse(null);
    } else {
      setAgeSpouse(35);
      setAgeSpouseRaw('35');
    }
  };

  const handleDependentCountChange = (count: number) => {
    const ages = [...dependentAges];
    while (ages.length < count) ages.push(5);
    ages.splice(count);
    setDependentAges(ages);
  };

  const formatNumber = (num: number) => num.toLocaleString('en-US');
  const parseNumber = (str: string) => {
    const num = Number(str.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  };

  const buildRequest = (): HouseholdRequest => ({
    age_head: ageHead,
    age_spouse: married ? ageSpouse : null,
    dependent_ages: dependentAges,
    income,
    year,
    max_earnings: maxEarnings,
    state_code: stateCode,
    childcare_expenses: childcareExpenses,
  });

  const handleCalculate = () => {
    setSubmittedRequest(buildRequest());
    setTriggered(true);
  };

  return (
    <div className="space-y-6">
      {/* Inline household config */}
      <section className="bg-gray-50 rounded-xl p-6 md:p-8 border border-gray-200 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Your household</h2>

        {/* Row 1: Income, Age, Filing status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
          {/* Employment income */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">
              Employment income
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
              <input
                type="text"
                value={formatNumber(income)}
                onChange={(e) => setIncome(parseNumber(e.target.value))}
                className="w-full pl-6 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
          </div>

          {/* Ages (head + spouse when joint) */}
          <div>
            <div className={married ? 'grid grid-cols-2 gap-3' : ''}>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1.5">
                  Your age
                </label>
                <input
                  type="number"
                  value={ageHeadRaw}
                  onChange={(e) => setAgeHeadRaw(e.target.value)}
                  onBlur={() => {
                    const clamped = Math.max(18, Math.min(100, parseInt(ageHeadRaw) || 18));
                    setAgeHead(clamped);
                    setAgeHeadRaw(String(clamped));
                  }}
                  min={18}
                  max={100}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              </div>
              {married && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">
                    Spouse age
                  </label>
                  <input
                    type="number"
                    value={ageSpouseRaw}
                    onChange={(e) => setAgeSpouseRaw(e.target.value)}
                    onBlur={() => {
                      const clamped = Math.max(18, Math.min(100, parseInt(ageSpouseRaw) || 18));
                      setAgeSpouse(clamped);
                      setAgeSpouseRaw(String(clamped));
                    }}
                    min={18}
                    max={100}
                    aria-label="Spouse age"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Filing status */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Filing status</label>
            <label
              htmlFor="married"
              className="flex items-center gap-3 w-full px-3 py-2 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <input
                type="checkbox"
                id="married"
                checked={married}
                onChange={(e) => handleMarriedChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Married filing jointly</span>
            </label>
          </div>
        </div>

        {/* Row 2: Dependents + Year */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5 mt-5">
          {/* Year */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Tax year</label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              aria-label="Tax year"
            >
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
              <option value={2028}>2028</option>
            </select>
          </div>

          {/* Dependents */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Dependents</label>
            <input
              type="number"
              value={dependentAges.length}
              onChange={(e) => handleDependentCountChange(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
              min={0}
              max={10}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            />
            {dependentAges.length > 0 && (
              <div className="mt-2">
                <span className="block text-xs font-medium text-gray-500 mb-1">Age(s) - children under 13 qualify for the CDCC</span>
                <div className="grid grid-cols-3 gap-1.5">
                {dependentAges.map((age, i) => (
                  <input
                    key={i}
                    type="number"
                    value={age}
                    onChange={(e) => {
                      const newAges = [...dependentAges];
                      newAges[i] = Math.max(0, Math.min(26, parseInt(e.target.value) || 0));
                      setDependentAges(newAges);
                    }}
                    min={0}
                    max={26}
                    className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                    placeholder={`Age ${i + 1}`}
                    aria-label={`Dependent ${i + 1} age`}
                  />
                ))}
                </div>
              </div>
            )}
          </div>

          {/* Childcare expenses (CDCC) */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">
              Annual childcare expenses
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
              <input
                type="text"
                value={formatNumber(childcareExpenses)}
                onChange={(e) => setChildcareExpenses(parseNumber(e.target.value))}
                placeholder="0"
                aria-label="Annual childcare expenses"
                className="w-full pl-6 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>
          </div>

        </div>

        {/* Calculate button */}
        <div className="mt-8">
          <button
            onClick={handleCalculate}
            className="py-3 px-10 rounded-lg font-semibold text-white bg-primary-500 hover:bg-primary-600 active:bg-primary-700 transition-all shadow-sm hover:shadow-md sm:w-auto w-full"
          >
            Calculate impact
          </button>
        </div>
      </section>

      {/* Chart x-axis options */}
      {triggered && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>Chart x-axis max:</span>
          {[100000, 200000, 500000, 1000000].map((v) => (
            <button
              key={v}
              onClick={() => {
                setMaxEarnings(v);
                setSubmittedRequest(prev => prev ? { ...prev, max_earnings: v } : null);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                maxEarnings === v
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              ${v >= 1000000 ? `${v / 1000000}M` : `${v / 1000}k`}
            </button>
          ))}
        </div>
      )}

      {/* Impact results */}
      {submittedRequest && (
        <ImpactAnalysis request={submittedRequest} triggered={triggered} maxEarnings={maxEarnings} />
      )}
    </div>
  );
}

/** Statewide impact tab (NC-level) */
function AggregateImpactTab() {
  return (
    <div className="space-y-6">
      <AggregateImpact triggered={true} />
    </div>
  );
}
