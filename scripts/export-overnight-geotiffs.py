"""Create aligned overnight GeoTIFFs from NASA Black Marble A1 tiles."""

import argparse
from datetime import datetime, timedelta, timezone
from itertools import permutations
from math import ceil, floor
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject, transform_bounds

from black_marble import identity, read_tile

LA_BOUNDS = (-118.65, 33.75, -117.95, 34.30)
NODATA = -9999.0


def choose_passes(tiles, max_view_difference):
    views = [tile.view for tile in tiles]
    view_range = np.maximum.reduce(views) - np.minimum.reduce(views)
    comparable = np.logical_and.reduce([tile.valid for tile in tiles]) & (view_range <= max_view_difference)
    best_count, best = 0, None
    for ordered in permutations(tiles):
        candidates = comparable.copy()
        for earlier, later in zip(ordered, ordered[1:]):
            candidates &= (later.utc_hours - earlier.utc_hours) >= 0.25
        if not candidates.any():
            continue
        # Keep one swath segment per satellite and use the same cells in every frame.
        granules, counts = np.unique(
            np.column_stack([tile.granule[candidates] for tile in ordered]),
            axis=0,
            return_counts=True,
        )
        winner = int(np.argmax(counts))
        count = int(counts[winner])
        if count > best_count:
            for tile, granule in zip(ordered, granules[winner]):
                candidates &= tile.granule == granule
            best_count, best = count, (ordered, candidates)
    if best is None:
        raise ValueError(f"No cells were usable in all {len(tiles)} passes under the viewing-angle and 15-minute separation checks.")
    return best


def save_passes(tiles, shared, day, bounds, output, resolution):
    first = tiles[0]
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

    projected = [(tile, warp(tile.radiance), warp(tile.utc_hours)) for tile in tiles]
    valid = np.logical_and.reduce([times != NODATA for _, _, times in projected])
    if not valid.any():
        raise ValueError("No shared cells landed on the output grid. Try a finer --resolution.")

    output.mkdir(parents=True, exist_ok=True)
    print(f"Shared cells on the output grid: {valid.sum():,} of {valid.size:,} ({valid.mean():.1%})")
    names = ["first-pass", "later-pass"]
    if len(tiles) == 3:
        names.insert(1, "middle-pass")
    for name, (tile, values, times) in zip(names, projected):
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
    parser.add_argument("tile_c", type=Path, nargs="?", help="Optional third satellite for the same tile and UTC date")
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
        paths = [path for path in (args.tile_a, args.tile_b, args.tile_c) if path is not None]
        identities = [identity(path) for path in paths]
        satellites, days, tile_ids = zip(*identities)
        if len(set(satellites)) != len(paths) or len(set(days)) != 1 or len(set(tile_ids)) != 1:
            raise ValueError("Use distinct satellites for the same UTC date and the same NASA tile ID.")
        tiles = [read_tile(path, satellite, args.bounds) for path, satellite in zip(paths, satellites)]
        first = tiles[0]
        for tile in tiles[1:]:
            if (first.radiance.shape != tile.radiance.shape
                    or not np.allclose(first.lat, tile.lat, atol=1e-8, rtol=0)
                    or not np.allclose(first.lon, tile.lon, atol=1e-8, rtol=0)):
                raise ValueError("The NASA inputs do not use the same source grid.")
        ordered, shared = choose_passes(tiles, args.max_view_difference)
        save_passes(ordered, shared, days[0], args.bounds, args.output_dir, args.resolution)
    except (OSError, KeyError, ValueError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
