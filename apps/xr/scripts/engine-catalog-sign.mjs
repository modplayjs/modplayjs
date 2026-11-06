#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
//
// Signs (or creates the key for) the published engine catalog.
//
//   node scripts/engine-catalog-sign.mjs keygen
//   node scripts/engine-catalog-sign.mjs sign [catalog.json]
//
// Why a signature at all: the catalog is engine code. TLS protects the
// transport, but a compromised CDN, a hijacked GitHub account or a mirror with
// a valid certificate can still serve *different* JavaScript. A signature made
// with a key that never leaves the build machine is the only thing that keeps
// that code out of the V8 isolate.
//
// What is signed: a canonical text form of the catalog, not the raw JSON. Raw
// JSON cannot be signed reliably because key order and whitespace are not
// stable across JSON writers, and a signature that depends on formatting breaks
// the moment a tool reformats the file. The canonical form is defined once,
// implemented identically here and in EngineCatalog.kt, and excludes `baseUrl`
// and `signature`:
//
//   modplay-engine-catalog/1
//   schema=1
//   api_level=1
//   generated=2026-11-06T12:00:00.000Z
//   engine=engine-core/index.js|23166|<sha256>|0.2.1
//   package=modplayjs-core|modplayjs-core/index.js|250222|<sha256>|0.2.1
//   format=xm|modplayjs-fmt-xm|install/xm.js|141|<sha256>|0.2.1|xm
//
// Packages and formats are sorted by name, lines are separated by "\n" with no
// trailing newline, all numbers are plain decimals.
//
// `baseUrl` is deliberately outside the signature: it only decides where the
// bytes are fetched from. A mirror may point it at another host, but the files
// it serves must still match the signed SHA-256 values, so a redirect can cause
// a failed update at worst - never a different engine.

import { execFileSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const xrRoot = resolve(here, '..');
const keyDir = join(xrRoot, 'build/engine-keys');
const defaultKey = join(keyDir, 'private.pem');
const catalogPath = process.argv[3] ? resolve(process.argv[3]) : join(xrRoot, 'build/engine-catalog/catalog.json');

const CANONICAL_HEADER = 'modplay-engine-catalog/1';

/** See the header comment; EngineCatalog.kt builds the same string. */
export function canonicalText(catalog) {
  const lines = [
    CANONICAL_HEADER,
    `schema=${catalog.schema}`,
    `api_level=${catalog.apiLevel}`,
    `generated=${catalog.generated}`,
    `engine=${[
      catalog.engine.asset,
      catalog.engine.bytes,
      catalog.engine.sha256,
      catalog.engine.version,
    ].join('|')}`,
  ];
  for (const name of Object.keys(catalog.packages).sort()) {
    const p = catalog.packages[name];
    lines.push(`package=${name}|${p.asset}|${p.bytes}|${p.sha256}|${p.version}`);
  }
  for (const name of Object.keys(catalog.formats).sort()) {
    const f = catalog.formats[name];
    lines.push(
      `format=${name}|${f.package}|${f.install}|${f.bytes}|${f.sha256}|${f.version}|` +
        `${(f.extensions ?? []).join(',')}`,
    );
  }
  return lines.join('\n');
}

function keygen(force) {
  if (existsSync(defaultKey) && !force) {
    const publicKey = createPublicKey(readFileSync(defaultKey)).export({
      type: 'spki',
      format: 'der',
    });
    console.log(`key already exists: ${defaultKey}`);
    console.log(`public key (base64): ${publicKey.toString('base64')}`);
    return;
  }
  mkdirSync(keyDir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  writeFileSync(defaultKey, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const der = publicKey.export({ type: 'spki', format: 'der' });
  writeFileSync(join(keyDir, 'public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
  writeFileSync(join(keyDir, 'public.base64'), `${der.toString('base64')}\n`);
  console.log(`wrote private key: ${defaultKey} (never commit this)`);
  console.log(`wrote public key:  ${join(keyDir, 'public.pem')}`);
  console.log('');
  console.log('Put this in the app build:');
  console.log(`  -PengineCatalogPubKey=${der.toString('base64')}`);
  console.log('or set MODPLAY_ENGINE_CATALOG_PUBKEY to the same string.');
}

/**
 * A key that git would commit is an incident, not a warning.
 *
 * The default lives under build/engine-keys (ignored), but
 * MODPLAY_ENGINE_SIGNING_KEY can point anywhere - including into a tracked
 * directory, which would publish the key that signs engine code for every
 * install.
 */
function assertNotTracked(keyPath) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
    // stdio: 'ignore' returns null, so the output has to be captured; a
    // successful call means the file is in the index.
    const tracked = execFileSync('git', ['ls-files', '--error-unmatch', keyPath], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (String(tracked).trim().length > 0) {
      throw new Error(`signing key ${keyPath} is tracked by git`);
    }
  } catch (error) {
    if (String(error.message ?? error).includes('is tracked by git')) throw error;
    // Not a git work tree, or the file is untracked: both are fine.
  }
}

function signCatalog() {
  const keyPath = process.env.MODPLAY_ENGINE_SIGNING_KEY ?? defaultKey;
  if (!existsSync(keyPath)) {
    throw new Error(`no signing key at ${keyPath}; run "keygen" first`);
  }
  assertNotTracked(keyPath);
  if (!existsSync(catalogPath)) {
    throw new Error(`no catalog at ${catalogPath}; run build-modules first`);
  }

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const text = canonicalText(catalog);
  const signature = sign(null, Buffer.from(text, 'utf8'), createPrivateKey(readFileSync(keyPath)));

  // The signature is stored as base64 next to the data it covers. Written back
  // with the same 2-space layout the generator uses.
  catalog.signature = signature.toString('base64');
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  const publicKey = createPublicKey(readFileSync(keyPath)).export({ type: 'spki', format: 'der' });
  console.log(
    `signed ${catalogPath}\n  key:    ${keyPath}\n  public: ${publicKey.toString('base64')}`,
  );
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const command = process.argv[2] ?? 'sign';
  if (command === 'keygen') {
    keygen(process.argv.includes('--force'));
  } else if (command === 'sign') {
    signCatalog();
  } else if (command === 'canonical') {
    console.log(canonicalText(JSON.parse(readFileSync(catalogPath, 'utf8'))));
  } else {
    console.error(`unknown command "${command}" (use keygen, sign or canonical)`);
    process.exit(1);
  }
}
