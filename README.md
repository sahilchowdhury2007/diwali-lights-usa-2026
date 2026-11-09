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

## Prepare overnight playback

1. In the Earth Engine Code Editor, run the [overnight input check](earth-engine/12-check-overnight-inputs.js) under project `diwali-lights-usa`. The Console lists the daily NOAA-20 A2 bands for October 21, 2025 UTC. This product supports the daily brightness comparison and omits per-pixel `UTC_Time`. The overnight pilot needs two readings from different times of the same night. [Earth Engine NOAA-20 A2 catalog](https://developers.google.com/earth-engine/datasets/catalog/NASA_VIIRS_002_VJ146A2)
2. Sign in to NASA Earthdata and download both A1 inputs. These HDF5 files contain the observation times and quality flags used to isolate passes. Both cover Los Angeles and Phoenix in tile `h06v05` on October 21, 2025 UTC. Save them in `data/raw/overnight-la-2025` under the repo. [NOAA-20 tile](https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/5200/VJ146A1/2025/294/VJ146A1.A2025294.h06v05.002.2025295100330.h5) · [NOAA-21 tile](https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/5200/VJ246A1/2025/294/VJ246A1.A2025294.h06v05.002.2025343142734.h5)
3. From the repo folder, run the exporter in PowerShell. This pair failed the 20° viewing-angle check over Los Angeles. The Phoenix pilot uses the same tiles and screening rules.

```powershell
python -m pip install h5py numpy rasterio
python scripts/export-overnight-geotiffs.py --output-dir data/raw/overnight-phoenix-2025 `
  --bounds -112.61 33.12 -111.48 33.88 `
  "data/raw/overnight-la-2025/VJ146A1.A2025294.h06v05.002.2025295100330.h5" `
  "data/raw/overnight-la-2025/VJ246A1.A2025294.h06v05.002.2025343142734.h5"
```

The exporter selects the pass pair with the most shared clear cells under its time and viewing-angle checks. It writes `first-pass.tif` and `later-pass.tif` and prints the `--frame` arguments for the builder below. The A1 radiance is measured at the sensor. Differences can still reflect viewing geometry, atmospheric conditions, or calibration across satellites, so use the outputs as an exploratory pilot.

The Phoenix pair has 7,391 matched cells, or 31.9% of the output grid. The nominal observation times are 08:47:06 and 09:38:08 UTC. Use the printed `--frame` arguments to build the two frames at the exploratory cutoff of 5 nW/cm²/sr.

```powershell
python -m pip install rasterio numpy Pillow
python scripts/prepare-overnight.py --year 2025 --region "Phoenix pilot" --cutoff 5 `
  --frame "2025-10-21T08:47:06Z" "data/raw/overnight-phoenix-2025/first-pass.tif" "NOAA-20 pass" `
  --frame "2025-10-21T09:38:08Z" "data/raw/overnight-phoenix-2025/later-pass.tif" "NOAA-21 pass"
npm run dev
```

The builder limits the comparison to cells with valid readings in every frame. The earliest pass is the reference. Later frames show which cells crossed the cutoff or were on the same side of it in both readings. A cell above the cutoff at two passes may have changed between them.

On the matching year's festival date, select **Open overnight playback**. You can step through measured passes and gaps from New York sunset to Los Angeles sunrise. The control appears when the manifest has at least two measured frames for that night. The builder writes the PNGs to `public/data/<year>/overnight` and updates the public manifest. Commit those files with the player code and push to `main` to publish.

## First research milestone

Before nationwide processing, assess valid coverage, observation timing, baseline variability, and event-versus-control differences in several preregistered test regions. Fix the method before evaluating 2026. See `docs/methodology.md`.

## Sources

- NASA Black Marble via Earth Engine: https://developers.google.com/earth-engine/datasets/catalog/NASA_VIIRS_002_VNP46A2
- NASA Black Marble product documentation: https://viirsland.gsfc.nasa.gov/Products/NASA/BlackMarble.html
- Earth Engine account requirements: https://developers.google.com/earth-engine/guides/access
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
