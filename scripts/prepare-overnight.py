"""Build playback frames from aligned, quality-screened VIIRS radiance GeoTIFFs."""

import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageColor
import rasterio
from rasterio.warp import transform


DATA = Path(__file__).resolve().parents[1] / "public" / "data"
WINDOWS = {
    2025: ("2025-10-20T22:08:00Z", "2025-10-21T14:03:00Z"),
    2026: ("2026-11-08T21:44:00Z", "2026-11-09T14:20:00Z"),
}
REFERENCE = [
    ("#40516a", "Below cutoff"),
    ("#ffc56e", "Above cutoff"),
]
COMPARISON = [
    ("#40516a", "Below cutoff at both passes"),
    ("#76a9ff", "Dropped below cutoff"),
    ("#72d7ad", "Rose above cutoff"),
    ("#ffc56e", "Above cutoff at both passes"),
]


def parse_utc(value):
    timestamp = datetime.fromisoformat(value)
    if timestamp.utcoffset() is None or timestamp.utcoffset().total_seconds() != 0:
        raise ValueError("Frame times must be ISO timestamps in UTC, ending in Z or +00:00.")
    return timestamp.astimezone(timezone.utc)


def load_frames(specs):
    grid = None
    frames = []
    for time, path, label in specs:
        with rasterio.open(path) as source:
            affine = source.transform
            if (source.count != 1 or source.crs is None or source.crs.to_epsg() != 3857
                    or affine.b != 0 or affine.d != 0 or affine.a <= 0 or affine.e >= 0):
                raise ValueError(f"{path} must be a north-up, single-band EPSG:3857 GeoTIFF.")
            if source.scales[0] != 1 or source.offsets[0] != 0:
                raise ValueError(f"{path} must store the physical radiance values directly.")
            current_grid = (source.shape, affine)
            if grid is None:
                grid = current_grid
                west, south, east, north = source.bounds
                lons, lats = transform(source.crs, "EPSG:4326", [west, east, east, west], [north, north, south, south])
                corners = [[lon, lat] for lon, lat in zip(lons, lats)]
            elif current_grid != grid:
                raise ValueError(f"{path} does not match the reference frame grid.")
            radiance = source.read(1, masked=True).astype(np.float32).filled(np.nan)
            frames.append((time, label, radiance))
    return frames, corners


def render_frame(folder, time, label, cells, valid, palette, region, corners, reference):
    rgba = np.zeros((*valid.shape, 4), dtype=np.uint8)
    for code, (color, _) in enumerate(palette):
        rgba[valid & (cells == code)] = (*ImageColor.getrgb(color), 255)
    stamp = time.strftime("%Y%m%dT%H%M%S")
    fingerprint = sha256(rgba.tobytes()).hexdigest()[:12]
    path = folder / f"{stamp}-{fingerprint}.png"
    Image.fromarray(rgba).save(path, optimize=True)
    return {
        "time": time.isoformat().replace("+00:00", "Z"),
        "label": label,
        "reference": reference,
        "legend": [{"color": color, "label": description} for color, description in palette],
        "tiles": [{"name": region, "raster": {"url": path.relative_to(DATA).as_posix(), "coordinates": corners}}],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", required=True, type=int, choices=WINDOWS)
    parser.add_argument("--region", required=True, help="Region covered by these rasters")
    parser.add_argument("--cutoff", required=True, type=float, help="Brightness threshold in nW/cm²/sr")
    parser.add_argument("--view-angle-preview", type=float, metavar="DEGREES",
                        help="Save a separate exploratory sequence made with this wider view-angle limit")
    parser.add_argument("--frame", action="append", required=True, nargs=3, metavar=("UTC", "GEOTIFF", "LABEL"))
    args = parser.parse_args()
    if not math.isfinite(args.cutoff) or args.cutoff <= 0:
        parser.error("--cutoff must be a positive, finite radiance.")
    if args.view_angle_preview is not None and not 20 < args.view_angle_preview <= 60:
        parser.error("--view-angle-preview must be greater than 20 and at most 60 degrees.")

    sunset, sunrise = WINDOWS[args.year]
    start, end = parse_utc(sunset), parse_utc(sunrise)
    specs = sorted((parse_utc(time), path, label) for time, path, label in args.frame)
    timestamps = {time for time, _, _ in specs}
    if len(timestamps) < 2 or len(timestamps) != len(specs):
        parser.error("Provide at least two frames with distinct observation times.")
    if any(time < start or time > end for time in timestamps):
        parser.error("All frames must fall between New York sunset and Los Angeles sunrise.")
    if any(time.microsecond for time in timestamps):
        parser.error("Frame timestamps must use whole seconds.")

    frames, corners = load_frames(specs)
    shared = np.logical_and.reduce([np.isfinite(values) for _, _, values in frames])
    if not shared.any():
        raise ValueError("The frames have no usable cells in common.")

    folder = DATA / str(args.year) / "overnight"
    folder.mkdir(parents=True, exist_ok=True)
    first = (frames[0][2] >= args.cutoff).astype(np.uint8)
    output = []
    for index, (time, label, values) in enumerate(frames):
        is_reference = index == 0
        palette = REFERENCE if is_reference else COMPARISON
        cells = first if is_reference else first + 2 * (values >= args.cutoff)
        output.append(render_frame(folder, time, label, cells, shared, palette, args.region, corners, is_reference))

    manifest_path = DATA / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    night = {
        "sunset": sunset,
        "sunrise": sunrise,
        "region": args.region,
        "cutoff": args.cutoff,
        "matchedCells": int(shared.sum()),
        "frames": output,
    }
    key = "overnight"
    if args.view_angle_preview is not None:
        key = "overnightPreview"
        night["maxViewDifference"] = args.view_angle_preview
    manifest["years"][str(args.year)][key] = night
    updated = manifest_path.with_suffix(".json.tmp")
    updated.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    updated.replace(manifest_path)
    print(f"Prepared {len(output)} frames on {shared.sum():,} shared cells.")


if __name__ == "__main__":
    main()
