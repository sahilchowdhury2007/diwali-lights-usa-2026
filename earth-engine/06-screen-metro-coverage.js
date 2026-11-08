// Paste this entire script into a new Earth Engine Code Editor tab and run it.
// Leave YEAR at 2025 for the first run. Switch to 2026 after its image arrives.
var YEAR = 2025;
var MIN_CONTROL_NIGHTS = 3;
var SCALE_METERS = 500;

// Product dates are UTC. Verify the local overpass time for promising regions
// before treating the observations as belonging to the festival evening.
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

var metros = [
  ['Bay Area', [-122.25, 37.15, -121.65, 37.65]],
  ['Los Angeles', [-118.65, 33.75, -117.95, 34.30]],
  ['Dallas–Fort Worth', [-97.55, 32.55, -96.60, 33.10]],
  ['Chicago', [-88.20, 41.55, -87.50, 42.15]],
  ['New York–North Jersey', [-74.50, 40.45, -73.75, 40.95]],
  ['Seattle', [-122.58, 47.32, -121.95, 47.86]],
  ['Atlanta', [-84.70, 33.55, -84.08, 34.06]],
  ['Washington, DC area', [-77.55, 38.66, -76.75, 39.18]]
];

var suomi = ee.ImageCollection('NASA/VIIRS/002/VNP46A2');
var noaa20 = ee.ImageCollection('NASA/VIIRS/002/VJ146A2');

function oneDay(collection, utcDate) {
  var start = ee.Date(utcDate);
  return collection.filterDate(start, start.advance(1, 'day'));
}

function screen(image) {
  // Use the same-day radiance band and the Dallas pilot's quality checks.
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

function screenPlatform(label, collection, schedule) {
  var event = oneDay(collection, schedule.event);
  var start = ee.Date(schedule.controls[0]);
  var end = ee.Date(schedule.controls[schedule.controls.length - 1]).advance(1, 'day');
  var controls = collection.filterDate(start, end).map(function(image) {
    return image.set('utc_date', image.date().format('YYYY-MM-dd'));
  }).filter(ee.Filter.inList('utc_date', schedule.controls));

  // A global daily image can exist while having no usable data in a metro.
  var status = ee.Dictionary({
    event_images: event.size(),
    control_utc_dates: controls.aggregate_array('utc_date').sort()
  });

  status.evaluate(function(info, error) {
    if (error) {
      print(label + ' — collection check failed', error);
      return;
    }
    print(label + ' — image availability', info);
    if (info.event_images !== 1) {
      print(label + ' — coverage skipped: expected one event image');
      return;
    }
    var days = info.control_utc_dates;
    var duplicates = days.some(function(date, i) { return i > 0 && date === days[i - 1]; });
    if (days.length < MIN_CONTROL_NIGHTS || duplicates) {
      print(label + ' — coverage skipped: expected one image per available control date and at least three control dates');
      return;
    }

    var eventImage = ee.Image(event.first());
    var observed = screen(eventImage);
    // Unmask only the 0/1 counting bands. Missing radiance stays missing.
    var available = eventImage.select('DNB_BRDF_Corrected_NTL').gte(0).unmask(0, false);
    var usable = observed.mask().gt(0).unmask(0, false);
    var enoughControls = controls.map(screen).count().gte(MIN_CONTROL_NIGHTS).unmask(0, false);
    var matched = usable.and(enoughControls);
    var counts = available.rename('available_pixels')
      .addBands(usable.rename('event_pixels'))
      .addBands(matched.rename('matched_pixels'))
      .addBands(ee.Image.constant(1).rename('total_pixels'));

    var rows = metros.map(function(metro) {
      var totals = counts.reduceRegion({
        geometry: ee.Geometry.Rectangle(metro[1]),
        reducer: ee.Reducer.sum().unweighted(),
        crs: observed.projection(),
        scale: SCALE_METERS,
        maxPixels: 1e7
      });
      var coverage = ee.Number(totals.get('matched_pixels'))
        .divide(ee.Number(totals.get('total_pixels'))).multiply(100);
      return totals.set('metro', metro[0]).set('matched_percent', coverage);
    });
    print(label + ' — coverage by metro (send this list)', ee.List(rows));
  });
}

var schedule = schedules[YEAR];
print('Screening year and candidate event UTC product date', YEAR, schedule.event);
print('2026 event product availability (2026-11-09 UTC)', ee.Dictionary({
  suomi_npp_images: oneDay(suomi, schedules[2026].event).size(),
  noaa_20_images: oneDay(noaa20, schedules[2026].event).size()
}));
screenPlatform('Suomi NPP', suomi, schedule);
screenPlatform('NOAA-20', noaa20, schedule);
