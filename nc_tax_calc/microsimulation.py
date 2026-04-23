"""Aggregate impact calculations for the NC Gov. Stein FY2026-27 tax proposals.

Uses the North Carolina state-level microsimulation dataset
(``hf://policyengine/policyengine-us-data/states/NC.h5``).

Baseline sim applies ``baseline_adjustments.json`` (rate-reduction triggers
in current NC law: 3.49% in 2027, 2.99% in 2028) so the comparison is
against expected current law. Reform sim applies ``reform.json`` (the
Stein package).

Impact = reform - baseline (positive => household gains; negative => cost
to government). Pulls ``nc_income_tax``, ``income_tax`` (federal), and
``household_net_income``; all distributional analysis runs off
``household_net_income``.
"""

import numpy as np
from policyengine_us import Microsimulation

from .reforms import build_baseline_reform, build_stein_reform


NC_DATASET = "hf://policyengine/policyengine-us-data/states/NC.h5"

_INTRA_BOUNDS = [-np.inf, -0.05, -1e-3, 1e-3, 0.05, np.inf]
_INTRA_LABELS = [
    "Lose more than 5%",
    "Lose less than 5%",
    "No change",
    "Gain less than 5%",
    "Gain more than 5%",
]


def _poverty_metrics(baseline_rate: float, reform_rate: float):
    """Return rate change and percent change for a poverty metric.

    ``rate_change = reform_rate - baseline_rate`` (negative means
    poverty fell under the reform).
    """
    rate_change = reform_rate - baseline_rate
    percent_change = (
        rate_change / baseline_rate * 100 if baseline_rate > 0 else 0.0
    )
    return rate_change, percent_change


def calculate_aggregate_impact(year: int = 2027) -> dict:
    """Calculate North Carolina-wide aggregate impact.

    Args:
        year: Tax year (2026, 2027, or 2028).

    Returns:
        Dict with budget, decile, intra_decile, poverty, and income-bracket
        fields. Money amounts are reform - baseline (positive = household
        gain; state revenue impact is typically positive because the Stein
        proposal preserves rates that would otherwise drop).
    """
    sim_baseline = Microsimulation(
        dataset=NC_DATASET, reform=build_baseline_reform()
    )
    sim_reform = Microsimulation(
        dataset=NC_DATASET, reform=build_stein_reform()
    )

    # ===== FISCAL IMPACT =====
    nc_baseline = sim_baseline.calculate(
        "nc_income_tax", period=year, map_to="household"
    )
    nc_reform = sim_reform.calculate(
        "nc_income_tax", period=year, map_to="household"
    )
    # reform - baseline: positive => state collects MORE tax under reform
    # (rate preserved at 3.99% vs triggered reduction), offset by the new
    # refundable credits.
    state_tax_revenue_impact = float((nc_reform - nc_baseline).sum())

    fed_baseline = sim_baseline.calculate(
        "income_tax", period=year, map_to="household"
    )
    fed_reform = sim_reform.calculate(
        "income_tax", period=year, map_to="household"
    )
    federal_tax_revenue_impact = float((fed_reform - fed_baseline).sum())

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

    intra_decile_deciles = {label: [] for label in _INTRA_LABELS}
    for d in range(1, 11):
        dmask = decile_arr == d
        d_people = people_weighted[dmask]
        d_total_people = d_people.sum()
        d_rel = rel_change_arr[dmask]

        for lower, upper, label in zip(
            _INTRA_BOUNDS[:-1], _INTRA_BOUNDS[1:], _INTRA_LABELS
        ):
            in_group = (d_rel > lower) & (d_rel <= upper)
            proportion = (
                float(d_people[in_group].sum() / d_total_people)
                if d_total_people > 0
                else 0.0
            )
            intra_decile_deciles[label].append(proportion)

    intra_decile_all = {
        label: sum(intra_decile_deciles[label]) / 10
        for label in _INTRA_LABELS
    }

    # ===== POVERTY =====
    pov_bl = sim_baseline.calculate("in_poverty", period=year, map_to="person")
    pov_rf = sim_reform.calculate("in_poverty", period=year, map_to="person")
    poverty_baseline_rate = float(pov_bl.mean() * 100)
    poverty_reform_rate = float(pov_rf.mean() * 100)
    poverty_rate_change, poverty_percent_change = _poverty_metrics(
        poverty_baseline_rate, poverty_reform_rate
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
    child_poverty_rate_change, child_poverty_percent_change = (
        _poverty_metrics(
            child_poverty_baseline_rate, child_poverty_reform_rate
        )
    )

    deep_bl = sim_baseline.calculate(
        "in_deep_poverty", period=year, map_to="person"
    )
    deep_rf = sim_reform.calculate(
        "in_deep_poverty", period=year, map_to="person"
    )
    deep_poverty_baseline_rate = float(deep_bl.mean() * 100)
    deep_poverty_reform_rate = float(deep_rf.mean() * 100)
    deep_poverty_rate_change, deep_poverty_percent_change = (
        _poverty_metrics(
            deep_poverty_baseline_rate, deep_poverty_reform_rate
        )
    )

    deep_bl_arr = np.array(deep_bl).astype(bool)
    deep_rf_arr = np.array(deep_rf).astype(bool)
    deep_child_poverty_baseline_rate = _child_rate(deep_bl_arr)
    deep_child_poverty_reform_rate = _child_rate(deep_rf_arr)
    deep_child_poverty_rate_change, deep_child_poverty_percent_change = (
        _poverty_metrics(
            deep_child_poverty_baseline_rate,
            deep_child_poverty_reform_rate,
        )
    )

    # ===== INCOME BRACKETS =====
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
        mask = (
            (agi_arr >= min_inc)
            & (agi_arr < max_inc)
            & affected_mask
        )
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

    return {
        "budget": {
            "budgetary_impact": budgetary_impact,
            "federal_tax_revenue_impact": federal_tax_revenue_impact,
            "state_tax_revenue_impact": state_tax_revenue_impact,
            "tax_revenue_impact": tax_revenue_impact,
            "households": total_households,
        },
        "decile": {
            "average": decile_average,
            "relative": decile_relative,
        },
        "intra_decile": {
            "all": intra_decile_all,
            "deciles": intra_decile_deciles,
        },
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
        "by_income_bracket": by_income_bracket,
    }
