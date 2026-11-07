import React from 'react';

const hour = 60 * 60 * 1000;

export function makeNightFrames(overnight, observations) {
  const sunset = Date.parse(overnight.sunset);
  const sunrise = Date.parse(overnight.sunrise);
  const passes = observations
    .map(observation => ({
      time: (Date.parse(observation.overpassStart) + Date.parse(observation.overpassEnd)) / 2,
      label: observation.name + ' pass',
      observation,
    }))
    .filter(frame => frame.time >= sunset && frame.time <= sunrise);

  const frames = [{ time: sunset, label: 'New York City sunset' }];
  for (let time = Math.ceil(sunset / hour) * hour; time < sunrise; time += hour) {
    if (time > sunset && !passes.some(pass => pass.time === time)) {
      frames.push({ time, label: 'No observation at this time' });
    }
  }
  return [...frames, ...passes, { time: sunrise, label: 'Los Angeles sunrise' }]
    .sort((a, b) => a.time - b.time);
}

function clock(time, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(time);
}

export function OvernightPlayback({ frames, index, playing, onSelect, onPlay }) {
  const frame = frames[index];
  const last = frames.length - 1;
  const passIndex = frames.findIndex(item => item.observation);

  return <section className="overnight" aria-label="Sunset to sunrise playback">
    <div className="overnight-heading">
      <div><span className="field-label">OVERNIGHT PLAYBACK</span><h3>Sunset to sunrise</h3></div>
      <button className="play-button" onClick={onPlay}>{playing ? 'Pause' : 'Play night'}</button>
    </div>
    <div className="playback-frame" aria-live={playing ? 'off' : 'polite'}>
      <strong>{frame.label}</strong>
      <span>{clock(frame.time, 'America/New_York')} · {clock(frame.time, 'America/Los_Angeles')}</span>
    </div>
    <div className="playback-controls">
      <button aria-label="Previous time" disabled={index === 0} onClick={() => onSelect(index - 1)}>←</button>
      <label className="sr-only" htmlFor="overnight-time">Overnight time</label>
      <input id="overnight-time" type="range" min="0" max={last} step="1" value={index}
        aria-valuetext={frame.label + ', ' + clock(frame.time, 'America/New_York')}
        onChange={event => onSelect(Number(event.target.value))} />
      <button aria-label="Next time" disabled={index === last} onClick={() => onSelect(index + 1)}>→</button>
    </div>
    <div className="playback-landmarks">
      <button onClick={() => onSelect(0)}>NYC sunset <span>{clock(frames[0].time, 'America/New_York')}</span></button>
      {passIndex >= 0 && <button className="observed-landmark" onClick={() => onSelect(passIndex)}>● Dallas pass <span>{clock(frames[passIndex].time, 'America/New_York')}</span></button>}
      <button onClick={() => onSelect(last)}>LA sunrise <span>{clock(frames[last].time, 'America/Los_Angeles')}</span></button>
    </div>
    <p className="timeline-note">Measured passes appear at their recorded times. Tracking lights that turn off or stay on requires repeated observations of the same place.</p>
  </section>;
}
