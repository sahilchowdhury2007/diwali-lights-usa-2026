# Diwali Lights USA 2026

An open experiment: can unusual nighttime brightness around Diwali be detected in the United States? Use 2025 to test feasibility, then repeat the same analysis for 2026.

[Open the dashboard](https://sahilchowdhury2007.github.io/diwali-lights-usa-2026/) · [Check deployments](https://github.com/sahilchowdhury2007/diwali-lights-usa-2026/actions/workflows/pages.yml)

## Current state

The dashboard includes 2025 and 2026 views and a date slider. The 2025 festival date opens the national NOAA-20 comparison. The satellite layers show **Brighter than baseline**, **Stronger increases** above +0.5 nW/cm²/sr, and **Matched coverage**. Use **Map View** to explore Alaska, Hawaii, and the Western Aleutians. City labels help orient the map as you zoom. Click a map cell to inspect the data. See the [2025 results](docs/methodology.md#2025-national-coverage-screen).

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

## First research milestone

Before nationwide processing, assess valid coverage, observation timing, baseline variability, and event-versus-control differences in several preregistered test regions. Fix the method before evaluating 2026. See `docs/methodology.md`.

## Sources

- NASA Black Marble via Earth Engine: https://developers.google.com/earth-engine/datasets/catalog/NASA_VIIRS_002_VNP46A2
- NASA Black Marble product documentation: https://viirsland.gsfc.nasa.gov/Products/NASA/BlackMarble.html
- Earth Engine account requirements: https://developers.google.com/earth-engine/guides/access
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
