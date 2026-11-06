#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
//
// Partitions the monorepo packages into separate Android assets so the V8
// loader can pull in one format at a time instead of shipping one bundle that
// contains all of them.
//
// Output, all under app/src/main/assets/modules:
//
//   modplayjs-core/index.js            one ESM file per package
//   modplayjs-fmt-xm/index.js
//   install/xm.js                      bridge: imports the plugin and registers it
//   manifest.json                      what exists, which exports to register
//
// Cross-package imports stay external (`@modplayjs/core`), because the native
// resolver maps them onto the asset paths at runtime; everything inside a
// package is inlined by esbuild as usual.
//
// The directory names are flattened on purpose: `modules/modplayjs-fmt-xm`
// instead of `modules/@modplayjs/fmt-xm`. AAssetManager_open handles the `@`,
// but the path also travels through Gradle's asset merge, aapt2 and the zip
// central directory, and a plain identifier removes that whole class of doubt.

import { build } from 'esbuild';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const xrRoot = resolve(here, '..');
const repoRoot = resolve(xrRoot, '../..');
const packagesRoot = join(repoRoot, 'packages');
const outRoot = join(xrRoot, 'app/src/main/assets/modules');

/**
 * Which package provides which tracker format, and which exports have to be
 * registered. This table is the single source of truth for the install
 * bridges: adding a format means adding one row, not editing the engine.
 */
const FORMATS = {
  mod: { pkg: 'fmt-mod', exports: ['plugin', 'hmnPlugin', 'fltPlugin'] },
  s3m: { pkg: 'fmt-s3m', exports: ['plugin'] },
  xm: { pkg: 'fmt-xm', exports: ['plugin'] },
  it: { pkg: 'fmt-it', exports: ['plugin'] },
  mtm: { pkg: 'fmt-mtm', exports: ['plugin'] },
  stm: { pkg: 'fmt-stm', exports: ['plugin'] },
  '669': { pkg: 'fmt-669', exports: ['plugin'] },
  sfx: { pkg: 'fmt-sfx', exports: ['plugin'] },
  digi: { pkg: 'fmt-digi', exports: ['plugin'] },
  asylum: { pkg: 'fmt-asylum', exports: ['plugin'] },
  ice: { pkg: 'fmt-ice', exports: ['plugin'] },
  med: { pkg: 'fmt-med', exports: ['plugin', 'mmd3Plugin', 'med2Plugin', 'med3Plugin', 'med4Plugin'] },
  st: { pkg: 'fmt-st', exports: ['plugin'] },
  sid: { pkg: 'fmt-sid', exports: ['plugin'] },
  fc: { pkg: 'fmt-fc', exports: ['plugin'] },
  prowizard: { pkg: 'fmt-prowizard', exports: ['pwPlugin'] },
};

/** Loaded for every session; the mixer and the Paula path are not optional. */
const ALWAYS = ['core', 'effects-shared', 'dsp-softmixer', 'dsp-paula', 'out-android'];

const assetName = (pkg) => `modplayjs-${pkg}`;
const specifier = (pkg) => `@modplayjs/${pkg}`;

function packageDirs() {
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      try {
        return statSync(join(packagesRoot, name, 'src/index.ts')).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

/** Import specifiers a package uses, so the manifest can state the graph. */
async function importsOf(pkg) {
  const { readFileSync } = await import('node:fs');
  const seen = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const text = readFileSync(path, 'utf8');
      for (const match of text.matchAll(/from\s+'(@modplayjs\/[a-z0-9-]+)'/g)) {
        seen.add(match[1]);
      }
    }
  };
  walk(join(packagesRoot, pkg, 'src'));
  return [...seen].sort();
}

function kb(bytes) {
  return `${Math.round(bytes / 1024)}K`;
}

async function main() {
  const packages = packageDirs();
  if (packages.length === 0) throw new Error(`no packages found in ${packagesRoot}`);

  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(join(outRoot, 'install'), { recursive: true });

  const manifest = {
    generated: new Date().toISOString(),
    layout: 'modules/<name>/index.js',
    always: ALWAYS.map(assetName),
    packages: {},
    formats: {},
  };

  let total = 0;
  for (const pkg of packages) {
    const outfile = join(outRoot, assetName(pkg), 'index.js');
    await build({
      entryPoints: [join(packagesRoot, pkg, 'src/index.ts')],
      bundle: true,
      format: 'esm',
      target: 'es2022',
      platform: 'neutral',
      legalComments: 'none',
      // Cross-package imports stay live: the native resolver loads them from
      // their own asset directory, which is the whole point of the split.
      external: ['@modplayjs/*'],
      outfile,
    });
    const size = statSync(outfile).size;
    total += size;
    manifest.packages[assetName(pkg)] = {
      specifier: specifier(pkg),
      asset: `${assetName(pkg)}/index.js`,
      bytes: size,
      imports: await importsOf(pkg),
    };
    console.log(`  ${assetName(pkg).padEnd(24)} ${kb(size).padStart(6)}`);
  }

  for (const [format, entry] of Object.entries(FORMATS)) {
    if (!manifest.packages[assetName(entry.pkg)]) {
      throw new Error(`format "${format}" names a missing package: ${entry.pkg}`);
    }
    const names = entry.exports.join(', ');
    const body =
      `// Generated by build-modules.mjs - registers "${format}".\n` +
      `import { ${names} } from '${specifier(entry.pkg)}';\n` +
      `globalThis.__modplayInstall('${format}', [${names}]);\n`;
    const file = join(outRoot, 'install', `${format}.js`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
    manifest.formats[format] = {
      package: assetName(entry.pkg),
      install: `install/${format}.js`,
      exports: entry.exports,
    };
  }

  writeFileSync(join(outRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // Every cross-package import has to exist as its own asset, or the native
  // resolver will fail at load time on the device instead of here. This is the
  // check that would have caught fmt-xm needing fmt-it and stb-vorbis.
  const missing = [];
  for (const [name, info] of Object.entries(manifest.packages)) {
    for (const spec of info.imports) {
      const pkg = spec.replace('@modplayjs/', '');
      if (!manifest.packages[assetName(pkg)]) missing.push(`${name} -> ${spec}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`unresolvable imports:\n  ${missing.join('\n  ')}`);
  }

  const installBytes = Object.keys(FORMATS).length;
  console.log(
    `\n${packages.length} packages, ${kb(total)} total, ` +
      `${installBytes} format bridges, manifest written`,
  );
  console.log(`out: ${outRoot}`);
}

main().catch((error) => {
  console.error('[build-modules]', error.message ?? error);
  process.exit(1);
});
