"""Create two aligned overnight GeoTIFFs from NASA Black Marble A1 tiles."""

import argparse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import ceil, floor
from pathlib import Path
import re

import h5py
import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject, transform_bounds


FIELDS = "HDFEOS/GRIDS/VIIRS_Grid_DNB_2d/Data Fields"
PRODUCTS = {"VJ146A1": "NOAA-20", "VJ246A1": "NOAA-21", "VNP46A1": "Suomi NPP"}
LA_BOUNDS = (-118.65, 33.75, -117.95, 34.30)
NODATA = -9999.0


@dataclass
class Tile:
    path: Path
    satellite: str
    radiance: np.ndarray
    utc_hours: np.ndarray
    granule: np.ndarray
    view: np.ndarray
    valid: np.ndarray
    lat: np.ndarray
    lon: np.ndarray


def identity(path):
    match = re.fullmatch(r"(VJ146A1|VJ246A1|VNP46A1)\.A(\d{7})\.(h\d{2}v\d{2})\.002\.\d+\.h5", path.name)
    if not match:
        raise ValueError(f"Expected a NASA Collection 2 A1 .h5 filename, got {path.name}.")
    product, day, tile = match.groups()
    return PRODUCTS[product], datetime.strptime(day, "%Y%j").replace(tzinfo=timezone.utc), tile


def physical(dataset, subset):
    raw = dataset[subset].astype(np.float32)
    fill = dataset.attrs.get("_FillValue")
    if fill is not None:
        raw[raw == np.asarray(fill).item()] = np.nan
    return raw * np.asarray(dataset.attrs.get("scale_factor", 1)).item() + np.asarray(dataset.attrs.get("add_offset", 0)).item()


def read_tile(path, satellite, bounds):
    west, south, east, north = bounds
    with h5py.File(path, "r") as source:
        fields = source[FIELDS]
        lat, lon = fields["lat"][:], fields["lon"][:]
        rows = np.flatnonzero((lat >= south) & (lat <= north))
        cols = np.flatnonzero((lon >= west) & (lon <= east))
        if len(rows) < 2 or len(cols) < 2:
            raise ValueError(f"{path.name} does not cover the requested bounds.")
        subset = np.s_[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
        lat, lon = lat[subset[0]], lon[subset[1]]
        arrays = [
            physical(fields[name], subset) for name in
            ("DNB_At_Sensor_Radiance", "UTC_Time", "Solar_Zenith", "Lunar_Zenith", "Sensor_Zenith")
        ]
        arrays += [fields[name][subset] for name in ("QF_Cloud_Mask", "QF_DNB", "Granule")]
    if lat[0] < lat[-1]:
        lat, arrays = lat[::-1], [array[::-1, :] for array in arrays]
    if lon[0] > lon[-1]:
        lon, arrays = lon[::-1], [array[:, ::-1] for array in arrays]
    radiance, utc_hours, solar, lunar, view, cloud, dnb, granule = arrays
    # NASA Black Marble Collection 2 user guide, Tables 5–7.
    land = (cloud >> 1) & 7
    valid = (
        np.isfinite(radiance) & (radiance >= 0) & (utc_hours >= 0) & (utc_hours < 24)
        & (solar >= 102) & (lunar >= 90) & (view >= 0) & (view <= 60)
        & (dnb == 0) & (granule != 255)
        & ((cloud & 1) == 0) & np.isin(land, [0, 1, 5])
        & (((cloud >> 4) & 3) == 3) & (((cloud >> 6) & 3) == 0)
        & (((cloud >> 8) & 7) == 0) & (((cloud >> 12) & 3) == 0)
    )
    return Tile(path, satellite, radiance, utc_hours, granule, view, valid, lat, lon)


def choose_passes(a, b, max_view_difference):
    comparable = a.valid & b.valid & (np.abs(a.view - b.view) <= max_view_difference)
    gap = b.utc_hours - a.utc_hours
    best_count, best = 0, None
    for earlier, later, separated in ((a, b, gap >= 0.25), (b, a, gap <= -0.25)):
        candidates = comparable & separated
        for first_id in np.unique(earlier.granule[candidates]):
            first = candidates & (earlier.granule == first_id)
            for later_id in np.unique(later.granule[first]):
                shared = first & (later.granule == later_id)
                count = int(shared.sum())
                if count > best_count:
                    best_count, best = count, (earlier, later, shared)
    if best is None:
        raise ValueError("No shared clear cells passed the viewing-angle and 15-minute separation checks.")
    return best


def save_pair(first, later, shared, day, bounds, output, resolution):
    dx, dy = first.lon[1] - first.lon[0], first.lat[0] - first.lat[1]
    if not np.allclose(np.diff(first.lon), dx) or not np.allclose(-np.diff(first.lat), dy):
        raise ValueError("Expected a regular latitude/longitude grid.")
    source = from_origin(first.lon[0] - dx / 2, first.lat[0] + dy / 2, dx, dy)
    west, south, east, north = transform_bounds("EPSG:4326", "EPSG:3857", *bounds)
    x0, y0 = floor(west / resolution), ceil(north / resolution)
    width = ceil(east / resolution) - x0
    height = y0 - floor(south / resolution)
    target = from_origin(x0 * resolution, y0 * resolution, resolution, resolution)
    if width * height > 10_000_000:
        raise ValueError("Output grid is too large. Increase --resolution or narrow --bounds.")

    def warp(array):
        result = np.full((height, width), NODATA, dtype=np.float32)
        reproject(np.where(shared, array, NODATA), result,
                  src_transform=source, src_crs="EPSG:4326", src_nodata=NODATA,
                  dst_transform=target, dst_crs="EPSG:3857", dst_nodata=NODATA,
                  resampling=Resampling.nearest)
        return result

    projected = [(tile, warp(tile.radiance), warp(tile.utc_hours)) for tile in (first, later)]
    valid = np.logical_and.reduce([times != NODATA for _, _, times in projected])
    if not valid.any():
        raise ValueError("No shared cells landed on the output grid. Try a finer --resolution.")

    output.mkdir(parents=True, exist_ok=True)
    print(f"Shared cells on the output grid: {valid.sum():,} of {valid.size:,} ({valid.mean():.1%})")
    for name, (tile, values, times) in zip(("first-pass", "later-pass"), projected):
        seconds = [round(float(hours) * 3600) for hours in (times[valid].min(), np.median(times[valid]), times[valid].max())]
        start, nominal, end = [(day + timedelta(seconds=s)).strftime("%Y-%m-%dT%H:%M:%SZ") for s in seconds]
        path = output / f"{name}.tif"
        with rasterio.open(path, "w", driver="GTiff", width=width, height=height, count=1,
                           dtype="float32", crs="EPSG:3857", transform=target, nodata=NODATA, compress="deflate") as tif:
            tif.write(np.where(valid, values, NODATA), 1)
            tif.set_band_unit(1, "nW/cm²/sr")
            tif.update_tags(satellite=tile.satellite, source_file=tile.path.name,
                            observation_start_utc=start, observation_utc=nominal, observation_end_utc=end)
        print(f'{tile.satellite} | {start} to {end}')
        print(f'--frame "{nominal}" "{path}" "{tile.satellite} pass"')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tile_a", type=Path)
    parser.add_argument("tile_b", type=Path)
    parser.add_argument("--bounds", type=float, nargs=4, default=LA_BOUNDS, metavar=("WEST", "SOUTH", "EAST", "NORTH"))
    parser.add_argument("--resolution", type=int, default=750, help="Output grid spacing in Web Mercator meters")
    parser.add_argument("--max-view-difference", type=float, default=20, help="Maximum difference in sensor zenith angles")
    parser.add_argument("--output-dir", type=Path, default=Path("data/raw/overnight"))
    args = parser.parse_args()
    west, south, east, north = args.bounds
    if not (-180 <= west < east <= 180 and -85 < south < north < 85):
        parser.error("--bounds must be a valid west south east north box.")
    if args.resolution <= 0 or not 0 <= args.max_view_difference <= 60:
        parser.error("Use positive resolution and a view-angle difference from 0 to 60 degrees.")
    try:
        a, b = identity(args.tile_a), identity(args.tile_b)
        if a[0] == b[0] or a[1:] != b[1:]:
            raise ValueError("Use two satellites for the same UTC date and the same NASA tile ID.")
        first = read_tile(args.tile_a, a[0], args.bounds)
        second = read_tile(args.tile_b, b[0], args.bounds)
        if (first.radiance.shape != second.radiance.shape
                or not np.allclose(first.lat, second.lat, atol=1e-8, rtol=0)
                or not np.allclose(first.lon, second.lon, atol=1e-8, rtol=0)):
            raise ValueError("The NASA inputs do not use the same source grid.")
        early, late, shared = choose_passes(first, second, args.max_view_difference)
        save_pair(early, late, shared, a[1], args.bounds, args.output_dir, args.resolution)
    except (OSError, KeyError, ValueError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
