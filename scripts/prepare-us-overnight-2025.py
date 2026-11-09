"""Build the 2025 U.S. overnight playback from Collection 2 Black Marble A1 tiles."""

import argparse
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from math import ceil, floor, pi
from pathlib import Path

import numpy as np
from PIL import Image, ImageColor
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.warp import transform, transform_bounds, transform_geom

from black_marble import identity, read_tile, us_states


ROOT = Path(__file__).resolve().parents[1]
DAY = datetime(2025, 10, 21, tzinfo=timezone.utc)
SUNSET = datetime(2025, 10, 20, 22, 8, tzinfo=timezone.utc)
SUNRISE = datetime(2025, 10, 21, 14, 3, tzinfo=timezone.utc)
END_HOUR = (SUNRISE - DAY).total_seconds() / 3600
RESOLUTION = 3000
CUTOFF = 5
MAX_VIEW_DIFFERENCE = 20
FRAME_MINUTES = 15
REGIONS = {
    'Lower 48': (-125, 24, -66, 50),
    'Alaska': (-180, 51, -129, 72),
    'Western Aleutians': (172, 51, 180, 56),
    'Hawaii': (-179, 18, -154, 29),
}
LEGEND = [
    ('#55657a', 'Below cutoff at first reading'),
    ('#d8a454', 'Above cutoff at first reading'),
    ('#344259', 'Below cutoff at both readings'),
    ('#76a9ff', 'Dropped below cutoff'),
    ('#72d7ad', 'Rose above cutoff'),
    ('#ffc56e', 'Above cutoff at both readings'),
]
COLORS = np.array([(0, 0, 0, 0)] + [(*ImageColor.getrgb(color), 255) for color, _ in LEGEND], dtype=np.uint8)


def iso(time):
    return time.isoformat().replace('+00:00', 'Z')


def region_grid(bounds, geometries):
    west, south, east, north = transform_bounds('EPSG:4326', 'EPSG:3857', *bounds)
    world_edge = pi * 6378137
    x0 = max(-world_edge, floor(west / RESOLUTION) * RESOLUTION)
    x1 = min(world_edge, ceil(east / RESOLUTION) * RESOLUTION)
    y0 = ceil(north / RESOLUTION) * RESOLUTION
    y1 = floor(south / RESOLUTION) * RESOLUTION
    width = ceil((x1 - x0) / RESOLUTION)
    height = round((y0 - y1) / RESOLUTION)
    dx = (x1 - x0) / width
    grid = from_origin(x0, y0, dx, RESOLUTION)
    land = rasterize(geometries, out_shape=(height, width), transform=grid, dtype='uint8')
    lon = np.asarray(transform('EPSG:3857', 'EPSG:4326', x0 + (np.arange(width) + 0.5) * dx, np.zeros(width))[0])
    lat = np.asarray(transform('EPSG:3857', 'EPSG:4326', np.zeros(height), y0 - (np.arange(height) + 0.5) * RESOLUTION)[1])
    lon_edges, lat_edges = transform('EPSG:3857', 'EPSG:4326', [x0, x1, x1, x0], [y0, y0, y1, y1])
    corners = [[max(-180, min(180, x)), y] for x, y in zip(lon_edges, lat_edges)]
    return land, lat, lon, corners


def tile_groups(lat, lon):
    rows_by_tile = ((90 - lat) // 10).astype(int)
    cols_by_tile = ((lon + 180) // 10).astype(int)
    for v in np.unique(rows_by_tile):
        rows = np.flatnonzero(rows_by_tile == v)
        for h in np.unique(cols_by_tile):
            cols = np.flatnonzero(cols_by_tile == h)
            yield f'h{h:02}v{v:02}', rows, cols


def compare(tiles, land):
    times = np.stack([tile.utc_hours for tile in tiles])
    views = np.stack([tile.view for tile in tiles])
    bright = np.stack([tile.radiance >= CUTOFF for tile in tiles])
    valid = np.stack([tile.valid for tile in tiles]) & land & (times < END_HOUR)
    elapsed = times[None, ...] - times[:, None, ...]
    pairs = valid[None, ...] & valid[:, None, ...] & (elapsed >= 0.25)
    pairs &= np.abs(views[None, ...] - views[:, None, ...]) <= MAX_VIEW_DIFFERENCE

    # Keep the reading with the most comparable later observations. In a tie,
    # use the earlier reading so the comparison covers as much time as possible.
    counts = pairs.sum(axis=1)
    best = counts.max(axis=0)
    reference = np.where(counts == best, times, np.inf).argmin(axis=0)
    shared = best > 0
    reference_bright = np.take_along_axis(bright, reference[None, ...], axis=0)[0]
    selected_pairs = np.take_along_axis(pairs, reference[None, None, ...], axis=0)[0]
    return times, shared, np.where(
        (np.arange(len(tiles))[:, None, None] == reference) & shared, 1 + bright,
        np.where(selected_pairs, 3 + reference_bright + 2 * bright, 0),
    ).astype(np.uint8)


def read_region(bounds, geometries, inputs, state_count):
    land, lat, lon, corners = region_grid(bounds, geometries)
    frames = {}
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
        times, shared, codes = compare(tiles, state_ids > 0)
        matched += np.bincount(state_ids[shared], minlength=state_count + 1)
        for tile, hours, values in zip(tiles, times, codes):
            active = values > 0
            if not active.any():
                continue
            sources.add(tile.path.name)
            bins = np.full(active.shape, -1, dtype=np.int16)
            bins[active] = np.floor(hours[active].astype(np.float64) * 60 / FRAME_MINUTES).astype(np.int16)
            for slot in np.unique(bins[active]):
                if slot not in frames:
                    frames[slot] = np.zeros_like(land)
                # Different satellites may populate the same time window, but
                # readings for a given cell are separated by at least one window.
                selection = bins == slot
                window = frames[slot][target]
                window[selection] = values[selection]
                frames[slot][target] = window
    return frames, corners, counts, matched, sources


def write_image(data_dir, pixels, stamp):
    rgba = COLORS[pixels]
    fingerprint = sha256(rgba.tobytes()).hexdigest()[:12]
    filename = f'2025/overnight/us-{stamp}-{fingerprint}.png'
    Image.fromarray(rgba).save(data_dir / filename, optimize=True)
    return filename


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', type=Path, default=ROOT / 'data/raw/overnight-us-2025')
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'public/data')
    args = parser.parse_args()
    inputs = defaultdict(dict)
    for path in sorted(args.input_dir.glob('*.h5')):
        satellite, date, tile = identity(path)
        if date == DAY:
            inputs[tile][satellite] = path
    states = us_states(args.data_dir / 'us-states.geojson')
    geometries = [(transform_geom('EPSG:4326', 'EPSG:3857', state['geometry']), index)
                  for index, state in enumerate(states, 1)]
    totals = np.zeros(len(states) + 1, dtype=np.int64)
    shared = np.zeros_like(totals)
    sources = set()
    output = defaultdict(list)
    counts = defaultdict(int)
    (args.data_dir / '2025/overnight').mkdir(parents=True, exist_ok=True)

    for region, bounds in REGIONS.items():
        frames, corners, cells, matched, files = read_region(bounds, geometries, inputs, len(states))
        totals += cells
        shared += matched
        sources.update(files)
        print(f'{region}: {matched[1:].sum():,} of {cells[1:].sum():,} cells compared.', flush=True)
        for slot, pixels in sorted(frames.items()):
            stamp = (DAY + timedelta(minutes=int(slot) * FRAME_MINUTES)).strftime('%H%M')
            filename = write_image(args.data_dir, pixels, stamp)
            output[slot].append({'name': region, 'raster': {'url': filename, 'coordinates': corners}})
            counts[slot] += int(np.count_nonzero(pixels))
    if len(output) < 2:
        parser.error('At least two observed windows are needed to publish playback.')

    frames = []
    for slot, tiles in sorted(output.items()):
        start = DAY + timedelta(minutes=int(slot) * FRAME_MINUTES)
        end = min(start + timedelta(minutes=FRAME_MINUTES), SUNRISE)
        frames.append({'time': iso(start + (end - start) / 2),
                       'label': f'{start:%H:%M}–{end:%H:%M} UTC',
                       'cellCount': counts[slot], 'tiles': tiles})

    path = args.data_dir / 'manifest.json'
    manifest = json.loads(path.read_text(encoding='utf-8'))
    year = manifest['years']['2025']
    year.pop('overnightPreview', None)
    year['overnight'] = {
        'region': 'United States', 'sunset': iso(SUNSET), 'sunrise': iso(SUNRISE),
        'cutoff': CUTOFF, 'maxViewDifference': MAX_VIEW_DIFFERENCE, 'frameMinutes': FRAME_MINUTES,
        'matchedCells': int(shared[1:].sum()), 'totalCells': int(totals[1:].sum()),
        'sourceLabel': 'NASA Black Marble A1 · NOAA-20, NOAA-21, and Suomi NPP',
        'sourceFiles': sorted(sources),
        'stateCoverage': [{'name': state['properties']['name'], 'matchedCells': int(shared[index]),
                           'totalCells': int(totals[index])} for index, state in enumerate(states, 1)],
        'legend': [{'color': color, 'label': label} for color, label in LEGEND],
        'frames': frames,
    }
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)
    print(f'{len(frames)} observation windows across {np.count_nonzero(shared[1:])} of {len(states)} jurisdictions.')


if __name__ == '__main__':
    main()
