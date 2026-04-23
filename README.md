# NC Gov. Stein FY2026-27 tax proposals dashboard

Interactive calculator for Governor Josh Stein's FY2026-27 Budget tax
proposals for North Carolina.

**Live:** https://nc-governor-tax-proposals.vercel.app/us/nc-stein-2027-tax-proposals

**Reference:** [NC OSBM FY2026-27 Governor's Recommended Budget, p.69](https://www.osbm.nc.gov/fy2026-27-budget-rec-budget-book/open#page=69)

## Provisions modeled

1. **Maintain 3.99% individual income tax rate** (repeals triggered
   reductions that would cut the rate to 3.49% in 2027 and 2.99% in 2028).
2. **Raise the standard deduction starting 2027**: +$1,000 MFJ and
   surviving spouse, +$750 head of household, +$500 single and MFS.
3. **Refundable Working Families Tax Credit** = 10% of federal EITC
   (2026+). Implemented via `gov.contrib.states.nc.eitc` (already in
   policyengine-us).
4. **Refundable child and dependent care tax credit** = 30% of federal
   CDCC (2026+). Implemented via `gov.contrib.states.nc.cdcc` (see PR
   [policyengine-us#8142](https://github.com/PolicyEngine/policyengine-us/pull/8142)).

## Provisions not modeled (footnoted on the Policy Overview tab)

- **Sales Tax Back-to-School Holiday** — PolicyEngine-US does not cover
  NC sales tax.
- **Maintain 2% corporate income tax rate** — PolicyEngine-US does not
  cover corporate income tax.

## Layout

```
reform.json                  Stein reform parameter overrides
baseline_adjustments.json    Triggered rate cuts under current NC law
nc_tax_calc/                 Python package: household + microsimulation
scripts/                     Pipelines (local + Modal)
frontend/                    Next.js 14 app
tests/                       Python tests (import paths updated; some
                             assertions still reference the Utah template
                             and need rewriting)
```

## Local development

```bash
cd frontend && npm install
make dev                   # serves on http://localhost:4000
make build                 # Next.js production build
```

## Microsimulation pipelines

```bash
# Local (subprocess-per-year)
make pipeline

# Modal (cloud, parallel years)
make pipeline-modal

# District placeholder CSV (14 NC districts, FIPS 37)
make pipeline-districts
```

The Modal pipeline writes `frontend/public/data/*.csv`:
`distributional_impact.csv`, `metrics.csv`, `winners_losers.csv`,
`income_brackets.csv`.

## Post-CDCC-merge checklist

Once [policyengine-us#8142](https://github.com/PolicyEngine/policyengine-us/pull/8142)
merges:

1. **Bump policyengine-us version** in `scripts/modal_pipeline.py` image
   pin to the released version that includes NC CDCC (and update
   `pyproject.toml` dependencies to match).
2. **Verify EITC + CDCC composition.** The `nc_eitc` and `nc_cdcc`
   reforms each redefine `nc_refundable_credits` to return only their
   own credit. Because policyengine-us applies auto-contrib reforms
   sequentially, the last-applied reform wins — so with both active,
   `nc_refundable_credits = nc_cdcc` and the EITC does not flow through
   `nc_income_tax`. Either:
   - Wait for an upstream fix that sums the two credits in
     `nc_refundable_credits` when both are active, OR
   - Patch the composition locally in `nc_tax_calc/reforms.py` by
     adding a composed reform that overrides `nc_refundable_credits`
     to equal `nc_eitc + nc_cdcc`.
3. **Run the Modal pipeline** for 2026, 2027, 2028:
   `make pipeline-modal` (or
   `modal run scripts/modal_pipeline.py --years 2026,2027,2028`).
4. **Commit generated CSVs** under `frontend/public/data/` and push —
   Vercel auto-deploys.
5. **Sanity check** household-level output on the live site for a
   low-income NC family with young children (should show a gain from
   EITC + CDCC in 2026 and additional gain from rate + std deduction
   maintenance in 2027+).

## Impact sign convention

`impact = reform - baseline`
- Positive value → household gains net income under the Stein proposal.
- Negative value → household pays more in taxes / cost to government.

The baseline already layers in the triggered rate cuts from
`baseline_adjustments.json`, so the dashboard compares the Stein package
against *expected current law*, not the raw policyengine-us baseline.
