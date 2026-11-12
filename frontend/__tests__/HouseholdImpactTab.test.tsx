// Renders with react-dom directly: @testing-library/react cannot load here,
// since its peer dependency @testing-library/dom is not installed.
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Home from '../app/(shell)/page';
import { pauseHouseholdCalculations } from '../hooks/useHouseholdImpact';
import { api, HouseholdCalculationError } from '../lib/api';
import type { HouseholdImpactResponse } from '../lib/types';

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

// The other tabs are not under test.
vi.mock('../components/PolicyOverview', () => ({ default: () => null }));
vi.mock('../components/AggregateImpact', () => ({ default: () => null }));
vi.mock('../components/CongressionalDistrictImpact', () => ({
  default: () => null,
}));

// One example card, whose precomputed answer the page shows without a
// calculation, over a chart range of $200k. The card reports whether the
// page marks it as selected.
vi.mock('../components/ExampleHouseholds', () => ({
  default: ({
    onSelect,
    selectedLabel,
  }: {
    onSelect: (profile: unknown, response: unknown) => void;
    selectedLabel?: string | null;
  }) => (
    <button
      aria-pressed={selectedLabel === 'Single parent, one child'}
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
            income_range: [0, 40000, 200000],
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
            x_axis_max: 200000,
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

/** The page's default household, at $50,000, as the page calculates it. */
const calculatedAnswer: HouseholdImpactResponse = {
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

/**
 * Refuses a calculation for the firewall's limit and starts the pause, as
 * the API module does for a refusal.
 */
async function refuseAndPause(): Promise<HouseholdImpactResponse> {
  pauseHouseholdCalculations();
  throw new HouseholdCalculationError(refusalMessage, 429, false, true);
}

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

/** The chart x-axis range buttons, such as "$100k". */
function chartRangeButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button')).filter((button) =>
    /^\$\d+(k|M)$/.test(button.textContent ?? ''),
  );
}

/** The text of the chart x-axis range button the page highlights. */
function highlightedChartRange(container: HTMLElement): string | undefined {
  return chartRangeButtons(container).find((button) =>
    button.classList.contains('bg-primary-500'),
  )?.textContent ?? undefined;
}

/** The chart x-axis range button with the text `range`, such as "$500k". */
function chartRangeButton(
  container: HTMLElement,
  range: string,
): HTMLButtonElement {
  const rangeButton = chartRangeButtons(container).find(
    (button) => button.textContent === range,
  );
  expect(rangeButton).toBeDefined();
  return rangeButton!;
}

/** The label of the last tick on the chart's income axis: where it ends. */
function chartRangeEnd(container: HTMLElement): string | null | undefined {
  const tickLabels = container.querySelectorAll(
    '.recharts-xAxis .recharts-cartesian-axis-tick-value',
  );
  return tickLabels[tickLabels.length - 1]?.textContent;
}

/** The notice above a kept answer, once it is shown. */
function refusalNotice(container: HTMLElement): HTMLElement | undefined {
  return elementWithText(container, '[role="status"]', refusalMessage);
}

/**
 * Types `value` into the text input that shows `currentValue`. React reads
 * a typed value through the input's native setter and an input event.
 */
function typeIntoInput(
  container: HTMLElement,
  currentValue: string,
  value: string,
): void {
  const input = Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="text"]'),
  ).find((textInput) => textInput.value === currentValue);
  expect(input).toBeDefined();
  const setNativeValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!;
  setNativeValue.call(input, value);
  input!.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Shows the example, then has the reader edit its year and calculate the
 * edited household, which is refused.
 */
async function refuseEditedExample(container: HTMLElement): Promise<void> {
  await openHouseholdImpactTab(container);
  (await findButton(container, 'Load the example')).click();
  await vi.waitFor(() =>
    expect(
      elementWithText(container, 'p', 'Based on your employment income of'),
    ).toHaveTextContent('$40,000'),
  );
  const yearSelect = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Tax year"]',
  )!;
  yearSelect.value = '2026';
  yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
  (await findButton(container, 'Calculate impact')).click();
  await vi.waitFor(() => expect(refusalNotice(container)).toBeDefined());
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

  it('explains the pause beside the Calculate button, announcing only the explanation', async () => {
    pauseHouseholdCalculations();
    const container = renderPage();
    await openHouseholdImpactTab(container);

    const calculateButton = await findButton(container, 'Calculate again in');
    expect(calculateButton).toBeDisabled();
    const pauseNote = elementWithText(
      container,
      'p',
      'This page can calculate again in',
    );
    expect(calculateButton.parentElement).toContainElement(pauseNote ?? null);
    expect(pauseNote).toHaveTextContent(
      /^Everyone on your network, such as a workshop or an office, shares a limit on calculations a minute\. This page can calculate again in \d+ s\.$/,
    );
    // Only the explanation is a live region, so screen readers announce it
    // once: the countdown changes every second.
    expect(pauseNote?.closest('[role="status"]')).toBeNull();
    expect(pauseNote?.querySelector('[role="status"]')).toHaveTextContent(
      /^Everyone on your network, such as a workshop or an office, shares a limit on calculations a minute\.$/,
    );
  });

  it("keeps a calculated household's chart range and highlighted x-axis button after a refusal", async () => {
    // The page calculates the household itself, then the reader changes
    // the chart's range, which is refused.
    const calculate = vi
      .spyOn(api, 'calculateHouseholdImpact')
      .mockResolvedValueOnce(calculatedAnswer)
      .mockImplementation(refuseAndPause);
    const container = renderPage();
    await openHouseholdImpactTab(container);
    (await findButton(container, 'Calculate impact')).click();
    await vi.waitFor(() =>
      expect(
        elementWithText(container, 'p', 'Based on your employment income of'),
      ).toHaveTextContent('$50,000'),
    );
    expect(chartRangeEnd(container)).toBe('$100k');

    chartRangeButton(container, '$500k').click();
    await vi.waitFor(() => expect(refusalNotice(container)).toBeDefined());

    expect(calculate).toHaveBeenLastCalledWith(
      expect.objectContaining({ income: 50000, max_earnings: 500000 }),
    );
    // The answer calculated before stays, over its own range, and the
    // page highlights that range.
    expect(
      elementWithText(container, 'p', 'Based on your employment income of'),
    ).toHaveTextContent('$50,000');
    expect(chartRangeEnd(container)).toBe('$100k');
    expect(highlightedChartRange(container)).toBe('$100k');
  });

  it("keeps the example's card selected and its chart range after a refusal", async () => {
    vi.spyOn(api, 'calculateHouseholdImpact').mockImplementation(
      refuseAndPause,
    );
    const container = renderPage();

    await refuseEditedExample(container);

    expect(
      elementWithText(container, 'p', 'Based on your employment income of'),
    ).toHaveTextContent('$40,000');
    expect(await findButton(container, 'Load the example')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(chartRangeEnd(container)).toBe('$200k');
    expect(highlightedChartRange(container)).toBe('$200k');
  });

  it('rescales a kept example with the x-axis buttons during the pause, without a calculation', async () => {
    const calculate = vi
      .spyOn(api, 'calculateHouseholdImpact')
      .mockImplementation(refuseAndPause);
    const container = renderPage();
    await refuseEditedExample(container);
    expect(calculate).toHaveBeenCalledTimes(1);

    const rescaleButton = chartRangeButton(container, '$500k');
    expect(rescaleButton).toBeEnabled();
    rescaleButton.click();

    // The example is shown again directly, over the new range.
    await vi.waitFor(() => expect(chartRangeEnd(container)).toBe('$500k'));
    expect(highlightedChartRange(container)).toBe('$500k');
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(refusalNotice(container)).toBeUndefined();
    expect(
      elementWithText(container, 'p', 'Based on your employment income of'),
    ).toHaveTextContent('$40,000');
    expect(
      elementWithText(container, 'h3', 'Your personal impact'),
    ).toHaveTextContent('(2027)');
    expect(await findButton(container, 'Load the example')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows a refusal itself after the household tab is opened again', async () => {
    // Leaving the tab and coming back empties the results area, so a later
    // refusal must not bring the earlier answer back.
    const calculate = vi
      .spyOn(api, 'calculateHouseholdImpact')
      .mockResolvedValueOnce(calculatedAnswer)
      .mockImplementation(refuseAndPause);
    const container = renderPage();
    await openHouseholdImpactTab(container);
    (await findButton(container, 'Calculate impact')).click();
    await vi.waitFor(() =>
      expect(
        elementWithText(container, 'p', 'Based on your employment income of'),
      ).toHaveTextContent('$50,000'),
    );
    (await findButton(container, 'Policy overview')).click();
    await openHouseholdImpactTab(container);
    expect(
      elementWithText(container, 'p', 'Based on your employment income of'),
    ).toBeUndefined();

    typeIntoInput(container, '50,000', '60,000');
    (await findButton(container, 'Calculate impact')).click();
    await vi.waitFor(() =>
      expect(elementWithText(container, 'p', refusalMessage)).toBeDefined(),
    );

    expect(calculate).toHaveBeenLastCalledWith(
      expect.objectContaining({ income: 60000 }),
    );
    expect(
      elementWithText(container, 'p', 'Based on your employment income of'),
    ).toBeUndefined();
    expect(refusalNotice(container)).toBeUndefined();
    expect(container).toHaveTextContent(
      'Household calculator temporarily unavailable',
    );
  });
});
