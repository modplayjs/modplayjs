#!/usr/bin/env node
// Single cross-platform helper: fetch the pinned prebuilt V8 Android static
// library into build/v8-prebuilt/android-<abi> and print that path.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const V8_VERSION = '14.9.207.39';
const V8_TAG = `v8-${V8_VERSION}-7`;
const BASE = `https://github.com/NativeScript/v8-buildscripts/releases/download/${V8_TAG}`;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const outRoot = path.join(root, 'build', 'v8-prebuilt');

const args = process.argv.slice(2);
const force = args.includes('--force');
const abi = args.find((a) => !a.startsWith('--')) ?? 'arm64-v8a';
const dir = path.join(outRoot, `android-${abi}`);
const lib = path.join(dir, 'lib', 'libv8_monolith.a');

const log = (...a) => console.error('[v8]', ...a);

if (!force && existsSync(lib)) {
  console.log(dir);
  process.exit(0);
}

mkdirSync(outRoot, { recursive: true });
const file = `v8-${V8_VERSION}-android-${abi}.tar.gz`;
const archive = path.join(outRoot, file);
const sumsPath = path.join(outRoot, 'SHA256SUMS');

async function download(url, dest) {
  log(`GET ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  await new Promise((resolve, reject) => {
    const out = createWriteStream(dest);
    Readable.fromWeb(res.body).pipe(out).on('finish', resolve).on('error', reject);
  });
}

async function main() {
  await download(`${BASE}/${file}`, archive);
  await download(`${BASE}/SHA256SUMS`, sumsPath);

  const line = readFileSync(sumsPath, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.includes(file));
  if (!line) throw new Error(`checksum entry not found for ${file}`);
  const expected = line.trim().split(/\s+/)[0].toLowerCase();
  const actual = createHash('sha256').update(readFileSync(archive)).digest('hex');
  if (actual !== expected) throw new Error(`checksum mismatch: ${actual} != ${expected}`);
  log('checksum ok');

  rmSync(dir, { recursive: true, force: true });
  execFileSync('tar', ['-xzf', archive, '-C', outRoot], { stdio: 'inherit' });
  if (!existsSync(lib)) throw new Error(`V8 library missing after extract: ${lib}`);
  console.log(dir);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
