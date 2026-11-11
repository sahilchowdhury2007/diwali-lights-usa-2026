import React, { useState } from 'react';
import demand from './data/grid-demand-2025.json';
import './grid-demand.css';

const sum = values => values.reduce((total, value) => total + value, 0);
const comparisons = {
  all: { label: 'All six Mondays', start: 0, end: 6 },
  before: { label: 'Three Mondays before', start: 0, end: 3 },
  after: { label: 'Three Mondays after', start: 3, end: 6 },
};
const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const axisAmount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const signed = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function clock(hour) {
  const localHour = hour % 24;
  return `${localHour % 12 || 12} ${localHour < 12 ? 'a.m.' : 'p.m.'}`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = (sorted.length - 1) / 2;
  return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
}

export default function GridDemand() {
  const [regionId, setRegionId] = useState('US48');
  const [selected, setSelected] = useState(0);
  const [comparison, setComparison] = useState('all');
  const region = demand.regions.find(item => item.id === regionId);
  const { eventMw } = region;
  const controlWindow = comparisons[comparison];
  const controlsMw = region.controlsMw.slice(controlWindow.start, controlWindow.end);
  const baselineMw = eventMw.map((_, index) => median(controlsMw.map(night => night[index])));
  const controlTotals = controlsMw.map(sum).sort((a, b) => a - b);
  const typicalTotal = median(controlTotals);
  const eventTotal = sum(eventMw);
  const totalDelta = eventTotal - typicalTotal;
  const percentDelta = 100 * totalDelta / typicalTotal;
  const rangePosition = eventTotal < controlTotals[0] ? 'below'
    : eventTotal > controlTotals.at(-1) ? 'above' : 'within';
  const low = eventMw.map((_, index) => Math.min(...controlsMw.map(night => night[index])));
  const high = eventMw.map((_, index) => Math.max(...controlsMw.map(night => night[index])));
  const bottom = Math.min(...eventMw, ...low) * 0.94;
  const top = Math.max(...eventMw, ...high) * 1.06;
  const x = index => 70 + index * 76;
  const y = value => 215 - (value - bottom) / (top - bottom) * 190;
  const points = series => series.map((value, index) => `${x(index)},${y(value)}`);
  const range = [...points(high), ...points(low).reverse()].join(' ');
  const start = demand.startHour + selected;
  const currentHour = `${clock(start)} to ${clock(start + 1)}`;
  const comparisonDates = demand.controlDates.slice(controlWindow.start, controlWindow.end)
    .map(value => shortDate.format(new Date(`${value}T00:00:00Z`))).join(', ');

  return <section className="grid-demand" id="electricity" aria-labelledby="electricity-title">
    <div className="demand-heading">
      <div>
        <p className="eyebrow">OCTOBER 20–21, 2025 · EIA FORM 930</p>
        <h2 id="electricity-title">Did electricity demand rise on Diwali night?</h2>
        <p>Compare the 12 hours from 5 p.m. to 5 a.m. with the same hours on nearby Mondays.</p>
      </div>
      <div className="demand-controls">
        <label>Grid region
          <select value={regionId} onChange={event => setRegionId(event.target.value)}>
            {demand.regions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Comparison nights
          <select value={comparison} onChange={event => setComparison(event.target.value)}>
            {Object.entries(comparisons).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
    </div>

    <div className="demand-metrics" aria-live="polite">
      <div><span>Diwali night</span><strong>{amount.format(eventTotal / 1000)} GWh</strong></div>
      <div><span>Median Monday night</span><strong>{amount.format(typicalTotal / 1000)} GWh</strong></div>
      <div><span>Difference from median</span><strong>{signed.format(percentDelta)}%</strong><small>{signed.format(totalDelta / 1000)} GWh</small></div>
    </div>
    <p className="demand-finding"><strong>{region.name} demand was {rangePosition} the comparison range.</strong> The selected Monday totals ran from {amount.format(controlTotals[0] / 1000)} to {amount.format(controlTotals.at(-1) / 1000)} GWh.</p>

    <figure className="demand-figure">
      <figcaption className="demand-legend">
        <span><i className="demand-event-key" /> Diwali night</span>
        <span><i className="demand-baseline-key" /> Monday median</span>
        <span><i className="demand-range-key" /> Monday range</span>
      </figcaption>
      <svg viewBox="0 0 940 246" role="img" aria-label={`Hourly grid demand for ${region.name} in gigawatts. Use the slider or expand the data table for the values.`}>
        {[0, 1, 2, 3, 4].map(tick => {
          const value = bottom + (top - bottom) * tick / 4;
          return <g key={tick}>
            <line className="demand-gridline" x1="60" x2="920" y1={y(value)} y2={y(value)} />
            <text className="demand-axis" x="51" y={y(value) + 5} textAnchor="end">{axisAmount.format(value / 1000)}</text>
          </g>;
        })}
        <text className="demand-axis" x="12" y="16">GW</text>
        <polygon className="demand-band" points={range} />
        <polyline className="demand-baseline" points={points(baselineMw).join(' ')} />
        <polyline className="demand-event" points={points(eventMw).join(' ')} />
        <line className="demand-cursor" x1={x(selected)} x2={x(selected)} y1="25" y2="215" />
        <circle className="demand-dot" cx={x(selected)} cy={y(eventMw[selected])} r="6" />
        {[0, 3, 6, 9, 11].map(index =>
          <text key={index} className="demand-axis" x={x(index)} y="239" textAnchor="middle">
            {clock(demand.startHour + index + 1)}
          </text>
        )}
      </svg>
    </figure>

    <div className="demand-scrubber">
      <label htmlFor="demand-hour">Explore an hour</label>
      <input id="demand-hour" type="range" min="0" max="11" step="1" value={selected} aria-valuetext={currentHour}
        onChange={event => setSelected(Number(event.target.value))} />
      <div className="demand-endpoints"><span>5 p.m.</span><span>5 a.m.</span></div>
      <p aria-live="polite"><strong>{currentHour}</strong> · {amount.format(eventMw[selected] / 1000)} GW on Diwali · {amount.format(baselineMw[selected] / 1000)} GW Monday median</p>
    </div>
    <details className="demand-table">
      <summary>View hourly data</summary>
      <div>
        <table>
          <thead><tr><th scope="col">Reporting time</th><th scope="col">Diwali (GW)</th><th scope="col">Monday median (GW)</th><th scope="col">Monday range (GW)</th></tr></thead>
          <tbody>{eventMw.map((value, index) => {
            const hour = demand.startHour + index;
            return <tr key={hour}>
              <th scope="row">{clock(hour)} to {clock(hour + 1)}</th>
              <td>{amount.format(value / 1000)}</td>
              <td>{amount.format(baselineMw[index] / 1000)}</td>
              <td>{amount.format(low[index] / 1000)}–{amount.format(high[index] / 1000)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </details>
    <p className="demand-note">Hours follow each grid operator’s reporting clock and are plotted at the end of each interval. The baseline uses {comparisonDates}. Grid demand includes homes, businesses, and industry. Weather and other changes in electricity use can affect the comparison. <a href={demand.sourceArchive}>Download source data ↗</a></p>
  </section>;
}
