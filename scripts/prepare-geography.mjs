import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { feature } from 'topojson-client';

const atlas = JSON.parse(await readFile(new URL('../node_modules/us-atlas/states-10m.json', import.meta.url), 'utf8'));
const states = feature(atlas, atlas.objects.states);
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/data/us-states.geojson', import.meta.url), JSON.stringify(states));
await copyFile(new URL('../node_modules/us-atlas/LICENSE', import.meta.url), new URL('../public/data/us-atlas-LICENSE.txt', import.meta.url));
console.log(`Prepared ${states.features.length} state/territory boundaries from the Census-derived U.S. Atlas.`);
