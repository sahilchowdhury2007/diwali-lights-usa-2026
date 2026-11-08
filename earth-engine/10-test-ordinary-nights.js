// Compare Diwali with ordinary nights held out from the NOAA-20 baseline.
var EVENT = '2025-10-21';
var CONTROL_DATES = [
  '2025-09-23', '2025-09-30', '2025-10-07', '2025-10-14', '2025-10-28'
];
// UTC product dates for nearby Monday nights outside the baseline.
var TEST_DATES = [
  '2025-09-09', '2025-09-16', '2025-11-04', '2025-11-11', '2025-11-18', '2025-12-09'
];
var MIN_OVERLAP = 0.70;
var regions = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Rectangle([-118.65, 33.75, -117.95, 34.30]), {metro: 'Los Angeles'}),
  ee.Feature(ee.Geometry.Rectangle([-97.55, 32.55, -96.60, 33.10]), {metro: 'Dallas–Fort Worth'})
]);

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

var dates = CONTROL_DATES.concat(TEST_DATES, [EVENT]).sort();
var images = ee.ImageCollection('NASA/VIIRS/002/VJ146A2')
  .filterDate(dates[0], ee.Date(dates[dates.length - 1]).advance(1, 'day'))
  .map(function(image) {
    return image.set('utc_date', image.date().format('YYYY-MM-dd'));
  }).filter(ee.Filter.inList('utc_date', dates));

images.aggregate_array('utc_date').sort().evaluate(function(found, error) {
  if (error) {
    print('NOAA-20 date check failed', error);
    return;
  }
  function hasOneImage(date) {
    return found.indexOf(date) !== -1 && found.indexOf(date) === found.lastIndexOf(date);
  }
  if (!CONTROL_DATES.concat([EVENT]).every(hasOneImage)) {
    print('Expected one image for the event and each baseline date. Dates found', found);
    return;
  }
  var availableTests = TEST_DATES.filter(hasOneImage);
  print('Ordinary test dates without exactly one image', TEST_DATES.filter(function(date) {
    return !hasOneImage(date);
  }));
  if (!availableTests.length) return;

  var screened = images.map(screen);
  function night(date) {
    return ee.Image(screened.filter(ee.Filter.eq('utc_date', date)).first());
  }
  var observed = night(EVENT);
  var controls = screened.filter(ee.Filter.inList('utc_date', CONTROL_DATES));
  var baseline = controls.median().updateMask(controls.count().gte(3));
  var eventChange = observed.subtract(baseline);
  var stack = eventChange.rename('all_event');

  availableTests.forEach(function(date, index) {
    var prefix = 'pair_' + index;
    var testChange = night(date).subtract(baseline);
    var eventPaired = eventChange.updateMask(testChange.mask());
    var testPaired = testChange.updateMask(eventChange.mask());
    stack = stack.addBands(eventPaired.rename(prefix + '_event'))
      .addBands(testPaired.rename(prefix + '_ordinary'))
      .addBands(eventPaired.gt(0).multiply(100).rename(prefix + '_event_positive'))
      .addBands(testPaired.gt(0).multiply(100).rename(prefix + '_ordinary_positive'));
  });

  var stats = stack.reduceRegions({
    collection: regions,
    reducer: ee.Reducer.mean().unweighted()
      .combine({reducer2: ee.Reducer.count(), sharedInputs: true}),
    crs: observed.projection(),
    scale: 500,
    tileScale: 2
  });

  var results = stats.toList(2).map(function(row) {
    var feature = ee.Feature(row);
    var eventPixels = ee.Number(ee.Algorithms.If(feature.get('all_event_count'), feature.get('all_event_count'), 0));
    var pairs = availableTests.map(function(date, index) {
      var prefix = 'pair_' + index;
      var count = feature.get(prefix + '_event_count');
      var pixels = ee.Number(ee.Algorithms.If(count, count, 0));
      var overlap = pixels.divide(eventPixels.max(1));
      return ee.Dictionary(ee.Algorithms.If(count, {
        event_mean: feature.get(prefix + '_event_mean'),
        ordinary_mean: feature.get(prefix + '_ordinary_mean'),
        event_positive_pct: feature.get(prefix + '_event_positive_mean'),
        ordinary_positive_pct: feature.get(prefix + '_ordinary_positive_mean')
      }, {})).set('ordinary_utc_date', date)
        .set('paired_pixels', pixels)
        .set('event_overlap_pct', overlap.multiply(100))
        .set('passes_coverage', overlap.gte(MIN_OVERLAP));
    });
    return ee.Dictionary({metro: feature.get('metro'), event_pixels: eventPixels, pairs: ee.List(pairs)});
  });

  print('Event UTC product date', EVENT);
  print('Minimum overlap with baseline-matched event pixels (%)', MIN_OVERLAP * 100);
  print('NOAA-20 ordinary-night checks by metro (mean change in nW/cm²/sr)', results);
});
