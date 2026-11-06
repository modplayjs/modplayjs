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
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const xrRoot = resolve(here, '..');
const repoRoot = resolve(xrRoot, '../..');
const packagesRoot = join(repoRoot, 'packages');
const outRoot = join(xrRoot, 'app/src/main/assets/modules');
/** Publishable artifact: manifests plus the files they describe. */
const publishRoot = join(xrRoot, 'build/engine-catalog');
/**
 * Signing material lives outside the repo's tracked files. The environment
 * override exists so a release machine can keep the key somewhere else - and
 * so CI can point at a path it never stores in the workspace, if it is ever
 * given one at all.
 */
const signingKey =
  process.env.MODPLAY_ENGINE_SIGNING_KEY ?? join(xrRoot, 'build/engine-keys/private.pem');

/**
 * Which package provides which tracker format, and which exports have to be
 * registered. This table is the single source of truth for the install
 * bridges: adding a format means adding one row, not editing the engine.
 */
const FORMATS = {
  mod: { pkg: 'fmt-mod', exports: ['plugin', 'hmnPlugin', 'fltPlugin'], ext: ['mod', 'hmn', 'flt'] },
  s3m: { pkg: 'fmt-s3m', exports: ['plugin'], ext: ['s3m'] },
  xm: { pkg: 'fmt-xm', exports: ['plugin'], ext: ['xm'] },
  it: { pkg: 'fmt-it', exports: ['plugin'], ext: ['it'] },
  mtm: { pkg: 'fmt-mtm', exports: ['plugin'], ext: ['mtm'] },
  stm: { pkg: 'fmt-stm', exports: ['plugin'], ext: ['stm'] },
  '669': { pkg: 'fmt-669', exports: ['plugin'], ext: ['669'] },
  sfx: { pkg: 'fmt-sfx', exports: ['plugin'], ext: ['sfx'] },
  digi: { pkg: 'fmt-digi', exports: ['plugin'], ext: ['digi'] },
  asylum: { pkg: 'fmt-asylum', exports: ['plugin'], ext: ['asylum'] },
  ice: { pkg: 'fmt-ice', exports: ['plugin'], ext: ['ice'] },
  med: {
    pkg: 'fmt-med',
    exports: ['plugin', 'mmd3Plugin', 'med2Plugin', 'med3Plugin', 'med4Plugin'],
    ext: ['med', 'mmd', 'mmd0', 'mmd1', 'mmd2', 'mmd3', 'mmdc'],
  },
  st: { pkg: 'fmt-st', exports: ['plugin'], ext: ['st'] },
  sid: { pkg: 'fmt-sid', exports: ['plugin'], ext: ['sid'] },
  fc: { pkg: 'fmt-fc', exports: ['plugin'], ext: ['fc13', 'fc14'] },
  prowizard: {
    pkg: 'fmt-prowizard',
    exports: ['pwPlugin'],
    ext: ['pow', 'pp', 'xpk', 'pack', 'p61', 'utz'],
  },
};

/** Loaded for every session; the mixer and the Paula path are not optional. */
const ALWAYS = ['core', 'effects-shared', 'dsp-softmixer', 'dsp-paula', 'out-android'];

/**
 * Packages whose exports the engine calls directly, and how the bridge builds
 * the service object from them. Kept here next to FORMATS so a package that
 * grows a service export is one edit, not a hunt through the C++ and Kotlin.
 */
const SERVICE_BRIDGES = {
  'fmt-sid': {
    kind: 'sid',
    exports: [
      'sidDsp',
      'sidStartTune',
      'sidSeek',
      'getSidPlayTimeSeconds',
      'getSidChipCount',
      'applySidSettingsLive',
      'loadSidSongLengths',
    ],
    wire: {
      dsp: 'sidDsp',
      startTune: 'sidStartTune',
      seek: 'sidSeek',
      playTimeSeconds: 'getSidPlayTimeSeconds',
      chipCount: 'getSidChipCount',
      applySettings: 'applySidSettingsLive',
      loadSongLengths: 'loadSidSongLengths',
    },
  },
  'fmt-fc': {
    kind: 'fc',
    exports: ['fcEffect', 'setModEventReader'],
    wire: {
      effect: 'fcEffect',
      // The reader needs the MOD format plugin; the engine calls this after
      // registering MOD, and retries if MOD is installed later.
      installEventReader: '() => setModEventReader((c, chn, row) => c.registries.format("mod").readEvent(c, chn, row))',
    },
  },
};

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

/** sha256 of a file, hex, for the catalog's integrity check. */
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Version of a package, for the catalog's update decision. */
function versionOf(pkg) {
  try {
    return JSON.parse(readFileSync(join(packagesRoot, pkg, 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Run the signing script against the catalog that was just written. */
function signCatalog() {
  execFileSync(process.execPath, [join(here, 'engine-catalog-sign.mjs'), 'sign',
    join(publishRoot, 'catalog.json')], { stdio: 'inherit' });
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
      sha256: sha256(outfile),
      version: versionOf(pkg),
      imports: await importsOf(pkg),
    };
    console.log(`  ${assetName(pkg).padEnd(24)} ${kb(size).padStart(6)}`);
  }

  for (const [format, entry] of Object.entries(FORMATS)) {
    if (!manifest.packages[assetName(entry.pkg)]) {
      throw new Error(`format "${format}" names a missing package: ${entry.pkg}`);
    }
    const names = entry.exports.join(', ');
    const lines = [
      `// Generated by build-modules.mjs - registers "${format}".`,
      `import { ${names} } from '${specifier(entry.pkg)}';`,
    ];
    // Services are the exports the engine calls directly, not registry values:
    // SID tuning/seeking and the FC event reader. They are injected so the
    // shared engine never imports an optional package.
    const service = SERVICE_BRIDGES[entry.pkg];
    if (service) {
      lines.push(
        `import { ${service.exports.join(', ')} } from '${specifier(entry.pkg)}';`,
        `globalThis.__modplayAttach('${service.kind}', {`,
      );
      for (const [key, expr] of Object.entries(service.wire)) lines.push(`  ${key}: ${expr},`);
      lines.push('});');
    }
    lines.push(`globalThis.__modplayInstall('${format}', [${names}]);`, '');
    const file = join(outRoot, 'install', `${format}.js`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, lines.join('\n'));
    manifest.formats[format] = {
      package: assetName(entry.pkg),
      install: `install/${format}.js`,
      bytes: statSync(file).size,
      sha256: sha256(file),
      version: versionOf(entry.pkg),
      extensions: (entry.ext ?? []).map((e) => e.toLowerCase()),
      ...(service ? { services: service.kind } : {}),
    };
  }

  // The engine itself is a module too: same loader, same resolution, same
  // cache. It imports only @modplayjs/core, dsp-*, out-android and
  // stream-audio; every format arrives later through an install bridge.
  const engineEntry = join(repoRoot, 'apps/android/engine/src/engine-entry.ts');
  await build({
    entryPoints: [engineEntry],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'neutral',
    legalComments: 'none',
    external: ['@modplayjs/*'],
    outfile: join(outRoot, 'engine-core/index.js'),
  });
  const engineFile = join(outRoot, 'engine-core/index.js');
  const engineBytes = statSync(engineFile).size;
  total += engineBytes;
  manifest.engine = {
    asset: 'engine-core/index.js',
    bytes: engineBytes,
    sha256: sha256(engineFile),
    version: versionOf('core'),
    // Read from the bundle instead of a hardcoded list: a new import in
    // engine-entry.ts must show up in the catalog's reachability walk, or the
    // published tree would be missing the package and the device would fail
    // to start the engine after the update.
    imports: [
      ...new Set(
        [...readFileSync(engineFile, 'utf8').matchAll(/from "(@modplayjs\/[a-z0-9-]+)"/g)].map(
          (match) => match[1],
        ),
      ),
    ],
  };
  console.log(`  ${'engine-core'.padEnd(24)} ${kb(engineBytes).padStart(6)}`);

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
  writeCatalog(manifest, packages, total);
  console.log(`out: ${outRoot}`);
}

/**
 * The publishable catalog. One JSON document that lists every engine module
 * with size, SHA-256 and version; a host only has to serve this file plus the
 * modules/ tree next to it. The app downloads only the files whose hash differs
 * from what it has, so a one-format update is tens of kilobytes.
 *
 * Written to build/engine-catalog/ (gitignored) together with a copy of the
 * files, so the directory can be uploaded as-is.
 */
/**
 * Packages the engine can actually reach.
 *
 * The catalog is what a device downloads, so it must not carry packages the XR
 * app never imports (out-webaudio, out-pcm, playhead are for other hosts).
 * Start at engine-core plus every published format, then follow `imports`
 * until it closes.
 */
function reachable(manifest) {
  const bySpecifier = new Map(
    Object.entries(manifest.packages).map(([name, info]) => [info.specifier, name]),
  );
  const seen = new Set();
  const queue = [];
  const push = (specifier) => {
    const name = bySpecifier.get(specifier);
    if (name && !seen.has(name)) {
      seen.add(name);
      queue.push(name);
    }
  };

  for (const specifier of manifest.engine.imports) push(specifier);
  for (const format of Object.values(manifest.formats)) {
    push(`@modplayjs/${format.package.replace(/^modplayjs-/, '')}`);
  }
  while (queue.length > 0) {
    const name = queue.pop();
    for (const specifier of manifest.packages[name].imports) push(specifier);
  }
  return seen;
}

function writeCatalog(manifest, packages, total) {
  rmSync(publishRoot, { recursive: true, force: true });
  mkdirSync(join(publishRoot, 'modules'), { recursive: true });

  const catalog = {
    schema: 1,
    apiLevel: 1,
    generated: manifest.generated,
    // Asset paths in the catalog are relative to the modules root, so the
    // default base is the `modules/` directory next to catalog.json. An
    // absolute override points at a hosted modules directory.
    baseUrl: process.env.MODPLAY_ENGINE_BASE_URL ?? 'modules/',
    engine: manifest.engine,
    packages: {},
    formats: {},
  };

  const used = reachable(manifest);
  for (const [name, info] of Object.entries(manifest.packages)) {
    if (!used.has(name)) continue;
    catalog.packages[name] = {
      asset: info.asset,
      bytes: info.bytes,
      sha256: info.sha256,
      version: info.version,
    };
  }
  for (const [format, info] of Object.entries(manifest.formats)) {
    catalog.formats[format] = {
      package: info.package,
      install: info.install,
      bytes: info.bytes,
      sha256: info.sha256,
      version: info.version,
      extensions: info.extensions,
    };
  }

  writeFileSync(join(publishRoot, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);

  // Copy only what the catalog lists. The APK assets keep every package (they
  // are cheap in context); the upload tree should not carry 27 directories when
  // 23 are reachable, or the size of a release stops matching the catalog.
  const published = new Set(Object.values(catalog.packages).map((info) => info.asset));
  for (const info of Object.values(catalog.formats)) published.add(info.install);
  published.add(catalog.engine.asset);
  for (const asset of published) {
    const from = join(outRoot, asset);
    const to = join(publishRoot, 'modules', asset);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }

  // Self-check: every file the catalog promises must exist in the publish tree
  // with the hash it advertises. A catalog that lies is worse than no catalog,
  // because the device downloads it and then rejects every file.
  const broken = [];
  const files = [catalog.engine, ...Object.values(catalog.packages), ...Object.values(catalog.formats)];
  for (const info of files) {
    if (!info || !info.asset) continue;
    const file = join(publishRoot, 'modules', info.asset);
    try {
      if (statSync(file).size !== info.bytes) broken.push(`${info.asset}: size`);
      else if (sha256(file) !== info.sha256) broken.push(`${info.asset}: sha256`);
    } catch {
      broken.push(`${info.asset}: missing`);
    }
  }
  for (const info of Object.values(catalog.formats)) {
    const file = join(publishRoot, 'modules', info.install);
    try {
      if (sha256(file) !== info.sha256) broken.push(`${info.install}: sha256`);
    } catch {
      broken.push(`${info.install}: missing`);
    }
  }
  if (broken.length > 0) {
    throw new Error(`catalog self-check failed:\n  ${broken.join('\n  ')}`);
  }

  // Sign automatically when a key exists; a build machine that has the key
  // should never be able to produce an unsigned catalog by forgetting a flag.
  if (existsSync(signingKey)) {
    signCatalog();
  } else {
    console.log(
      'catalog: unsigned (no key at ' + signingKey + '; run engine-catalog-sign.mjs keygen)',
    );
  }

  const catalogBytes = statSync(join(publishRoot, 'catalog.json')).size;
  const signed = existsSync(signingKey) ? 'signed' : 'UNSIGNED';
  console.log(
    `catalog: ${catalogBytes} bytes, ${Object.keys(catalog.packages).length} packages, ` +
      `${Object.keys(catalog.formats).length} formats, hashes verified, ${signed} -> ${publishRoot}`,
  );
}

main().catch((error) => {
  console.error('[build-modules]', error.message ?? error);
  process.exit(1);
});
