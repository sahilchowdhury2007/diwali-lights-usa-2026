// Compare metro brightness against ordinary nights from the same satellite.
var EVENT = '2025-10-21';  // UTC product date for the overnight passes.
var CONTROL_DATES = [
  '2025-09-23', '2025-09-30', '2025-10-07', '2025-10-14', '2025-10-28'
];

// Same test boxes as the coverage screen. Atlanta had no matched pixels.
var metros = {
  'Bay Area': [-122.25, 37.15, -121.65, 37.65],
  'Los Angeles': [-118.65, 33.75, -117.95, 34.30],
  'Dallas–Fort Worth': [-97.55, 32.55, -96.60, 33.10],
  'Chicago': [-88.20, 41.55, -87.50, 42.15],
  'New York–North Jersey': [-74.50, 40.45, -73.75, 40.95],
  'Seattle': [-122.58, 47.32, -121.95, 47.86],
  'Washington, DC area': [-77.55, 38.66, -76.75, 39.18]
};

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

function compare(platform, collectionId, metroNames) {
  var dates = CONTROL_DATES.concat([EVENT]).sort();
  var images = ee.ImageCollection(collectionId)
    .filterDate(dates[0], ee.Date(dates[dates.length - 1]).advance(1, 'day'))
    .map(function(image) {
      return image.set('utc_date', image.date().format('YYYY-MM-dd'));
    }).filter(ee.Filter.inList('utc_date', dates));

  images.aggregate_array('utc_date').sort().evaluate(function(found, error) {
    if (error) {
      print(platform + ' — date check failed', error);
      return;
    }
    if (found.join(',') !== dates.join(',')) {
      print(platform + ' — expected one image per date; dates found', found);
      return;
    }

    var screened = images.map(screen);
    var observed = ee.Image(screened.filter(ee.Filter.eq('utc_date', EVENT)).first());
    var controls = screened.filter(ee.Filter.inList('utc_date', CONTROL_DATES));

    // Main result: event reading minus the pixel's ordinary-night median.
    var baseline = controls.median().updateMask(controls.count().gte(3));
    var changes = observed.subtract(baseline).rename('change');

    // Check whether the event also exceeded individual ordinary nights on the
    // same pixels. As in the Dallas pilot, require two other usable controls.
    // Subtracting the shared baseline from both nights cancels it in the delta.
    CONTROL_DATES.forEach(function(date, i) {
      var ordinary = ee.Image(controls.filter(ee.Filter.eq('utc_date', date)).first());
      var remaining = controls.filter(ee.Filter.neq('utc_date', date));
      var paired = observed.subtract(ordinary).updateMask(remaining.count().gte(2));
      changes = changes.addBands(paired.rename('pair_' + i));
    });

    var regions = ee.FeatureCollection(metroNames.map(function(name) {
      return ee.Feature(ee.Geometry.Rectangle(metros[name]), {metro: name});
    }));
    var reducer = ee.Reducer.mean().unweighted()
      .combine({reducer2: ee.Reducer.median().unweighted(), sharedInputs: true})
      .combine({reducer2: ee.Reducer.count(), sharedInputs: true});
    var stats = changes.reduceRegions({
      collection: regions,
      reducer: reducer,
      crs: observed.projection(),
      scale: 500,
      maxPixelsPerRegion: 1e7
    });

    var results = stats.toList(metroNames.length).map(function(row) {
      var feature = ee.Feature(row);
      var pairs = CONTROL_DATES.map(function(date, i) {
        var band = 'pair_' + i;
        var count = feature.get(band + '_count');
        return ee.Dictionary(ee.Algorithms.If(count, {
          paired_pixels: count,
          paired_mean: feature.get(band + '_mean'),
          paired_median: feature.get(band + '_median')
        }, {paired_pixels: 0})).set('ordinary_utc_date', date);
      });
      return feature.toDictionary(['metro', 'change_count', 'change_mean', 'change_median'])
        .set('ordinary_night_checks', ee.List(pairs));
    });
    print(platform + ' — brightness by metro', results);
  });
}

print('Event UTC product date', EVENT);
print('Brightness change units: nW/cm²/sr. Positive is brighter.');
compare('Suomi NPP', 'NASA/VIIRS/002/VNP46A2', ['Dallas–Fort Worth', 'Washington, DC area']);
compare('NOAA-20', 'NASA/VIIRS/002/VJ146A2', Object.keys(metros));
