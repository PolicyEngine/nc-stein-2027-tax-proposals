// Renders with react-dom directly: @testing-library/react cannot load here,
// since its peer dependency @testing-library/dom is not installed.
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Home from '../app/(shell)/page';
import { pauseHouseholdCalculations } from '../hooks/useHouseholdImpact';
import { api, HouseholdCalculationError } from '../lib/api';

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

// The other tabs are not under test.
vi.mock('../components/PolicyOverview', () => ({ default: () => null }));
vi.mock('../components/AggregateImpact', () => ({ default: () => null }));
vi.mock('../components/CongressionalDistrictImpact', () => ({
  default: () => null,
}));

// One example card, whose precomputed answer the page shows without a
// calculation.
vi.mock('../components/ExampleHouseholds', () => ({
  default: ({
    onSelect,
  }: {
    onSelect: (profile: unknown, response: unknown) => void;
  }) => (
    <button
      onClick={() =>
        onSelect(
          {
            label: 'Single parent, one child',
            income: 40000,
            age_head: 30,
            married: false,
            dependents: [4],
            childcare_expenses: 0,
          },
          {
            income_range: [0, 40000, 100000],
            net_income_change: [0, 300, 0],
            federalTaxChange: [0, 0, 0],
            stateTaxChange: [0, -300, 0],
            netIncomeChange: [0, 300, 0],
            benefit_at_income: {
              baseline: 38000,
              reform: 38300,
              difference: 300,
              federal_tax_change: 0,
              state_tax_change: -300,
              net_income_change: 300,
            },
            x_axis_max: 100000,
          },
        )
      }
    >
      Load the example
    </button>
  ),
}));

const refusalMessage =
  'Everyone on your network, such as a workshop or an office, shares a ' +
  'limit on calculations a minute, and it has been reached.';

let renderedRoot: Root | null = null;
let rootContainer: HTMLDivElement | null = null;

function renderPage(): HTMLDivElement {
  rootContainer = document.createElement('div');
  document.body.appendChild(rootContainer);
  renderedRoot = createRoot(rootContainer);
  renderedRoot.render(
    <QueryClientProvider client={new QueryClient()}>
      <Home />
    </QueryClientProvider>,
  );
  return rootContainer;
}

/** The first element matching `selector` whose text contains `text`. */
function elementWithText(
  container: HTMLElement,
  selector: string,
  text: string,
): HTMLElement | undefined {
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).find(
    (element) => element.textContent?.includes(text),
  );
}

/** Waits for the button whose text contains `text`. */
async function findButton(
  container: HTMLElement,
  text: string,
): Promise<HTMLButtonElement> {
  await vi.waitFor(() =>
    expect(elementWithText(container, 'button', text)).toBeDefined(),
  );
  return elementWithText(container, 'button', text) as HTMLButtonElement;
}

async function openHouseholdImpactTab(container: HTMLElement): Promise<void> {
  (await findButton(container, 'Household impact')).click();
  await findButton(container, 'Load the example');
}

let originalScrollIntoView: typeof Element.prototype.scrollIntoView;

beforeEach(() => {
  // The page scrolls a chosen example into view, which jsdom cannot do.
  originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
  renderedRoot?.unmount();
  rootContainer?.remove();
  renderedRoot = null;
  rootContainer = null;
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.restoreAllMocks();
  pauseHouseholdCalculations(0);
});

describe('HouseholdImpactTab', () => {
  it("keeps an example's results on screen when the next calculation is refused", async () => {
    const calculate = vi
      .spyOn(api, 'calculateHouseholdImpact')
      .mockRejectedValue(
        new HouseholdCalculationError(refusalMessage, 429, false, true),
      );
    const container = renderPage();
    await openHouseholdImpactTab(container);
    (await findButton(container, 'Load the example')).click();
    await vi.waitFor(() =>
      expect(
        elementWithText(container, 'p', 'Based on your employment income of'),
      ).toHaveTextContent('$40,000'),
    );

    // The reader edits the household and calculates it.
    const yearSelect = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Tax year"]',
    )!;
    yearSelect.value = '2026';
    yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
    (await findButton(container, 'Calculate impact')).click();
    await vi.waitFor(() =>
      expect(calculate).toHaveBeenCalledWith(
        expect.objectContaining({ income: 40000, year: 2026 }),
      ),
    );

    await vi.waitFor(() =>
      expect(elementWithText(container, '[role="status"]', refusalMessage))
        .toBeDefined(),
    );
    // The example's results stay, with the example's own labels.
    expect(
      elementWithText(container, 'p', 'Based on your employment income of'),
    ).toHaveTextContent('$40,000');
    expect(
      elementWithText(container, 'h3', 'Your personal impact'),
    ).toHaveTextContent('(2027)');
    expect(container).not.toHaveTextContent(
      'Household calculator temporarily unavailable',
    );
  });

  it('explains the pause beside the Calculate button', async () => {
    pauseHouseholdCalculations();
    const container = renderPage();
    await openHouseholdImpactTab(container);

    const calculateButton = await findButton(container, 'Calculate again in');
    expect(calculateButton).toBeDisabled();
    const pauseExplanation =
      calculateButton.parentElement?.querySelector('[role="status"]') ?? null;
    expect(pauseExplanation).not.toBeNull();
    expect(pauseExplanation).toHaveTextContent(
      /^Everyone on your network, such as a workshop or an office, shares a limit on calculations a minute\. This page can calculate again in \d+ s\.$/,
    );
  });
});
