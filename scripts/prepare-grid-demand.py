"""Build a Diwali electricity comparison from the EIA-930 Balance CSV."""

import argparse
import csv
import io
import json
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zipfile import ZipFile


EVENTS = {
    2025: (
        date(2025, 10, 20), (-4, -3, -2, 1, 2, 3),
        "https://zenodo.org/records/21103294",
    ),
    2026: (
        # Oct 11 precedes a federal holiday, and Nov 1 has gaps in the Balance CSV.
        date(2026, 11, 8), (-5, -3, -2),
        "https://www.eia.gov/electricity/gridmonitor/sixMonthFiles/EIA930_BALANCE_2026_Jul_Dec.csv",
    ),
}
REGIONS = {
    "CAL": "California", "CAR": "Carolinas", "CENT": "Central", "FLA": "Florida",
    "MIDA": "Mid-Atlantic", "MIDW": "Midwest", "NE": "New England", "NY": "New York",
    "NW": "Northwest", "SE": "Southeast", "SW": "Southwest", "TEN": "Tennessee",
    "TEX": "Texas",
}
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "src/data"


def hour_ends(night):
    start = datetime.combine(night, time(17))
    return [start + timedelta(hours=offset) for offset in range(1, 13)]


def build_dataset(rows, year):
    event_date, control_offsets, source = EVENTS[year]
    controls = [event_date + timedelta(weeks=offset) for offset in control_offsets]
    nights = (event_date, *controls)
    # EIA reports the 5–6 p.m. interval at 6 p.m.
    hours = {hour for night in nights for hour in hour_ends(night)}
    reporting_dates = {hour.strftime("%m/%d/%Y").lstrip("0") for hour in hours}
    readings = defaultdict(dict)
    for row in rows:
        region = row["Region"].strip()
        reported_time = row["Local Time at End of Hour"].strip()
        if region not in REGIONS or reported_time.split(" ", 1)[0].lstrip("0") not in reporting_dates:
            continue
        hour = datetime.strptime(reported_time, "%m/%d/%Y %I:%M:%S %p")
        value = row["Demand (MW)"].strip().replace(",", "")
        if hour not in hours or not value or int(value) <= 0:
            continue
        authority = (region, row["Balancing Authority"].strip())
        if hour in readings[authority]:
            raise ValueError(f"Duplicate demand report for {authority} at {hour}")
        readings[authority][hour] = int(value)

    complete = {key: values for key, values in readings.items() if values.keys() == hours}
    excluded = sorted(code for (region, code) in readings if (region, code) not in complete)
    groups = [("US48", "Lower 48", list(complete))]
    groups.extend(
        (region, name, [key for key in complete if key[0] == region])
        for region, name in REGIONS.items()
    )
    results = []
    for region, name, authorities in groups:
        if not authorities:
            raise ValueError(f"No complete demand series for {name}")
        totals = [
            [sum(complete[key][hour] for key in authorities) for hour in hour_ends(night)]
            for night in nights
        ]
        event, *control_totals = totals
        results.append({
            "id": region,
            "name": name,
            "authorities": sorted(code for _, code in authorities),
            "eventMw": event,
            "controlsMw": control_totals,
        })

    return {
        "eventDate": event_date.isoformat(),
        "controlDates": [night.isoformat() for night in controls],
        "startHour": 17,
        "sourceArchive": source,
        "excludedAuthorities": excluded,
        "regions": results,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="EIA-930 half-year ZIP or Balance CSV")
    parser.add_argument("--year", type=int, choices=EVENTS, default=2025)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.input.suffix.lower() == ".zip":
        with ZipFile(args.input) as archive:
            members = [name for name in archive.namelist() if "BALANCE" in name.upper() and name.lower().endswith(".csv")]
            if len(members) != 1:
                raise ValueError(f"Expected one Balance CSV, found {members}")
            with archive.open(members[0]) as member, io.TextIOWrapper(member, encoding="utf-8-sig", newline="") as source:
                dataset = build_dataset(csv.DictReader(source), args.year)
    else:
        with args.input.open(encoding="utf-8-sig", newline="") as source:
            dataset = build_dataset(csv.DictReader(source), args.year)
    output = args.output or OUTPUT_DIR / f"grid-demand-{args.year}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(dataset, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
