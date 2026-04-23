"""
Tests for the nc_tax_calc.reforms module.

These tests verify that the Stein FY2026-27 reform and baseline
adjustments load correctly from reform.json and baseline_adjustments.json.
Most of the older content-specific assertions (Utah SB60/HB290 values)
will fail and are left as follow-ups; import paths are fixed so tests
can at least be collected.
"""

import json
from pathlib import Path

import pytest
from nc_tax_calc.reforms import (
    REFORM_PATH,
    load_reform,
    get_reform_provisions,
)


class TestReformPath:
    """Tests for the reform.json path constant."""

    def test_reform_path_points_to_repo_root_file(self):
        """REFORM_PATH should resolve to reform.json at repo root."""
        assert isinstance(REFORM_PATH, Path)
        assert REFORM_PATH.name == "reform.json"
        assert REFORM_PATH.exists(), f"Expected reform.json at {REFORM_PATH}"

    def test_reform_json_is_valid_json(self):
        """reform.json must parse as JSON."""
        with open(REFORM_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        assert isinstance(data, dict)


class TestLoadReform:
    """Tests for load_reform()."""

    def test_load_returns_dict(self):
        reform = load_reform()
        assert isinstance(reform, dict)

    def test_includes_sb60_rate_revert(self):
        """The reform must revert the Utah income tax rate to 0.045."""
        reform = load_reform()
        key = "gov.states.ut.tax.income.rate"
        assert key in reform
        periods = reform[key]
        # Pre-2026 rate is 0.045
        assert any(v == 0.045 for v in periods.values())

    def test_includes_hb290_ctc_threshold_reverts(self):
        """The reform must revert all five CTC phaseout thresholds."""
        reform = load_reform()
        ctc_root = "gov.states.ut.tax.income.credits.ctc.reduction.start"
        expected = {
            f"{ctc_root}.SEPARATE": 27000,
            f"{ctc_root}.SINGLE": 43000,
            f"{ctc_root}.HEAD_OF_HOUSEHOLD": 43000,
            f"{ctc_root}.JOINT": 54000,
            f"{ctc_root}.SURVIVING_SPOUSE": 54000,
        }
        for key, value in expected.items():
            assert key in reform, f"Missing Utah CTC revert: {key}"
            periods = reform[key]
            assert any(v == value for v in periods.values()), (
                f"Expected pre-2026 value {value} for {key}"
            )

    def test_reform_structure_for_policyengine(self):
        """Structure must be compatible with Reform.from_dict()."""
        reform = load_reform()
        assert isinstance(reform, dict)
        for param_path, periods in reform.items():
            assert isinstance(param_path, str)
            assert param_path.startswith("gov.states.ut."), (
                f"Non-Utah parameter in reform: {param_path}"
            )
            assert isinstance(periods, dict)
            for period_str in periods:
                # Expect PolicyEngine "YYYY-MM-DD.YYYY-MM-DD" period strings
                assert "." in period_str
                start, end = period_str.split(".")
                assert len(start) == 10
                assert len(end) == 10


class TestGetReformProvisions:
    """Tests for get_reform_provisions()."""

    def test_returns_all_provisions(self):
        provisions = get_reform_provisions()

        expected_keys = [
            "sb60_income_tax_rate",
            "hb290_ctc_phaseout_married_separate",
            "hb290_ctc_phaseout_single",
            "hb290_ctc_phaseout_head_of_household",
            "hb290_ctc_phaseout_joint",
            "hb290_ctc_phaseout_surviving_spouse",
        ]
        for key in expected_keys:
            assert key in provisions
            assert "description" in provisions[key]
            assert "parameter" in provisions[key]

    def test_sb60_current_and_pre_2026_values(self):
        """SB60 is the 4.5% -> 4.45% cut."""
        provisions = get_reform_provisions()
        sb60 = provisions["sb60_income_tax_rate"]
        assert sb60["pre_2026_value"] == 0.045
        assert sb60["current_law_value"] == 0.0445

    def test_hb290_thresholds(self):
        """HB290 CTC phaseout starts are preserved at 2025 values."""
        provisions = get_reform_provisions()
        assert provisions["hb290_ctc_phaseout_married_separate"]["pre_2026_value"] == 27_000
        assert provisions["hb290_ctc_phaseout_single"]["pre_2026_value"] == 43_000
        assert provisions["hb290_ctc_phaseout_head_of_household"]["pre_2026_value"] == 43_000
        assert provisions["hb290_ctc_phaseout_joint"]["pre_2026_value"] == 54_000
        assert provisions["hb290_ctc_phaseout_surviving_spouse"]["pre_2026_value"] == 54_000
