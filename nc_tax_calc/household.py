"""Household situation builder for the NC Gov. Stein FY2026-27 tax proposals.

Runs two PolicyEngine simulations:

* ``baseline_sim`` — PolicyEngine-US baseline + ``baseline_adjustments.json``
  (NC rate-reduction triggers that would apply under current law: 3.49% in
  2027 and 2.99% in 2028).
* ``reform_sim`` — PolicyEngine-US baseline + the full Stein package
  (``reform.json``): maintain 3.99% rate, raise standard deduction (2027+),
  10% EITC match, 30% CDCC match.

Impact = reform - baseline (positive => household gains; negative => cost).
"""

from typing import Any, Dict, List, Optional
import numpy as np


GROUP_UNITS = ["families", "spm_units", "tax_units", "households"]


def _add_member_to_units(situation: Dict[str, Any], member_id: str) -> None:
    """Add a member to all group units in the situation."""
    for unit in GROUP_UNITS:
        unit_dict = situation[unit]
        first_key = next(iter(unit_dict))
        unit_dict[first_key]["members"].append(member_id)


def build_household_situation(
    age_head: int,
    age_spouse: Optional[int],
    dependent_ages: List[int],
    income: float,
    year: int,
    max_earnings: float,
    state_code: str = "NC",
    include_axes: bool = True,
    childcare_expenses: float = 0.0,
) -> Dict[str, Any]:
    """Build a PolicyEngine household situation dictionary."""
    year_str = str(year)
    axis_max = max(max_earnings, income)

    situation: Dict[str, Any] = {
        "people": {
            "you": {
                "age": {year_str: age_head},
                "employment_income": {year_str: income if not include_axes else None},
            },
        },
        "families": {"your family": {"members": ["you"]}},
        "marital_units": {"your marital unit": {"members": ["you"]}},
        "spm_units": {"your household": {"members": ["you"]}},
        "tax_units": {
            "your tax unit": {
                "members": ["you"],
                "adjusted_gross_income": {year_str: None},
                "tax_unit_childcare_expenses": {year_str: childcare_expenses},
            },
        },
        "households": {
            "your household": {
                "members": ["you"],
                "state_code": {year_str: state_code},
                "household_net_income": {year_str: None},
            },
        },
    }

    if include_axes:
        count = min(4001, max(501, int(axis_max / 500)))
        situation["axes"] = [
            [
                {
                    "name": "employment_income",
                    "min": 0,
                    "max": axis_max,
                    "count": count,
                    "period": year_str,
                    "target": "person",
                },
            ],
        ]

    if age_spouse is not None:
        situation["people"]["your partner"] = {"age": {year_str: age_spouse}}
        _add_member_to_units(situation, "your partner")
        situation["marital_units"]["your marital unit"]["members"].append("your partner")

    for i, age in enumerate(dependent_ages):
        if i == 0:
            child_id = "your first dependent"
        elif i == 1:
            child_id = "your second dependent"
        else:
            child_id = f"dependent_{i + 1}"

        situation["people"][child_id] = {"age": {year_str: age}}
        _add_member_to_units(situation, child_id)
        situation["marital_units"][f"{child_id}'s marital unit"] = {
            "members": [child_id],
        }

    return situation


def calculate_household_impact(
    age_head: int,
    age_spouse: Optional[int],
    dependent_ages: List[int],
    income: float,
    year: int,
    max_earnings: float,
    state_code: str = "NC",
    childcare_expenses: float = 0.0,
) -> Dict[str, Any]:
    """Calculate household impact of the Stein FY2026-27 tax proposals.

    Returns dict with income_range, net_income_change, nc_income_tax_change,
    income_tax_change (federal), and benefit_at_income.
    """
    try:
        from policyengine_us import Simulation
    except ImportError:
        raise ImportError(
            "policyengine_us is required for calculate_household_impact. "
            "Install it with: pip install policyengine-us"
        )

    from .reforms import build_baseline_reform, build_stein_reform

    situation = build_household_situation(
        age_head=age_head,
        age_spouse=age_spouse,
        dependent_ages=dependent_ages,
        income=income,
        year=year,
        max_earnings=max_earnings,
        state_code=state_code,
        include_axes=True,
        childcare_expenses=childcare_expenses,
    )

    baseline_sim = Simulation(
        situation=situation, reform=build_baseline_reform()
    )
    baseline_net_income = baseline_sim.calculate("household_net_income", year)
    baseline_nc_income_tax = baseline_sim.calculate("nc_income_tax", year)
    baseline_income_tax = baseline_sim.calculate("income_tax", year)
    income_range = baseline_sim.calculate("employment_income", year)

    reform_sim = Simulation(situation=situation, reform=build_stein_reform())
    reform_net_income = reform_sim.calculate("household_net_income", year)
    reform_nc_income_tax = reform_sim.calculate("nc_income_tax", year)
    reform_income_tax = reform_sim.calculate("income_tax", year)

    net_income_change = reform_net_income - baseline_net_income
    nc_income_tax_change = reform_nc_income_tax - baseline_nc_income_tax
    income_tax_change = reform_income_tax - baseline_income_tax

    def interpolate(xs: np.ndarray, ys: np.ndarray, x: float) -> float:
        if x <= xs[0]:
            return float(ys[0])
        if x >= xs[-1]:
            return float(ys[-1])
        return float(np.interp(x, xs, ys))

    baseline_at_income = interpolate(income_range, baseline_net_income, income)
    reform_at_income = interpolate(income_range, reform_net_income, income)

    return {
        "income_range": income_range.tolist(),
        "net_income_change": net_income_change.tolist(),
        "nc_income_tax_change": nc_income_tax_change.tolist(),
        "income_tax_change": income_tax_change.tolist(),
        "benefit_at_income": {
            "baseline": baseline_at_income,
            "reform": reform_at_income,
            "difference": reform_at_income - baseline_at_income,
        },
        "x_axis_max": max_earnings,
    }
