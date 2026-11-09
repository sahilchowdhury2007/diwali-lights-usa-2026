// Check the 2025 Los Angeles daily product before obtaining separate pass data.
var productDate = '2025-10-21';
var losAngeles = ee.Geometry.Rectangle([-118.65, 33.75, -117.95, 34.30], null, false);
var daily = ee.ImageCollection('NASA/VIIRS/002/VJ146A2')
  .filterBounds(losAngeles)
  .filterDate(productDate, ee.Date(productDate).advance(1, 'day'));

var count = daily.size();
var bands = ee.List(ee.Algorithms.If(count.gt(0), ee.Image(daily.first()).bandNames(), ee.List([])));
print('UTC product date', productDate);
print('NOAA-20 daily images', count);
print('NOAA-20 daily product bands', bands);
print('Daily product includes per-pixel UTC_Time', bands.contains('UTC_Time'));
print('Overnight pilot inputs', {
  tile: 'h06v05',
  noaa20: 'VJ146A1.A2025294.h06v05.002.2025295100330.h5',
  noaa21: 'VJ246A1.A2025294.h06v05.002.2025343142734.h5'
});

Map.centerObject(losAngeles, 9);
Map.addLayer(losAngeles, {color: 'ffc56e'}, 'Los Angeles pilot bounds');
