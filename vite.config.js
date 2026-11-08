import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const manifest = readFileSync(new URL('./public/data/manifest.json', import.meta.url));
const manifestRevision = createHash('sha256').update(manifest).digest('hex').slice(0, 12);

export default defineConfig({
  base: './',
  define: { __MANIFEST_REVISION__: JSON.stringify(manifestRevision) },
});
