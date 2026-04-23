"""Modal-based congressional-district impact pipeline for the Utah 2026 tax changes.

Calculates actual district-level impacts for Utah's four congressional
districts (UT-01, UT-02, UT-03, UT-04; state_fips=49) using district-
specific datasets on HuggingFace.

Uses the inverse reform (reverting 2026 Utah parameters to 2025 values)
and reports ``impact = current_law - reverted``, matching the aggregate
pipeline.

Usage:
    modal run scripts/modal_district_pipeline.py
"""

import os

import modal

# Modal app definition
app = modal.App("utah-2026-tax-changes-district-pipeline")

# Image with policyengine-us and dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "policyengine-us>=1.150.0",
        "numpy>=1.24.0",
        "pandas>=2.0.0",
        "huggingface_hub",
    )
)

# Utah: 4 congressional districts, state FIPS 49.
UTAH_STATE = "UT"
UTAH_STATE_FIPS = 49
UTAH_DISTRICTS = [1, 2, 3, 4]

# Inverse reform: revert Utah parameters to pre-2026 (2025) values.
REFORM_DICT = {
    "gov.states.ut.tax.income.rate": {
        "2026-01-01.2100-12-31": 0.045,
    },
    "gov.states.ut.tax.income.credits.ctc.reduction.start.SEPARATE": {
        "2026-01-01.2100-12-31": 27000,
    },
    "gov.states.ut.tax.income.credits.ctc.reduction.start.SINGLE": {
        "2026-01-01.2100-12-31": 43000,
    },
    "gov.states.ut.tax.income.credits.ctc.reduction.start.HEAD_OF_HOUSEHOLD": {
        "2026-01-01.2100-12-31": 43000,
    },
    "gov.states.ut.tax.income.credits.ctc.reduction.start.JOINT": {
        "2026-01-01.2100-12-31": 54000,
    },
    "gov.states.ut.tax.income.credits.ctc.reduction.start.SURVIVING_SPOUSE": {
        "2026-01-01.2100-12-31": 54000,
    },
}

YEAR = 2026


def get_utah_districts() -> list[str]:
    """Return the list of Utah congressional district IDs (UT-01..UT-04)."""
    return [f"{UTAH_STATE}-{d:02d}" for d in UTAH_DISTRICTS]


@app.function(
    image=image,
    memory=16384,
    timeout=1800,
    retries=2,
)
def calculate_single_district_impact(district_id: str, year: int = YEAR) -> dict:
    """Calculate impact for a single Utah congressional district.

    Uses the district-specific dataset on HuggingFace. Returns winners/
    losers share, average and relative income change, and poverty
    percent changes. All figures use the impact = current_law - reverted
    convention.
    """
    import numpy as np
    from policyengine_us import Microsimulation
    from policyengine_core.reforms import Reform

    print(f"Calculating impact for {district_id}...")

    dataset_url = f"hf://policyengine/policyengine-us-data/districts/{district_id}.h5"

    try:
        reform = Reform.from_dict(REFORM_DICT, country_id="us")

        sim_baseline = Microsimulation(dataset=dataset_url)
        sim_reform = Microsimulation(dataset=dataset_url, reform=reform)

        household_weight = np.array(sim_baseline.calculate("household_weight", period=year))
        baseline_net_income = np.array(sim_baseline.calculate("household_net_income", period=year))
        reform_net_income = np.array(sim_reform.calculate("household_net_income", period=year))
        # current_law - reverted
        income_change = baseline_net_income - reform_net_income

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
                # impact = current_law - reverted
                poverty_pct_change = (
                    (baseline_poverty_rate - reform_poverty_rate) / reform_poverty_rate * 100
                    if reform_poverty_rate > 0
                    else 0.0
                )

                spm_unit_children = np.array(sim_baseline.calculate("spm_unit_count_children", period=year))
                child_weight = spm_unit_weight * spm_unit_children
                total_child_weight = child_weight.sum()

                if total_child_weight > 0:
                    baseline_child_poverty_rate = (baseline_in_poverty * child_weight).sum() / total_child_weight
                    reform_child_poverty_rate = (reform_in_poverty * child_weight).sum() / total_child_weight
                    child_poverty_pct_change = (
                        (baseline_child_poverty_rate - reform_child_poverty_rate) / reform_child_poverty_rate * 100
                        if reform_child_poverty_rate > 0
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

        print(f"  {district_id}: avg=${avg_change:.2f}, winners={winners_share:.1%}, poverty={poverty_pct_change:+.1f}%")
        return result

    except Exception as e:
        print(f"  ERROR for {district_id}: {e}")
        return None


@app.local_entrypoint()
def main(year: int = YEAR):
    """Run Utah district-level analysis on Modal and save to CSV."""
    import pandas as pd

    output_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend",
        "public",
        "data",
    )
    os.makedirs(output_dir, exist_ok=True)

    districts = get_utah_districts()

    print("Running Utah 2026 tax-changes district analysis on Modal...")
    print(f"Year: {year}")
    print(f"State: {UTAH_STATE} (FIPS {UTAH_STATE_FIPS})")
    print(f"Districts: {districts}")
    print(f"Output directory: {output_dir}")

    results = list(calculate_single_district_impact.map(districts, kwargs={"year": year}))
    new_districts = [r for r in results if r is not None]

    failed_count = len(results) - len(new_districts)
    if failed_count > 0:
        print(f"WARNING: {failed_count} districts failed to calculate")

    if not new_districts:
        print("ERROR: No district data generated!")
        return

    df = pd.DataFrame(new_districts)
    df = df.sort_values(["state", "district"]).reset_index(drop=True)

    filepath = os.path.join(output_dir, "congressional_districts.csv")
    df.to_csv(filepath, index=False)
    print(f"\nSaved {len(df)} districts to: {filepath}")

    print("\nSummary:")
    print(f"  Total districts: {len(df)}")
    print(f"  Avg income change: ${df['average_household_income_change'].mean():,.2f}")
    print(f"  Min change: ${df['average_household_income_change'].min():,.2f}")
    print(f"  Max change: ${df['average_household_income_change'].max():,.2f}")
