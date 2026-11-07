"""Convert the Dallas Earth Engine export into dashboard assets."""

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
ASSET = "2025/dallas-fort-worth-2025-10-20"
COLORS = ["#348ad0", "#3b4657", "#ffc56e"]
LIMIT = 5


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("geotiff", type=Path)
    args = parser.parse_args()

    with rasterio.open(args.geotiff) as source:
        if source.crs is None or source.crs.to_epsg() != 3857 or source.count != 4:
            raise ValueError("Expected a four-band Dallas export in EPSG:3857.")
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
            [-97.55, 32.55, -96.60, 33.10], atol=0.01, rtol=0,
        ):
            raise ValueError("The raster bounds do not match the Dallas pilot.")
        bands = source.read(masked=True).filled(np.nan)

    valid = np.all(np.isfinite(bands) & (bands != -9999), axis=0)
    observed, baseline, change, controls = bands[:, valid]
    if (
        not valid.any()
        or np.any(observed < 0)
        or np.any(baseline < 0)
        or not np.all(np.isin(controls, [3, 4, 5]))
        or not np.allclose(change, observed - baseline, atol=0.001, rtol=0)
    ):
        raise ValueError("The measurements do not match the Dallas export contract.")

    height, width = valid.shape
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    palette = np.array([ImageColor.getrgb(color) for color in COLORS])
    for channel in range(3):
        rgba[valid, channel] = np.interp(
            change, [-LIMIT, 0, LIMIT], palette[:, channel],
        ).round().astype(np.uint8)
    rgba[valid, 3] = 255

    output = DATA / ASSET
    output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba).save(output.with_suffix(".png"), optimize=True)
    cells = [
        [round(float(a), 3), round(float(b), 3), round(float(c), 3), int(n)]
        if valid_cell else None
        for (a, b, c, n), valid_cell in zip(bands.reshape(4, -1).T, valid.flat)
    ]
    output.with_name(output.name + "-pixels.json").write_text(
        json.dumps({"width": width, "height": height, "cells": cells}, separators=(",", ":")),
        encoding="utf-8",
    )

    manifest_path = DATA / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    pilot = {
        "date": "2025-10-20",
        "status": "ready",
        "name": "Dallas–Fort Worth",
        "productDateUtc": "2025-10-21",
        "overpassStart": "2025-10-21T08:24:00Z",
        "overpassEnd": "2025-10-21T08:30:00Z",
        "granuleUrl": "https://cmr.earthdata.nasa.gov/search/concepts/G3825772898-LAADS.html",
        "summary": {"count": 22340, "mean": -1.1411, "median": -1.5363},
        "raster": {
            "url": ASSET + ".png",
            "pixelsUrl": ASSET + "-pixels.json",
            "coordinates": coordinates,
            "colors": COLORS,
            "limit": LIMIT,
            "validCells": int(valid.sum()),
            "inputSha256": hashlib.sha256(args.geotiff.read_bytes()).hexdigest(),
        },
    }
    year = manifest["years"]["2025"]
    year["status"] = "pilot_ready"
    year["observations"] = [
        item for item in year["observations"]
        if (item["date"], item.get("overpassStart")) != (pilot["date"], pilot["overpassStart"])
    ] + [pilot]
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8",
    )
    print(f"Wrote {width} × {height} overlay with {valid.sum():,} valid display cells.")


if __name__ == "__main__":
    main()
