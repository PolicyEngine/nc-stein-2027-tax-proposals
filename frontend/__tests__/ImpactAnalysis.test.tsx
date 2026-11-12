// Renders with react-dom directly: @testing-library/react cannot load here,
// since its peer dependency @testing-library/dom is not installed.
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ImpactAnalysis from '../components/ImpactAnalysis';
import { pauseHouseholdCalculations } from '../hooks/useHouseholdImpact';
import { api, HouseholdCalculationError } from '../lib/api';
import type { HouseholdImpactResponse, HouseholdRequest } from '../lib/types';

// Recharts' ResponsiveContainer measures its parent, which jsdom cannot do.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

const earlierRequest: HouseholdRequest = {
  age_head: 35,
  age_spouse: null,
  dependent_ages: [5],
  income: 50000,
  year: 2026,
  max_earnings: 100000,
  state_code: 'NC',
  childcare_expenses: 0,
};

// The household submitted after the earlier one was answered.
const refusedRequest: HouseholdRequest = {
  ...earlierRequest,
  income: 75000,
  year: 2027,
};

const earlierAnswer: HouseholdImpactResponse = {
  income_range: [0, 50000, 100000],
  net_income_change: [0, 200, 0],
  federalTaxChange: [0, 0, 0],
  stateTaxChange: [0, -200, 0],
  netIncomeChange: [0, 200, 0],
  benefit_at_income: {
    baseline: 45000,
    reform: 45200,
    difference: 200,
    federal_tax_change: 0,
    state_tax_change: -200,
    net_income_change: 200,
  },
  x_axis_max: 100000,
};

const refusalMessage =
  'Everyone on your network, such as a workshop or an office, shares a ' +
  'limit on calculations a minute, and it has been reached. This page can ' +
  'calculate again in a minute.';

let renderedRoot: Root | null = null;
let rootContainer: HTMLDivElement | null = null;

function renderIntoDocument(element: React.ReactNode): HTMLDivElement {
  rootContainer = document.createElement('div');
  document.body.appendChild(rootContainer);
  renderedRoot = createRoot(rootContainer);
  renderedRoot.render(element);
  return rootContainer;
}

/** The first element matching `selector` whose text contains `text`. */
function elementWithText(
  container: HTMLElement,
  selector: string,
  text: string,
): Element | undefined {
  return Array.from(container.querySelectorAll(selector)).find((element) =>
    element.textContent?.includes(text),
  );
}

afterEach(() => {
  renderedRoot?.unmount();
  rootContainer?.remove();
  renderedRoot = null;
  rootContainer = null;
  vi.restoreAllMocks();
  pauseHouseholdCalculations(0);
});

describe('ImpactAnalysis', () => {
  it('shows the last answer and the notice after a rate-limit refusal', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['householdImpact', earlierRequest], earlierAnswer);
    vi.spyOn(api, 'calculateHouseholdImpact').mockRejectedValue(
      new HouseholdCalculationError(refusalMessage, 429, false, true),
    );

    const container = renderIntoDocument(
      <QueryClientProvider client={queryClient}>
        <ImpactAnalysis request={refusedRequest} triggered={true} maxEarnings={100000} />
      </QueryClientProvider>,
    );

    await vi.waitFor(() =>
      expect(container.querySelector('[role="status"]')).not.toBeNull(),
    );
    const notice = container.querySelector('[role="status"]');
    expect(notice).toHaveTextContent(refusalMessage);
    expect(notice).toHaveTextContent(
      'The results below are for the last household calculated.',
    );
    // The labels describe the household whose answer is shown.
    expect(
      elementWithText(container, 'p', 'Based on your employment income of'),
    ).toHaveTextContent('$50,000');
    expect(
      elementWithText(container, 'h3', 'Your personal impact'),
    ).toHaveTextContent('(2026)');
    expect(container).not.toHaveTextContent(
      'Household calculator temporarily unavailable',
    );
  });
});
