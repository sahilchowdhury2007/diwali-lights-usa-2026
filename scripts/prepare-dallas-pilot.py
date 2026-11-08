"""Convert a Dallas or Los Angeles Earth Engine export into dashboard assets."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageColor
import rasterio
from rasterio.warp import transform


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
COLORS = ["#7d5636", "#d4924c", "#ffdda2"]
LIMIT = 5
OBSERVATIONS = {
    "dallas": {
        "slug": "dallas-fort-worth",
        "bounds": [-97.55, 32.55, -96.60, 33.10],
        "name": "Dallas–Fort Worth",
        "satellite": "Suomi NPP",
        "baselineLabel": "Median of usable control nights",
        "overpassStart": "2025-10-21T08:24:00Z",
        "overpassEnd": "2025-10-21T08:30:00Z",
        "granuleUrl": "https://cmr.earthdata.nasa.gov/search/concepts/G3825772898-LAADS.html",
        "summary": {"count": 22340, "mean": -1.1411, "median": -1.5363},
    },
    "los-angeles": {
        "slug": "los-angeles",
        "bounds": [-118.65, 33.75, -117.95, 34.30],
        "name": "Los Angeles",
        "satellite": "NOAA-20",
        "baselineLabel": "Brightest of three control nights",
        "sourceUrl": "https://developers.google.com/earth-engine/datasets/catalog/NASA_VIIRS_002_VJ146A2",
        "summary": {"count": 8887, "mean": -1.3918, "median": 0.5424, "aboveControlsPct": 57.4},
    },
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("geotiff", type=Path)
    parser.add_argument("--metro", choices=OBSERVATIONS, default="dallas")
    args = parser.parse_args()
    config = OBSERVATIONS[args.metro]
    asset = f"2025/{config['slug']}-2025-10-20"

    with rasterio.open(args.geotiff) as source:
        if source.crs is None or source.crs.to_epsg() != 3857 or source.count != 4:
            raise ValueError("Expected a four-band Earth Engine export in EPSG:3857.")
        grid = source.transform
        if grid.b != 0 or grid.d != 0 or grid.a <= 0 or grid.e >= 0:
            raise ValueError("Expected a north-up raster.")
        west, south, east, north = source.bounds
        lons, lats = transform(
            source.crs, "EPSG:4326",
            [west, east, east, west], [north, north, south, south],
        )
        coordinates = [[round(lon, 8), round(lat, 8)] for lon, lat in zip(lons, lats)]
        if not np.allclose(
            [lons[0], lats[2], lons[2], lats[0]],
            config["bounds"], atol=0.01, rtol=0,
        ):
            raise ValueError(f"The raster bounds do not match {config['name']}.")
        bands = source.read(masked=True).filled(np.nan)

    measured = np.isfinite(bands) & (bands != -9999)
    valid = measured.all(axis=0)
    values = bands[:, valid]
    if args.metro == "los-angeles":
        if not np.all(measured == valid) or np.any(values < 0):
            raise ValueError("Expected four nonnegative readings on a shared pixel mask.")
        observed = values[0]
        baseline = values[1:].max(axis=0)
        change = observed - baseline
        controls = np.full(observed.shape, 3)
    else:
        observed, baseline, change, controls = values
    if (
        not valid.any()
        or np.any(observed < 0)
        or np.any(baseline < 0)
        or not np.all(np.isin(controls, [3, 4, 5]))
        or not np.allclose(change, observed - baseline, atol=0.001, rtol=0)
    ):
        raise ValueError(f"The measurements do not match the {config['name']} export contract.")

    height, width = valid.shape
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    palette = np.array([ImageColor.getrgb(color) for color in COLORS])
    brighter = change > 0
    visible = valid.copy()
    visible[valid] = brighter
    for channel in range(3):
        rgba[visible, channel] = np.interp(
            change[brighter], [0, LIMIT / 2, LIMIT], palette[:, channel],
        ).round().astype(np.uint8)
    rgba[visible, 3] = 255

    output = DATA / asset
    output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba).save(output.with_suffix(".png"), optimize=True)
    cells = [None] * valid.size
    for index, a, b, c, n in zip(np.flatnonzero(valid), observed, baseline, change, controls):
        cells[index] = [round(float(a), 3), round(float(b), 3), round(float(c), 3), int(n)]
    output.with_name(output.name + "-pixels.json").write_text(
        json.dumps({"width": width, "height": height, "cells": cells}, separators=(",", ":")),
        encoding="utf-8",
    )

    manifest_path = DATA / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    pilot = {
        **{key: value for key, value in config.items() if key not in ("slug", "bounds")},
        "date": "2025-10-20",
        "status": "ready",
        "productDateUtc": "2025-10-21",
        "raster": {
            "url": asset + ".png",
            "pixelsUrl": asset + "-pixels.json",
            "coordinates": coordinates,
            "colors": COLORS,
            "limit": LIMIT,
            "validCells": int(valid.sum()),
            "inputSha256": hashlib.sha256(args.geotiff.read_bytes()).hexdigest(),
        },
    }
    year = manifest["years"]["2025"]
    year["status"] = "pilot_ready"
    for index, item in enumerate(year["observations"]):
        if (item["date"], item.get("name")) == (pilot["date"], pilot["name"]):
            year["observations"][index] = pilot
            break
    else:
        year["observations"].append(pilot)
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
    print(f"Wrote {width} × {height} overlay with {valid.sum():,} valid display cells.")


if __name__ == "__main__":
    main()
