"""Build two Lower 48 brightness snapshots with the same coverage from Black Marble A1."""

import argparse
from collections import defaultdict
from datetime import datetime, timezone
from hashlib import sha256
import json
from math import ceil, floor
from pathlib import Path
from zipfile import ZipFile

import numpy as np
from PIL import Image, ImageColor
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.warp import transform, transform_bounds, transform_geom

from black_marble import identity, read_tile, us_states


ROOT = Path(__file__).resolve().parents[1]
DAY = datetime(2025, 10, 21, tzinfo=timezone.utc)
# These adjacent local hours have the widest shared coverage on this night.
EARLY_HOUR, LATE_HOUR = 2, 3
BOUNDS = (-125, 24, -66, 50)
# Offsets for this date, when most of the Lower 48 was on daylight time.
ZONE_OFFSETS = {
    'America/New_York': -4,
    'America/Chicago': -5,
    'America/Denver': -6,
    'America/Los_Angeles': -7,
    'America/Phoenix': -7,
}
RESOLUTION = 3000
MAX_VIEW_DIFFERENCE = 20
RADIANCE_MAX = 40
RADIANCE_COLORS = ['#263545', '#715635', '#d89342', '#ffedb1']


def clock(hour):
    return f'{hour % 12 or 12} {"AM" if hour % 24 < 12 else "PM"}'


def region_grid(geometries):
    west, south, east, north = transform_bounds('EPSG:4326', 'EPSG:3857', *BOUNDS)
    x0 = floor(west / RESOLUTION) * RESOLUTION
    x1 = ceil(east / RESOLUTION) * RESOLUTION
    y0 = ceil(north / RESOLUTION) * RESOLUTION
    y1 = floor(south / RESOLUTION) * RESOLUTION
    width = round((x1 - x0) / RESOLUTION)
    height = round((y0 - y1) / RESOLUTION)
    grid = from_origin(x0, y0, RESOLUTION, RESOLUTION)
    land = rasterize(geometries, out_shape=(height, width), transform=grid, dtype='uint8')
    lon = np.asarray(transform('EPSG:3857', 'EPSG:4326', x0 + (np.arange(width) + 0.5) * RESOLUTION, np.zeros(width))[0])
    lat = np.asarray(transform('EPSG:3857', 'EPSG:4326', np.zeros(height), y0 - (np.arange(height) + 0.5) * RESOLUTION)[1])
    lon_edges, lat_edges = transform('EPSG:3857', 'EPSG:4326', [x0, x1, x1, x0], [y0, y0, y1, y1])
    corners = [[x, y] for x, y in zip(lon_edges, lat_edges)]
    return land, lat, lon, corners, grid


def read_offsets(path, shape, grid):
    with ZipFile(path) as archive, archive.open('combined-now.json') as source:
        features = json.load(source)['features']
    zones = {feature['properties']['tzid']: feature['geometry'] for feature in features}
    geometries = [(transform_geom('EPSG:4326', 'EPSG:3857', zones[name]), offset)
                  for name, offset in ZONE_OFFSETS.items()]
    return rasterize(geometries, out_shape=shape, transform=grid, dtype='int16')


def tile_groups(lat, lon):
    rows_by_tile = ((90 - lat) // 10).astype(int)
    cols_by_tile = ((lon + 180) // 10).astype(int)
    for v in np.unique(rows_by_tile):
        rows = np.flatnonzero(rows_by_tile == v)
        for h in np.unique(cols_by_tile):
            cols = np.flatnonzero(cols_by_tile == h)
            yield f'h{h:02}v{v:02}', rows, cols


def compare(tiles, land, offsets):
    times = np.stack([tile.utc_hours for tile in tiles])
    views = np.stack([tile.view for tile in tiles])
    radiance = np.stack([tile.radiance for tile in tiles])
    local_times = times + offsets
    valid = np.stack([tile.valid for tile in tiles]) & land & (offsets != 0)
    early = valid & (local_times >= EARLY_HOUR) & (local_times < EARLY_HOUR + 1)
    late = valid & (local_times >= LATE_HOUR) & (local_times < LATE_HOUR + 1)
    elapsed = times[None, ...] - times[:, None, ...]
    angle_difference = np.abs(views[None, ...] - views[:, None, ...])
    pairs = early[:, None, ...] & late[None, ...] & (elapsed >= 0.25)
    pairs &= angle_difference <= MAX_VIEW_DIFFERENCE

    # Compare the most similar view angles when multiple pairs qualify.
    shared = pairs.any(axis=(0, 1))
    closest = np.where(pairs, angle_difference, np.inf).reshape(-1, *land.shape).argmin(axis=0)
    indexes = np.stack(np.divmod(closest, len(tiles)))
    readings = np.take_along_axis(radiance, indexes, axis=0)
    return shared, np.where(shared, readings, np.nan), np.unique(indexes[:, shared])


def read_region(geometries, inputs, state_count, zone_path):
    land, lat, lon, corners, grid = region_grid(geometries)
    offsets = read_offsets(zone_path, land.shape, grid)
    frames = np.full((2, *land.shape), np.nan, dtype=np.float32)
    counts = np.bincount(land.ravel(), minlength=state_count + 1)
    matched = np.zeros_like(counts)
    sources = set()
    for key, rows, cols in tile_groups(lat, lon):
        target = np.ix_(rows, cols)
        state_ids = land[target]
        if not state_ids.any() or len(inputs[key]) < 2:
            continue
        tiles = [read_tile(path, satellite, target_axes=(lat[rows], lon[cols]))
                 for satellite, path in sorted(inputs[key].items())]
        shared, readings, satellites = compare(tiles, state_ids > 0, offsets[target])
        matched += np.bincount(state_ids[shared], minlength=state_count + 1)
        sources.update(tiles[index].path.name for index in satellites)
        frames[:, rows[:, None], cols] = readings
    return frames, corners, counts, matched, sources


def write_image(data_dir, radiance, stamp):
    rgba = np.zeros((*radiance.shape, 4), dtype=np.uint8)
    valid = np.isfinite(radiance)
    # A fixed scale keeps faint light visible and preserves the order of readings.
    brightness = np.arcsinh(np.clip(radiance[valid], 0, RADIANCE_MAX) / 2) / np.arcsinh(RADIANCE_MAX / 2)
    colors = np.array([ImageColor.getrgb(color) for color in RADIANCE_COLORS])
    stops = np.linspace(0, 1, len(colors))
    for channel in range(3):
        rgba[:, :, channel][valid] = np.rint(np.interp(brightness, stops, colors[:, channel]))
    rgba[:, :, 3][valid] = 255
    fingerprint = sha256(rgba.tobytes()).hexdigest()[:12]
    filename = f'2025/overnight/matched-{stamp}-{fingerprint}.png'
    Image.fromarray(rgba).save(data_dir / filename, optimize=True)
    return filename


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', type=Path, default=ROOT / 'data/raw/overnight-us-2025')
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'public/data')
    parser.add_argument('--time-zones', type=Path, required=True, help='Time Zone Boundary Builder 2025b timezones-now.geojson.zip')
    args = parser.parse_args()
    inputs = defaultdict(dict)
    for path in sorted(args.input_dir.glob('*.h5')):
        satellite, date, tile = identity(path)
        if date == DAY:
            inputs[tile][satellite] = path
    states = [state for state in us_states(args.data_dir / 'us-states.geojson')
              if state['properties']['name'] not in ('Alaska', 'Hawaii')]
    geometries = [(transform_geom('EPSG:4326', 'EPSG:3857', state['geometry']), index)
                  for index, state in enumerate(states, 1)]
    output, corners, totals, shared, sources = read_region(geometries, inputs, len(states), args.time_zones)
    cell_count = int(shared[1:].sum())
    if cell_count == 0:
        parser.error('No cells passed the comparison checks in both hours.')
    (args.data_dir / '2025/overnight').mkdir(parents=True, exist_ok=True)
    frames = []
    for slot, pixels in zip((EARLY_HOUR, LATE_HOUR), output):
        label = f'{clock(slot)} to {clock(slot + 1)} local time'
        filename = write_image(args.data_dir, pixels, f'{slot % 24:02}00')
        frames.append({'localHour': slot, 'label': label, 'cellCount': cell_count,
                       'tiles': [{'name': 'Lower 48', 'raster': {'url': filename, 'coordinates': corners}}]})

    path = args.data_dir / 'manifest.json'
    manifest = json.loads(path.read_text(encoding='utf-8'))
    year = manifest['years']['2025']
    year.pop('overnightPreview', None)
    year['overnight'] = {
        'region': 'Lower 48', 'startLocalHour': EARLY_HOUR, 'endLocalHour': LATE_HOUR + 1,
        'fixedFootprint': True, 'radianceMax': RADIANCE_MAX, 'radianceColors': RADIANCE_COLORS,
        'maxViewDifference': MAX_VIEW_DIFFERENCE, 'frameMinutes': 60,
        'matchedCells': cell_count, 'totalCells': int(totals[1:].sum()),
        'sourceLabel': 'NASA Black Marble A1 · NOAA-20, NOAA-21, and Suomi NPP',
        'sourceFiles': sorted(sources),
        'stateCoverage': [{'name': state['properties']['name'], 'matchedCells': int(shared[index]),
                           'totalCells': int(totals[index])} for index, state in enumerate(states, 1)],
        'frames': frames,
    }
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)
    print(f'{cell_count:,} of {totals[1:].sum():,} cells compared in both snapshots.')


if __name__ == '__main__':
    main()
