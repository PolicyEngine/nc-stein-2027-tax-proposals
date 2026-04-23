"""Generate North Carolina congressional-district CSV from state-level results.

North Carolina has 14 congressional districts (NC-01..NC-14, state FIPS 37).
This script seeds the district CSV by spreading the state-level average
impact across districts with modest variation — used as a placeholder
before the full Modal district pipeline has been run.
"""

import os
import random

# NC state-level placeholder — replace with real pipeline output.
NC_STATE_RESULT = {"avg_change": 135.00, "rel_change": 0.0018}

# North Carolina congressional districts (119th Congress): 14 districts.
NC_STATE = "NC"
NC_DISTRICTS = list(range(1, 15))

YEAR = 2027


def main():
    output_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "frontend",
        "public",
        "data",
    )
    os.makedirs(output_dir, exist_ok=True)

    random.seed(42)

    districts = []
    base_change = NC_STATE_RESULT["avg_change"]
    base_rel = NC_STATE_RESULT["rel_change"]

    for d in NC_DISTRICTS:
        variation = 1.0 + random.uniform(-0.2, 0.2)
        district_change = base_change * variation
        district_rel = base_rel * variation

        district_id = f"{NC_STATE}-{d:02d}"

        districts.append({
            "district": district_id,
            "average_household_income_change": round(district_change, 2),
            "relative_household_income_change": round(district_rel, 6),
            "state": NC_STATE,
            "year": YEAR,
        })

    districts.sort(key=lambda x: x["district"])

    filepath = os.path.join(output_dir, "congressional_districts.csv")
    with open(filepath, "w") as f:
        headers = [
            "district",
            "average_household_income_change",
            "relative_household_income_change",
            "state",
            "year",
        ]
        f.write(",".join(headers) + "\n")
        for d in districts:
            row = [str(d[h]) for h in headers]
            f.write(",".join(row) + "\n")

    print(f"Saved {len(districts)} North Carolina districts to: {filepath}")

    avg_change = sum(d["average_household_income_change"] for d in districts) / len(districts)
    min_change = min(d["average_household_income_change"] for d in districts)
    max_change = max(d["average_household_income_change"] for d in districts)

    print("\nSummary:")
    print(f"  Total districts: {len(districts)}")
    print(f"  Avg income change: ${avg_change:,.2f}")
    print(f"  Min change: ${min_change:,.2f}")
    print(f"  Max change: ${max_change:,.2f}")


if __name__ == "__main__":
    main()
