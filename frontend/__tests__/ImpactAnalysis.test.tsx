// Renders with react-dom directly: @testing-library/react cannot load here,
// since its peer dependency @testing-library/dom is not installed.
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ImpactAnalysis from '../components/ImpactAnalysis';
import { pauseHouseholdCalculations } from '../hooks/useHouseholdImpact';
import { api, HouseholdCalculationError } from '../lib/api';
import type { HouseholdImpactResponse, HouseholdRequest } from '../lib/types';

// Recharts' ResponsiveContainer measures its parent, which jsdom cannot do,
// so the chart gets a fixed size instead, and draws its income axis.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  const { cloneElement } = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <div data-testid="responsive-container">
        {cloneElement(
          children as React.ReactElement<{ width: number; height: number }>,
          { width: 800, height: 400 },
        )}
      </div>
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
  'limit on calculations a minute, and it has been reached.';

// A new client for each test, so that no test sees what another showed.
let queryClient = new QueryClient();

let renderedRoot: Root | null = null;
let rootContainer: HTMLDivElement | null = null;

function renderIntoDocument(element: React.ReactNode): HTMLDivElement {
  rootContainer = document.createElement('div');
  document.body.appendChild(rootContainer);
  renderedRoot = createRoot(rootContainer);
  renderedRoot.render(element);
  return rootContainer;
}

/** Renders ImpactAnalysis again with new props, as the page does. */
function renderAgain(element: React.ReactNode): void {
  renderedRoot?.render(element);
}

/** ImpactAnalysis inside the test's query client. */
function impactAnalysis(props: React.ComponentProps<typeof ImpactAnalysis>) {
  return (
    <QueryClientProvider client={queryClient}>
      <ImpactAnalysis {...props} />
    </QueryClientProvider>
  );
}

/** Waits until the page shows the answer for `income`. */
async function waitForAnswerAtIncome(
  container: HTMLElement,
  income: string,
): Promise<void> {
  await vi.waitFor(() =>
    expect(
      elementWithText(container, 'p', 'Based on your employment income of'),
    ).toHaveTextContent(income),
  );
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

/** The label of the last tick on the chart's income axis: where it ends. */
function chartRangeEnd(container: HTMLElement): string | null | undefined {
  const tickLabels = container.querySelectorAll(
    '.recharts-xAxis .recharts-cartesian-axis-tick-value',
  );
  return tickLabels[tickLabels.length - 1]?.textContent;
}

beforeEach(() => {
  queryClient = new QueryClient();
});

afterEach(() => {
  renderedRoot?.unmount();
  rootContainer?.remove();
  renderedRoot = null;
  rootContainer = null;
  vi.restoreAllMocks();
  pauseHouseholdCalculations(0);
});

describe('ImpactAnalysis', () => {
  it('shows the answer that was on screen and the notice after a rate-limit refusal', async () => {
    queryClient.setQueryData(['householdImpact', earlierRequest], earlierAnswer);
    vi.spyOn(api, 'calculateHouseholdImpact').mockRejectedValue(
      new HouseholdCalculationError(refusalMessage, 429, false, true),
    );
    // The page shows the earlier household, then submits another.
    const container = renderIntoDocument(
      impactAnalysis({ request: earlierRequest, triggered: true, maxEarnings: 100000 }),
    );
    await waitForAnswerAtIncome(container, '$50,000');

    renderAgain(
      impactAnalysis({ request: refusedRequest, triggered: true, maxEarnings: 100000 }),
    );

    await vi.waitFor(() =>
      expect(container.querySelector('[role="status"]')).not.toBeNull(),
    );
    const notice = container.querySelector('[role="status"]');
    expect(notice).toHaveTextContent(refusalMessage);
    // The answer shown need not be the one calculated last.
    expect(notice).toHaveTextContent(
      'The results below are for the household shown before.',
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

  it('keeps an answer it calculated itself on screen after a rate-limit refusal', async () => {
    // The earlier answer is calculated while the component shows the
    // household, not placed in the cache before.
    const calculate = vi
      .spyOn(api, 'calculateHouseholdImpact')
      .mockResolvedValueOnce(earlierAnswer)
      .mockRejectedValue(
        new HouseholdCalculationError(refusalMessage, 429, false, true),
      );
    const container = renderIntoDocument(
      impactAnalysis({ request: earlierRequest, triggered: true, maxEarnings: 100000 }),
    );
    await waitForAnswerAtIncome(container, '$50,000');

    renderAgain(
      impactAnalysis({ request: refusedRequest, triggered: true, maxEarnings: 100000 }),
    );

    await vi.waitFor(() =>
      expect(container.querySelector('[role="status"]')).not.toBeNull(),
    );
    expect(calculate).toHaveBeenCalledTimes(2);
    expect(
      elementWithText(container, 'p', 'Based on your employment income of'),
    ).toHaveTextContent('$50,000');
    expect(container).not.toHaveTextContent(
      'Household calculator temporarily unavailable',
    );
  });

  it("draws the chart over the shown household's range after a rate-limit refusal", async () => {
    // The page passes the refused household's range; the chart keeps the
    // range of the household whose answer it shows.
    queryClient.setQueryData(['householdImpact', earlierRequest], earlierAnswer);
    vi.spyOn(api, 'calculateHouseholdImpact').mockRejectedValue(
      new HouseholdCalculationError(refusalMessage, 429, false, true),
    );
    const container = renderIntoDocument(
      impactAnalysis({ request: earlierRequest, triggered: true, maxEarnings: 100000 }),
    );
    await waitForAnswerAtIncome(container, '$50,000');
    expect(chartRangeEnd(container)).toBe('$100k');

    renderAgain(
      impactAnalysis({
        request: { ...earlierRequest, max_earnings: 500000 },
        triggered: true,
        maxEarnings: 500000,
      }),
    );

    await vi.waitFor(() =>
      expect(container.querySelector('[role="status"]')).not.toBeNull(),
    );
    expect(chartRangeEnd(container)).toBe('$100k');
  });

  it('tells the page which household is shown after a rate-limit refusal', async () => {
    // The page highlights the chart range of the household shown, not the
    // range of the refused one.
    queryClient.setQueryData(['householdImpact', earlierRequest], earlierAnswer);
    vi.spyOn(api, 'calculateHouseholdImpact').mockRejectedValue(
      new HouseholdCalculationError(refusalMessage, 429, false, true),
    );
    const shownRequests: Array<HouseholdRequest | null> = [];
    const recordShownRequest = (request: HouseholdRequest | null) => {
      shownRequests.push(request);
    };
    const container = renderIntoDocument(
      impactAnalysis({
        request: earlierRequest,
        triggered: true,
        maxEarnings: 100000,
        onShownRequestChange: recordShownRequest,
      }),
    );
    await waitForAnswerAtIncome(container, '$50,000');

    renderAgain(
      impactAnalysis({
        request: { ...earlierRequest, max_earnings: 500000 },
        triggered: true,
        maxEarnings: 500000,
        onShownRequestChange: recordShownRequest,
      }),
    );

    await vi.waitFor(() =>
      expect(container.querySelector('[role="status"]')).not.toBeNull(),
    );
    expect(shownRequests.at(-1)).toEqual(earlierRequest);
  });
});
