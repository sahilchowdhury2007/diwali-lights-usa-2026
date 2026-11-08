# Diwali Lights USA 2026

An open experiment: can unusual nighttime brightness around Diwali be detected in the United States? Use 2025 to test feasibility, then repeat the same analysis for 2026.

[Open the dashboard](https://sahilchowdhury2007.github.io/diwali-lights-usa-2026/) · [Check deployments](https://github.com/sahilchowdhury2007/diwali-lights-usa-2026/actions/workflows/pages.yml)

## Current state

The dashboard includes 2025 and 2026 views and a date slider. The 2025 Dallas–Fort Worth snapshot shows measured brightness change from the control median. Click a map cell to see the event reading, baseline, change, and number of usable control nights. See the [coverage and Dallas results](docs/methodology.md#first-diagnostic).

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

The app is static. It reads `public/data/manifest.json`; no API credentials belong in the browser. The basemap uses bundled U.S. Census-derived state/territory boundaries from U.S. Atlas (2017). The geographic backdrop is context, not satellite observations. Google Fonts needs internet access, with local font fallbacks if unavailable.

Regenerate the tracked basemap geometry after changing the U.S. Atlas dependency with `node scripts/prepare-geography.mjs`. Its license is included alongside the geometry.

## Run the coverage check

1. Sign in at https://code.earthengine.google.com/ with an account that has access to the registered Cloud project `diwali-lights-usa`. Select that project from the account menu in the Code Editor.
2. Run `earth-engine/01-check-coverage.js` in the Code Editor. It inspects daily image availability and usable pixel counts in a small test region. The optional CSV export must be started separately from the Tasks panel.
3. To look beyond the Dallas pilot, paste the entire [metro coverage script](earth-engine/06-screen-metro-coverage.js) into a new Code Editor script and click **Run**. Leave `YEAR = 2025` for the first run and read the two **coverage by metro** lists in the Console. The script also reports whether the candidate November 9 UTC product is present for 2026. No export is needed.

## Rebuild the Dallas overlay

Run [the export script](earth-engine/05-export-dallas-pilot.js) in Earth Engine and download the GeoTIFF. Convert it to the dashboard's PNG overlay and pixel data with Python.

```powershell
python -m pip install rasterio numpy Pillow
python scripts/prepare-dallas-pilot.py "path-to-export.tiff"
```

The converter reads the export's projection and bounds, validates the bands, and records the input SHA-256. It writes the display assets to `public/data/2025` and updates the manifest. The original GeoTIFF can be kept in the ignored `data/raw` directory.

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
