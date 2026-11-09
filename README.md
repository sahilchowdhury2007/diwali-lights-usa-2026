# Diwali Lights USA 2026

An open experiment: can unusual nighttime brightness around Diwali be detected in the United States? Use 2025 to test feasibility, then repeat the same analysis for 2026.

[Open the dashboard](https://sahilchowdhury2007.github.io/diwali-lights-usa-2026/) · [Check deployments](https://github.com/sahilchowdhury2007/diwali-lights-usa-2026/actions/workflows/pages.yml)

## Current state

The 2025 view opens the national NOAA-20 comparison, with the Lower 48 playback by local hour below the same map. The daily layers show **Brighter than baseline**, **Stronger increases** above +0.5 nW/cm²/sr, and **Matched coverage**. Click a daily map cell to inspect the data. Use **Map View** to explore Alaska, Hawaii, and the Western Aleutians. See the [2025 results](docs/methodology.md#2025-national-coverage-screen).

## Run locally

Requires Node.js 24 and npm.

```powershell
npm ci
npm run dev
```

```powershell
npm run build
npm run preview
```

The app is static. It reads `public/data/manifest.json`; no API credentials belong in the browser. The basemap uses bundled U.S. Census-derived state/territory boundaries from U.S. Atlas (2017). The geographic backdrop is context, not satellite observations. The site uses Comic Sans when installed, with Comic Neue from Google Fonts as a fallback.

Regenerate the tracked basemap geometry after changing the U.S. Atlas dependency with `node scripts/prepare-geography.mjs`. Its license is included alongside the geometry.

## Run the coverage check

1. Sign in at https://code.earthengine.google.com/ with an account that has access to the registered Cloud project `diwali-lights-usa`. Select that project from the account menu in the Code Editor.
2. Run `earth-engine/01-check-coverage.js` in the Code Editor. It inspects daily image availability and usable pixel counts in a small test region. The optional CSV export must be started separately from the Tasks panel.
3. Run the [metro coverage screen](earth-engine/06-screen-metro-coverage.js) with `YEAR = 2025` to reproduce the historical coverage results. The Console reports matched coverage by metro and the availability of the November 9 UTC product for 2026.
4. Run the [metro brightness comparison](earth-engine/07-compare-metro-brightness.js) to compare the 2025 event with ordinary nights from the same satellite. The Console reports each metro's change from its baseline and its comparisons with individual nights.

## Screen the United States

Run the [national coverage script](earth-engine/09-screen-united-states.js) with `YEAR = 2025`. It reports coverage in all 50 states and DC as a percentage of samples on a 0.05° geographic grid. The map previews signed NOAA-20 radiance changes at its current zoom level. A matched sample has a usable event reading and at least three usable control nights.

Set `CREATE_EXPORTS = true` to create four GeoTIFF tasks for the lower 48, Hawaii, and both sides of Alaska's antimeridian. Each export contains the mean change over matched observations and the fraction of each 0.05° cell that had matched coverage within state boundaries. Those fractions can mask low coverage when building the dashboard layer. Start the batch exports from the Tasks panel.

With the four GeoTIFFs in one directory, run `python scripts/prepare-national.py --year 2025 "path-to-export-directory"` using the dependencies below. The converter verifies the two data bands and shared grid, then generates both map layers and the pixel readings. The brightness layer shows increases where matched coverage reaches 25%. The coverage layer includes cells at 0%.

For the 2026 comparison, set `YEAR = 2026` and first run with `CREATE_EXPORTS = false`. The Console must include the November 9 UTC event product and all five control dates. When they are available, set `CREATE_EXPORTS = true`, run again, then start all four tasks. Download the four `diwali_2026_*_0p05deg.tif` files into `data/raw/national-2026` and run `python scripts/prepare-national.py --year 2026 data/raw/national-2026`. Publish after checking the matched coverage and the generated layers.

## Reproduce the metro pilots locally

Run [the export script](earth-engine/05-export-dallas-pilot.js) in Earth Engine and download the GeoTIFF. Convert it to a PNG overlay and pixel data with Python.

```powershell
python -m pip install rasterio numpy Pillow
python scripts/prepare-dallas-pilot.py "path-to-export.tiff"
python scripts/prepare-dallas-pilot.py --metro los-angeles "path-to-la-four-night-export.tiff"
```

The Los Angeles export comes from the [footprint script](earth-engine/08-check-los-angeles-footprint.js). The converter validates each export and writes the overlay, pixel data, and metadata with its SHA-256 under the ignored `data/raw/pilots` directory. These pilot comparisons are separate from the national dashboard.

## GitHub Pages

The repository uses **GitHub Actions** as its Pages source. The [deployment workflow](.github/workflows/pages.yml) installs dependencies from the lockfile, builds `dist`, and deploys on pushes to `main`. You can also run **Publish dashboard** from the Actions tab. If you fork the project, select **GitHub Actions** in **Settings → Pages** before running the workflow.

Earth Engine processing runs outside the public site. Later, a separately configured data workflow can generate and publish static exports. No scheduled data ingestion or credentials are configured yet. The current Pages workflow only builds and publishes the frontend.

## Prepare overnight playback

The 2025 player uses October 21 UTC Black Marble A1 tiles from NOAA-20, NOAA-21, and Suomi NPP. A1 supplies the observation times, at-sensor radiance, and quality flags needed to compare different overpasses of the same cell. The daily map uses the separate A2 product.

Generate a NASA Earthdata download token and save the Time Zone Boundary Builder 2025b archive in Downloads. Run the commands below from the repository in PowerShell. The token is entered in a hidden prompt and cleared from the environment after the downloader exits. The raw files are stored in the ignored `data/raw/overnight-us-2025` folder. [NASA Earthdata token instructions](https://urs.earthdata.nasa.gov/documentation/for_users/user_token) · [Time zone boundary archive](https://github.com/evansiroky/timezone-boundary-builder/releases/download/2025b/timezones-now.geojson.zip)

```powershell
python -m pip install h5py numpy rasterio Pillow
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

The builder writes hourly Lower 48 frames to `public/data/2025/overnight` and updates `public/data/manifest.json` with source filenames and coverage by state. Run `npm run build` and check the playback before publishing. [2025 playback methodology](docs/methodology.md#2025-us-overnight-playback)

### 2026 Phoenix overnight pilot

The 2026 Phoenix pilot uses NOAA's open VIIRS DNB radiance and geolocation files with matching JRR cloud masks. It uses two November 9, 2026 UTC granules, NOAA-20 starting at 08:54:19.7 and NOAA-21 starting at 09:38:25.4. For each granule, use the matching SVDNB, GDNBO, and JRR-CloudMask files from the `2026/11/09` directories. [NOAA open-data directory](https://ncc.nesdis.noaa.gov/VIIRS/noddviirs.php)

Run `scripts/export-noaa-overnight.py` with two `--pass SDR GEO CLOUD` bundles and an `--output-dir`. It uses a 1 km Web Mercator grid, nearest samples within 1 km in that projection, clear JRR pixels, and the 20° viewing-angle check. Install `h5py numpy rasterio scipy` first. The resulting pair covers 12,949 of 12,954 output cells. The nominal times are 08:55:22 and 09:38:46 UTC. Feed the printed frame arguments into `prepare-overnight.py --year 2026`. The NOAA swath pilot and the national Black Marble comparison are separate products.

## First research milestone

Before nationwide processing, assess valid coverage, observation timing, baseline variability, and event-versus-control differences in several preregistered test regions. Fix the method before evaluating 2026. See `docs/methodology.md`.

## Sources

- NASA Black Marble via Earth Engine: https://developers.google.com/earth-engine/datasets/catalog/NASA_VIIRS_002_VJ146A2
- NASA Black Marble product documentation: https://viirsland.gsfc.nasa.gov/Products/NASA/BlackMarble.html
- Earth Engine account requirements: https://developers.google.com/earth-engine/guides/access
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
