# Reproduce the satellite analysis

The dashboard runs from committed map exports. To reproduce the satellite analysis, install the Python dependencies below and use your own Earth Engine project and Earthdata account. The [methodology](methodology.md) documents the dates, baselines, and coverage checks.

```powershell
python -m pip install h5py numpy Pillow rasterio scipy
```

## Run the coverage check

1. Sign in at https://code.earthengine.google.com/ with your Google account. Select your registered Earth Engine Cloud project in the Code Editor.
2. Run the [daily coverage check](../earth-engine/01-check-coverage.js) in the Code Editor. It inspects daily image availability and usable pixel counts in a small test region. Start the optional CSV export in the Tasks panel.
3. Run the [metro coverage screen](../earth-engine/06-screen-metro-coverage.js) with `YEAR = 2025` to reproduce the historical coverage results. The Console reports matched coverage by metro and the availability of the November 9 UTC product for 2026.
4. Run the [metro brightness comparison](../earth-engine/07-compare-metro-brightness.js) to compare the 2025 event with ordinary nights from the same satellite. The Console reports each metro's change from its baseline and its comparisons with individual nights.

## Screen the United States

Run the [national coverage script](../earth-engine/09-screen-united-states.js) with `YEAR = 2025`. It reports coverage in all 50 states and DC as a percentage of samples on a 0.05° geographic grid. The map previews signed NOAA-20 radiance changes at its current zoom level. A matched sample has a usable event reading and at least three usable control nights.

Set `CREATE_EXPORTS = true` to create four GeoTIFF tasks for the lower 48, Hawaii, and both sides of Alaska's antimeridian. Each export contains the mean change over matched observations and the fraction of each 0.05° cell that had matched coverage within state boundaries. Those fractions can mask low coverage when building the dashboard layer. Start the batch exports from the Tasks panel.

With the four GeoTIFFs in one directory, run `python scripts/prepare-national.py --year 2025 "path-to-export-directory"` after installing the Python dependencies above. The converter verifies the two data bands and shared grid, then generates both map layers and the pixel readings. The brightness layer shows increases where matched coverage reaches 25%. The coverage layer includes cells at 0%.

For the 2026 comparison, set `YEAR = 2026` and first run with `CREATE_EXPORTS = false`. The Console must include the November 9 UTC event product and all five control dates. When they are available, set `CREATE_EXPORTS = true`, run again, then start all four tasks. Download the four `diwali_2026_*_0p05deg.tif` files into `data/raw/national-2026` and run `python scripts/prepare-national.py --year 2026 data/raw/national-2026`. Publish after checking the matched coverage and the generated layers.

## Reproduce the metro pilots locally

Run the [Dallas export script](../earth-engine/05-export-dallas-pilot.js) or the [Los Angeles footprint script](../earth-engine/08-check-los-angeles-footprint.js) in Earth Engine and download the GeoTIFF. Convert it to a PNG overlay and pixel data with Python.

```powershell
python scripts/prepare-dallas-pilot.py "path-to-export.tiff"
python scripts/prepare-dallas-pilot.py --metro los-angeles "path-to-la-four-night-export.tiff"
```

The converter validates each export and writes the overlay, pixel data, and metadata with its SHA-256 under `data/raw/pilots`.

## Prepare overnight playback

The 2025 player uses October 21 UTC Black Marble A1 tiles from NOAA-20, NOAA-21, and Suomi NPP. A1 supplies the observation times, at-sensor radiance, and quality flags needed to compare different overpasses of the same cell. The daily map uses the separate A2 product.

Generate a NASA Earthdata download token and save the Time Zone Boundary Builder 2025b archive in Downloads. Run the commands below from the repository in PowerShell. The token is entered in a hidden prompt and cleared from the environment after the downloader exits. The raw files are stored in the ignored `data/raw/overnight-us-2025` folder. [NASA Earthdata token instructions](https://urs.earthdata.nasa.gov/documentation/for_users/user_token) · [Time zone boundary archive](https://github.com/evansiroky/timezone-boundary-builder/releases/download/2025b/timezones-now.geojson.zip)

```powershell
$earthdataSecret = Read-Host 'Earthdata token' -AsSecureString
$env:EARTHDATA_TOKEN = [System.Net.NetworkCredential]::new('', $earthdataSecret).Password
try {
  python scripts/fetch-overnight-2025.py
  if ($LASTEXITCODE -ne 0) { throw 'Earthdata download failed.' }
} finally {
  Remove-Item Env:EARTHDATA_TOKEN
}
python scripts/prepare-us-overnight-2025.py --time-zones "$env:USERPROFILE/Downloads/timezones-now.geojson.zip"
```

The builder writes two Lower 48 brightness snapshots to `public/data/2025/overnight` and updates `public/data/manifest.json` with source filenames and coverage by state. Run `npm run build` and check the playback before publishing. [2025 playback methodology](methodology.md#2025-us-overnight-playback)

### 2026 Phoenix overnight pilot

The 2026 Phoenix pilot uses NOAA's open VIIRS DNB radiance and geolocation files with matching JRR cloud masks. It uses two November 9, 2026 UTC granules, NOAA-20 starting at 08:54:19.7 and NOAA-21 starting at 09:38:25.4. For each granule, use the matching SVDNB, GDNBO, and JRR-CloudMask files from the `2026/11/09` directories. [NOAA open-data directory](https://ncc.nesdis.noaa.gov/VIIRS/noddviirs.php)

Run `scripts/export-noaa-overnight.py` with two `--pass SDR GEO CLOUD` bundles and an `--output-dir`. It uses a 1 km Web Mercator grid, nearest samples within 1 km in that projection, clear JRR pixels, and the 20° viewing-angle check. Install `h5py numpy rasterio scipy` first. The resulting pair covers 12,949 of 12,954 output cells. The nominal times are 08:55:22 and 09:38:46 UTC. Feed the printed frame arguments into `prepare-overnight.py --year 2026`. The NOAA swath pilot and the national Black Marble comparison are separate products.
