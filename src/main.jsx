import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as maplibre from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

maplibre.setWorkerUrl(workerUrl);

const base = import.meta.env.BASE_URL;
const dates = { 2025: '2025-10-20', 2026: '2026-11-08' };
const locations = {
  'United States': [[-125, 24], [-66, 50]],
  'Alaska': [[-170, 51], [-130, 72]],
  'Hawaii': [[-161, 18], [-154, 23]],
};

function dateAtOffset(year, offset) {
  const date = new Date(`${dates[year]}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(offset));
  return date.toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

function App() {
  const [year, setYear] = useState(2025);
  const [offset, setOffset] = useState(0);
  const [manifest, setManifest] = useState(null);
  const [dataError, setDataError] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [area, setArea] = useState('United States');
  const [opacity, setOpacity] = useState(85);
  const [showMethod, setShowMethod] = useState(false);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const date = dateAtOffset(year, offset);
  const record = manifest?.years?.[year]?.observations?.find(item => item.date === date);
  const hasRaster = record?.status === 'ready' && Boolean(record.raster?.url);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${base}data/manifest.json`, { signal: controller.signal })
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
    map.current.fitBounds(locations[area], { padding: 35, duration: 700 });
  }, [area, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;
    if (instance.getLayer('excess-light')) instance.removeLayer('excess-light');
    if (instance.getSource('excess-light')) instance.removeSource('excess-light');
    if (!hasRaster) return;
    // Export paths are relative to the data directory, so project Pages URLs work.
    const url = new URL(record.raster.url, new URL(`${base}data/`, window.location.href)).href;
    instance.addSource('excess-light', { type: 'image', url, coordinates: record.raster.coordinates });
    instance.addLayer({ id: 'excess-light', type: 'raster', source: 'excess-light', paint: { 'raster-opacity': opacity / 100, 'raster-fade-duration': 0 } });
  }, [hasRaster, record, mapReady]);

  useEffect(() => {
    if (mapReady && map.current?.getLayer('excess-light')) map.current.setPaintProperty('excess-light', 'raster-opacity', opacity / 100);
  }, [opacity, mapReady]);

  const stateLabel = dataError ? 'Data unavailable' : !manifest ? 'Loading data index' : hasRaster ? 'Processed observation' : year === 2025 ? 'Historical data not processed' : '2026 observations pending';

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
          <p className="small-copy">The glow will show light above a local baseline. It measures a change in brightness, not a count of celebrations.</p>
          <label className="field-label" id="year-label">DIWALI YEAR</label>
          <div className="segmented" role="group" aria-labelledby="year-label">{[2025, 2026].map(value => <button key={value} aria-pressed={year === value} className={year === value ? 'active' : ''} onClick={() => setYear(value)}>{value}<span>{value === 2025 ? 'THE FIRST TEST' : 'THIS YEAR'}</span></button>)}</div>
          <div className="event-row"><span>Festival date</span><strong>{formatDate(dates[year])}</strong></div>
          <label className="field-label" htmlFor="area">MAP VIEW</label>
          <select id="area" value={area} onChange={event => setArea(event.target.value)}>{Object.keys(locations).map(name => <option key={name}>{name}</option>)}</select>
          <div className="rule" />
          <span className="field-label">SATELLITE LAYER</span>
          <div className="layer-label"><span className="light-dot" /> Excess nighttime light <span className="pill">DAILY</span></div>
          <label className="opacity-label" htmlFor="opacity">Glow opacity <span>{opacity}%</span></label>
          <input id="opacity" type="range" min="10" max="100" value={opacity} disabled={!hasRaster} onChange={event => setOpacity(Number(event.target.value))} />
          <div className="layer-note">{hasRaster ? 'Showing quality-screened satellite observations.' : 'Glow controls activate when processed observations are available.'}</div>
          <div className="status-card" aria-live="polite"><span className="status-dot" /><div><strong>{stateLabel}</strong><p>{dataError ? 'The data index could not load. Reload to try again.' : year === 2025 ? 'Historical satellite observations have not been processed yet. No measured glow is displayed.' : 'This view will populate after satellite observations are published and processed.'}</p></div></div>
        </aside>

        <div className="map-column">
          <div className="map-stage">
            <div ref={mapContainer} className="map" role="region" aria-label="Interactive United States basemap. No light anomalies are shown until observations are processed." />
            <div className="map-top"><span className="map-tag"><i /> NASA BLACK MARBLE</span><span className="map-date">{formatDate(date)}</span></div>
            {!hasRaster && <div className="empty-map"><span className="empty-icon">✧</span><h3>{dataError ? 'Data index unavailable' : year === 2025 ? 'The experiment starts here.' : 'A new festival. A new observation.'}</h3><p>{dataError ? 'The basemap is available, but the observation index could not load.' : year === 2025 ? 'The map is ready. We’re waiting on the first processed satellite observations to test the theory.' : '2026 will appear here as satellite data becomes available. Explore the 2025 test in the meantime.'}</p><span>NO OBSERVATIONS DISPLAYED</span></div>}
            {mapError && <p className="map-error" role="status">Some map resources could not load. Check your internet connection and WebGL support.</p>}
            <div className="map-legend"><span>EXCESS LIGHT</span><div className="legend-ramp" /><div className="legend-labels"><span>Lower</span><span>Higher</span></div><p>{hasRaster ? record.raster.legend : 'Scale will be set after baseline validation.'}</p></div>
          </div>
          <div className="timeline">
            <div className="timeline-heading"><div><span className="field-label">NIGHT TO EXPLORE</span><strong>{formatDate(date)}</strong></div><span className="relative-day">{Number(offset) === 0 ? 'Diwali reference date' : `${Math.abs(offset)} ${Math.abs(offset) === 1 ? 'day' : 'days'} ${offset < 0 ? 'before' : 'after'} Diwali`}</span></div>
            <label className="sr-only" htmlFor="night">Days relative to Diwali</label><input id="night" type="range" min="-7" max="7" step="1" value={offset} onChange={event => setOffset(Number(event.target.value))} />
            <div className="timeline-labels"><span>−7 DAYS</span><button onClick={() => setOffset(0)}>DIWALI <span>✧</span></button><span>+7 DAYS</span></div>
            <p className="timeline-note">Dates are reference dates for now. Satellite overpasses will be aligned to local nights during data validation.</p>
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
