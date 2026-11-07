// Paste this full script into a new Earth Engine Code Editor script.
var region = ee.Geometry.Rectangle([-97.55, 32.55, -96.60, 33.10]);
var eventDate = '2025-10-21'; // UTC product date for the night of Oct 20 in Dallas.
var controlDates = [
  '2025-09-23', '2025-09-30', '2025-10-07', '2025-10-14', '2025-10-28'
];
var minimumControls = 3;

var images = ee.ImageCollection('NASA/VIIRS/002/VNP46A2')
  .filterBounds(region)
  .filterDate('2025-09-23', '2025-10-29')
  .map(function(image) {
    return image.set('utc_date', image.date().format('YYYY-MM-dd'));
  });

function screenedRadiance(image) {
  var radiance = image.select('DNB_BRDF_Corrected_NTL');
  var cloud = image.select('QF_Cloud_Mask');
  var valid = radiance.gte(0)
    .and(image.select('Mandatory_Quality_Flag').eq(0))
    .and(cloud.bitwiseAnd(1).eq(0))
    .and(cloud.rightShift(4).bitwiseAnd(3).eq(3))
    .and(cloud.rightShift(6).bitwiseAnd(3).eq(0))
    .and(cloud.rightShift(8).bitwiseAnd(7).eq(0))
    .and(image.select('Snow_Flag').eq(0));

  return radiance.updateMask(valid).rename('radiance');
}

var eventImage = ee.Image(images.filter(ee.Filter.eq('utc_date', eventDate)).first());
var observed = screenedRadiance(eventImage);

var controlImages = images.filter(ee.Filter.inList('utc_date', controlDates));
var controls = controlImages.map(screenedRadiance);
var controlCount = controls.count();
var baseline = controls.median().updateMask(controlCount.gte(minimumControls));

// Only compare pixels with both an event reading and enough control readings.
var change = observed.subtract(baseline).rename('change');

var summary = change.reduceRegion({
  reducer: ee.Reducer.mean()
    .combine({reducer2: ee.Reducer.median(), sharedInputs: true})
    .combine({reducer2: ee.Reducer.count(), sharedInputs: true}),
  geometry: region,
  scale: 500,
  maxPixels: 1e7
});

print('Event UTC product date', eventDate);
print('Control images found', controlImages.aggregate_array('utc_date').sort());
print('Dallas–Fort Worth change summary', summary);

Map.centerObject(region, 9);
Map.addLayer(change.clip(region), {
  min: -5,
  max: 5,
  palette: ['#2166ac', '#f7f7f7', '#b2182b']
}, 'Event radiance minus control median');
