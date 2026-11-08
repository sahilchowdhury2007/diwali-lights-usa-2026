import { Marker } from 'maplibre-gl';

// Place major reference cities first so they keep their labels at overview scale.
const cities = [
  ['Seattle', -122.33, 47.61],
  ['Los Angeles', -118.24, 34.05],
  ['Denver', -104.99, 39.74],
  ['Dallas–Fort Worth', -97.04, 32.90],
  ['Chicago', -87.63, 41.88],
  ['New York', -74.01, 40.71],
  ['Atlanta', -84.39, 33.75],
  ['Miami', -80.19, 25.76],
  ['Anchorage', -149.90, 61.22],
  ['Honolulu', -157.86, 21.31],
  ['San Francisco', -122.42, 37.77],
  ['Phoenix', -112.07, 33.45],
  ['Minneapolis', -93.27, 44.98],
  ['Houston', -95.37, 29.76],
  ['Detroit', -83.05, 42.33],
  ['Washington, DC', -77.04, 38.91],
  ['Boston', -71.06, 42.36],
  ['San Diego', -117.16, 32.72],
  ['Philadelphia', -75.17, 39.95],
  ['Juneau', -134.42, 58.30],
  ['Hilo', -155.09, 19.71],
];

export function addCityLabels(map) {
  const labels = cities.map(([name, longitude, latitude]) => {
    const center = [longitude, latitude];
    const label = document.createElement('span');
    label.className = 'city-label';
    label.textContent = name;
    const marker = new Marker({ element: label, anchor: 'bottom' }).setLngLat(center).addTo(map);
    return { center, label, marker, width: label.offsetWidth, height: label.offsetHeight };
  });

  function placeLabels() {
    const { clientWidth, clientHeight } = map.getContainer();
    const placed = [];
    for (const { center, label, width, height } of labels) {
      const { x, y } = map.project(center);
      const box = { left: x - width / 2 - 3, right: x + width / 2 + 3, top: y - height - 3, bottom: y + 6 };
      const fits = box.left >= 4 && box.right <= clientWidth - 4 && box.top >= 4 && box.bottom <= clientHeight - 4;
      const overlaps = placed.some(other =>
        box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
      const visible = fits && !overlaps;
      label.style.visibility = visible ? 'visible' : 'hidden';
      if (visible) placed.push(box);
    }
  }

  map.on('move', placeLabels);
  map.on('resize', placeLabels);
  placeLabels();
  return () => {
    map.off('move', placeLabels);
    map.off('resize', placeLabels);
    labels.forEach(({ marker }) => marker.remove());
  };
}
