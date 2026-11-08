// Compare four NOAA-20 nights on the same set of Los Angeles pixels.
var region = ee.Geometry.Rectangle([-118.65, 33.75, -117.95, 34.30]);
var eventDate = '2025-10-21';  // UTC product date after the October 20 evening.
// These three controls each matched more than 8,800 event pixels in script 07.
var controlDates = ['2025-09-23', '2025-10-07', '2025-10-28'];
var dates = controlDates.concat([eventDate]).sort();

var images = ee.ImageCollection('NASA/VIIRS/002/VJ146A2')
  .filterDate('2025-09-23', '2025-10-29')
  .map(function(image) {
    return image.set('utc_date', image.date().format('YYYY-MM-dd'));
  }).filter(ee.Filter.inList('utc_date', dates));

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

images.aggregate_array('utc_date').sort().evaluate(function(found, error) {
  if (error) {
    print('Image date check failed', error);
    return;
  }
  if (found.join(',') !== dates.join(',')) {
    print('Expected one image per UTC product date. Found', found);
    return;
  }

  var screened = images.map(screen);
  var event = ee.Image(screened.filter(ee.Filter.eq('utc_date', eventDate)).first());
  var controls = screened.filter(ee.Filter.inList('utc_date', controlDates));
  var shared = screened.count().eq(dates.length);
  var eventOnShared = event.updateMask(shared);
  var excess = eventOnShared.subtract(controls.max()).rename('event_minus_brightest_control');

  var readings = eventOnShared.rename('diwali');
  controlDates.forEach(function(date) {
    var night = ee.Image(controls.filter(ee.Filter.eq('utc_date', date)).first());
    readings = readings.addBands(night.updateMask(shared).rename('night_' + date.replace(/-/g, '_')));
  });
  // The mean of a band containing 0 or 100 gives the percentage above all three.
  var summaryBands = readings.addBands(excess)
    .addBands(excess.gt(0).multiply(100).rename('above_all_controls_pct'));

  var stats = summaryBands.reduceRegion({
    geometry: region,
    reducer: ee.Reducer.mean().unweighted()
      .combine({reducer2: ee.Reducer.median().unweighted(), sharedInputs: true})
      .combine({reducer2: ee.Reducer.count(), sharedInputs: true}),
    crs: event.projection(),
    scale: 500,
    maxPixels: 1e7
  });

  print('Los Angeles — same pixels across four nights', stats);
  Map.centerObject(region, 10);
  Map.addLayer(excess.clip(region), {
    min: -5,
    max: 5,
    palette: ['#2166ac', '#f7f7f7', '#e7a843']
  }, 'Diwali minus the brightest control at each pixel');

  // Preserve all four readings on the shared analysis grid before projection for display.
  var exportImage = readings.clip(region)
    .reproject({crs: event.projection(), scale: 500})
    .unmask(-9999, false)
    .toFloat();
  var downloadUrl = exportImage.getDownloadURL({
    name: 'los-angeles-2025-10-20-four-night-readings',
    region: region,
    crs: 'EPSG:3857',
    scale: 500,
    format: 'GEO_TIFF'
  });
  print(ui.Label('Download Los Angeles four-night GeoTIFF', {}, downloadUrl));
});
