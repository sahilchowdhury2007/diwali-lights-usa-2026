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

The coverage script checks September 22 through November 10, 2025 over a small Bay Area bounding box. In the initial Code Editor run, the cloud and snow filters and quality flags 0 or 1 left usable pixels on 46 of 50 product dates. The counts for October 19 through 22 UTC were 13,732, 0, 0, and 1,628.

The follow-up Code Editor run used quality flag 0 and nonnegative radiance and counted pixels at each screening stage. At least one pixel passed all checks on 45 of 50 dates.

| UTC product date | Available radiance | High quality at night | Clear and snow free | Passed all filters |
| --- | ---: | ---: | ---: | ---: |
| 2025-10-19 | 14,830 | 14,825 | 14,825 | 13,727 |
| 2025-10-20 | 0 | 0 | 0 | 0 |
| 2025-10-21 | 0 | 0 | 0 | 0 |
| 2025-10-22 | 2,076 | 657 | 657 | 503 |

The Bay Area test region had zero available samples in the same-day radiance band on both candidate product dates, before the study's quality filters. Screen other regions on those same dates for coverage before choosing locations for a brightness comparison.

The five-metro screen found zero available samples on October 20 UTC in all five boxes. On October 21 UTC, the Bay Area, Los Angeles, Chicago, and New York–North Jersey boxes still had zero available samples. Dallas–Fort Worth had 23,807 available samples, and 22,756 of 25,742 sampled cells (88.4%) passed all filters. NASA lists one nighttime Suomi NPP granule overlapping the Dallas–Fort Worth box on October 21 UTC. Its range of 08:24–08:30 UTC corresponds to 03:24–03:30 CDT after the October 20 evening. [NASA granule metadata](https://cmr.earthdata.nasa.gov/search/concepts/G3825772898-LAADS.html)

The [Dallas pilot](../earth-engine/02-dallas-pilot.js) subtracts the median of five candidate comparison images from each usable event pixel. The control product dates are September 23 and 30 and October 7, 14, and 28 UTC, corresponding to nearby Monday nights locally. Each comparison pixel requires at least three usable control readings. The initial run found all five control images and reported a mean change of −1.1292 and median of −1.5285 nW/cm²/sr. Its reported count of 22,874 exceeded the 22,756 cells in the separate strict coverage run, so the results are provisional. Earth Engine can include different boundary cells in weighted and unweighted reductions. [Earth Engine region reduction rules](https://developers.google.com/earth-engine/guides/reducers_reduce_region)

The [night comparison](../earth-engine/03-dallas-night-comparison.js) reran the pilot on one 500 m grid with unweighted reductions. It compared 22,340 of the 22,756 usable event cells (98.2%) with the control median. The corrected mean change was −1.1411 and the median was −1.5363 nW/cm²/sr. No cell passed the quality filters on all six dates, so the shared six-night comparison returned counts of zero and null changes.

The [paired comparison](../earth-engine/04-dallas-paired-comparison.js) matches the event with each ordinary night separately. Both dates in a pair use the same cells and the same baseline, which is the median of at least two usable readings from the other four ordinary nights. Pixel coverage can differ from pair to pair. Report the count alongside each result. These comparisons are descriptive and retain differences in overpass time and viewing geometry. The paired results are pending.

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
