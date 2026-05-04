"""Pre-compute a handful of representative North Carolina households so
the household tab can show example impacts without hitting the PE API
on page load.

Hits https://api.policyengine.org/us/calculate twice per profile —
once with the expected-current-law baseline policy (rate triggers fire
to 3.49% in 2027 / 2.99% in 2028), once with the Stein FY2026-27 reform
policy — and writes the diff into
``frontend/public/data/example_households.json``.

The example profiles are picked to surface different provisions in the
package:

  - Single parent, $30k, 1 child age 4, $5,000 childcare expenses:
    triggers the new Working Families Tax Credit (10% federal EITC) and
    the Child & Dependent Care Tax Credit (30% federal CDCC). Sees a
    small cost from maintaining the 3.99% rate.
  - Married couple, $80k, 2 kids ages 5 and 8, $4,000 childcare: smaller
    EITC band, captures the higher standard deduction + CDCC + rate
    maintenance trade-off.
  - Married couple, $150k, 2 kids ages 10 and 13: above CDCC interest;
    rate maintenance + standard-deduction effects dominate.

Usage:
    uv run --with requests scripts/compute_example_households.py
"""

import json
from pathlib import Path

import requests

PE_API = "https://api.policyengine.org/us/calculate"
YEAR = 2027
REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = REPO_ROOT / "frontend" / "public" / "data" / "example_households.json"

PROFILES = [
    {
        "label": "Single parent, $30k, 1 child + childcare",
        "income": 30_000,
        "age_head": 32,
        "married": False,
        "dependents": [4],
        "childcare_expenses": 5_000,
    },
    {
        "label": "Married couple, $80k, 2 kids + childcare",
        "income": 80_000,
        "age_head": 36,
        "married": True,
        "dependents": [5, 8],
        "childcare_expenses": 4_000,
    },
    {
        "label": "Married couple, $150k, 2 kids",
        "income": 150_000,
        "age_head": 44,
        "married": True,
        "dependents": [10, 13],
        "childcare_expenses": 0,
    },
]


def baseline_policy() -> dict:
    """Expected current-law NC rate after triggers fire (3.49% in 2027,
    2.99% in 2028+)."""
    return {
        "gov.states.nc.tax.income.rate": {
            "2027-01-01.2027-12-31": 0.0349,
            "2028-01-01.2100-12-31": 0.0299,
        },
    }


def reform_policy() -> dict:
    """Stein FY2026-27 package: maintain 3.99% rate, raise standard
    deductions (2027), enable 10% NC EITC match (2026)."""
    return {
        "gov.states.nc.tax.income.rate": {
            "2027-01-01.2100-12-31": 0.0399,
        },
        "gov.states.nc.tax.income.deductions.standard.amount.JOINT": {
            "2027-01-01.2100-12-31": 26_500,
        },
        "gov.states.nc.tax.income.deductions.standard.amount.SURVIVING_SPOUSE": {
            "2027-01-01.2100-12-31": 26_500,
        },
        "gov.states.nc.tax.income.deductions.standard.amount.HEAD_OF_HOUSEHOLD": {
            "2027-01-01.2100-12-31": 19_875,
        },
        "gov.states.nc.tax.income.deductions.standard.amount.SINGLE": {
            "2027-01-01.2100-12-31": 13_250,
        },
        "gov.states.nc.tax.income.deductions.standard.amount.SEPARATE": {
            "2027-01-01.2100-12-31": 13_250,
        },
        "gov.contrib.states.nc.eitc.in_effect": {
            "2026-01-01.2100-12-31": True,
        },
        "gov.contrib.states.nc.eitc.match": {
            "2026-01-01.2100-12-31": 0.1,
        },
        # CDCC parameters intentionally omitted — the live API is pinned
        # to a policyengine-us version that predates them and would 500.
        # Modal CSVs include the CDCC effect.
    }


def build_household(profile: dict, with_axes: bool = False) -> dict:
    """Build a PolicyEngine household situation for the given profile.

    If ``with_axes`` is True, sweeps employment_income from $0 to a
    profile-derived max so we can pre-compute the full net-income chart.
    """
    year = str(YEAR)
    income_for_baseline = None if with_axes else profile["income"]
    people: dict = {
        "you": {
            "age": {year: profile["age_head"]},
            "employment_income": {year: income_for_baseline},
        }
    }
    members = ["you"]
    marital_units: dict = {"your marital unit": {"members": ["you"]}}

    if profile["married"]:
        people["your partner"] = {"age": {year: 35}}
        members.append("your partner")
        marital_units["your marital unit"]["members"].append("your partner")

    for i, age in enumerate(profile["dependents"]):
        cid = (
            "your first dependent"
            if i == 0
            else "your second dependent"
            if i == 1
            else f"dependent_{i + 1}"
        )
        people[cid] = {"age": {year: age}}
        members.append(cid)
        marital_units[f"{cid}'s marital unit"] = {"members": [cid]}

    situation: dict = {
        "people": people,
        "families": {"your family": {"members": members}},
        "marital_units": marital_units,
        "spm_units": {"your household": {"members": members}},
        "tax_units": {
            "your tax unit": {
                "members": members,
                "adjusted_gross_income": {year: None},
                "income_tax": {year: None},
                "nc_income_tax": {year: None},
                "tax_unit_childcare_expenses": {
                    year: profile.get("childcare_expenses", 0),
                },
            }
        },
        "households": {
            "your household": {
                "members": members,
                "state_code": {year: "NC"},
                "household_net_income": {year: None},
            }
        },
    }

    if with_axes:
        axis_max = max(profile["income"] * 2, 100_000)
        situation["axes"] = [
            [
                {
                    "name": "employment_income",
                    "min": 0,
                    "max": axis_max,
                    "count": 201,
                    "period": year,
                    "target": "person",
                }
            ]
        ]
    return situation


def calc(situation: dict, policy: dict) -> dict:
    body = {"household": situation, "policy": policy}
    response = requests.post(
        PE_API, json=body, headers={"Content-Type": "application/json"}, timeout=180
    )
    response.raise_for_status()
    return response.json()["result"]


def extract(result: dict) -> dict:
    yr = str(YEAR)
    hh = result["households"]["your household"]
    tu = result["tax_units"]["your tax unit"]
    return {
        "household_net_income": hh["household_net_income"][yr],
        "nc_income_tax": tu["nc_income_tax"][yr],
        "income_tax": tu["income_tax"][yr],
    }


def compute_profile(profile: dict) -> dict:
    """Run baseline (expected current law) + reform (Stein) at the
    user's income point and as an income sweep, so the page can render
    the full net-income chart instantly."""
    yr = str(YEAR)

    # Point estimate.
    point_situation = build_household(profile, with_axes=False)
    baseline_pt = extract(calc(point_situation, baseline_policy()))
    reform_pt = extract(calc(point_situation, reform_policy()))

    # Income sweep for the chart.
    sweep_situation = build_household(profile, with_axes=True)
    base_sweep = calc(sweep_situation, baseline_policy())
    ref_sweep = calc(sweep_situation, reform_policy())

    income_range = base_sweep["people"]["you"]["employment_income"][yr]
    base_net = base_sweep["households"]["your household"]["household_net_income"][yr]
    ref_net = ref_sweep["households"]["your household"]["household_net_income"][yr]
    base_state = base_sweep["tax_units"]["your tax unit"]["nc_income_tax"][yr]
    ref_state = ref_sweep["tax_units"]["your tax unit"]["nc_income_tax"][yr]
    base_fed = base_sweep["tax_units"]["your tax unit"]["income_tax"][yr]
    ref_fed = ref_sweep["tax_units"]["your tax unit"]["income_tax"][yr]

    net_income_change = [r - b for r, b in zip(ref_net, base_net)]
    state_tax_change = [r - b for r, b in zip(ref_state, base_state)]
    federal_tax_change = [r - b for r, b in zip(ref_fed, base_fed)]

    return {
        **profile,
        "baseline": baseline_pt,
        "reform": reform_pt,
        "net_income_change": reform_pt["household_net_income"]
        - baseline_pt["household_net_income"],
        "nc_tax_change": reform_pt["nc_income_tax"]
        - baseline_pt["nc_income_tax"],
        "chart": {
            "income_range": income_range,
            "net_income_change": net_income_change,
            "state_tax_change": state_tax_change,
            "federal_tax_change": federal_tax_change,
        },
    }


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for profile in PROFILES:
        print(f"  Computing: {profile['label']}...")
        rows.append(compute_profile(profile))

    with OUTPUT_PATH.open("w", encoding="utf-8") as fh:
        json.dump({"year": YEAR, "households": rows}, fh, indent=2)
    print(f"Saved: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
