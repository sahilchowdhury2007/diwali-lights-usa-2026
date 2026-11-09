import React, { useEffect, useState } from 'react';

const hour = 60 * 60 * 1000;
const clocks = ['America/New_York', 'America/Los_Angeles'].map(timeZone =>
  new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }));

export function makeOvernightStops(night) {
  if (!night) return [];
  const sunset = Date.parse(night.sunset);
  const sunrise = Date.parse(night.sunrise);
  if (!Number.isFinite(sunset) || !Number.isFinite(sunrise) || sunrise <= sunset || sunrise - sunset > 24 * hour) return [];

  const passes = (night.frames ?? []).map(frame => ({ ...frame, time: Date.parse(frame.time) }))
    .filter(frame => frame.time >= sunset && frame.time <= sunrise && frame.tiles?.length)
    .sort((a, b) => a.time - b.time);
  if (new Set(passes.map(frame => frame.time)).size < 2) return [];

  const stops = [...passes];
  if (!passes.some(frame => frame.time === sunset)) stops.push({ time: sunset, label: 'New York sunset' });
  if (!passes.some(frame => frame.time === sunrise)) stops.push({ time: sunrise, label: 'Los Angeles sunrise' });
  for (let time = Math.ceil(sunset / hour) * hour; time < sunrise; time += hour) {
    if (time > sunset && !passes.some(frame => frame.time >= time && frame.time < time + hour)) {
      stops.push({ time, label: 'No processed frame this hour' });
    }
  }
  return stops.sort((a, b) => a.time - b.time);
}

export function OvernightPlayback({ stops, index, onSelect }) {
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const stop = stops[index];
  const last = stops.length - 1;
  const time = clocks.map(clock => clock.format(stop.time)).join(' · ');

  useEffect(() => {
    if (!playing || index >= last) return;
    const timer = window.setTimeout(() => {
      onSelect(index + 1);
      if (index + 1 === last) setPlaying(false);
    }, stop.tiles ? 2200 : 500);
    return () => window.clearTimeout(timer);
  }, [index, last, onSelect, playing, stop.tiles]);

  function select(index) {
    setPlaying(false);
    setStarted(true);
    onSelect(index);
  }

  function togglePlayback() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (!started || index === last) onSelect(0);
    setStarted(true);
    setPlaying(true);
  }

  return <section className="timeline overnight-player" aria-label="Sunset to sunrise playback">
    <div className="timeline-heading">
      <div><span className="field-label">SUNSET TO SUNRISE</span><strong>{time}</strong></div>
      <button type="button" onClick={togglePlayback}>{playing ? 'Pause' : 'Play night'}</button>
    </div>
    <p className="overnight-status" aria-live={playing ? 'off' : 'polite'}>{stop.label}</p>
    <div className="overnight-controls">
      <button type="button" aria-label="Previous frame" disabled={index === 0} onClick={() => select(index - 1)}>←</button>
      <label className="sr-only" htmlFor="overnight-time">Overnight time</label>
      <input id="overnight-time" type="range" min="0" max={last} step="1" value={index}
        aria-valuetext={`${time}, ${stop.label}`} onChange={event => select(Number(event.target.value))} />
      <button type="button" aria-label="Next frame" disabled={index === last} onClick={() => select(index + 1)}>→</button>
    </div>
    <div className="overnight-passes" role="group" aria-label="Measured passes">
      {stops.map((frame, i) => frame.tiles && <button type="button" key={frame.time} aria-pressed={i === index} onClick={() => select(i)}>
        {frame.label} · {clocks[1].format(frame.time)}
      </button>)}
    </div>
    <p className="timeline-note">Playback pauses longer on measured frames. Blank frames mark times without a processed reading.</p>
  </section>;
}
