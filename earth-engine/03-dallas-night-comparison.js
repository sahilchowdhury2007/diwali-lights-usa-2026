// Copy this full script into Earth Engine and run it after the Dallas pilot.
var region = ee.Geometry.Rectangle([-97.55, 32.55, -96.60, 33.10]);
var eventDate = '2025-10-21';
var controlDates = [
  '2025-09-23', '2025-09-30', '2025-10-07', '2025-10-14', '2025-10-28'
];
var dates = controlDates.concat([eventDate]).sort();

var images = ee.ImageCollection('NASA/VIIRS/002/VNP46A2')
  .filterBounds(region)
  .filterDate('2025-09-23', '2025-10-29')
  .map(function(image) {
    return image.set('utc_date', image.date().format('YYYY-MM-dd'));
  })
  .filter(ee.Filter.inList('utc_date', dates));

var screened = images.map(function(image) {
  var radiance = image.select('DNB_BRDF_Corrected_NTL');
  var cloud = image.select('QF_Cloud_Mask');
  var valid = radiance.gte(0)
    .and(image.select('Mandatory_Quality_Flag').eq(0))
    .and(cloud.bitwiseAnd(1).eq(0))
    .and(cloud.rightShift(4).bitwiseAnd(3).eq(3))
    .and(cloud.rightShift(6).bitwiseAnd(3).eq(0))
    .and(cloud.rightShift(8).bitwiseAnd(7).eq(0))
    .and(image.select('Snow_Flag').eq(0));

  return radiance.updateMask(valid)
    .rename('radiance')
    .set('utc_date', image.get('utc_date'));
});

var observed = ee.Image(screened.filter(ee.Filter.eq('utc_date', eventDate)).first());
var grid = observed.projection();
var controls = screened.filter(ee.Filter.inList('utc_date', controlDates));
var pilotBaseline = controls.median().updateMask(controls.count().gte(3));
var pilotChange = observed.subtract(pilotBaseline).rename('change');

function reduceOnGrid(image, reducer) {
  return image.reduceRegion({
    reducer: reducer,
    geometry: region,
    crs: grid,
    scale: 500,
    maxPixels: 1e7
  });
}

var summaryReducer = ee.Reducer.mean().unweighted()
  .combine({reducer2: ee.Reducer.median().unweighted(), sharedInputs: true})
  .combine({reducer2: ee.Reducer.count(), sharedInputs: true});

var auditedCounts = reduceOnGrid(
  observed.rename('event_pixels').addBands(pilotChange.rename('compared_pixels')),
  ee.Reducer.count()
);
print('Fixed-grid pilot counts', auditedCounts);
print('Fixed-grid pilot brightness summary', reduceOnGrid(pilotChange, summaryReducer));

// Every row uses the cells with a valid reading on all six dates.
var commonPixels = screened.count().eq(dates.length);
var nightSummaries = ee.List(dates).map(function(date) {
  var night = ee.Image(screened.filter(ee.Filter.eq('utc_date', date)).first());
  var otherNights = screened.filter(ee.Filter.neq('utc_date', date));
  var change = night.subtract(otherNights.median())
    .updateMask(commonPixels)
    .rename('change');

  return reduceOnGrid(change, summaryReducer).set('utc_date', date);
});

print('Image dates found', images.aggregate_array('utc_date').sort());
print('Same-pixel comparison across six nights', nightSummaries);
