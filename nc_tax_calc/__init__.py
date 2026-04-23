"""North Carolina Gov. Stein FY2026-27 Tax Proposals calculation module.

Provides utilities for calculating household and aggregate impacts of
Governor Josh Stein's FY2026-27 tax proposals for North Carolina.

Provisions modeled:
- Maintain 3.99% individual income tax rate in 2027 and 2028 (repeal
  triggered reductions to 3.49% in 2027 and 2.99% in 2028).
- Raise standard deduction starting 2027: +$1,000 JOINT / +$750 HoH /
  +$500 SINGLE and SEPARATE.
- Refundable Working Families Tax Credit = 10% of federal EITC (2026+).
- Refundable child and dependent care tax credit = 30% of federal CDCC
  (2026+).

Not modeled: the sales tax back-to-school holiday (PolicyEngine-US does
not cover NC sales tax) and the maintenance of the 2% corporate income
tax rate (PolicyEngine-US does not cover corporate income tax).

Reference: NC FY2026-27 Governor's Recommended Budget, p.69
(https://www.osbm.nc.gov/fy2026-27-budget-rec-budget-book/open#page=69).
"""

from .household import build_household_situation, calculate_household_impact
from .reforms import (
    build_baseline_reform,
    build_stein_reform,
    load_baseline_adjustments,
    load_reform,
    get_reform_provisions,
    UNMODELED_PROVISIONS,
    REFORM_PATH,
    BASELINE_ADJUSTMENTS_PATH,
)
from .microsimulation import calculate_aggregate_impact

__all__ = [
    "build_household_situation",
    "calculate_household_impact",
    "build_baseline_reform",
    "build_stein_reform",
    "load_baseline_adjustments",
    "load_reform",
    "get_reform_provisions",
    "UNMODELED_PROVISIONS",
    "REFORM_PATH",
    "BASELINE_ADJUSTMENTS_PATH",
    "calculate_aggregate_impact",
]

__version__ = "1.0.0"
