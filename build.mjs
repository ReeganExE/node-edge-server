#!/usr/bin/env node

import esbuild from 'esbuild';

esbuild.build({
  outdir: 'dist/esm',
  entryPoints: process.argv.slice(2),
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'error',
  minifySyntax: true,
  plugins: [
    {
      name: 'mjs',
      setup(build) {
        build.onResolve({ filter: /\..*/ }, (args) => {
          if (args.importer) return { path: `${args.path}.mjs`, external: true };
        });
      },
    },
  ],
});
