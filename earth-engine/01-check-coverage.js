// Count available and quality-screened nighttime pixels by UTC date.
// REGION is a bounding box in [west, south, east, north] order.
var REGION = ee.Geometry.Rectangle([-122.25, 37.15, -121.65, 37.65]);
var START = '2025-09-22';
var END_EXCLUSIVE = '2025-11-11';
var COLLECTION = 'NASA/VIIRS/002/VNP46A2';

var images = ee.ImageCollection(COLLECTION)
  .filterBounds(REGION)
  .filterDate(START, END_EXCLUSIVE)
  .sort('system:time_start');

function usableObservation(image) {
  var cloud = image.select('QF_Cloud_Mask');
  var quality = image.select('Mandatory_Quality_Flag');
  var radiance = image.select('DNB_BRDF_Corrected_NTL');
  // NASA's Collection 2 guide (Table 9) marks only 0 as high quality.
  return quality.eq(0)
    .and(cloud.bitwiseAnd(1).eq(0))                 // Night
    .and(cloud.rightShift(4).bitwiseAnd(3).eq(3))  // High cloud-mask confidence
    .and(cloud.rightShift(6).bitwiseAnd(3).eq(0))  // Confident clear
    .and(cloud.rightShift(8).bitwiseAnd(1).eq(0))  // No shadow
    .and(cloud.rightShift(9).bitwiseAnd(1).eq(0))  // No cirrus
    .and(cloud.rightShift(10).bitwiseAnd(1).eq(0)) // No snow/ice
    .and(image.select('Snow_Flag').eq(0))
    .and(radiance.gte(0))
    .rename('usable_pixels');
}

var table = ee.FeatureCollection(images.toList(images.size()).map(function(value) {
  var image = ee.Image(value);
  var usable = usableObservation(image).unmask(0);
  var counts = usable.reduceRegion({
    reducer: ee.Reducer.sum().unweighted(),
    geometry: REGION,
    scale: 500,
    maxPixels: 1e7,
    tileScale: 2
  });
  return ee.Feature(null, {
    product_date_utc: image.date().format('YYYY-MM-dd'),
    image_id: image.id(),
    usable_pixels_at_500m: counts.get('usable_pixels'),
    collection: COLLECTION
  });
}));

print('Image count for the requested dates', images.size());
print('Product days with at least one usable sample', table.filter(ee.Filter.gt('usable_pixels_at_500m', 0)).size());
var nearDiwali = table.filter(ee.Filter.inList('product_date_utc', [
  '2025-10-19', '2025-10-20', '2025-10-21', '2025-10-22'
]));
print('Usable samples by UTC product date around Diwali', ee.Dictionary.fromLists(
  nearDiwali.aggregate_array('product_date_utc'),
  nearDiwali.aggregate_array('usable_pixels_at_500m')
));
print('Coverage diagnostic (product dates, not validated local event nights)', table);
print('Do not interpret usable pixel counts as brightness or celebration counts.');
print('The initial ROI is a small Bay Area test area, not a nationwide result.');
Map.centerObject(REGION, 10);
Map.addLayer(REGION, { color: 'd8b779' }, 'Test region');

// After this completes, optionally export the table from the Tasks panel.
Export.table.toDrive({
  collection: table,
  description: 'diwali_2025_coverage_diagnostic',
  fileNamePrefix: 'diwali_2025_coverage_diagnostic',
  fileFormat: 'CSV',
  selectors: ['product_date_utc', 'image_id', 'usable_pixels_at_500m', 'collection']
});
