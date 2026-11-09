import React, { useEffect, useState } from 'react';

const hour = 60 * 60 * 1000;
const clocks = ['America/New_York', 'America/Los_Angeles'].map(timeZone =>
  new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }));

export function getOvernightPasses(night) {
  if (!night) return [];
  const sunset = Date.parse(night.sunset);
  const sunrise = Date.parse(night.sunrise);
  if (!Number.isFinite(sunset) || !Number.isFinite(sunrise) || sunrise <= sunset || sunrise - sunset > 24 * hour) return [];

  const passes = (night.frames ?? []).map(frame => ({
    ...frame,
    time: Date.parse(frame.time),
    tiles: (frame.tiles ?? []).filter(({ raster }) => raster?.url && raster.coordinates?.length === 4),
  })).filter(frame => frame.time >= sunset && frame.time <= sunrise && frame.tiles.length)
    .sort((a, b) => a.time - b.time);
  const distinct = passes.filter((pass, index) => index === 0 || pass.time !== passes[index - 1].time);
  return distinct.length >= 2 ? distinct : [];
}

export function OvernightPlayback({ night, passes, index, active, onSelect }) {
  const [playing, setPlaying] = useState(false);
  const pass = passes[index];
  const last = passes.length - 1;
  const windowed = Boolean(night.frameMinutes);
  const time = windowed ? pass.label : clocks.map(clock => clock.format(pass.time)).join(' · ');
  const sunset = Date.parse(night.sunset);
  const sunrise = Date.parse(night.sunrise);

  useEffect(() => {
    if (!active) setPlaying(false);
  }, [active]);

  useEffect(() => {
    if (!active || !playing || index >= last) return;
    const timer = window.setTimeout(() => {
      onSelect(index + 1);
      if (index + 1 === last) setPlaying(false);
    }, windowed ? 1300 : 2200);
    return () => window.clearTimeout(timer);
  }, [active, index, last, onSelect, playing, windowed]);

  function select(index) {
    setPlaying(false);
    onSelect(index);
  }

  function togglePlayback() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (!active || index === last) onSelect(index === last ? 0 : index);
    setPlaying(true);
  }

  return <section className="timeline overnight-player" aria-label="Sunset to sunrise playback">
    <div className="timeline-heading">
      <div><span className="field-label">SUNSET TO SUNRISE</span><strong>{time}</strong></div>
      <button type="button" onClick={togglePlayback}>{playing ? 'Pause' : windowed ? 'Play night' : 'Play passes'}</button>
    </div>
    <p className="overnight-status" aria-live={playing ? 'off' : 'polite'}>{windowed
      ? `Window ${index + 1} of ${passes.length} · ${pass.cellCount.toLocaleString('en-US')} grid cells · ${pass.tiles.map(tile => tile.name).join(', ')}`
      : `${pass.label} · Pass ${index + 1} of ${passes.length}`}</p>
    <div className="overnight-controls">
      <button type="button" aria-label="Previous frame" disabled={index === 0} onClick={() => select(index - 1)}>←</button>
      <label className="sr-only" htmlFor="overnight-time">{windowed ? 'Satellite observation window' : 'Measured satellite pass'}</label>
      <input id="overnight-time" type="range" min="0" max={last} step="1" value={index}
        aria-valuetext={`${time}, ${windowed ? 'window' : pass.label + ', pass'} ${index + 1} of ${passes.length}`} onChange={event => select(Number(event.target.value))} />
      <button type="button" aria-label="Next frame" disabled={index === last} onClick={() => select(index + 1)}>→</button>
    </div>
    {!windowed && <div className="overnight-passes" role="group" aria-label="Measured passes">
      {passes.map((frame, i) => <button type="button" key={frame.time} aria-pressed={i === index} onClick={() => select(i)}>
        {frame.label} · {clocks[1].format(frame.time)}
      </button>)}
    </div>}
    <div className={`overnight-coverage${windowed ? ' windowed' : ''}`} aria-hidden="true">
      {passes.map((frame, i) => <span key={frame.time} className={i === index ? 'active' : undefined}
        style={{ left: `${100 * (frame.time - sunset) / (sunrise - sunset)}%` }} />)}
    </div>
    <div className="timeline-labels overnight-endpoints">
      <span>New York sunset · {clocks[0].format(sunset)}</span>
      <span>Los Angeles sunrise · {clocks[1].format(sunrise)}</span>
    </div>
    <p className="timeline-note">{windowed
      ? 'Move the slider or press Play to see the observed windows. Each dot marks a 15-minute window with usable readings somewhere in the U.S.'
      : 'Each dot marks a measured pass on the full-night timeline. The slider and playback step through those passes.'}</p>
  </section>;
}
