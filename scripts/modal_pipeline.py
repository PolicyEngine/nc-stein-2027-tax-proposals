"""Modal-based data generation pipeline for the NC Stein FY2026-27 tax proposals.

Runs both sims on Modal and computes the aggregate impact of Gov. Stein's
FY2026-27 tax proposals for tax years 2026, 2027, and 2028 against the NC
state-level microsimulation dataset.

Baseline layers ``baseline_adjustments.json`` (rate-reduction triggers
under current NC law) onto PolicyEngine-US baseline so the comparison is
against expected current law. Reform layers ``reform.json`` (the Stein
package) onto PolicyEngine-US baseline. Impact = reform - baseline
(positive => household gains, negative => cost to government).

Usage:
    modal run scripts/modal_pipeline.py                     # all years
    modal run scripts/modal_pipeline.py --years 2027        # one year
    modal run scripts/modal_pipeline.py --years 2026,2027   # multiple

    modal deploy scripts/modal_pipeline.py                  # schedule
"""

import os

import modal


app = modal.App("nc-stein-2027-tax-proposals-pipeline")

image = (
    modal.Image.debian_slim(python_version="3.11")
    # git is needed to clone the policyengine-us repo below.
    .apt_install("git")
    .pip_install(
        # Install from the merge commit for PR #8142 (NC CDCC contrib reform
        # + nc_refundable_credits stacking fix a97772917c). Switch back to a
        # PyPI pin ("policyengine-us>=X.Y.Z") once a release including that
        # commit is published — PyPI's latest 1.665.0 was cut before the
        # merge on 2026-04-23.
        "policyengine-us @ git+https://github.com/PolicyEngine/policyengine-us.git@cd40083a6e7f81d303a532501f2026798a53d50e",
        "numpy>=1.24.0",
        "pandas>=2.0.0",
        "huggingface_hub",
    )
)

# Stein proposals: EITC and CDCC take effect 2026; rate maintenance and
# standard deduction increases take effect 2027.
YEARS = [2026, 2027, 2028]

NC_DATASET = "hf://policyengine/policyengine-us-data/states/NC.h5"

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


def _build_baseline_reform():
    """Parametric baseline reform (triggered rate cuts).

    NC EITC and CDCC contributed reforms are auto-applied by
    PolicyEngine-US based on ``gov.contrib.states.nc.{eitc,cdcc}.in_effect``
    parameters, so no structural Reform composition is required here.
    """
    from policyengine_core.reforms import Reform

    return Reform.from_dict(BASELINE_ADJUSTMENTS_DICT, country_id="us")


def _build_stein_reform():
    """Parametric Stein reform (rate, std deduction, EITC/CDCC in_effect+match)."""
    from policyengine_core.reforms import Reform

    return Reform.from_dict(REFORM_DICT, country_id="us")


# Per-provision dicts used for the budgetary breakdown. Each one is layered
# ON TOP of the baseline (which already includes the triggered rate cuts), so
# it captures the isolated effect of the single Stein provision vs. expected
# current law. Individual impacts will NOT sum exactly to the combined total
# because interactions exist (rate-maintenance affects state tax liability,
# which changes the federal SALT deduction, etc.).
PROVISION_DICTS = {
    # Rate maintenance alone: rate stays at 3.99% (overrides the triggered
    # 3.49% / 2.99% cuts in the baseline).
    "rate_maintenance": {
        "gov.states.nc.tax.income.rate": {
            "2027-01-01.2100-12-31": 0.0399,
        },
    },
    # Standard deduction increase alone.
    "standard_deduction": {
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
    },
    # Working Families Tax Credit alone (10% of federal EITC, 2026+).
    "wftc": {
        "gov.contrib.states.nc.eitc.in_effect": {
            "2026-01-01.2100-12-31": True,
        },
        "gov.contrib.states.nc.eitc.match": {
            "2026-01-01.2100-12-31": 0.1,
        },
    },
    # Child and Dependent Care Credit alone (30% of federal CDCC, 2026+).
    "cdcc": {
        "gov.contrib.states.nc.cdcc.in_effect": {
            "2026-01-01.2100-12-31": True,
        },
        "gov.contrib.states.nc.cdcc.match": {
            "2026-01-01.2100-12-31": 0.3,
        },
    },
}


def _build_provision_reform(provision: str):
    """Build a reform = baseline adjustments + a single provision's overrides."""
    from policyengine_core.reforms import Reform

    merged = {**BASELINE_ADJUSTMENTS_DICT, **PROVISION_DICTS[provision]}
    return Reform.from_dict(merged, country_id="us")


@app.function(
    image=image,
    memory=16384,
    timeout=1800,
    retries=1,
)
def calculate_provision_breakdown(year: int) -> dict:
    """Fiscal impact broken out by provision for one year.

    Runs the baseline (expected current law with triggered rate cuts) once
    and four "isolated provision" sims. Each isolated sim applies the
    baseline adjustments plus ONE of: rate_maintenance, standard_deduction,
    wftc, cdcc. The returned per-provision numbers are the isolated fiscal
    effect of that provision vs expected current law. They will not sum
    exactly to the combined total because interactions exist (e.g. state
    tax change -> federal SALT deduction).
    """
    from policyengine_us import Microsimulation

    print(f"Starting provision breakdown for year {year}...")

    sim_baseline = Microsimulation(
        dataset=NC_DATASET, reform=_build_baseline_reform()
    )
    baseline_nc = sim_baseline.calculate(
        "nc_income_tax", period=year, map_to="household"
    )
    baseline_fed = sim_baseline.calculate(
        "income_tax", period=year, map_to="household"
    )
    baseline_net = sim_baseline.calculate(
        "household_net_income", period=year, map_to="household"
    )
    household_weight = sim_baseline.calculate("household_weight", period=year)

    breakdown = {}
    for provision in PROVISION_DICTS.keys():
        print(f"  Running provision '{provision}'...")
        sim = Microsimulation(
            dataset=NC_DATASET, reform=_build_provision_reform(provision)
        )
        p_nc = sim.calculate("nc_income_tax", period=year, map_to="household")
        p_fed = sim.calculate("income_tax", period=year, map_to="household")
        p_net = sim.calculate(
            "household_net_income", period=year, map_to="household"
        )
        # reform - baseline (positive state tax => state collects more)
        state_impact = float((p_nc - baseline_nc).sum())
        fed_impact = float((p_fed - baseline_fed).sum())
        net_change = p_net - baseline_net
        import numpy as np

        affected_mask = np.abs(net_change) > 1
        affected_households = float(
            np.array(household_weight)[np.array(affected_mask)].sum()
        )
        breakdown[provision] = {
            "state_tax_revenue_impact": state_impact,
            "federal_tax_revenue_impact": fed_impact,
            "budgetary_impact": state_impact + fed_impact,
            "households_affected": affected_households,
        }
        print(
            f"    {provision}: state={state_impact:+,.0f}  "
            f"fed={fed_impact:+,.0f}  hh_affected={affected_households:,.0f}"
        )

    print(f"  Provision breakdown for {year} complete.")
    return {"year": year, "breakdown": breakdown}


@app.function(
    image=image,
    memory=16384,
    timeout=1800,
    retries=1,
)
def calculate_year(year: int) -> dict:
    """Calculate NC-wide impact for a single year on Modal."""
    import numpy as np
    from policyengine_us import Microsimulation

    print(f"Starting calculation for year {year}...")

    intra_bounds = [-np.inf, -0.05, -1e-3, 1e-3, 0.05, np.inf]
    intra_labels = [
        "Lose more than 5%",
        "Lose less than 5%",
        "No change",
        "Gain less than 5%",
        "Gain more than 5%",
    ]

    print("  Creating baseline (expected current law) sim on NC dataset...")
    sim_baseline = Microsimulation(
        dataset=NC_DATASET, reform=_build_baseline_reform()
    )
    print("  Creating reform (Stein package) sim on NC dataset...")
    sim_reform = Microsimulation(
        dataset=NC_DATASET, reform=_build_stein_reform()
    )

    # ===== FISCAL IMPACT =====
    print("  Calculating fiscal impact...")
    fed_baseline = sim_baseline.calculate(
        "income_tax", period=year, map_to="household"
    )
    fed_reform = sim_reform.calculate(
        "income_tax", period=year, map_to="household"
    )
    federal_tax_revenue_impact = float((fed_reform - fed_baseline).sum())

    nc_baseline = sim_baseline.calculate(
        "nc_income_tax", period=year, map_to="household"
    )
    nc_reform = sim_reform.calculate(
        "nc_income_tax", period=year, map_to="household"
    )
    state_tax_revenue_impact = float((nc_reform - nc_baseline).sum())

    tax_revenue_impact = federal_tax_revenue_impact + state_tax_revenue_impact
    budgetary_impact = tax_revenue_impact

    baseline_net_income = sim_baseline.calculate(
        "household_net_income", period=year, map_to="household"
    )
    reform_net_income = sim_reform.calculate(
        "household_net_income", period=year, map_to="household"
    )
    income_change = reform_net_income - baseline_net_income

    total_households = float((income_change * 0 + 1).sum())

    # ===== WINNERS / LOSERS =====
    print("  Calculating winners/losers...")
    winners = float((income_change > 1).sum())
    losers = float((income_change < -1).sum())
    beneficiaries = float((income_change > 0).sum())

    affected = abs(income_change) > 1
    affected_count = float(affected.sum())
    avg_benefit = (
        float(income_change[affected].sum() / affected.sum())
        if affected_count > 0
        else 0.0
    )

    winners_rate = winners / total_households * 100 if total_households else 0.0
    losers_rate = losers / total_households * 100 if total_households else 0.0

    # ===== INCOME DECILE =====
    print("  Calculating decile analysis...")
    decile = sim_baseline.calculate(
        "household_income_decile", period=year, map_to="household"
    )

    decile_average = {}
    decile_relative = {}
    for d in range(1, 11):
        dmask = decile == d
        d_count = float(dmask.sum())
        if d_count > 0:
            d_baseline_sum = float(baseline_net_income[dmask].sum())
            d_change_sum = float(income_change[dmask].sum())
            decile_average[str(d)] = d_change_sum / d_count
            decile_relative[str(d)] = (
                d_change_sum / d_baseline_sum
                if d_baseline_sum != 0
                else 0.0
            )
        else:
            decile_average[str(d)] = 0.0
            decile_relative[str(d)] = 0.0

    household_weight = sim_reform.calculate("household_weight", period=year)
    people_per_hh = sim_baseline.calculate(
        "household_count_people", period=year, map_to="household"
    )
    capped_baseline = np.maximum(np.array(baseline_net_income), 1)
    rel_change_arr = np.array(income_change) / capped_baseline

    decile_arr = np.array(decile)
    weight_arr = np.array(household_weight)
    people_weighted = np.array(people_per_hh) * weight_arr

    intra_decile_deciles = {label: [] for label in intra_labels}
    for d in range(1, 11):
        dmask = decile_arr == d
        d_people = people_weighted[dmask]
        d_total_people = d_people.sum()
        d_rel = rel_change_arr[dmask]

        for lower, upper, label in zip(
            intra_bounds[:-1], intra_bounds[1:], intra_labels
        ):
            in_group = (d_rel > lower) & (d_rel <= upper)
            proportion = (
                float(d_people[in_group].sum() / d_total_people)
                if d_total_people > 0
                else 0.0
            )
            intra_decile_deciles[label].append(proportion)

    intra_decile_all = {
        label: sum(intra_decile_deciles[label]) / 10 for label in intra_labels
    }

    # ===== POVERTY =====
    print("  Calculating poverty impact...")
    pov_bl = sim_baseline.calculate("in_poverty", period=year, map_to="person")
    pov_rf = sim_reform.calculate("in_poverty", period=year, map_to="person")
    poverty_baseline_rate = float(pov_bl.mean() * 100)
    poverty_reform_rate = float(pov_rf.mean() * 100)
    poverty_rate_change = poverty_reform_rate - poverty_baseline_rate
    poverty_percent_change = (
        poverty_rate_change / poverty_baseline_rate * 100
        if poverty_baseline_rate > 0
        else 0.0
    )

    age_arr = np.array(sim_baseline.calculate("age", period=year))
    is_child = age_arr < 18
    pw_arr = np.array(sim_baseline.calculate("person_weight", period=year))
    child_w = pw_arr[is_child]
    total_child_w = child_w.sum()

    pov_bl_arr = np.array(pov_bl).astype(bool)
    pov_rf_arr = np.array(pov_rf).astype(bool)

    def _child_rate(arr):
        return (
            float((arr[is_child] * child_w).sum() / total_child_w * 100)
            if total_child_w > 0
            else 0.0
        )

    child_poverty_baseline_rate = _child_rate(pov_bl_arr)
    child_poverty_reform_rate = _child_rate(pov_rf_arr)
    child_poverty_rate_change = (
        child_poverty_reform_rate - child_poverty_baseline_rate
    )
    child_poverty_percent_change = (
        child_poverty_rate_change / child_poverty_baseline_rate * 100
        if child_poverty_baseline_rate > 0
        else 0.0
    )

    deep_bl = sim_baseline.calculate(
        "in_deep_poverty", period=year, map_to="person"
    )
    deep_rf = sim_reform.calculate(
        "in_deep_poverty", period=year, map_to="person"
    )
    deep_poverty_baseline_rate = float(deep_bl.mean() * 100)
    deep_poverty_reform_rate = float(deep_rf.mean() * 100)
    deep_poverty_rate_change = (
        deep_poverty_reform_rate - deep_poverty_baseline_rate
    )
    deep_poverty_percent_change = (
        deep_poverty_rate_change / deep_poverty_baseline_rate * 100
        if deep_poverty_baseline_rate > 0
        else 0.0
    )

    deep_bl_arr = np.array(deep_bl).astype(bool)
    deep_rf_arr = np.array(deep_rf).astype(bool)
    deep_child_poverty_baseline_rate = _child_rate(deep_bl_arr)
    deep_child_poverty_reform_rate = _child_rate(deep_rf_arr)
    deep_child_poverty_rate_change = (
        deep_child_poverty_reform_rate - deep_child_poverty_baseline_rate
    )
    deep_child_poverty_percent_change = (
        deep_child_poverty_rate_change / deep_child_poverty_baseline_rate * 100
        if deep_child_poverty_baseline_rate > 0
        else 0.0
    )

    # ===== INEQUALITY =====
    print("  Calculating inequality impact...")
    weights = np.array(sim_baseline.calculate("household_weight", period=year))
    net_bl_arr = np.array(baseline_net_income)
    net_rf_arr = np.array(reform_net_income)

    def _weighted_gini(values: np.ndarray, w: np.ndarray) -> float:
        if len(values) == 0 or w.sum() == 0:
            return 0.0
        order = np.argsort(values)
        v = values[order]
        ww = w[order]
        cum_w = np.cumsum(ww)
        total_w = cum_w[-1]
        cum_vw = np.cumsum(v * ww)
        total_vw = cum_vw[-1]
        if total_vw == 0:
            return 0.0
        lorenz = cum_vw / total_vw
        wf = ww / total_w
        area = np.sum(wf * (lorenz - wf / 2))
        return float(1 - 2 * area)

    def _top_share(values: np.ndarray, w: np.ndarray, top_quantile: float) -> float:
        if len(values) == 0 or w.sum() == 0:
            return 0.0
        order = np.argsort(values)
        v = values[order]
        ww = w[order]
        total_income = float(np.sum(v * ww))
        if total_income == 0:
            return 0.0
        cum_w = np.cumsum(ww)
        total_w = cum_w[-1]
        frac = cum_w / total_w
        mask = frac > top_quantile
        return float(np.sum(v[mask] * ww[mask]) / total_income)

    common_mask = (net_bl_arr > 0) & (net_rf_arr > 0)
    vb = net_bl_arr[common_mask]
    vr = net_rf_arr[common_mask]
    ww = weights[common_mask]

    gini_baseline = _weighted_gini(vb, ww)
    gini_reform = _weighted_gini(vr, ww)
    top_10_share_baseline = _top_share(vb, ww, 0.9)
    top_10_share_reform = _top_share(vr, ww, 0.9)
    top_1_share_baseline = _top_share(vb, ww, 0.99)
    top_1_share_reform = _top_share(vr, ww, 0.99)

    # ===== INCOME BRACKET BREAKDOWN =====
    print("  Calculating income brackets...")
    agi = sim_baseline.calculate(
        "adjusted_gross_income", period=year, map_to="household"
    )
    agi_arr = np.array(agi)
    change_arr = np.array(income_change)
    affected_mask = np.abs(change_arr) > 1

    income_brackets = [
        (0, 25_000, "$0 - $25k"),
        (25_000, 50_000, "$25k - $50k"),
        (50_000, 75_000, "$50k - $75k"),
        (75_000, 100_000, "$75k - $100k"),
        (100_000, 150_000, "$100k - $150k"),
        (150_000, 200_000, "$150k - $200k"),
        (200_000, float("inf"), "$200k+"),
    ]

    by_income_bracket = []
    for min_inc, max_inc, label in income_brackets:
        mask = (agi_arr >= min_inc) & (agi_arr < max_inc) & affected_mask
        bracket_affected = float(weight_arr[mask].sum())
        if bracket_affected > 0:
            bracket_cost = float(
                (change_arr[mask] * weight_arr[mask]).sum()
            )
            bracket_avg = float(
                np.average(change_arr[mask], weights=weight_arr[mask])
            )
        else:
            bracket_cost = 0.0
            bracket_avg = 0.0
        by_income_bracket.append({
            "bracket": label,
            "beneficiaries": bracket_affected,
            "total_cost": bracket_cost,
            "avg_benefit": bracket_avg,
        })

    print(f"  Year {year} complete!")

    return {
        "year": year,
        "budget": {
            "budgetary_impact": budgetary_impact,
            "federal_tax_revenue_impact": federal_tax_revenue_impact,
            "state_tax_revenue_impact": state_tax_revenue_impact,
            "tax_revenue_impact": tax_revenue_impact,
            "households": total_households,
        },
        "decile": {"average": decile_average, "relative": decile_relative},
        "intra_decile": {"all": intra_decile_all, "deciles": intra_decile_deciles},
        "total_cost": -budgetary_impact,
        "beneficiaries": beneficiaries,
        "avg_benefit": avg_benefit,
        "winners": winners,
        "losers": losers,
        "winners_rate": winners_rate,
        "losers_rate": losers_rate,
        "poverty_baseline_rate": poverty_baseline_rate,
        "poverty_reform_rate": poverty_reform_rate,
        "poverty_rate_change": poverty_rate_change,
        "poverty_percent_change": poverty_percent_change,
        "child_poverty_baseline_rate": child_poverty_baseline_rate,
        "child_poverty_reform_rate": child_poverty_reform_rate,
        "child_poverty_rate_change": child_poverty_rate_change,
        "child_poverty_percent_change": child_poverty_percent_change,
        "deep_poverty_baseline_rate": deep_poverty_baseline_rate,
        "deep_poverty_reform_rate": deep_poverty_reform_rate,
        "deep_poverty_rate_change": deep_poverty_rate_change,
        "deep_poverty_percent_change": deep_poverty_percent_change,
        "deep_child_poverty_baseline_rate": deep_child_poverty_baseline_rate,
        "deep_child_poverty_reform_rate": deep_child_poverty_reform_rate,
        "deep_child_poverty_rate_change": deep_child_poverty_rate_change,
        "deep_child_poverty_percent_change": deep_child_poverty_percent_change,
        "gini_baseline": gini_baseline,
        "gini_reform": gini_reform,
        "top_10_share_baseline": top_10_share_baseline,
        "top_10_share_reform": top_10_share_reform,
        "top_1_share_baseline": top_1_share_baseline,
        "top_1_share_reform": top_1_share_reform,
        "by_income_bracket": by_income_bracket,
    }


@app.local_entrypoint()
def main(years: str = ""):
    """Run the pipeline on Modal and save CSVs locally.

    Args:
        years: Comma-separated list of years to run. If empty, runs the
               default set (2026, 2027, 2028).
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
    else:
        target_years = YEARS

    print(f"Running NC Stein FY2026-27 tax-proposals microsim for {target_years} on Modal...")
    print(f"Dataset: {NC_DATASET}")
    print(f"Output directory: {output_dir}")

    results = list(calculate_year.map(target_years))
    results.sort(key=lambda r: r["year"])

    breakdown_results = list(calculate_provision_breakdown.map(target_years))
    breakdown_results.sort(key=lambda r: r["year"])

    distributional_rows = []
    metrics_rows = []
    winners_losers_rows = []
    income_bracket_rows = []
    provision_breakdown_rows = []

    PROVISION_LABELS = {
        "rate_maintenance": "Maintain 3.99% income tax rate",
        "standard_deduction": "Raise standard deduction (2027)",
        "wftc": "Working Families Tax Credit (10% of federal EITC)",
        "cdcc": "Child and Dependent Care Credit (30% of federal CDCC)",
    }

    for result in breakdown_results:
        year = result["year"]
        for provision, numbers in result["breakdown"].items():
            provision_breakdown_rows.append({
                "year": year,
                "provision": provision,
                "provision_label": PROVISION_LABELS.get(provision, provision),
                "state_tax_revenue_impact": round(
                    numbers["state_tax_revenue_impact"], 0
                ),
                "federal_tax_revenue_impact": round(
                    numbers["federal_tax_revenue_impact"], 0
                ),
                "budgetary_impact": round(numbers["budgetary_impact"], 0),
                "households_affected": round(numbers["households_affected"], 0),
            })

    for result in results:
        year = result["year"]

        for decile, avg in result["decile"]["average"].items():
            distributional_rows.append({
                "year": year,
                "decile": decile,
                "average_change": round(avg, 2),
                "relative_change": round(result["decile"]["relative"][decile], 6),
            })

        metrics = [
            ("budgetary_impact", result["budget"]["budgetary_impact"]),
            ("federal_tax_revenue_impact", result["budget"]["federal_tax_revenue_impact"]),
            ("state_tax_revenue_impact", result["budget"]["state_tax_revenue_impact"]),
            ("tax_revenue_impact", result["budget"]["tax_revenue_impact"]),
            ("households", result["budget"]["households"]),
            ("total_cost", result["total_cost"]),
            ("beneficiaries", result["beneficiaries"]),
            ("avg_benefit", result["avg_benefit"]),
            ("winners", result["winners"]),
            ("losers", result["losers"]),
            ("winners_rate", result["winners_rate"]),
            ("losers_rate", result["losers_rate"]),
            ("poverty_baseline_rate", result["poverty_baseline_rate"]),
            ("poverty_reform_rate", result["poverty_reform_rate"]),
            ("poverty_rate_change", result["poverty_rate_change"]),
            ("poverty_percent_change", result["poverty_percent_change"]),
            ("child_poverty_baseline_rate", result["child_poverty_baseline_rate"]),
            ("child_poverty_reform_rate", result["child_poverty_reform_rate"]),
            ("child_poverty_rate_change", result["child_poverty_rate_change"]),
            ("child_poverty_percent_change", result["child_poverty_percent_change"]),
            ("deep_poverty_baseline_rate", result["deep_poverty_baseline_rate"]),
            ("deep_poverty_reform_rate", result["deep_poverty_reform_rate"]),
            ("deep_poverty_rate_change", result["deep_poverty_rate_change"]),
            ("deep_poverty_percent_change", result["deep_poverty_percent_change"]),
            ("deep_child_poverty_baseline_rate", result["deep_child_poverty_baseline_rate"]),
            ("deep_child_poverty_reform_rate", result["deep_child_poverty_reform_rate"]),
            ("deep_child_poverty_rate_change", result["deep_child_poverty_rate_change"]),
            ("deep_child_poverty_percent_change", result["deep_child_poverty_percent_change"]),
            ("gini_baseline", result["gini_baseline"]),
            ("gini_reform", result["gini_reform"]),
            ("top_10_share_baseline", result["top_10_share_baseline"]),
            ("top_10_share_reform", result["top_10_share_reform"]),
            ("top_1_share_baseline", result["top_1_share_baseline"]),
            ("top_1_share_reform", result["top_1_share_reform"]),
        ]
        for metric, value in metrics:
            metrics_rows.append({"year": year, "metric": metric, "value": value})

        intra = result["intra_decile"]
        winners_losers_rows.append({
            "year": year,
            "decile": "All",
            "gain_more_5pct": intra["all"]["Gain more than 5%"],
            "gain_less_5pct": intra["all"]["Gain less than 5%"],
            "no_change": intra["all"]["No change"],
            "lose_less_5pct": intra["all"]["Lose less than 5%"],
            "lose_more_5pct": intra["all"]["Lose more than 5%"],
        })
        for i in range(10):
            winners_losers_rows.append({
                "year": year,
                "decile": str(i + 1),
                "gain_more_5pct": intra["deciles"]["Gain more than 5%"][i],
                "gain_less_5pct": intra["deciles"]["Gain less than 5%"][i],
                "no_change": intra["deciles"]["No change"][i],
                "lose_less_5pct": intra["deciles"]["Lose less than 5%"][i],
                "lose_more_5pct": intra["deciles"]["Lose more than 5%"][i],
            })

        for b in result["by_income_bracket"]:
            income_bracket_rows.append({
                "year": year,
                "bracket": b["bracket"],
                "beneficiaries": b["beneficiaries"],
                "total_cost": b["total_cost"],
                "avg_benefit": b["avg_benefit"],
            })

    BRACKET_ORDER = ["$0 - $25k", "$25k - $50k", "$50k - $75k", "$75k - $100k",
                     "$100k - $150k", "$150k - $200k", "$200k+"]
    DECILE_ORDER = ["All"] + [str(i) for i in range(1, 11)]

    def merge_and_save(new_rows: list, filename: str, years_to_replace: list):
        filepath = os.path.join(output_dir, filename)
        new_df = pd.DataFrame(new_rows)

        if os.path.exists(filepath) and len(years_to_replace) < len(YEARS):
            existing_df = pd.read_csv(filepath)
            existing_df = existing_df[~existing_df["year"].isin(years_to_replace)]
            combined_df = pd.concat([existing_df, new_df], ignore_index=True)
        else:
            combined_df = new_df

        if "bracket" in combined_df.columns:
            combined_df["_sort"] = combined_df["bracket"].map(
                {b: i for i, b in enumerate(BRACKET_ORDER)}
            )
            combined_df = combined_df.sort_values(["year", "_sort"]).drop(columns=["_sort"])
        elif "decile" in combined_df.columns:
            combined_df["_sort"] = combined_df["decile"].astype(str).map(
                {d: i for i, d in enumerate(DECILE_ORDER)}
            )
            combined_df = combined_df.sort_values(["year", "_sort"]).drop(columns=["_sort"])
        else:
            combined_df = combined_df.sort_values("year")

        combined_df = combined_df.reset_index(drop=True)
        combined_df.to_csv(filepath, index=False)
        print(f"Saved: {filepath}")

    merge_and_save(distributional_rows, "distributional_impact.csv", target_years)
    merge_and_save(metrics_rows, "metrics.csv", target_years)
    merge_and_save(winners_losers_rows, "winners_losers.csv", target_years)
    merge_and_save(income_bracket_rows, "income_brackets.csv", target_years)
    merge_and_save(
        provision_breakdown_rows, "provision_breakdown.csv", target_years
    )

    print(f"\nDone! All data saved to {output_dir}/")
