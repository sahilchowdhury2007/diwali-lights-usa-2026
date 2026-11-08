// Export the Dallas–Fort Worth radiance change and its baseline as a GeoTIFF.
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

// Use the same sampling grid as the fixed-grid pilot before exporting.
var exportImage = observed.rename('event_radiance')
  .addBands(pilotBaseline.rename('baseline_median'))
  .addBands(pilotChange.rename('radiance_change'))
  .addBands(controls.count().rename('control_count'))
  .updateMask(pilotChange.mask())
  .clip(region)
  .reproject({crs: grid, scale: 500})
  .unmask(-9999, false)
  .toFloat();

var downloadUrl = exportImage.getDownloadURL({
  name: 'dallas-fort-worth-2025-10-20',
  region: region,
  crs: 'EPSG:3857',
  scale: 500,
  format: 'GEO_TIFF'
});
print(ui.Label('Download Dallas GeoTIFF', {}, downloadUrl));

Map.centerObject(region, 9);
Map.addLayer(pilotChange.clip(region), {
  min: -5,
  max: 5,
  palette: ['#2166ac', '#f7f7f7', '#e7a843']
}, 'Diwali night minus baseline');
