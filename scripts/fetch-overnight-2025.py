"""Download the Collection 2 Black Marble A1 tiles for the 2025 U.S. playback."""

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import re
from shutil import copyfileobj
from time import sleep
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

import h5py
from rasterio.features import rasterize
from rasterio.transform import from_origin

from black_marble import PRODUCTS, us_states


ROOT = Path(__file__).resolve().parents[1]
HOST = 'ladsweb.modaps.eosdis.nasa.gov'
BASE = f'https://{HOST}/api/v2/content'
DESTINATION = ROOT / 'data/raw/overnight-us-2025'


class ArchiveRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urlsplit(newurl)
        if target.scheme != 'https' or target.hostname == 'urs.earthdata.nasa.gov':
            raise ValueError('NASA redirected the download to sign-in. Check the Earthdata token.')
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None and target.hostname != HOST:
            redirected.remove_header('Authorization')
        return redirected


def download_list():
    states = us_states(ROOT / 'public/data/us-states.geojson')
    grid = rasterize((feature['geometry'] for feature in states), out_shape=(18, 36),
                     transform=from_origin(-180, 90, 10, 10), all_touched=True)
    tiles = {f'h{col:02}v{row:02}' for row, col in zip(*grid.nonzero())}
    for product in PRODUCTS:
        folder = f'allData/5200/{product}/2025/294'
        with urlopen(f'{BASE}/details/{folder}', timeout=30) as response:
            inventory = json.load(response)['content']
        pattern = re.compile(rf'{product}\.A2025294\.(h\d{{2}}v\d{{2}})\.002\.\d+\.h5')
        selected = {}
        for entry in sorted(inventory, key=lambda item: item['name']):
            match = pattern.fullmatch(entry['name'])
            if match and match[1] in tiles and entry['status'] == 'Online':
                selected[match[1]] = (f'{BASE}/archives/{folder}/{entry["name"]}', entry['name'], entry['size'])
        if not selected:
            raise ValueError(f'No online Collection 2 files found for {product}.')
        yield from selected.values()


def download(item, token):
    url, filename, size = item
    path = DESTINATION / filename
    if path.is_file() and path.stat().st_size == size and h5py.is_hdf5(path):
        return
    temporary = path.with_suffix('.partial')
    request = Request(url, headers={'Authorization': f'Bearer {token}', 'X-Requested-With': 'XMLHttpRequest'})
    try:
        for attempt in range(3):
            try:
                with build_opener(ArchiveRedirect()).open(request, timeout=60) as response, temporary.open('wb') as output:
                    copyfileobj(response, output, length=1024 * 1024)
                if temporary.stat().st_size != size or not h5py.is_hdf5(temporary):
                    raise ValueError(f'NASA returned an incomplete or non-HDF5 file for {filename}.')
                temporary.replace(path)
                return
            except HTTPError as error:
                if error.code in (401, 403):
                    raise ValueError('NASA rejected the Earthdata token or this account lacks LAADS access.') from None
                if error.code < 500 and error.code != 429:
                    raise
                if attempt == 2:
                    raise
            except (URLError, TimeoutError, ValueError):
                if attempt == 2:
                    raise
            sleep(2 ** attempt)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    token = os.environ.get('EARTHDATA_TOKEN', '').strip()
    if not token:
        raise SystemExit('Set EARTHDATA_TOKEN for this process before downloading.')
    DESTINATION.mkdir(parents=True, exist_ok=True)
    items = list(download_list())
    print(f'Found {len(items)} U.S. tiles ({sum(item[2] for item in items) / 1e9:.2f} GB).', flush=True)
    with ThreadPoolExecutor(max_workers=8) as pool:
        for start in range(0, len(items), 8):
            batch = items[start:start + 8]
            try:
                list(pool.map(lambda tile: download(tile, token), batch))
            except (OSError, ValueError) as error:
                raise SystemExit(str(error)) from None
            print(f'{start + len(batch)}/{len(items)} tiles ready.', flush=True)


if __name__ == '__main__':
    main()
