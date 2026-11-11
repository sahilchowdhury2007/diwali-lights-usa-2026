import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as maplibre from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { addCityLabels } from './city-labels.js';
import { getOvernightPasses, OvernightPlayback } from './overnight.jsx';
import GridDemand from './GridDemand.jsx';
import './style.css';

maplibre.setWorkerUrl(workerUrl);

const base = import.meta.env.BASE_URL;
const dates = { 2025: '2025-10-20', 2026: '2026-11-08' };
const emptyTiles = [];
const locations = {
  'Lower 48': [[-125, 24], [-66, 50]],
  'Alaska': [[-188, 51], [-129, 72]],
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

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

function setPlaybackBlend(map, opacity, blend) {
  const laterOpacity = opacity * blend;
  // Compensate for the top layer covering the bottom layer during the fade.
  const earlierOpacity = laterOpacity === 1 ? 0 : opacity * (1 - blend) / (1 - laterOpacity);
  map.setPaintProperty('excess-light-0', 'raster-opacity', earlierOpacity);
  map.setPaintProperty('excess-light-1', 'raster-opacity', laterOpacity);
}

function App() {
  const [year, setYear] = useState(2025);
  const [manifest, setManifest] = useState(null);
  const [dataError, setDataError] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [area, setArea] = useState('Lower 48');
  const [satelliteLayer, setSatelliteLayer] = useState('change');
  const [opacity, setOpacity] = useState(85);
  const [showMethod, setShowMethod] = useState(false);
  const [showOvernight, setShowOvernight] = useState(false);
  const [overnightIndex, setOvernightIndex] = useState(0);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const playbackBlend = useRef(null);
  const yearData = manifest?.years?.[year];
  const date = yearData?.eventDate ?? dates[year];
  const national = yearData?.national;
  const nationalView = national?.date === date && national.tiles?.length ? national : null;
  const dailyTiles = useMemo(() => nationalView?.tiles.filter(({ name }) =>
    name === area || (area === 'Alaska' && name === 'Western Aleutians')) ?? emptyTiles, [nationalView, area]);
  const dailyAvailable = dailyTiles.length > 0;
  const night = yearData?.overnight;
  const overnightPasses = useMemo(() => getOvernightPasses(night), [night]);
  const overnightAvailable = area === 'Lower 48' && overnightPasses.length > 0;
  const nationalPlayback = Boolean(night?.frameMinutes && overnightAvailable);
  const matchedPlayback = night?.fixedFootprint === true && overnightPasses.length === 2;
  const overnightMode = showOvernight && overnightAvailable;
  const matchedMode = overnightMode && matchedPlayback;
  const overnightPass = overnightMode ? overnightPasses[overnightIndex] : null;
  const matchedTiles = useMemo(() => overnightPasses.map(pass => pass.tiles[0]), [overnightPasses]);
  const coverageMode = dailyAvailable && satelliteLayer === 'coverage';
  const strongMode = dailyAvailable && nationalView.strongChangeMin != null && satelliteLayer === 'strong';
  const layerUrlKey = !overnightMode && coverageMode ? 'coverageUrl' : !overnightMode && strongMode ? 'strongChangeUrl' : 'url';
  const layerDescription = !dailyAvailable ? null
    : coverageMode ? 'Shows how much of each map cell has enough usable satellite readings to compare Diwali with ordinary nights. Use this layer to spot gaps in the data.'
      : strongMode ? `Shows only increases above +${number.format(nationalView.strongChangeMin)} ${unit}. This makes larger increases easier to spot.`
        : `Shows where Diwali was brighter than the median of ordinary nights. Gold appears where at least ${percent.format(nationalView.minCoverage)} of a cell has usable comparisons.`;
  const displayed = matchedMode ? matchedTiles : overnightMode ? overnightPass.tiles : dailyTiles;
  const hasRaster = displayed.length > 0;
  const legend = displayed[0]?.raster;

  function closeOvernight() {
    setShowOvernight(false);
  }

  function selectArea(nextArea) {
    setArea(nextArea);
    if (nextArea !== 'Lower 48') closeOvernight();
  }

  const selectOvernightFrame = useCallback(index => {
    setOvernightIndex(index);
    setShowOvernight(true);
  }, []);

  function selectYear(nextYear) {
    if (nextYear === year) return;
    setYear(nextYear);
    setOvernightIndex(0);
    const nextData = manifest?.years?.[nextYear];
    if (area === 'Lower 48' && !nextData?.national?.tiles?.length && getOvernightPasses(nextData?.overnight).length > 0) {
      setShowOvernight(true);
    } else {
      closeOvernight();
    }
  }

  useEffect(() => {
    if (!overnightMode || matchedMode) return;
    const nextPass = overnightPasses[overnightIndex + 1];
    nextPass?.tiles.forEach(({ raster }) => {
      const image = new Image();
      image.src = dataUrl(raster.url);
    });
  }, [overnightMode, matchedMode, overnightIndex, overnightPasses]);

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
        bounds: locations['Lower 48'],
        fitBoundsOptions: { padding: 30 },
        interactive: false,
        renderWorldCopies: false,
      });
      map.current = instance;
      instance.on('load', () => setMapReady(true));
      instance.on('error', () => setMapError(true));
    } catch {
      setMapError(true);
    }
    return () => { instance?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    // Alaska's preset extends west of −180° to include the western Aleutians.
    instance.setRenderWorldCopies(area === 'Alaska');
    function fitRegion() {
      instance.fitBounds(locations[area], { padding: 30, duration: 0 });
    }
    fitRegion();
    instance.on('resize', fitRegion);
    return () => { instance.off('resize', fitRegion); };
  }, [area, mapReady]);

  useEffect(() => {
    if (map.current && mapReady && hasRaster) return addCityLabels(map.current);
  }, [mapReady, hasRaster]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    const layers = displayed.map(({ raster }, index) => {
      const id = `excess-light-${index}`;
      instance.addSource(id, { type: 'image', url: dataUrl(raster[layerUrlKey]), coordinates: raster.coordinates });
      const paint = { 'raster-fade-duration': 0, 'raster-resampling': 'nearest' };
      if (matchedMode) {
        paint['raster-opacity'] = 0;
        paint['raster-opacity-transition'] = { duration: 0, delay: 0 };
      }
      instance.addLayer({ id, type: 'raster', source: id, paint }, 'state-borders');
      return id;
    });
    return () => {
      if (map.current !== instance) return;
      layers.forEach(id => {
        instance.removeLayer(id);
        instance.removeSource(id);
      });
    };
  }, [layerUrlKey, displayed, mapReady, matchedMode]);

  useEffect(() => {
    const instance = map.current;
    if (!mapReady || !instance) return;
    const alpha = opacity / 100;
    if (!matchedMode) {
      playbackBlend.current = null;
      displayed.forEach((_, index) => instance.setPaintProperty(`excess-light-${index}`, 'raster-opacity', alpha));
      return;
    }

    const from = playbackBlend.current ?? overnightIndex;
    if (from === overnightIndex || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      playbackBlend.current = overnightIndex;
      setPlaybackBlend(instance, alpha, overnightIndex);
      return;
    }

    const started = performance.now();
    let animation;
    function fade(now) {
      const progress = Math.min((now - started) / 1000, 1);
      const blend = from + (overnightIndex - from) * progress;
      playbackBlend.current = blend;
      setPlaybackBlend(instance, alpha, blend);
      if (progress < 1) animation = window.requestAnimationFrame(fade);
    }
    animation = window.requestAnimationFrame(fade);
    return () => window.cancelAnimationFrame(animation);
  }, [layerUrlKey, displayed, opacity, mapReady, matchedMode, overnightIndex]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady || overnightMode || !nationalView || !displayed.length) return;
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
      const point = maplibre.MercatorCoordinate.fromLngLat(lngLat.wrap());
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
      if (cell) {
        text = `Matched coverage: ${percent.format(cell[1])}`;
        if (cell[0] !== null) text += `\nMean change: ${changeNumber.format(cell[0])} ${unit}`;
        else text += `\nBrightness display requires ${percent.format(nationalView.minCoverage)} coverage.`;
      }
      popup.setText(`${item.name}\n${text}`);
    }
    instance.on('click', inspect);
    return () => { controller.abort(); instance.off('click', inspect); popup.remove(); };
  }, [mapReady, displayed, nationalView, overnightMode]);

  const stateLabel = dataError ? 'Data unavailable' : !manifest ? 'Loading data index'
    : overnightMode ? `Overnight playback · ${night.region}`
      : dailyAvailable ? `${area} · ${nationalView.satellite}` : 'No processed observation';
  const emptyTitle = dataError ? 'Data index unavailable' : !manifest ? 'Loading observations' : 'Observation pending';
  const emptyMessage = dataError
    ? 'The observation index could not load.'
    : !manifest ? 'Checking the observation index.' : `The daily comparison for ${area} on this festival date is pending.`;

  return <>
    <header className="topbar">
      <a className="brand" href="./" aria-label="Diwali Lights USA home"><span className="brand-mark">✧</span><span>DIWALI LIGHTS <span className="muted">/ USA</span></span></a>
      <div className="toplinks"><span className="experiment"><i /> OPEN EXPERIMENT</span><a href="https://github.com/sahilchowdhury2007/diwali-lights-usa-2026" target="_blank" rel="noreferrer">GitHub ↗</a></div>
    </header>

    <main>
      <section className="intro">
        <div><p className="eyebrow">DIWALI NIGHT IN THE UNITED STATES</p><h1>From satellite lights<br /><em>to electricity demand.</em></h1></div>
        <div className="intro-copy"><p>Which lights stay on for Diwali? The satellite only caught parts of the night, so we turned to hourly grid data. Here’s how demand on Diwali 2025 compared with nearby Mondays.</p><a className="text-button" href="#electricity">Explore the 12-hour timeline <span>↓</span></a></div>
      </section>

      <GridDemand />

      <section className="workspace" aria-label="Nighttime light explorer">
        <aside className="sidebar">
          <p className="eyebrow">THE ORIGINAL SATELLITE EXPERIMENT</p>
          <h2>What the satellite saw.</h2>
          <p className="small-copy">Choose a year and region to explore the available nighttime light observations.</p>
          <label className="field-label" id="year-label">DIWALI YEAR</label>
          <div className="segmented" role="group" aria-labelledby="year-label">{[2025, 2026].map(value => <button key={value} aria-pressed={year === value} className={year === value ? 'active' : ''} onClick={() => selectYear(value)}>{value}<span>{value === 2025 ? 'THE FIRST TEST' : 'THIS YEAR'}</span></button>)}</div>
          <div className="event-row"><span>Festival date</span><strong>{formatDate(dates[year])}</strong></div>
          <label className="field-label" htmlFor="area">MAP VIEW</label>
          <select id="area" value={area} onChange={event => selectArea(event.target.value)}>
            {Object.keys(locations).map(name => <option key={name}>{name}</option>)}
          </select>
          <div className="rule" />
          {overnightMode ? <div className="layer-picker">
            <span className="field-label">SATELLITE LAYER</span>
            <p className="layer-description">{matchedMode
              ? 'Compare the same places at two times. Brighter gold means more light reached the satellite.'
              : 'Colors show how each cell compares with its first comparable reading. The satellite measures total light in each cell, so a decrease can have several causes.'}</p>
          </div> : dailyAvailable ? <div className="layer-picker">
            <label className="field-label" htmlFor="satellite-layer">SATELLITE LAYER</label>
            <select id="satellite-layer" aria-describedby="layer-description" value={coverageMode ? 'coverage' : strongMode ? 'strong' : 'change'} onChange={event => setSatelliteLayer(event.target.value)}>
              <option value="change">Brighter than baseline</option>
              {nationalView.strongChangeMin != null && <option value="strong">Stronger increases</option>}
              <option value="coverage">Matched coverage</option>
            </select>
            <p className="layer-description" id="layer-description" aria-live="polite">{layerDescription}</p>
          </div> : <>
            <span className="field-label">SATELLITE LAYER</span>
            <div className="layer-label"><span className="light-dot" /> Brighter than baseline <span className="pill">SATELLITE</span></div>
          </>}
          <label className="opacity-label" htmlFor="opacity">Layer opacity <span>{opacity}%</span></label>
          <input id="opacity" type="range" min="10" max="100" value={opacity} disabled={!hasRaster} onChange={event => setOpacity(Number(event.target.value))} />
          {!overnightMode && <div className="layer-note">{hasRaster ? 'Click a cell to see its coverage and brightness change.' : 'Layer opacity is available for processed observations.'}</div>}
          <div className="status-card" aria-live="polite"><span className="status-dot" /><div><strong>{stateLabel}</strong>
            {overnightMode ? <>
              {nationalPlayback ? <>
                <p>{number.format(night.matchedCells)} of {number.format(night.totalCells)} grid cells compared{matchedMode ? ' in both snapshots' : ''}.</p>
                <p>Comparable readings in {night.stateCoverage.filter(state => state.matchedCells > 0).length} of {night.stateCoverage.length} jurisdictions.</p>
              </> : <p>{overnightPasses.length} satellite passes · {number.format(night.matchedCells)} cells compared.</p>}
              {night.sourceLabel && <p>{night.sourceLabel}</p>}
              <p>{matchedMode ? 'Satellite brightness combines light from all sources. Viewing conditions can also affect the readings.' : `Cutoff: ${number.format(night.cutoff)} ${unit}. Viewing geometry can affect brightness between passes.`}</p>
            </> : dailyAvailable ? <>
              <p>Event brightness compared with the median of at least three ordinary nights.</p>
              <p>Brightness increases are shown where at least {percent.format(nationalView.minCoverage)} of a cell has matched coverage.</p>
            </> : <p>{emptyMessage}</p>}
          </div></div>
        </aside>

        <div className="map-column">
          <div className="map-stage">
            <div ref={mapContainer} className="map" role="region" aria-label={overnightMode ? `${area} overnight satellite observations` : coverageMode ? `${area} matched satellite coverage` : hasRaster ? `${area} measured nighttime brightness change` : `${area} basemap`} />
            <div className="map-top"><span className="map-tag"><i /> {overnightMode ? 'VIIRS OVERNIGHT' : 'NASA BLACK MARBLE'}</span><span className="map-date">{formatDate(date)}</span></div>
            {!hasRaster && <div className="empty-map"><span className="empty-icon">✧</span><h3>{emptyTitle}</h3><p>{emptyMessage}</p></div>}
            {mapError && <p className="map-error" role="status">Some map resources could not load. Check your internet connection and WebGL support.</p>}
            {matchedMode ? <div className="map-legend">
              <span>MEASURED BRIGHTNESS</span>
              <div className="legend-ramp" style={{ background: `linear-gradient(90deg, ${night.radianceColors.join(', ')})` }} />
              <div className="legend-labels"><span>0</span><span>≥ {night.radianceMax} {unit}</span></div>
              <p>Both snapshots use the same scale. Blank areas lack a comparable pair.</p>
            </div> : overnightMode ? <div className="map-legend">
              <span>{nationalPlayback ? 'NIGHTTIME BRIGHTNESS' : overnightPass.reference ? 'FIRST MEASURED PASS' : 'COMPARED WITH FIRST PASS'}</span>
              <ul className="overnight-legend">{(night.legend ?? overnightPass.legend)?.map(({ color, label }) =>
                <li key={label}><i style={{ background: color }} />{label}</li>)}</ul>
              <p>{nationalPlayback ? 'Blank areas have no usable reading for this window.' : 'Blank cells have no usable comparison.'}</p>
            </div> : coverageMode ? <div className="map-legend">
              <span>MATCHED COVERAGE</span>
              <div className="legend-ramp" style={{ background: `linear-gradient(90deg, ${nationalView.coverageColors.join(', ')})` }} />
              <div className="legend-labels"><span>0%</span><span>100%</span></div>
              <p>Share of each cell with usable event and baseline readings.</p>
            </div> : hasRaster && <div className="map-legend">
              <span>{strongMode ? 'STRONGER INCREASES' : 'ABOVE BASELINE'}</span>
              <div className="legend-ramp" style={{ background: `linear-gradient(90deg, ${legend.colors.join(', ')})` }} />
              <div className="legend-labels"><span>0</span><span>≥ +{legend.limit}</span></div>
              <p>{unit} above baseline · at least {percent.format(nationalView.minCoverage)} matched coverage.</p>
              {strongMode && <p>Highlights changes above +{number.format(nationalView.strongChangeMin)} {unit}.</p>}
            </div>}
          </div>
          <div className="timeline">
            <div className="timeline-heading"><div><span className="field-label">DIWALI NIGHT</span><strong>{formatDate(date)}</strong></div><span className="relative-day">{dailyAvailable ? 'Daily comparison available' : 'Daily comparison pending'}</span></div>
            {!overnightMode && dailyAvailable && <p className="timeline-note">{nationalView.satellite} daily product · UTC product date {nationalView.productDateUtc}</p>}
            {overnightAvailable && <div className="overnight-choices" role="group" aria-label="Observation mode">
              <button type="button" className="overnight-toggle" aria-pressed={!overnightMode} onClick={closeOvernight}>
                {dailyAvailable ? 'Daily comparison' : 'Daily status'}
              </button>
              <button type="button" className="overnight-toggle" aria-pressed={overnightMode} onClick={() => selectOvernightFrame(overnightIndex)}>
                {matchedPlayback ? 'Same places over time' : `Overnight playback · ${night.region}`}
              </button>
            </div>}
          </div>
          {(nationalPlayback || overnightMode) && <OvernightPlayback key={year} night={night} passes={overnightPasses}
            index={overnightIndex} active={overnightMode} onSelect={selectOvernightFrame} />}
        </div>
      </section>

      <section className="research-strip"><div><span>01</span><h3>Compare against normal.</h3><p>Subtract a comparable baseline so ordinary city lights don’t look like a festival signal.</p></div><div><span>02</span><h3>Keep the gaps visible.</h3><p>Clouds and missing observations stay missing. An unobserved area isn’t evidence of no celebration.</p></div><div><span>03</span><h3>Let the evidence decide.</h3><p>A brighter night may have many explanations. A weak or absent signal is a useful finding too.</p></div></section>

      <section className="method" id="method">
        <button className="method-toggle" aria-expanded={showMethod} onClick={() => setShowMethod(!showMethod)}><span><span className="eyebrow">THE METHOD</span><h2>Beautiful maps need careful questions.</h2></span><span className="expand">{showMethod ? '−' : '+'}</span></button>
        {showMethod && <div className="method-copy">
          <p>The electricity timeline compares grid demand across 12 hours with six nearby Monday nights. The comparison describes how demand differed that night. Estimating Diwali’s contribution would require additional evidence.</p>
          <p>The daily comparison subtracts the median of at least three usable ordinary nights from the NOAA-20 Diwali reading. The map shows where brightness increased and where cloud and quality checks left enough coverage to compare.</p>
          <p>In 2025, Los Angeles was brighter across several well-covered comparisons. Results varied across metro areas, so the measurements leave the cause of those increases open.</p>
          <p>The 2025 overnight playback compares two readings of the same locations on a shared brightness scale. Clouds, viewing angles, and gaps between overpasses limit what the sequence can show.</p>
          <a href="https://github.com/sahilchowdhury2007/diwali-lights-usa-2026/blob/main/docs/methodology.md" target="_blank" rel="noreferrer">Read the methodology and results ↗</a>
        </div>}
      </section>
    </main>
    <footer><span>DIWALI LIGHTS USA <span className="muted">/ 2025 + 2026</span></span><span>Observations first. Interpretations second.</span></footer>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
