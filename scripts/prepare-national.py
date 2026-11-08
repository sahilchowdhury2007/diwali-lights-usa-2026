"""Convert the four national Earth Engine GeoTIFFs into dashboard layers."""

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageColor
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject, transform, transform_bounds


DATA = Path(__file__).resolve().parents[1] / "public" / "data"
DATES = {2025: ("2025-10-20", "2025-10-21"), 2026: ("2026-11-08", "2026-11-09")}
REGIONS = {
    "lower48": ("Lower 48", (-125, 24, -66, 50)),
    "alaska_west_longitude": ("Alaska", (-180, 51, -129, 72)),
    "alaska_east_longitude": ("Western Aleutians", (172, 51, 180, 56)),
    "hawaii": ("Hawaii", (-179, 18, -154, 29)),
}
CHANGE_COLORS = ["#348ad0", "#3b4657", "#ffc56e"]
COVERAGE_COLORS = ["#4a3b53", "#65d9bc"]
CHANGE_LIMIT = 5
MIN_COVERAGE = 0.25


def read_tile(path, bounds):
    with rasterio.open(path) as source:
        if (
            source.crs is None or source.crs.to_epsg() != 4326
            or source.descriptions != ("radiance_change", "matched_fraction")
            or not np.allclose(source.bounds, bounds, atol=1e-7, rtol=0)
            or not np.allclose(tuple(source.transform)[:6],
                               [0.05, 0, bounds[0], 0, -0.05, bounds[3]], atol=1e-7, rtol=0)
        ):
            raise ValueError(f"Unexpected grid or bands in {path.name}")
        bands = source.read(masked=True).astype(np.float32).filled(np.nan)
        bands[bands == -9999] = np.nan
        change, coverage = bands
        finite = np.isfinite(coverage)
        if (
            not finite.any() or np.any(coverage[finite] < 0) or np.any(coverage[finite] > 1)
            or not np.array_equal(np.isfinite(change), coverage > 0)
        ):
            raise ValueError(f"Inconsistent brightness change and coverage in {path.name}")
        return bands, source.transform


def display_grid(bands, source_transform, bounds):
    west, south, east, north = transform_bounds("EPSG:4326", "EPSG:3857", *bounds)
    width = bands.shape[2]
    height = math.ceil((north - south) / ((east - west) / width))
    grid = np.full((2, height, width), np.nan, dtype=np.float32)
    reproject(
        bands, grid, src_transform=source_transform, src_crs="EPSG:4326", src_nodata=np.nan,
        dst_transform=from_bounds(west, south, east, north, width, height),
        dst_crs="EPSG:3857", dst_nodata=np.nan, resampling=Resampling.nearest,
    )
    return grid


def save_layer(path, data, mask, stops, colors):
    rgba = np.zeros((*data.shape, 4), dtype=np.uint8)
    palette = np.array([ImageColor.getrgb(color) for color in colors])
    for channel in range(3):
        rgba[mask, channel] = np.interp(data[mask], stops, palette[:, channel]).round()
    rgba[mask, 3] = 255
    Image.fromarray(rgba).save(path, optimize=True)


def prepare_tile(path, name, bounds, asset, bands, source_transform):
    grid = display_grid(bands, source_transform, bounds)
    change, coverage = grid
    width, height = change.shape[1], change.shape[0]
    visible = np.isfinite(change) & (coverage >= MIN_COVERAGE)
    known = np.isfinite(coverage)
    DATA.joinpath(asset).parent.mkdir(parents=True, exist_ok=True)
    change_url, coverage_url, pixels_url = f"{asset}.png", f"{asset}-coverage.png", f"{asset}-pixels.json"
    save_layer(DATA / change_url, change, visible, [-CHANGE_LIMIT, 0, CHANGE_LIMIT], CHANGE_COLORS)
    save_layer(DATA / coverage_url, coverage, known, [0, 1], COVERAGE_COLORS)
    cells = [None] * coverage.size
    for index in np.flatnonzero(known):
        value = round(float(change.flat[index]), 4) if visible.flat[index] else None
        cells[index] = [value, round(float(coverage.flat[index]), 6)]
    (DATA / pixels_url).write_text(
        json.dumps({"width": width, "height": height, "cells": cells}, separators=(",", ":")),
        encoding="utf-8",
    )
    west, south, east, north = bounds
    return {
        "name": name,
        "raster": {
            "url": change_url,
            "coverageUrl": coverage_url,
            "pixelsUrl": pixels_url,
            "coordinates": [[west, north], [east, north], [east, south], [west, south]],
            "colors": CHANGE_COLORS,
            "limit": CHANGE_LIMIT,
            "inputSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        },
        "matchedCells": int(np.isfinite(bands[0]).sum()),
        "displayedCells": int((bands[1] >= MIN_COVERAGE).sum()),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Directory containing the four Earth Engine exports")
    parser.add_argument("--year", type=int, choices=DATES, default=2025)
    args = parser.parse_args()
    date, product_date = DATES[args.year]

    # Validate every file before updating dashboard assets.
    exports = []
    for key, (name, bounds) in REGIONS.items():
        path = args.directory / f"diwali_{args.year}_{key}_0p05deg.tif"
        exports.append((path, name, bounds, f"{args.year}/us-{key}", *read_tile(path, bounds)))
    tiles = [prepare_tile(*export) for export in exports]

    manifest_path = DATA / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["years"][str(args.year)]["national"] = {
        "date": date,
        "productDateUtc": product_date,
        "satellite": "NOAA-20",
        "minCoverage": MIN_COVERAGE,
        "coverageColors": COVERAGE_COLORS,
        "tiles": tiles,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for tile in tiles:
        print(f"{tile['name']}: {tile['displayedCells']:,} of {tile['matchedCells']:,} matched source cells displayed")


if __name__ == "__main__":
    main()
