import React, { useRef, useState } from 'react';
import { findPlaces } from './place-search.js';
import './place-search.css';

let indexPromise;

function loadIndex() {
  indexPromise ??= fetch(`${import.meta.env.BASE_URL}data/place-search.json`)
    .then(response => {
      if (!response.ok) throw new Error('Place index unavailable');
      return response.json();
    })
    .catch(error => {
      indexPromise = undefined;
      throw error;
    });
  return indexPromise;
}

export function PlaceSearch({ map, ready, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const searchId = useRef(0);

  function moveTo(result) {
    const instance = map.current;
    if (!instance) return;
    onSelect();
    if (result.bounds) {
      instance.fitBounds(result.bounds, { padding: 42, duration: 700 });
    } else {
      instance.easeTo({ center: result.center, zoom: result.zoom, duration: 700 });
    }
    setQuery(result.label);
    setResults([]);
    setStatus(`Map centered on ${result.label}.`);
    instance.getContainer().scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }

  async function search(event) {
    event.preventDefault();
    if (!ready || query.trim().length < 2) return;
    const id = ++searchId.current;
    setLoading(true);
    setStatus('Searching…');
    setResults([]);
    try {
      const matches = findPlaces(await loadIndex(), query);
      if (id !== searchId.current) return;
      const exact = matches.filter(result => result.exact);
      if (exact.length === 1) {
        moveTo(exact[0]);
      } else {
        setResults(exact.length ? exact : matches);
        setStatus(matches.length ? 'Choose a match below.' : 'No match. Try a place with its state or a five-digit ZIP code.');
      }
    } catch {
      if (id === searchId.current) setStatus('Place search could not load. Try again.');
    } finally {
      if (id === searchId.current) setLoading(false);
    }
  }

  return <div className="place-search">
    <form onSubmit={search} role="search" aria-label="Search the map">
      <label className="field-label" htmlFor="place-query">FIND A PLACE</label>
      <div className="place-search-field">
        <input id="place-query" type="search" placeholder="City, state, county, ZIP" autoComplete="off"
          value={query} onChange={event => {
            searchId.current += 1;
            setQuery(event.target.value);
            setResults([]);
            setStatus('');
            setLoading(false);
          }} />
        <button type="submit" disabled={!ready || query.trim().length < 2 || loading}>Search</button>
      </div>
    </form>
    <p className="place-search-status" role="status">{status}</p>
    {results.length > 0 && <ul className="place-search-results" aria-label="Place matches">
      {results.map((result, index) => <li key={`${result.label}-${result.detail}-${index}`}>
        <button type="button" onClick={() => moveTo(result)}>{result.label}<small>{result.detail}</small></button>
      </li>)}
    </ul>}
  </div>;
}
