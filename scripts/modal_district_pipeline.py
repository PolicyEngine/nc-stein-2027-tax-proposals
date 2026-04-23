"""Modal-based congressional-district impact pipeline for the NC Stein
FY2026-27 tax proposals.

Calculates district-level impacts for North Carolina's 14 congressional
districts (NC-01..NC-14; state_fips=37) using district-specific
datasets on HuggingFace.

Baseline sim applies ``baseline_adjustments.json`` (triggered rate cuts
under current NC law: 3.49% in 2027, 2.99% in 2028). Reform sim applies
``reform.json`` (the Stein package). Impact convention:
``reform - baseline`` (positive = household gains).

Usage:
    modal run scripts/modal_district_pipeline.py                        # all 14 NC districts, default year
    modal run scripts/modal_district_pipeline.py --year 2027
    modal run scripts/modal_district_pipeline.py --years 2026,2027,2028
"""

import os

import modal


app = modal.App("nc-stein-2027-tax-proposals-district-pipeline")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install(
        # Install from the merge commit for policyengine-us PR #8142
        # (NC CDCC contrib reform + nc_refundable_credits stacking fix).
        # Switch to a PyPI pin once a release including that commit is
        # published.
        "policyengine-us @ git+https://github.com/PolicyEngine/policyengine-us.git@cd40083a6e7f81d303a532501f2026798a53d50e",
        "numpy>=1.24.0",
        "pandas>=2.0.0",
        "huggingface_hub",
    )
)

# Stein proposals: EITC and CDCC take effect 2026; rate maintenance and
# standard deduction increases take effect 2027.
YEARS = [2026, 2027, 2028]
DEFAULT_YEAR = 2027

# North Carolina: 14 congressional districts, state FIPS 37.
NC_STATE = "NC"
NC_STATE_FIPS = 37
NC_DISTRICTS = list(range(1, 15))

# Baseline adjustment: rate-reduction triggers in current NC law that
# PolicyEngine-US does not yet encode. Applied to the baseline sim.
BASELINE_ADJUSTMENTS_DICT = {
    "gov.states.nc.tax.income.rate": {
        "2027-01-01.2027-12-31": 0.0349,
        "2028-01-01.2100-12-31": 0.0299,
    },
}

# Stein FY2026-27 reform package. Applied to the reform sim.
REFORM_DICT = {
    "gov.states.nc.tax.income.rate": {
        "2027-01-01.2100-12-31": 0.0399,
    },
    "gov.states.nc.tax.income.deductions.standard.amount.SINGLE": {
        "2027-01-01.2100-12-31": 13250,
    },
    "gov.states.nc.tax.income.deductions.standard.amount.SEPARATE": {
        "2027-01-01.2100-12-31": 13250,
    },
    "gov.states.nc.tax.income.deductions.standard.amount.HEAD_OF_HOUSEHOLD": {
        "2027-01-01.2100-12-31": 19875,
    },
    "gov.states.nc.tax.income.deductions.standard.amount.JOINT": {
        "2027-01-01.2100-12-31": 26500,
    },
    "gov.states.nc.tax.income.deductions.standard.amount.SURVIVING_SPOUSE": {
        "2027-01-01.2100-12-31": 26500,
    },
    "gov.contrib.states.nc.eitc.in_effect": {
        "2026-01-01.2100-12-31": True,
    },
    "gov.contrib.states.nc.eitc.match": {
        "2026-01-01.2100-12-31": 0.1,
    },
    "gov.contrib.states.nc.cdcc.in_effect": {
        "2026-01-01.2100-12-31": True,
    },
    "gov.contrib.states.nc.cdcc.match": {
        "2026-01-01.2100-12-31": 0.3,
    },
}


def get_nc_districts() -> list[str]:
    """Return the list of NC congressional district IDs (NC-01..NC-14)."""
    return [f"{NC_STATE}-{d:02d}" for d in NC_DISTRICTS]


@app.function(
    image=image,
    memory=16384,
    timeout=1800,
    retries=2,
)
def calculate_single_district_impact(district_id: str, year: int) -> dict:
    """Calculate impact for a single NC congressional district.

    Uses the district-specific dataset on HuggingFace. Returns winners/
    losers share, average and relative income change, and poverty
    percent changes. Figures use ``impact = reform - baseline``.
    """
    import numpy as np
    from policyengine_us import Microsimulation
    from policyengine_core.reforms import Reform

    print(f"Calculating impact for {district_id} year {year}...")

    dataset_url = f"hf://policyengine/policyengine-us-data/districts/{district_id}.h5"

    try:
        baseline_reform = Reform.from_dict(BASELINE_ADJUSTMENTS_DICT, country_id="us")
        stein_reform = Reform.from_dict(REFORM_DICT, country_id="us")

        sim_baseline = Microsimulation(dataset=dataset_url, reform=baseline_reform)
        sim_reform = Microsimulation(dataset=dataset_url, reform=stein_reform)

        household_weight = np.array(sim_baseline.calculate("household_weight", period=year))
        baseline_net_income = np.array(sim_baseline.calculate("household_net_income", period=year))
        reform_net_income = np.array(sim_reform.calculate("household_net_income", period=year))
        # reform - baseline (positive => household gains under Stein).
        income_change = reform_net_income - baseline_net_income

        total_weight = household_weight.sum()

        if total_weight > 0:
            avg_change = (income_change * household_weight).sum() / total_weight
            avg_baseline = (baseline_net_income * household_weight).sum() / total_weight
            rel_change = avg_change / avg_baseline if avg_baseline > 0 else 0.0

            winners_mask = income_change > 1
            losers_mask = income_change < -1
            winners_share = (household_weight * winners_mask).sum() / total_weight
            losers_share = (household_weight * losers_mask).sum() / total_weight
        else:
            avg_change = 0.0
            rel_change = 0.0
            winners_share = 0.0
            losers_share = 0.0

        try:
            spm_unit_weight = np.array(sim_baseline.calculate("spm_unit_weight", period=year))
            total_spm_weight = spm_unit_weight.sum()

            if total_spm_weight > 0:
                baseline_in_poverty = np.array(sim_baseline.calculate("spm_unit_is_in_spm_poverty", period=year))
                reform_in_poverty = np.array(sim_reform.calculate("spm_unit_is_in_spm_poverty", period=year))

                baseline_poverty_rate = (baseline_in_poverty * spm_unit_weight).sum() / total_spm_weight
                reform_poverty_rate = (reform_in_poverty * spm_unit_weight).sum() / total_spm_weight
                # impact = reform - baseline (negative => poverty fell)
                poverty_pct_change = (
                    (reform_poverty_rate - baseline_poverty_rate) / baseline_poverty_rate * 100
                    if baseline_poverty_rate > 0
                    else 0.0
                )

                spm_unit_children = np.array(sim_baseline.calculate("spm_unit_count_children", period=year))
                child_weight = spm_unit_weight * spm_unit_children
                total_child_weight = child_weight.sum()

                if total_child_weight > 0:
                    baseline_child_poverty_rate = (baseline_in_poverty * child_weight).sum() / total_child_weight
                    reform_child_poverty_rate = (reform_in_poverty * child_weight).sum() / total_child_weight
                    child_poverty_pct_change = (
                        (reform_child_poverty_rate - baseline_child_poverty_rate) / baseline_child_poverty_rate * 100
                        if baseline_child_poverty_rate > 0
                        else 0.0
                    )
                else:
                    child_poverty_pct_change = 0.0
            else:
                poverty_pct_change = 0.0
                child_poverty_pct_change = 0.0
        except Exception as poverty_err:
            print(f"  Warning: Poverty calculation failed for {district_id}: {poverty_err}")
            poverty_pct_change = 0.0
            child_poverty_pct_change = 0.0

        state = district_id.split("-")[0]
        result = {
            "district": district_id,
            "average_household_income_change": round(float(avg_change), 2),
            "relative_household_income_change": round(float(rel_change), 6),
            "winners_share": round(float(winners_share), 4),
            "losers_share": round(float(losers_share), 4),
            "poverty_pct_change": round(float(poverty_pct_change), 2),
            "child_poverty_pct_change": round(float(child_poverty_pct_change), 2),
            "state": state,
            "year": year,
        }

        print(f"  {district_id} {year}: avg=${avg_change:.2f}, winners={winners_share:.1%}, poverty={poverty_pct_change:+.1f}%")
        return result

    except Exception as e:
        print(f"  ERROR for {district_id} {year}: {e}")
        return None


@app.local_entrypoint()
def main(year: int = 0, years: str = ""):
    """Run NC district-level analysis on Modal and save to CSV.

    Args:
        year: Single year to run (0 means use the ``--years`` flag or
            the default set).
        years: Comma-separated list of years. Overrides ``--year`` when
            provided. Default: 2026,2027,2028.
    """
    import pandas as pd

    output_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend",
        "public",
        "data",
    )
    os.makedirs(output_dir, exist_ok=True)

    if years:
        target_years = [int(y.strip()) for y in years.split(",")]
    elif year:
        target_years = [year]
    else:
        target_years = YEARS

    districts = get_nc_districts()

    print("Running NC Stein FY2026-27 tax-proposals district analysis on Modal...")
    print(f"Years: {target_years}")
    print(f"State: {NC_STATE} (FIPS {NC_STATE_FIPS})")
    print(f"Districts: {districts}")
    print(f"Output directory: {output_dir}")

    # Build (district, year) combinations for .map()
    pairs = [(d, y) for y in target_years for d in districts]
    district_args = [p[0] for p in pairs]
    year_args = [p[1] for p in pairs]

    results = list(
        calculate_single_district_impact.starmap(zip(district_args, year_args))
    )
    new_rows = [r for r in results if r is not None]

    failed_count = len(results) - len(new_rows)
    if failed_count > 0:
        print(f"WARNING: {failed_count} (district, year) combinations failed")

    if not new_rows:
        print("ERROR: No district data generated!")
        return

    df = pd.DataFrame(new_rows)

    filepath = os.path.join(output_dir, "congressional_districts.csv")
    if os.path.exists(filepath) and len(target_years) < len(YEARS):
        existing = pd.read_csv(filepath)
        existing = existing[~existing["year"].isin(target_years)]
        df = pd.concat([existing, df], ignore_index=True)

    df = df.sort_values(["year", "state", "district"]).reset_index(drop=True)
    df.to_csv(filepath, index=False)
    print(f"\nSaved {len(df)} district-year rows to: {filepath}")

    print("\nSummary (most recent year):")
    latest = df[df["year"] == df["year"].max()]
    print(f"  Districts: {len(latest)}")
    print(f"  Avg income change: ${latest['average_household_income_change'].mean():,.2f}")
    print(f"  Min change: ${latest['average_household_income_change'].min():,.2f}")
    print(f"  Max change: ${latest['average_household_income_change'].max():,.2f}")
