const countySuffix = / (city and borough|census area|planning region|county|parish|borough|municipio|municipality)$/;

function normalize(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[.'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function findPlaces(index, query) {
  const zip = query.trim().match(/^(\d{5})(?:[- ]\d{4})?$/);
  if (zip) {
    const row = index.zip.find(([code]) => code === zip[1]);
    if (!row) return [];
    const [code, longitude, latitude] = row;
    return [{ label: `ZIP ${code}`, detail: 'Census ZIP area', center: [longitude, latitude], zoom: 11.5, exact: true }];
  }

  const term = normalize(query);
  if (term.length < 2) return [];
  const stateNames = new Map(index.state.map(([name, code]) => [code, normalize(name)]));
  const results = [];
  for (const [name, code, bounds] of index.state) {
    const fullName = normalize(name);
    const exact = [fullName, code.toLowerCase()].includes(term) || (code === 'DC' && term === 'washington dc');
    if (exact || fullName.startsWith(term)) {
      results.push({ label: name, detail: 'State or territory', bounds, exact, rank: exact ? 0 : 3, area: 0 });
    }
  }

  for (const kind of ['city', 'county']) {
    for (const [name, code, longitude, latitude, area] of index[kind]) {
      if (code === 'DC' && term === 'washington dc') continue;
      const fullName = normalize(name);
      const matches = alias =>
        term === alias || term === `${alias} ${code.toLowerCase()}` || term === `${alias} ${stateNames.get(code)}`;
      const consolidated = kind === 'city' && /(?:government(?: \(balance\))?|urban county)$/.test(name);
      const cityAlias = consolidated ? normalize(name.split(/[-/]/)[0]) : fullName;
      const nyc = kind === 'city' && code === 'NY' && fullName === 'new york'
        && (term === 'nyc' || matches('new york city'));
      const direct = matches(fullName) || (consolidated && matches(cityAlias)) || nyc;
      const alias = kind === 'county' && matches(fullName.replace(countySuffix, ''));
      if (!direct && !alias && !fullName.startsWith(term)) continue;
      const zoom = Math.max(5, Math.min(12, 11.4 - Math.log2(Math.max(1, Math.sqrt(area / 20)))));
      results.push({
        label: `${name}, ${code}`,
        detail: kind === 'city' ? 'City or community' : 'County or equivalent',
        center: [longitude, latitude],
        zoom,
        exact: direct || alias,
        rank: direct ? 1 : alias ? 2 : 4,
        area,
      });
    }
  }
  const hasDirect = results.some(result => result.exact && result.rank < 2);
  return results.filter(result => !hasDirect || result.rank !== 2)
    .sort((a, b) => a.rank - b.rank || b.area - a.area || a.label.localeCompare(b.label)).slice(0, 8);
}
