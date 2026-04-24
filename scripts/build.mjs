#!/usr/bin/env node
import { build } from 'esbuild';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/omc-skill-adapter.mjs',
  target: 'node18',
  banner: {
    js: '#!/usr/bin/env node',
  },
  define: {
    'process.env.npm_package_version': JSON.stringify(pkg.version),
  },
  external: [],
  minify: false,
  sourcemap: false,
});

console.log(`Built dist/omc-skill-adapter.mjs (v${pkg.version})`);
