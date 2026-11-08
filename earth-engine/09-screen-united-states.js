// Measure NOAA-20 event coverage and preview 5 km radiance changes across the U.S.
var YEAR = 2025;
var CREATE_EXPORTS = false;
var GRID_CRS = 'EPSG:6933';
var GRID_METERS = 5000;
var GRID_TRANSFORM = [GRID_METERS, 0, 0, 0, -GRID_METERS, 0];
var MIN_CONTROL_NIGHTS = 3;
var MIN_PREVIEW_COVERAGE = 0.25;

// UTC product dates for the local festival and comparison nights.
var schedules = {
  2025: {
    event: '2025-10-21',
    controls: ['2025-09-23', '2025-09-30', '2025-10-07', '2025-10-14', '2025-10-28']
  },
  2026: {
    event: '2026-11-09',
    controls: ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']
  }
};

// Census state identifiers for the 50 states and DC.
var stateCodes = [
  '01', '02', '04', '05', '06', '08', '09', '10', '11', '12', '13', '15', '16',
  '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29',
  '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42',
  '44', '45', '46', '47', '48', '49', '50', '51', '53', '54', '55', '56'
];
var states = ee.FeatureCollection('TIGER/2018/States')
  .filter(ee.Filter.inList('STATEFP', stateCodes));

function screen(image) {
  var radiance = image.select('DNB_BRDF_Corrected_NTL');
  var cloud = image.select('QF_Cloud_Mask');
  var valid = radiance.gte(0)
    .and(image.select('Mandatory_Quality_Flag').eq(0))
    .and(cloud.bitwiseAnd(1).eq(0))
    .and(cloud.rightShift(4).bitwiseAnd(3).eq(3))
    .and(cloud.rightShift(6).bitwiseAnd(3).eq(0))
    .and(cloud.rightShift(8).bitwiseAnd(7).eq(0))
    .and(image.select('Snow_Flag').eq(0));
  return radiance.updateMask(valid).rename('radiance')
    .set('utc_date', image.get('utc_date'));
}

function coverageFlag(image, name) {
  // Zero is meaningful for coverage. The radiance itself stays masked.
  return image.mask().gt(0).unmask(0, false).rename(name);
}

var schedule = schedules[YEAR];
var dates = schedule.controls.concat([schedule.event]).sort();
var images = ee.ImageCollection('NASA/VIIRS/002/VJ146A2')
  .filterDate(dates[0], ee.Date(dates[dates.length - 1]).advance(1, 'day'))
  .map(function(image) {
    return image.set('utc_date', image.date().format('YYYY-MM-dd'));
  }).filter(ee.Filter.inList('utc_date', dates));

print('Event UTC product date', schedule.event);
print('State and district count', states.size());
images.aggregate_array('utc_date').sort().evaluate(function(found, error) {
  if (error) {
    print('Image date check failed', error);
    return;
  }
  if (found.join(',') !== dates.join(',')) {
    print('Expected one NOAA-20 image per event and control date. Dates available', found);
    return;
  }

  var screened = images.map(screen);
  var observed = ee.Image(screened.filter(ee.Filter.eq('utc_date', schedule.event)).first());
  var controls = screened.filter(ee.Filter.inList('utc_date', schedule.controls));
  var baseline = controls.median().updateMask(controls.count().gte(MIN_CONTROL_NIGHTS));
  var nativeGrid = observed.projection();
  var change = observed.subtract(baseline).rename('radiance_change').setDefaultProjection(nativeGrid);
  var matched = coverageFlag(change, 'matched_fraction');

  // State percentages describe samples at 5 km grid centers within state boundaries.
  var samples = coverageFlag(observed, 'event').addBands(matched.rename('matched')).multiply(100);
  var coverage = samples.reduceRegions({
    collection: states,
    reducer: ee.Reducer.mean().unweighted()
      .combine({reducer2: ee.Reducer.count(), sharedInputs: true}),
    crs: GRID_CRS,
    crsTransform: GRID_TRANSFORM,
    tileScale: 4
  }).select(['NAME', 'STUSPS', 'event_mean', 'matched_mean', 'matched_count'],
    ['state', 'postal', 'event_pct', 'matched_pct', 'sampled_cells'], false).sort('state');
  print('Coverage by state and DC (5 km samples)', coverage);

  // Average valid native-pixel changes and separately track their share of each grid cell.
  var coarse = change.addBands(matched).setDefaultProjection(nativeGrid).clipToCollection(states)
    .reduceResolution({reducer: ee.Reducer.mean(), maxPixels: 1024})
    .reproject({crs: GRID_CRS, crsTransform: GRID_TRANSFORM});
  var fraction = coarse.select('matched_fraction');
  var preview = coarse.select('radiance_change').updateMask(fraction.gte(MIN_PREVIEW_COVERAGE));

  Map.setCenter(-98, 39, 4);
  Map.addLayer(preview, {min: -5, max: 5, palette: ['#348ad0', '#3b4657', '#ffc56e']},
    'Mean change from control median (nW/cm²/sr)');
  Map.addLayer(fraction, {min: 0, max: 1, palette: ['#303746', '#67d8ab']},
    'Share of each cell with matched observations', false);
  Map.addLayer(states.style({color: 'aab7ca', fillColor: '00000000', width: 1}), {}, 'State boundaries');

  if (CREATE_EXPORTS) {
    var output = preview.addBands(fraction).unmask(-9999, false).toFloat();
    // Alaska crosses the antimeridian. Export both sides on the same grid.
    var tiles = {
      lower48: [-125, 24, -66, 50],
      alaska_west_longitude: [-180, 51, -129, 72],
      alaska_east_longitude: [172, 51, 180, 56],
      hawaii: [-179, 18, -154, 29]
    };
    Object.keys(tiles).forEach(function(key) {
      Export.image.toDrive({
        image: output,
        description: 'diwali_' + YEAR + '_' + key + '_5km',
        region: ee.Geometry.Rectangle(tiles[key], 'EPSG:4326', false),
        crs: GRID_CRS,
        crsTransform: GRID_TRANSFORM,
        maxPixels: 1e8,
        fileFormat: 'GeoTIFF',
        formatOptions: {cloudOptimized: true, noData: -9999}
      });
    });
  }
});
