import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as maplibre from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

maplibre.setWorkerUrl(workerUrl);

const base = import.meta.env.BASE_URL;
const dates = { 2025: '2025-10-20', 2026: '2026-11-08' };
const usOverview = 'us-overview';
const locations = {
  'United States': [[-125, 24], [-66, 50]],
  'Alaska': [[-180, 51], [-129, 72]],
  'Western Aleutians': [[172, 51], [180, 56]],
  'Hawaii': [[-179, 18], [-154, 29]],
};
const unit = 'nW/cm²/sr';
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const changeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

function dataUrl(path) {
  const url = new URL(path, new URL(`${base}data/`, window.location.href));
  url.searchParams.set('v', __MANIFEST_REVISION__);
  return url.href;
}

function dateAtOffset(year, offset) {
  const date = new Date(`${dates[year]}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(offset));
  return date.toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

function baselineName(record) {
  return record?.baselineLabel ?? 'Median of usable control nights';
}

function App() {
  const [year, setYear] = useState(2025);
  const [offset, setOffset] = useState(0);
  const [manifest, setManifest] = useState(null);
  const [dataError, setDataError] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [area, setArea] = useState('Observation area');
  const [observationName, setObservationName] = useState('');
  const [satelliteLayer, setSatelliteLayer] = useState('change');
  const [opacity, setOpacity] = useState(85);
  const [showMethod, setShowMethod] = useState(false);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const date = dateAtOffset(year, offset);
  const observations = useMemo(() => manifest?.years?.[year]?.observations?.filter(
    item => item.date === date && item.status === 'ready' && item.raster?.url,
  ) ?? [], [manifest, year, date]);
  const national = manifest?.years?.[year]?.national;
  const nationalForDate = national?.date === date ? national : null;
  const city = observations.find(item => item.name === observationName);
  const hasUsOption = Boolean(nationalForDate || (year === 2025 && observations.length));
  const showOverview = hasUsOption && (observationName === usOverview || Boolean(nationalForDate && !city));
  const nationalView = showOverview ? nationalForDate : null;
  const coverageMode = Boolean(nationalView && satelliteLayer === 'coverage');
  const record = city ?? observations[0];
  const displayed = useMemo(() => nationalView?.tiles ?? (showOverview ? observations : record ? [record] : []),
    [nationalView, showOverview, observations, record]);
  const hasRaster = displayed.length > 0;
  const legend = displayed[0]?.raster;
  const mapArea = showOverview && area === 'Observation area' ? 'United States' : area;
  const baselineLabel = baselineName(record);
  const selectObservation = useCallback(name => {
    setObservationName(name);
    setArea(name === usOverview ? 'United States' : 'Observation area');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${base}data/manifest.json?v=${__MANIFEST_REVISION__}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Manifest unavailable'); return response.json(); })
      .then(setManifest)
      .catch(error => { if (error.name !== 'AbortError') setDataError(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let instance;
    try {
      instance = new maplibre.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            states: {
              type: 'geojson',
              data: `${base}data/us-states.geojson`,
              attribution: '<a href="https://github.com/topojson/us-atlas">U.S. Atlas</a> / U.S. Census Bureau (2017)',
            },
          },
          layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#0d141e' } },
            { id: 'states', type: 'fill', source: 'states', paint: { 'fill-color': '#222d3a' } },
            { id: 'state-borders', type: 'line', source: 'states', paint: { 'line-color': '#495563', 'line-width': 0.7 } },
          ],
        },
        bounds: locations['United States'],
        fitBoundsOptions: { padding: 30 },
        minZoom: 1.5,
        maxZoom: 12,
        renderWorldCopies: false,
      });
      map.current = instance;
      instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
      instance.on('load', () => setMapReady(true));
      instance.on('error', () => setMapError(true));
    } catch {
      setMapError(true);
    }
    return () => { instance?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current || !mapReady) return;
    const coordinates = showOverview ? null : record?.raster?.coordinates;
    const bounds = mapArea === 'Observation area' && coordinates
      ? [coordinates[3], coordinates[1]]
      : locations[mapArea] ?? locations['United States'];
    map.current.fitBounds(bounds, { padding: 42, duration: 700 });
  }, [mapArea, record, mapReady, showOverview]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    const layers = displayed.map(({ raster }, index) => {
      const id = `excess-light-${index}`;
      instance.addSource(id, { type: 'image', url: dataUrl(coverageMode ? raster.coverageUrl : raster.url), coordinates: raster.coordinates });
      instance.addLayer({ id, type: 'raster', source: id, paint: { 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } }, 'state-borders');
      return id;
    });
    const markers = showOverview ? observations.map(({ name, raster }) => {
      const [west, north] = raster.coordinates[0];
      const [east, south] = raster.coordinates[2];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'observation-marker';
      button.textContent = name;
      button.setAttribute('aria-label', `View ${name} observation`);
      button.addEventListener('click', event => {
        event.stopPropagation();
        selectObservation(name);
      });
      return new maplibre.Marker({ element: button, anchor: 'bottom' })
        .setLngLat([(west + east) / 2, (south + north) / 2]).addTo(instance);
    }) : [];
    return () => {
      markers.forEach(marker => marker.remove());
      if (map.current !== instance) return;
      layers.forEach(id => {
        instance.removeLayer(id);
        instance.removeSource(id);
      });
    };
  }, [coverageMode, displayed, mapReady, observations, selectObservation, showOverview]);

  useEffect(() => {
    if (!mapReady || !map.current) return;
    displayed.forEach((_, index) => map.current.setPaintProperty(`excess-light-${index}`, 'raster-opacity', opacity / 100));
  }, [coverageMode, displayed, opacity, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady || !displayed.length) return;
    const controller = new AbortController();
    const popup = new maplibre.Popup({ maxWidth: '240px', className: 'reading-popup' });
    const readings = displayed.filter(item => item.raster.pixelsUrl).map(item => {
      const { raster } = item;
      const reading = {
        item,
        topLeft: maplibre.MercatorCoordinate.fromLngLat(raster.coordinates[0]),
        bottomRight: maplibre.MercatorCoordinate.fromLngLat(raster.coordinates[2]),
      };
      return reading;
    });
    let clickId = 0;
    async function inspect({ lngLat }) {
      const currentClick = ++clickId;
      const point = maplibre.MercatorCoordinate.fromLngLat(lngLat);
      const reading = readings.find(({ topLeft, bottomRight }) =>
        point.x >= topLeft.x && point.x < bottomRight.x && point.y >= topLeft.y && point.y < bottomRight.y);
      if (!reading) return;
      const { topLeft, bottomRight, item } = reading;
      popup.setLngLat(lngLat).setText('Loading pixel readings…').addTo(instance);
      reading.grid ??= fetch(dataUrl(item.raster.pixelsUrl), { signal: controller.signal })
        .then(response => { if (!response.ok) throw new Error('Pixel readings unavailable'); return response.json(); })
        .catch(() => null);
      const grid = await reading.grid;
      if (controller.signal.aborted || currentClick !== clickId || !popup.isOpen()) return;
      if (!grid) {
        reading.grid = null;
        popup.setText('Pixel readings unavailable.');
        return;
      }
      const x = (point.x - topLeft.x) / (bottomRight.x - topLeft.x);
      const y = (point.y - topLeft.y) / (bottomRight.y - topLeft.y);
      const cell = grid.cells[Math.floor(y * grid.height) * grid.width + Math.floor(x * grid.width)];
      let text = 'No usable comparison at this location.';
      if (nationalView && cell) {
        text = `Matched coverage: ${percent.format(cell[1])}`;
        if (cell[0] !== null) text += `\nMean change: ${changeNumber.format(cell[0])} ${unit}`;
        else text += `\nBrightness display requires ${percent.format(nationalView.minCoverage)} coverage.`;
      } else if (!nationalView) {
        text = cell
          ? `Observed: ${number.format(cell[0])} ${unit}\n${baselineName(item)}: ${number.format(cell[1])} ${unit}\nChange: ${changeNumber.format(cell[2])} ${unit}\nUsable baseline nights: ${cell[3]}`
          : 'No usable comparison at this location.';
      }
      popup.setText(showOverview ? `${item.name}\n${text}` : text);
    }
    instance.on('click', inspect);
    return () => { controller.abort(); instance.off('click', inspect); popup.remove(); };
  }, [mapReady, displayed, nationalView, showOverview]);

  const stateLabel = dataError ? 'Data unavailable' : !manifest ? 'Loading data index'
    : nationalView ? `United States · ${nationalView.satellite}`
      : hasRaster && showOverview ? 'United States coverage' : hasRaster ? `${record.name} pilot` : 'No processed observation';
  const emptyTitle = dataError ? 'Data index unavailable' : 'No satellite observation';
  const emptyMessage = dataError
    ? 'The observation index could not load.'
    : year === 2025
      ? 'Select Diwali to view the October 20 observations.'
      : 'Satellite observations for this date are pending.';

  return <>
    <header className="topbar">
      <a className="brand" href="./" aria-label="Diwali Lights USA home"><span className="brand-mark">✧</span><span>DIWALI LIGHTS <span className="muted">/ USA</span></span></a>
      <div className="toplinks"><span className="experiment"><i /> OPEN EXPERIMENT</span><a href="https://github.com/sahilchowdhury2007" target="_blank" rel="noreferrer">GitHub ↗</a></div>
    </header>

    <main>
      <section className="intro">
        <div><p className="eyebrow">A FESTIVAL. A SATELLITE. A QUESTION.</p><h1>Can we see Diwali<br /><em>from space?</em></h1></div>
        <div className="intro-copy"><p>Explore changes in America’s nighttime light around Diwali. Start with 2025, then follow the observations for 2026.</p><button className="text-button" onClick={() => { setShowMethod(true); document.getElementById('method').scrollIntoView({ behavior: 'smooth' }); }}>How we’re testing it <span>↘</span></button></div>
      </section>

      <section className="workspace" aria-label="Nighttime light explorer">
        <aside className="sidebar">
          <p className="eyebrow">01 / EXPLORE THE NIGHT</p>
          <h2>A little extra light.</h2>
          <p className="small-copy">Explore the U.S. satellite comparison and zoom in on the Dallas–Fort Worth and Los Angeles pilots.</p>
          <label className="field-label" id="year-label">DIWALI YEAR</label>
          <div className="segmented" role="group" aria-labelledby="year-label">{[2025, 2026].map(value => <button key={value} aria-pressed={year === value} className={year === value ? 'active' : ''} onClick={() => setYear(value)}>{value}<span>{value === 2025 ? 'THE FIRST TEST' : 'THIS YEAR'}</span></button>)}</div>
          <div className="event-row"><span>Festival date</span><strong>{formatDate(dates[year])}</strong></div>
          {(hasUsOption || observations.length > 1) && <div className="observation-picker">
            <label className="field-label" htmlFor="observation">OBSERVATION</label>
            <select id="observation" value={showOverview ? usOverview : record.name}
              onChange={event => selectObservation(event.target.value)}>
              {hasUsOption && <option value={usOverview}>United States</option>}
              {observations.map(item => <option key={item.name}>{item.name}</option>)}
            </select>
          </div>}
          <label className="field-label" htmlFor="area">MAP VIEW</label>
          <select id="area" value={mapArea} onChange={event => setArea(event.target.value)}>
            {!showOverview && <option value="Observation area">{record?.name ?? 'Observation area'}</option>}
            {Object.keys(locations).map(name => <option key={name}>{name}</option>)}
          </select>
          <div className="rule" />
          {nationalView ? <div className="layer-picker">
            <label className="field-label" htmlFor="satellite-layer">SATELLITE LAYER</label>
            <select id="satellite-layer" value={satelliteLayer} onChange={event => setSatelliteLayer(event.target.value)}>
              <option value="change">Brighter than baseline</option>
              <option value="coverage">Matched coverage</option>
            </select>
          </div> : <>
            <span className="field-label">SATELLITE LAYER</span>
            <div className="layer-label"><span className="light-dot" /> Brighter than baseline <span className="pill">SATELLITE</span></div>
          </>}
          <label className="opacity-label" htmlFor="opacity">Layer opacity <span>{opacity}%</span></label>
          <input id="opacity" type="range" min="10" max="100" value={opacity} disabled={!hasRaster} onChange={event => setOpacity(Number(event.target.value))} />
          <div className="layer-note">{nationalView ? 'Click a cell to see its coverage and brightness change.' : hasRaster ? 'Click a map cell for its reading and baseline.' : 'Layer opacity is available for processed observations.'}</div>
          <div className="status-card" aria-live="polite"><span className="status-dot" /><div><strong>{stateLabel}</strong>
            {nationalView ? <>
              <p>Event brightness compared with the median of at least three ordinary nights.</p>
              <p>Brightness increases are shown where at least {percent.format(nationalView.minCoverage)} of a cell has matched coverage.</p>
              <p>Use Map View to explore Alaska, Hawaii, and the Western Aleutians.</p>
            </> : showOverview && hasRaster ? <>
              <p>{observations.map(item => item.name).join(' and ')} have published comparisons. Each uses its own baseline.</p>
              <p>Select a city marker to zoom to its readings.</p>
            </> : hasRaster && record.summary ? <>
              <p>Mean {changeNumber.format(record.summary.mean)} · median {changeNumber.format(record.summary.median)} {unit}</p>
              <p>{baselineLabel}{record.satellite ? ` · ${record.satellite}` : ''}</p>
              <p>{number.format(record.summary.count)} compared cells on the analysis grid</p>
              {record.summary.aboveControlsPct != null && <p>{number.format(record.summary.aboveControlsPct)}% brighter than all three control nights</p>}
              {record.granuleUrl && <p><a href={record.granuleUrl} target="_blank" rel="noreferrer">NASA overpass record ↗</a></p>}
              {record.sourceUrl && <p><a href={record.sourceUrl} target="_blank" rel="noreferrer">Satellite dataset ↗</a></p>}
            </> : <p>{emptyMessage}</p>}
          </div></div>
        </aside>

        <div className="map-column">
          <div className="map-stage">
            <div ref={mapContainer} className="map" role="region" aria-label={coverageMode ? 'United States matched satellite coverage' : hasRaster ? `${showOverview ? 'United States' : record.name} measured nighttime brightness change` : 'United States basemap'} />
            <div className="map-top"><span className="map-tag"><i /> NASA BLACK MARBLE</span><span className="map-date">{formatDate(date)}</span></div>
            {!hasRaster && <div className="empty-map"><span className="empty-icon">✧</span><h3>{emptyTitle}</h3><p>{emptyMessage}</p></div>}
            {mapError && <p className="map-error" role="status">Some map resources could not load. Check your internet connection and WebGL support.</p>}
            {coverageMode ? <div className="map-legend">
              <span>MATCHED COVERAGE</span>
              <div className="legend-ramp" style={{ background: `linear-gradient(90deg, ${nationalView.coverageColors.join(', ')})` }} />
              <div className="legend-labels"><span>0%</span><span>100%</span></div>
              <p>Share of each cell with usable event and baseline readings.</p>
            </div> : hasRaster && <div className="map-legend">
              <span>ABOVE BASELINE</span>
              <div className="legend-ramp" style={{ background: `linear-gradient(90deg, ${legend.colors.join(', ')})` }} />
              <div className="legend-labels"><span>0</span><span>≥ +{legend.limit}</span></div>
              <p>{unit} above baseline{nationalView ? ` · at least ${percent.format(nationalView.minCoverage)} matched coverage.` : ''}</p>
            </div>}
          </div>
          <div className="timeline">
            <div className="timeline-heading"><div><span className="field-label">NIGHT TO EXPLORE</span><strong>{formatDate(date)}</strong></div><span className="relative-day">{Number(offset) === 0 ? 'Diwali reference date' : `${Math.abs(offset)} ${Math.abs(offset) === 1 ? 'day' : 'days'} ${offset < 0 ? 'before' : 'after'} Diwali`}</span></div>
            <label className="sr-only" htmlFor="night">Days relative to Diwali</label><input id="night" type="range" min="-7" max="7" step="1" value={offset} onChange={event => setOffset(Number(event.target.value))} />
            <div className="timeline-labels"><span>−7 DAYS</span><button onClick={() => setOffset(0)}>DIWALI <span>✧</span></button><span>+7 DAYS</span></div>
            {hasRaster && <p className="timeline-note">{nationalView ? 'NOAA-20 daily product' : 'Local festival evening'} · UTC product date {(nationalView ?? record).productDateUtc}</p>}
          </div>
        </div>
      </section>

      <section className="research-strip"><div><span>01</span><h3>Compare against normal.</h3><p>Subtract a comparable baseline so ordinary city lights don’t look like a festival signal.</p></div><div><span>02</span><h3>Keep the gaps visible.</h3><p>Clouds and missing observations stay missing. An unobserved area isn’t evidence of no celebration.</p></div><div><span>03</span><h3>Let the evidence decide.</h3><p>A brighter night may have many explanations. A weak or absent signal is a useful finding too.</p></div></section>

      <section className="method" id="method"><button className="method-toggle" aria-expanded={showMethod} onClick={() => setShowMethod(!showMethod)}><span><span className="eyebrow">THE METHOD</span><h2>Beautiful maps need careful questions.</h2></span><span className="expand">{showMethod ? '−' : '+'}</span></button>{showMethod && <div className="method-copy"><p>We will compare daily, quality-screened NASA VIIRS Black Marble nighttime radiance with a baseline from comparable non-festival nights. The first analysis uses 2025 to test whether a Diwali-associated change is distinguishable from normal night-to-night variation.</p><p>Same-night observations will be used for event detection. Historical values supplied by gap-filling will not count as new observations. Cloud, snow, retrieval quality, baseline sample counts, and local-night alignment must be checked before a glow layer is published.</p><p>The 2025 and 2026 views will use comparable processing and a fixed display scale. Matching positions relative to Diwali is more meaningful than matching calendar dates. Regional electricity demand can later provide separate context, at its actual grid-region resolution.</p><p>This experiment cannot identify individual celebrants, estimate crowd sizes from light alone, or establish that Diwali caused a change. Details and uncertainty will be published with the processed observations.</p><a href="https://developers.google.com/earth-engine/datasets/catalog/NASA_VIIRS_002_VNP46A2" target="_blank" rel="noreferrer">Read the NASA dataset documentation ↗</a></div>}</section>
    </main>
    <footer><span>DIWALI LIGHTS USA <span className="muted">/ 2025 + 2026</span></span><span>Observations first. Interpretations second.</span></footer>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
