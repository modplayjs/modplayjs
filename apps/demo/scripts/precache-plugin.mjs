// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// Vite plugin: emit the service-worker precache manifest.
//
// generateBundle has every chunk (code) and asset (source) final; the
// public/ files and the built HTML entries are appended in closeBundle
// from disk. The SW derives its cache name from the manifest contents,
// so any asset change produces a new cache and a clean activate.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** @type {import('vite').Plugin} */
export default function pwaPrecache() {
  /** @type {string | undefined} */
  let outDir;
  return {
    name: 'modplayjs-precache-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      const urls = [];
      const seen = new Set();

      // 1. bundle outputs (chunks carry .code, assets .source)
      for (const [name, file] of Object.entries(bundle)) {
        if (name === 'precache-manifest.js') continue;
        urls.push(name);
        seen.add(name);
      }

      // 2. public/ files (copied verbatim by Vite, not in the bundle) —
      //    the manifest stays unlisted (the SW reads it at runtime).
      const publicDir = resolve(__dirname, '..', 'public');
      for (const name of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
        if (!seen.has(name)) urls.push(name);
      }

      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.js',
        source: 'self.__PRECACHE_MANIFEST = ' + JSON.stringify(urls.map((url) => ({ url }))) + ';\n',
      });
    },
    closeBundle() {
      // HTML entries are built outside the rollup bundle — append them
      // from disk once everything is written. The manifest is ALSO
      // inlined into sw.js: the service-worker script bytes must change
      // whenever the build changes, or the browser never re-runs install
      // and keeps the stale cache forever.
      if (!outDir) return;
      const manifestPath = resolve(outDir, 'precache-manifest.js');
      let entries;
      try {
        entries = JSON.parse(
          readFileSync(manifestPath, 'utf8')
            .replace(/^self\.__PRECACHE_MANIFEST = /, '')
            .replace(/;\n?$/, ''),
        );
      } catch {
        return;
      }
      for (const name of ['index.html', 'studio.html']) {
        if (entries.some((/** @type {{url: string}} */ e) => e.url === name)) continue;
        try {
          readFileSync(resolve(outDir, name));
          entries.push({ url: name });
        } catch {
          /* html entry not built — skip */
        }
      }
      writeFileSync(
        manifestPath,
        'self.__PRECACHE_MANIFEST = ' + JSON.stringify(entries) + ';\n',
      );

      // inline into sw.js: replace the importScripts fallback manifest
      const swPath = resolve(outDir, 'sw.js');
      try {
        const sw = readFileSync(swPath, 'utf8');
        const inlined = sw.replace(
          "importScripts('./precache-manifest.js');",
          'self.__PRECACHE_MANIFEST = ' + JSON.stringify(entries) + ';',
        );
        writeFileSync(swPath, inlined);
      } catch {
        /* sw.js missing (dev) — nothing to do */
      }
    },
  };
}
