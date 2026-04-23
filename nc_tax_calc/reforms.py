"""Reform definitions for the NC Gov. Stein FY2026-27 tax proposals dashboard.

Two JSON files drive the simulation:

* ``baseline_adjustments.json`` — rate-reduction triggers under current NC
  law (3.49% in 2027, 2.99% in 2028) that are not yet in the PolicyEngine-US
  baseline. Applied to both sims so the dashboard's "baseline" reflects
  expected current law.
* ``reform.json`` — the Stein package: maintains 3.99% rate, raises the
  standard deduction in 2027, and enables the 10% EITC match and 30% CDCC
  match starting 2026. Applied to the reform sim only.

PolicyEngine-US already registers the ``nc_eitc`` and ``nc_cdcc`` contributed
reforms as auto-applied based on their respective
``gov.contrib.states.nc.{eitc,cdcc}.in_effect`` parameters, so flipping
``in_effect`` via a parameter override is enough — no structural Reform
class composition is needed.

Impact convention: ``reform - baseline`` (positive => household gains;
negative => cost to government).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from policyengine_core.reforms import Reform

REPO_ROOT = Path(__file__).resolve().parent.parent
BASELINE_ADJUSTMENTS_PATH = REPO_ROOT / "baseline_adjustments.json"
REFORM_PATH = REPO_ROOT / "reform.json"


def _load_json_without_comment(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data.pop("_comment", None)
    return data


def load_baseline_adjustments() -> Dict[str, Any]:
    """Rate-reduction triggers scheduled under current NC law."""
    return _load_json_without_comment(BASELINE_ADJUSTMENTS_PATH)


def load_reform() -> Dict[str, Any]:
    """The Stein FY2026-27 tax reform package."""
    return _load_json_without_comment(REFORM_PATH)


def build_baseline_reform() -> Reform:
    """Reform that restores expected current law (triggered rate cuts)."""
    return Reform.from_dict(load_baseline_adjustments(), country_id="us")


def build_stein_reform() -> Reform:
    """Full Stein reform as a parameter-override reform.

    NC EITC and CDCC contributed reforms are auto-applied by
    PolicyEngine-US when their ``in_effect`` parameters flip to true.
    """
    return Reform.from_dict(load_reform(), country_id="us")


def get_reform_provisions() -> Dict[str, Dict[str, Any]]:
    """Human-readable description of the Stein tax proposal provisions."""
    return {
        "maintain_income_tax_rate": {
            "description": (
                "Maintains the individual income tax rate at 3.99% and repeals "
                "the rate-reduction triggers. Under current law the rate would "
                "fall to 3.49% in 2027 and 2.99% in 2028."
            ),
            "parameter": "gov.states.nc.tax.income.rate",
            "reform_values": {"2027": 0.0399, "2028": 0.0399},
            "baseline_values": {"2027": 0.0349, "2028": 0.0299},
        },
        "standard_deduction_increase": {
            "description": (
                "Raises the standard deduction starting 2027 by $1,000 for "
                "married filing jointly (and surviving spouse), $750 for head "
                "of household, and $500 for single filers and married filing "
                "separately."
            ),
            "parameter": "gov.states.nc.tax.income.deductions.standard.amount",
            "effective_year": 2027,
            "reform_values": {
                "SINGLE": 13250,
                "SEPARATE": 13250,
                "HEAD_OF_HOUSEHOLD": 19875,
                "JOINT": 26500,
                "SURVIVING_SPOUSE": 26500,
            },
            "baseline_values": {
                "SINGLE": 12750,
                "SEPARATE": 12750,
                "HEAD_OF_HOUSEHOLD": 19125,
                "JOINT": 25500,
                "SURVIVING_SPOUSE": 25500,
            },
        },
        "working_families_tax_credit": {
            "description": (
                "Establishes a refundable Working Families Tax Credit equal to "
                "10% of the federal Earned Income Tax Credit starting 2026."
            ),
            "parameter": "gov.contrib.states.nc.eitc.match",
            "effective_year": 2026,
            "match_rate": 0.10,
        },
        "child_and_dependent_care_credit": {
            "description": (
                "Establishes a refundable child and dependent care tax credit "
                "equal to 30% of the federal credit starting 2026."
            ),
            "parameter": "gov.contrib.states.nc.cdcc.match",
            "effective_year": 2026,
            "match_rate": 0.30,
        },
    }


UNMODELED_PROVISIONS = {
    "sales_tax_back_to_school_holiday": {
        "description": (
            "Establishes a state sales tax holiday for school supplies and "
            "equipment. Not modeled: PolicyEngine-US does not currently cover "
            "North Carolina sales tax."
        ),
    },
    "maintain_corporate_income_tax_rate": {
        "description": (
            "Maintains the corporate income tax rate at 2%. Not modeled: "
            "PolicyEngine-US does not currently cover corporate income tax."
        ),
    },
}
