// Compare candidate display thresholds on the dashboard's 0.05° grid.
var TEST_SET = 'pilot';
var EVENT = '2025-10-21';
var BASELINE = ['2025-09-23', '2025-09-30', '2025-10-07', '2025-10-14', '2025-10-28'];
var ORDINARY = {
  pilot: ['2025-09-09', '2025-09-16', '2025-11-04', '2025-11-11', '2025-11-18', '2025-12-09'],
  holdout: ['2025-08-12', '2025-08-19', '2025-08-26', '2025-12-02', '2025-12-16']
};
var THRESHOLDS = [0, 0.5, 1, 2];
var MIN_CELL_COVERAGE = 0.25;
var MIN_METRO_OVERLAP = 0.70;
var GRID_CRS = 'EPSG:4326';
var GRID_TRANSFORM = [0.05, 0, -180, 0, -0.05, 90];
var regions = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Rectangle([-118.65, 33.75, -117.95, 34.30], GRID_CRS, false), {metro: 'Los Angeles'}),
  ee.Feature(ee.Geometry.Rectangle([-97.55, 32.55, -96.60, 33.10], GRID_CRS, false), {metro: 'Dallas–Fort Worth'})
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

var testDates = ORDINARY[TEST_SET];
var dates = BASELINE.concat(testDates, [EVENT]).sort();
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
  if (!BASELINE.concat([EVENT]).every(hasOneImage)) {
    print('Expected one image for the event and each baseline date. Dates found', found);
    return;
  }
  var available = testDates.filter(hasOneImage);
  print('Ordinary dates without exactly one image', testDates.filter(function(date) {
    return !hasOneImage(date);
  }));
  if (!available.length) return;

  var screened = images.map(screen);
  function night(date) {
    return ee.Image(screened.filter(ee.Filter.eq('utc_date', date)).first());
  }
  var observed = night(EVENT);
  var nativeGrid = observed.projection();
  var controls = screened.filter(ee.Filter.inList('utc_date', BASELINE));
  var baseline = controls.median().updateMask(controls.count().gte(3));
  var eventChange = observed.subtract(baseline);

  function toMapGrid(image) {
    return image.setDefaultProjection(nativeGrid).clipToCollection(regions)
      .reduceResolution({reducer: ee.Reducer.mean(), maxPixels: 1024})
      .reproject({crs: GRID_CRS, crsTransform: GRID_TRANSFORM});
  }

  var eventValid = eventChange.mask().gt(0).unmask(0, false);
  var eventCells = toMapGrid(eventValid).gte(MIN_CELL_COVERAGE).selfMask().rename('event_cell');
  var stack = eventCells;
  available.forEach(function(date, index) {
    var prefix = 'pair_' + index;
    var ordinaryChange = night(date).subtract(baseline);
    var common = eventValid.and(ordinaryChange.mask().gt(0).unmask(0, false));
    var coarse = toMapGrid(eventChange.updateMask(common).rename('event')
      .addBands(ordinaryChange.updateMask(common).rename('ordinary'))
      .addBands(common.rename('coverage')));
    var eligible = coarse.select('coverage').gte(MIN_CELL_COVERAGE).updateMask(eventCells);
    stack = stack.addBands(eligible.selfMask().rename(prefix + '_eligible'));
    var event = coarse.select('event').updateMask(eligible);
    var ordinary = coarse.select('ordinary').updateMask(eligible);
    THRESHOLDS.forEach(function(threshold, thresholdIndex) {
      var suffix = '_' + thresholdIndex;
      stack = stack.addBands(event.gt(threshold).multiply(100).rename(prefix + '_event' + suffix))
        .addBands(ordinary.gt(threshold).multiply(100).rename(prefix + '_ordinary' + suffix));
    });
  });

  var stats = stack.reduceRegions({
    collection: regions,
    reducer: ee.Reducer.mean().unweighted()
      .combine({reducer2: ee.Reducer.count(), sharedInputs: true}),
    crs: GRID_CRS,
    crsTransform: GRID_TRANSFORM,
    tileScale: 2
  });

  function cellCount(feature, name) {
    var count = feature.get(name + '_count');
    return ee.Number(ee.Algorithms.If(count, count, 0));
  }
  var results = stats.toList(2).map(function(row) {
    var feature = ee.Feature(row);
    var eventCount = cellCount(feature, 'event_cell');
    var pairs = available.map(function(date, index) {
      var prefix = 'pair_' + index;
      var count = cellCount(feature, prefix + '_eligible');
      var overlap = count.divide(eventCount.max(1));
      var rates = THRESHOLDS.map(function(threshold, i) {
        return ee.Dictionary({
          threshold: threshold,
          event_pct: feature.get(prefix + '_event_' + i + '_mean'),
          ordinary_pct: feature.get(prefix + '_ordinary_' + i + '_mean')
        });
      });
      return ee.Dictionary({
        ordinary_utc_date: date,
        paired_cells: count,
        event_overlap_pct: overlap.multiply(100),
        passes_coverage: overlap.gte(MIN_METRO_OVERLAP),
        rates: ee.Algorithms.If(count, ee.List(rates), ee.List([]))
      });
    });
    return ee.Dictionary({metro: feature.get('metro'), eligible_event_cells: eventCount, pairs: ee.List(pairs)});
  });

  print('Test set', TEST_SET);
  print('NOAA-20 map threshold checks (0.05 degree cells)', results);
});
