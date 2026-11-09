"""Build the static place search index from the 2025 Census Gazetteer ZIP files."""

import argparse
import csv
import io
import json
from pathlib import Path
import re
from zipfile import ZipFile


DATA = Path(__file__).resolve().parents[1] / "public" / "data"


def rows(directory, kind):
    with ZipFile(directory / f"2025_Gaz_{kind}_national.zip") as archive:
        with archive.open(f"2025_Gaz_{kind}_national.txt") as source:
            yield from csv.DictReader(io.TextIOWrapper(source, encoding="utf-8-sig"), delimiter="|")


def points(coordinates):
    if isinstance(coordinates[0], (int, float)):
        yield coordinates
    else:
        for part in coordinates:
            yield from points(part)


def state_bounds():
    features = json.loads((DATA / "us-states.geojson").read_text(encoding="utf-8"))["features"]
    bounds = {}
    for feature in features:
        lons, lats = zip(*points(feature["geometry"]["coordinates"]))
        bounds[feature["id"]] = [[min(lons), min(lats)], [max(lons), max(lats)]]
    bounds["02"] = [[-180, 51], [-129, 72]]
    bounds["15"] = [[-161, 18.8], [-154.7, 22.4]]
    return bounds


def center(row):
    if row.get("USPS") == "CA" and row.get("NAME") in ("San Francisco city", "San Francisco County"):
        # The jurisdiction includes offshore islands. Center the map on the city.
        return [-122.42, 37.77]
    return [round(float(row["INTPTLONG"]), 5), round(float(row["INTPTLAT"]), 5)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Directory with the place, counties, state and zcta ZIP archives")
    directory = parser.parse_args().directory
    bounds = state_bounds()
    index = {"state": [[row["NAME"], row["USPS"], bounds[row["GEOID"]]] for row in rows(directory, "state")]}
    for key, file in (("city", "place"), ("county", "counties")):
        index[key] = []
        for row in rows(directory, file):
            name = row["NAME"]
            if key == "city":
                name = re.sub(r" (CDP|city(?: \(balance\))?|town|village|borough|municipality|zona urbana|comunidad)$", "", name)
                if name == "Urban Honolulu" and row["USPS"] == "HI":
                    name = "Honolulu"
            index[key].append([name, row["USPS"], *center(row), round(float(row["ALAND_SQMI"]), 1)])
    index["zip"] = [[row["GEOID"], *center(row)] for row in rows(directory, "zcta")]
    (DATA / "place-search.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(", ".join(f"{len(items):,} {kind} records" for kind, items in index.items()))


if __name__ == "__main__":
    main()
