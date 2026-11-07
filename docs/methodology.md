# Analysis decisions and first experiment

## Confirmed scope

- Public static website on GitHub Pages, owned by sahilchowdhury2007.
- Display title: Diwali Lights USA 2026; planned repo: diwali-lights-usa-2026.
- A U.S. map with a glow representing measured excess nighttime light.
- 2025 is the feasibility test; 2026 repeats the analysis and supports comparison.
- The map does not claim to locate celebrants or quantify crowd sizes.

## Hypothesis

Daily satellite nighttime radiance around Diwali may show positive changes beyond normal variation at some aggregate geographic scales in the United States. A null or indeterminate result is valid. One historical year alone cannot establish causation or reproducibility.

## Data and quality

Use NASA/VIIRS/002/VNP46A2 and the same-day `DNB_BRDF_Corrected_NTL` band. Keep nonnegative radiance and `Mandatory_Quality_Flag == 0`. The Earth Engine catalog and NASA Collection 2 user guide disagree on flag 1. Both identify 0 as high quality. Report quality losses and valid observation counts. Confirm scale factors, units, and masks before calculating radiance anomalies. [NASA Collection 2 user guide, Table 9](https://ladsweb.modaps.eosdis.nasa.gov/api/v2/content/archives/Document%20Archive/Science%20Data%20Product%20Documentation/Black-Marble_v2.0_UG_2024.pdf)

Do not interpret a stale or imputed pixel as a new event-night measurement. Missing event or baseline data remains missing. Do not create a glow by distributing electricity demand across city centers or weighting demographic counts.

## Date alignment

Reference festival dates from the supplied project brief are October 20, 2025 and November 8, 2026. The UI currently shows reference dates only. Validate product timestamps and actual overpass times against local evenings before assigning event-night imagery. Inspect adjacent product dates to avoid assigning a post-midnight observation to the wrong evening. Handle time zones and DST explicitly. U.S. events may also be held on nearby weekends; an event window is useful, but must be specified before inspecting favorable results.

## First diagnostic

The coverage script checks September 22 through November 10, 2025 over a small Bay Area bounding box. In the initial Code Editor run, the cloud and snow filters and quality flags 0 or 1 left usable pixels on 46 of 50 product dates. The counts for October 19 through 22 UTC were 13,732, 0, 0, and 1,628. These counts record the initial filter. Rerun coverage using the corrected flag rule before comparing brightness.

After access works:

1. Select several test regions and comparison regions before inspecting anomaly maps. Include regions with differing urban brightness, weather, and geography; avoid selecting only apparent hotspots.
2. Verify adequate same-night and baseline coverage and determine sensible aggregation scales. Begin with daily observations; do not hide event-night gaps in a multi-day composite.
3. Prespecify an event window and control nights matched for local weekday, season, and retrieval quality. Exclude festival dates from baseline estimation. Examine neighboring holidays and unusual conditions.
4. Compare observed radiance with a robust local baseline. Report absolute excess, relative excess only where the baseline is sufficient, baseline variability, sample count, and coverage. Do not label a standardized score as a calibrated celebration probability.
5. Test the same statistic on non-event placebo dates. Account for testing many pixels/regions and spatial dependence before making significance claims. Assess whether the event signal exceeds ordinary fluctuations and retrieval artifacts.
6. Publish limitations even if the result is weak. Lock the pipeline and display scale before examining 2026, then repeat with the same settings.

## Mapping

Render geographically referenced raster exports. A glow may be a display treatment for a validated positive radiance anomaly, but it must preserve the underlying scale and missing-data mask. Excess light is not the number of celebrations. Avoid independently normalizing each year or date to its own maximum. Keep no-observation, insufficient-baseline, no-positive-excess, and not-yet-published states distinct in the eventual layer and hover inspection.

The base U.S. map includes separate views for the mainland, Alaska, and Hawaii; nationwide data coverage is not claimed yet. Mainland-only processing must be labeled if that is the first available export.

## Static data contract for initial UI

`public/data/manifest.json` has years, event dates, processing states, and observations. The initial observation lists are empty. A future display record may contain:

```json
{
  "date": "2025-10-21",
  "status": "ready",
  "raster": {
    "url": "2025/validated-night.png",
    "coordinates": [[-125, 50], [-66, 50], [-66, 24], [-125, 24]],
    "legend": "A validated, fixed anomaly scale with explicit units"
  }
}
```

This is a structural example, not an existing observation. Corners are top-left, top-right, bottom-right, bottom-left. The date must follow the validated local-night convention, and the raster must be properly reprojected before display. Production exports should include numerical values, observation timing, QA, baseline counts, methodology version, and coverage alongside the display image so region inspection is reproducible. Raster display alone is not a completed scientific dashboard.

## Delivery sequence

- Day 1: account setup, coverage/timing checks, first reproducible 2025 test.
- Day 2: real processed data on the map, numeric inspection, control comparisons, then geographic expansion if feasible.
- Day 3: 2025/2026 comparison behavior, quality review, GitHub Pages publication, and repeatable refresh instructions. Actual 2026 results depend on publication and valid satellite coverage.

## External dependencies

Google Earth Engine registration/authentication and GitHub account connection remain user actions. The local application and repository files can be developed independently. No background refresh is running, and no 2026 observations are promised before they exist.
