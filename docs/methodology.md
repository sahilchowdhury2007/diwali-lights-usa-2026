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

The [paired comparison](../earth-engine/04-dallas-paired-comparison.js) matches the event with each ordinary night separately. Both dates in a pair use the same cells and the same baseline, which is the median of at least two usable readings from the other four ordinary nights. Pixel coverage can differ from pair to pair. Changes below are event minus ordinary night in nW/cm²/sr.

| Ordinary UTC date | Matched cells | Mean change | Median change |
| --- | ---: | ---: | ---: |
| 2025-09-23 | 22,266 | −1.56 | −1.51 |
| 2025-09-30 | 0 | — | — |
| 2025-10-07 | 20,597 | −1.62 | +1.57 |
| 2025-10-14 | 22,015 | −2.85 | −1.72 |
| 2025-10-28 | 21,857 | −1.66 | −1.46 |

The mean was lower on the event night in all four usable pairs. The positive October 7 median shows that the distribution of local changes differed from the overall mean. These are descriptive results for the Dallas pilot. Coverage differs by pair, and the comparison retains differences in overpass time and viewing geometry.

The [Dallas export script](../earth-engine/05-export-dallas-pilot.js) prepares a GeoTIFF using the fixed-grid pilot baseline. Its four bands store event radiance, baseline median, signed change, and usable control count. The [converter](../scripts/prepare-dallas-pilot.py) derives the geographic corners from the Web Mercator export. The map colors positive changes up to +5 nW/cm²/sr and provides signed readings on click. Reprojection changes the number of display cells. The reported 22,340 comparisons refer to the original analysis grid.

The [metro coverage screen](../earth-engine/06-screen-metro-coverage.js) checks eight mainland test boxes on Suomi NPP and NOAA-20 separately. It reports raw availability, usable event pixels, and pixels with both a usable event reading and at least three usable control nights from the same platform. The 2025 dates and filters match the Dallas pilot. The 2026 screen uses the November 9 UTC candidate product and five earlier product dates after Sunday evenings. Use the coverage counts to choose follow-up regions before looking at brightness changes. Verify local overpass times before assigning event and control observations to nights. Two satellites observing the same festival night provide a cross-check, while a second year tests repeatability across festival nights.

### 2025 metro coverage results

Matched cells and percent of each metro's full test box, as reported by the Code Editor run:

| Metro | Suomi NPP | NOAA-20 |
| --- | ---: | ---: |
| Bay Area | 0 | 12,622 (84.9%) |
| Los Angeles | 0 | 8,922 (46.9%) |
| Dallas–Fort Worth | 22,340 (86.8%) | 19,007 (73.8%) |
| Chicago | 0 | 9,638 (46.5%) |
| New York–North Jersey | 0 | 9,642 (52.0%) |
| Seattle | 0 | 7,775 (46.3%) |
| Atlanta | 0 | 0 |
| Washington, DC area | 17,213 (83.4%) | 18,041 (87.4%) |

Atlanta had 15,815 usable NOAA-20 event pixels, but none had the required three usable control readings. The [metro brightness comparison](../earth-engine/07-compare-metro-brightness.js) runs on all seven metros with matched pixels. It uses the Dallas fixed-grid calculation separately by satellite and reports mean and median change. It also compares the event with each ordinary night on pixels both observed, requiring two usable observations from the other control nights as in the Dallas paired comparison. Compare signs and magnitudes alongside the pixel counts; these are descriptive checks on the observed area.

NASA's Level-1 swath metadata shows overlapping nighttime granules for these metro boxes between 06:42 and 12:06 UTC on October 21, all after the October 20 local evening. NOAA-20 had overlapping swaths at [07:00–07:06 UTC](https://cmr.earthdata.nasa.gov/search/concepts/G3824402056-LAADS.html) for Chicago, New York–North Jersey, and DC; [08:42–08:48 UTC](https://cmr.earthdata.nasa.gov/search/concepts/G3824511904-LAADS.html) for those metros, Dallas, and Los Angeles; and [10:24–10:30 UTC](https://cmr.earthdata.nasa.gov/search/concepts/G3825774952-LAADS.html) for Los Angeles, the Bay Area, and Seattle. Seattle had two additional overlaps at [10:18–10:24 UTC](https://cmr.earthdata.nasa.gov/search/concepts/G3825774938-LAADS.html) and [12:00–12:06 UTC](https://cmr.earthdata.nasa.gov/search/concepts/G3825768610-LAADS.html). The Suomi NPP DC swath overlaps at [06:42–06:48 UTC](https://cmr.earthdata.nasa.gov/search/concepts/G3824522090-LAADS.html). These are granule windows, not exact observation times for individual pixels in the daily product.

Neither catalog had an image for November 9, 2026 UTC when the coverage screen ran. [NASA announced the end of new Suomi NPP data delivery on November 2, 2026](https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-observations-cease-november-2-2026). Check NOAA-20 for the same-satellite 2025–2026 comparison once its 2026 image arrives.

### 2025 metro brightness results

The Code Editor run reproduced the original Suomi NPP Dallas result. The table records the event reading minus each pixel's same-satellite control median, summarized over matched cells in each metro box. Radiance changes are in nW/cm²/sr.

| Satellite | Metro | Matched cells | Mean change | Median change |
| --- | --- | ---: | ---: | ---: |
| NOAA-20 | Bay Area | 12,622 | +0.74 | +0.24 |
| NOAA-20 | Los Angeles | 8,922 | +5.58 | +0.94 |
| NOAA-20 | Dallas–Fort Worth | 19,007 | +0.10 | +1.57 |
| NOAA-20 | Chicago | 9,638 | −0.97 | −0.84 |
| NOAA-20 | New York–North Jersey | 9,642 | +0.45 | −0.68 |
| NOAA-20 | Seattle | 7,775 | −0.48 | −0.40 |
| NOAA-20 | Washington, DC area | 18,041 | −0.23 | −2.28 |
| Suomi NPP | Dallas–Fort Worth | 22,340 | −1.14 | −1.54 |
| Suomi NPP | Washington, DC area | 17,213 | −1.15 | −1.30 |

Los Angeles had the largest positive mean, with a smaller median increase and 46.9% of the test box matched. Both platforms measured lower mean and median brightness than their baselines near DC. The Dallas changes had opposite signs between platforms, which observed different times and can cover different cells.

### Los Angeles comparisons with individual nights

Each row compares October 21 UTC with an ordinary product date on the pixels usable for both. The pair also requires two valid readings from the other four controls. Changes are in nW/cm²/sr.

| Ordinary UTC date | Matched cells | Paired mean | Paired median |
| --- | ---: | ---: | ---: |
| 2025-09-23 | 8,922 | +3.18 | +0.55 |
| 2025-09-30 | 138 | −0.16 | +0.12 |
| 2025-10-07 | 8,889 | +6.43 | +2.81 |
| 2025-10-14 | 14 | +8.68 | +12.82 |
| 2025-10-28 | 8,920 | +5.44 | +0.96 |

Los Angeles was brighter by both measures in the three pairs that covered nearly the whole baseline sample. The two sparse pairs describe far smaller patches. The Bay Area had four positive paired means out of five and three positive paired medians. Its September 23 comparison covered 12,520 cells and was negative by both measures. In Dallas, NOAA-20's mean was lower in two of its three comparisons with at least 18,000 matched cells and essentially flat in the third. Suomi NPP's Dallas mean was lower in all four usable comparisons.

The [Los Angeles footprint check](../earth-engine/08-check-los-angeles-footprint.js) uses the intersection of the valid pixels on the event date and the three best-covered ordinary nights. The paired counts imply 8,887 to 8,889 shared cells on the same grid. It summarizes all four nights on that shared area and maps the event reading minus the brightest control reading at each pixel. The region was selected after the initial metro screen, and the three controls were selected by coverage. This is an exploratory comparison from one festival night.

The run returned 8,887 shared cells. Diwali had the highest mean radiance, 29.99 nW/cm²/sr compared with 26.81, 23.56, and 24.54 on the three controls in chronological order. Diwali was brighter than all three controls at 5,103 cells (57.4%). Against each cell's own brightest control, the median change was +0.54 and the mean was −1.39 nW/cm²/sr. The largest decreases pulled the mean below zero even though the median cell was brighter. The brightest control can be a different night at each location.

The footprint script also provides a GeoTIFF download. Its four bands store the event reading followed by the readings on September 23, October 7, and October 28 UTC. It uses the shared pixel mask for all four bands and stores missing data as −9999. The Web Mercator display grid can have a different cell count from the 8,887 on the analysis grid.

### 2025 national coverage screen

The [NOAA-20 national screen](../earth-engine/09-screen-united-states.js) found matched samples in all 50 states and DC for the October 21 UTC product. A match requires usable radiance on the event date and at least three usable control dates at the same location. The run returned 116,498 matches out of 466,521 geographic grid samples. Seven jurisdictions had matches at half or more of their sample locations, and twelve had matches at fewer than one in ten. These percentages describe locations sampled on a 0.05° grid, whose cells vary in physical area with latitude.

| Jurisdiction | Usable event samples | Matched samples |
| --- | ---: | ---: |
| Alabama | 99.5% | 81.8% |
| California | 63.0% | 56.8% |
| Hawaii | 51.3% | 30.0% |
| Alaska | 21.3% | 2.4% |
| West Virginia | 99.1% | 4.7% |
| Oklahoma | 84.7% | 0.7% |

DC had six matches among seven sampled locations. West Virginia had usable event readings at nearly all sampled locations, but few met the control requirement. For the national map, the regional GeoTIFFs preserve both signed brightness change and the fraction of each cell with matched coverage so that areas with sparse observations remain distinguishable.

The four exports contain 204,809 source cells with some matched coverage. Of these, 144,041 reach the 25% coverage threshold and 79,306 also have positive mean change. The national brightness map colors those increases from 0 to +5 nW/cm²/sr, while the coverage layer shows all measured coverage fractions, including 0% in the Western Aleutians. These source-cell totals differ from the state screen, which samples grid centers. The dashboard uses nearest-neighbor resampling for the Web Mercator display.

### 2025 U.S. overnight playback

The player groups actual observations into 15-minute UTC windows between New York sunset on October 20 and Los Angeles sunrise on October 21. NASA's Collection 2 Black Marble A1 tiles provide per-pixel UTC time, at-sensor radiance, viewing angles, and quality flags from NOAA-20, NOAA-21, and Suomi NPP. The builder samples the nearest source pixel to each cell on an approximately 3 km Web Mercator grid within state boundaries. The reported coverage describes these sampled grid cells. Their physical area varies by latitude. [NASA Black Marble A1 documentation](https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VJ146A1)

Each cell needs two quality-screened readings at least 15 minutes apart and within 20° of each other in sensor zenith angle. The reference is the reading with the most eligible later readings, with ties going to the earlier reading. The cutoff is 5 nW/cm²/sr. Blue means a later reading fell below the cutoff after an above-cutoff reference. Gold means both readings were above it. A cell may change brightness in the time between observations. Atmospheric effects, viewing geometry, and cross-satellite calibration can also affect radiance.

Frames show only cells observed during the selected window that passed the comparison checks. An empty area may have no overpass, clouds, or no comparable reading within the window. Use the daily comparison for the separate question of brightness relative to ordinary nights.

The published sequence has 19 observed windows between 06:00 and 14:00 UTC. It compares 846,530 of 2,394,043 sampled cells (35.4%) and includes at least one comparison in every state. No cell passed the repeat-reading checks in DC or the western Aleutians. The lower 48 had 752,803 comparable cells, Alaska had 93,164, and Hawaii had 563.

### Remaining checks

1. Select several test regions and comparison regions before inspecting anomaly maps. Include regions with differing urban brightness, weather, and geography; avoid selecting only apparent hotspots.
2. Verify adequate same-night and baseline coverage and determine sensible aggregation scales. Begin with daily observations; do not hide event-night gaps in a multi-day composite.
3. Prespecify an event window and control nights matched for local weekday, season, and retrieval quality. Exclude festival dates from baseline estimation. Examine neighboring holidays and unusual conditions.
4. Compare observed radiance with a robust local baseline. Report absolute excess, relative excess only where the baseline is sufficient, baseline variability, sample count, and coverage. Do not label a standardized score as a calibrated celebration probability.
5. Test the same statistic on non-event placebo dates. Account for testing many pixels/regions and spatial dependence before making significance claims. Assess whether the event signal exceeds ordinary fluctuations and retrieval artifacts.
6. Publish limitations even if the result is weak. Lock the pipeline and display scale before examining 2026, then repeat with the same settings.

The [ordinary-night check](../earth-engine/10-test-ordinary-nights.js) uses six candidate Monday nights outside the five-date NOAA-20 baseline in Los Angeles and Dallas–Fort Worth. Each pair compares Diwali and one ordinary night with the same baseline on pixels valid for both. It reports signed mean change and the share of pixels above baseline for both nights. For the initial screen, a pair needs at least 70% of the metro's baseline-matched event pixels. The candidate dates span the daylight saving transition, and the screen is descriptive. Verify overpass geometry and local timing before interpreting a possible festival signal.

Five Los Angeles pairs passed the overlap screen. In all five, Diwali had a higher mean change and a greater share of above-baseline pixels. Across these pairs, 80.3–81.4% of Diwali pixels were above baseline, compared with 35.2–53.9% on the ordinary nights. The November 11 UTC ordinary night exceeded Diwali by both measures on its shared pixels, with 48.6% overlap. Four Dallas–Fort Worth pairs passed. The ordinary-night mean change was higher in all four and the ordinary-night share of above-baseline pixels was higher in three. These comparisons describe the two sampled metros.

The [map threshold check](../earth-engine/11-check-map-thresholds.js) tests thresholds of 0, +0.5, +1, and +2 nW/cm²/sr on the dashboard's 0.05° grid. Each pair averages changes over the same usable source pixels within each cell. It applies the national map's 25% matched coverage rule and retains the 70% metro overlap cutoff on eligible coarse cells. The `pilot` set uses the same six ordinary dates. The `holdout` set uses five additional Monday nights for a separate check after selecting a candidate threshold. The holdout spans a wider seasonal window, and both sets use the same Diwali observation.

The pilot had five qualifying Los Angeles pairs and four qualifying Dallas–Fort Worth pairs. Each rate below is the average of the percentages of paired cells above the cutoff, with each qualifying night given equal weight.

| Cutoff (nW/cm²/sr) | Los Angeles Diwali | Los Angeles ordinary | Dallas–Fort Worth Diwali | Dallas–Fort Worth ordinary |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 95.1% | 47.7% | 52.6% | 66.7% |
| +0.5 | 93.9% | 36.3% | 42.5% | 56.1% |
| +1 | 80.9% | 31.5% | 31.1% | 45.5% |
| +2 | 68.1% | 20.8% | 19.5% | 29.9% |

Carry forward +0.5 nW/cm²/sr as the candidate display cutoff. It removed about 11 percentage points of ordinary-night highlights in Los Angeles and kept about 99% of the cells highlighted on Diwali at the zero cutoff. The stricter cutoffs removed more ordinary-night highlights and more of the Diwali highlights. Dallas–Fort Worth had a greater average share of ordinary-night highlights at every cutoff. Test the candidate on the separate ordinary nights before adopting it on the dashboard.

All five holdout pairs qualified in Los Angeles. Moving from 0 to +0.5 nW/cm²/sr reduced the average share of ordinary-night highlights from 68.7% to 60.7% and the Diwali share from 94.2% to 91.9%. Diwali led in all five pairs at +0.5, though the December 2 UTC comparison was close at 92.3% versus 87.9%. Two Dallas–Fort Worth pairs qualified, and Diwali led in one of them. The Los Angeles and Dallas results use the same Diwali observation as the pilot.

The national **Stronger increases** layer uses the +0.5 cutoff with the same colors and coverage rule as **Brighter than baseline**. It displays 9,516 of the 79,306 source cells with positive change, so the dashboard retains both views. The comparison tested two metros. The cutoff serves as a display filter rather than a test of whether an individual cell's increase is unusual.

## Mapping

Render geographically referenced raster exports. A glow may be a display treatment for a validated positive radiance anomaly, but it must preserve the underlying scale and missing-data mask. Excess light is not the number of celebrations. Avoid independently normalizing each year or date to its own maximum. Keep no-observation, insufficient-baseline, no-positive-excess, and not-yet-published states distinct in the eventual layer and hover inspection.

The base U.S. map includes views for the lower 48, Alaska, Hawaii, and the Western Aleutians. The national layer uses a common NOAA-20 control-median baseline. City labels are geographic references. The earlier metro pilots are documented separately above.

## Dashboard data

`public/data/manifest.json` stores the local festival date for each year. A published national comparison specifies its UTC product date, satellite, display thresholds, and regional rasters. Raster corners are ordered top-left, top-right, bottom-right, bottom-left. The pixel data uses row-major order with mean radiance change and matched coverage fraction. Missing cells are null.

## Delivery sequence

- Day 1: account setup, coverage/timing checks, first reproducible 2025 test.
- Day 2: real processed data on the map, numeric inspection, control comparisons, then geographic expansion if feasible.
- Day 3: 2025/2026 comparison behavior, quality review, GitHub Pages publication, and repeatable refresh instructions. Actual 2026 results depend on publication and valid satellite coverage.

## External dependencies

Google Earth Engine registration/authentication and GitHub account connection remain user actions. The local application and repository files can be developed independently. No background refresh is running, and no 2026 observations are promised before they exist.
