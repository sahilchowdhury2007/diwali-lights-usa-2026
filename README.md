# Diwali Lights USA 2026

An open experiment: can unusual nighttime brightness around Diwali be detected in the United States? Use 2025 to test feasibility, then repeat the same analysis for 2026.

## Current state

The initial React + MapLibre dashboard is scaffolded, with 2025/2026 selection, a reference-date slider, mainland/Alaska/Hawaii views, a methodology panel, and a GitHub Pages deployment workflow. **No satellite observations have been processed, no anomaly results are displayed, and the website is not deployed yet.** Blank data states do not mean zero extra light.

Initial validation: production build passed; the local dashboard rendered in the browser; switching to 2026 showed the pending-data state; moving the date slider to +1 updated the date to November 9, 2026. The bundled U.S. basemap was visually checked. The Earth Engine script passed JavaScript syntax checking but has not been executed against Earth Engine yet.

The user-approved glow metric is **measured excess nighttime light**, not an inferred number of celebrants. Electricity demand is a possible supporting layer at grid-region resolution. Population or demographic distributions will not be used to fabricate light hotspots.

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

## Your next setup steps

1. Sign in at https://code.earthengine.google.com/ with an account that has access to the registered Cloud project `diwali-lights-usa`. Select that project from the account menu in the Code Editor.
2. Run `earth-engine/01-check-coverage.js` in the Code Editor. It inspects daily image availability and usable pixel counts in a small test region. The optional CSV export must be started separately from the Tasks panel.
3. Use the GitHub integration to publish directly, or create an empty public repository named `diwali-lights-usa-2026` under `sahilchowdhury2007`. The display title is “Diwali Lights USA 2026”.

Expected address after repository creation, push, Pages configuration, and deployment: `https://sahilchowdhury2007.github.io/diwali-lights-usa-2026/`. This is a planned URL, not a verified live website.

## GitHub Pages

In repository Settings → Pages, select **GitHub Actions** as the build and deployment source. The checked-in workflow builds `dist` and deploys on pushes to `main` or `master`, or by manual workflow dispatch. The relative Vite base supports repository subpaths.

Earth Engine processing runs outside the public site. Later, a separately configured data workflow can generate and publish static exports. No scheduled data ingestion or credentials are configured yet. The current Pages workflow only builds and publishes the frontend.

## First research milestone

Before nationwide processing, assess valid coverage, observation timing, baseline variability, and event-versus-control differences in several preregistered test regions. Fix the method before evaluating 2026. See `docs/methodology.md`.

## Sources

- NASA Black Marble via Earth Engine: https://developers.google.com/earth-engine/datasets/catalog/NASA_VIIRS_002_VNP46A2
- NASA Black Marble product documentation: https://viirsland.gsfc.nasa.gov/Products/NASA/BlackMarble.html
- Earth Engine account requirements: https://developers.google.com/earth-engine/guides/access
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
