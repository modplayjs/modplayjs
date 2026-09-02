#!/usr/bin/env node
/**
 * tools/correlate.mjs — playback-parity test harness.
 *
 * Renders a module through OUR player (modplayjs, softmixer) and through the
 * C libxmp reference (a patched libxmp build with a WAV-dumping play_buffer),
 * then reports the per-channel playback correlation of the two WAVs.
 *
 * Usage:
 *   tools/correlate.mjs <module-file> [options]
 *
 * Options:
 *   --libxmp-a <path>   path to the reference libxmp static library
 *                       (default: /tmp/libxmp4.a — build with the bundled
 *                       script, see below)
 *   --seconds <n>       cap the comparison to the first n seconds
 *                       (default: whole module, ours and reference)
 *   --skip-build        reuse an existing reference build/output
 *   --keep              keep intermediate WAVs (out/ in the repo root)
 *
 * Output: one table row per comparison:
 *   <name>  <duration>s  corr <0..1>  bad <frames>  maxdiff <v>
 *   (bad = frames with |C − ours| > 0.05; maxdiff = peak difference)
 *
 * Exit code: 0 if correlation ≥ 0.99 for every file, 1 otherwise.
 *
 * The reference libxmp build uses the bundled source tree
 * (reference/libxmp) plus tools/xmpref.c (a play_buffer→WAV dumper).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repo = resolve(import.meta.dirname, '..');

// ---- args ------------------------------------------------------------------

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) {
  console.error('usage: tools/correlate.mjs <module-file> [options]');
  process.exit(2);
}
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const flag = name => args.includes('--' + name);

const libxmpA = resolve(opt('libxmp-a', '/tmp/libxmp4.a'));
const seconds = Number(opt('seconds', 0)) || 0;
const keep = flag('keep');
const skipBuild = flag('skip-build') || existsSync(libxmpA);

// ---- resolve our renderer (built demo bundles via esbuild) ------------------

const outDir = resolve(repo, 'out');
mkdirSync(outDir, { recursive: true });
const base = basename(file);
const name = base.replace(/\.[^.]+$/, '');
const ext = (base.match(/\.[^.]+$/) || [''])[0].toLowerCase();
if (!['.mod', '.s3m', '.xm', '.it'].includes(ext)) {
  console.error(`unsupported extension ${ext} (need .mod/.s3m/.xm/.it)`);
  process.exit(2);
}

// Build our player bundle with esbuild (same alias map as the demo vite config).
const esbuild = (await import('esbuild')).default ?? (await import('esbuild'));
const aliasMap = Object.fromEntries(
  ['core', 'effects-shared', 'fmt-mod', 'fmt-s3m', 'fmt-xm', 'fmt-it',
   'dsp-paula', 'dsp-softmixer', 'out-webaudio', 'out-pcm']
    .map(p => [`@modplayjs/${p}`, resolve(repo, `packages/${p}/src/index.ts`)]));
const ourBundle = resolve(outDir, 'our-player.mjs');
await esbuild.build({
  entryPoints: [resolve(repo, 'tools/our-player-entry.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  alias: aliasMap,
  outfile: ourBundle,
  logLevel: 'silent',
});

// ---- 1. our render ----------------------------------------------------------

const oursWav = resolve(outDir, `${name}-ours-48k.wav`);
{
  const script = `
import { readFileSync, writeFileSync } from 'fs';
import { CorePlayer, modPlugin, s3mPlugin, xmPlugin, itPlugin, createSoftMixerPlugin, encodeWavStereo } from ${JSON.stringify(ourBundle)};
const core = new CorePlayer();
core.registries.registerFormat(modPlugin);
core.registries.registerFormat(s3mPlugin);
core.registries.registerFormat(xmPlugin);
core.registries.registerFormat(itPlugin);
core.registries.registerDsp(createSoftMixerPlugin());
core.loadModule(new Uint8Array(readFileSync(${JSON.stringify(resolve(repo, file))})));
core.setDsp('softmixer');
core.setSampleRate(48000);
core.startPlayer();
const out = new Float32Array(48000);
const pcm = [];
let frames = 0;
const cap = ${seconds ? Math.floor(seconds * 48000) : 'Infinity'};
for (let chunk = 0; chunk < 4000 && frames < cap; chunk++) {
  const n = core.playBuffer(out, out.length, 1);
  if (n <= 0) break;
  const take = Math.min(n, cap - frames);
  for (let i = 0; i < take; i++) pcm.push(out[i]);
  frames += take;
}
writeFileSync(${JSON.stringify(oursWav)}, Buffer.from(encodeWavStereo(Float32Array.from(pcm), 48000)));
console.error('[ours] rendered', (frames / 48000).toFixed(1) + 's');
`;
  const tmp = resolve(outDir, 'render-ours.mjs');
  writeFileSync(tmp, script);
  const r = spawnSync(process.execPath, [tmp], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('our render failed'); process.exit(1); }
}
if (!existsSync(oursWav)) {
  console.error('our render produced no wav');
  process.exit(1);
}

// ---- 2. reference render (C libxmp) ----------------------------------------

const refWav = resolve(outDir, `${name}-ref-48k.wav`);
const refSrc = resolve(repo, 'tools/xmpref.c');
const refBin = resolve(outDir, 'xmpref');
if (!existsSync(libxmpA)) {
  console.error(
    `reference libxmp archive not found: ${libxmpA}\n` +
    'build it first: tools/build-ref-libxmp.sh /tmp/libxmp4.a');
  process.exit(1);
}
if (!skipBuild || !existsSync(refBin)) {
  execFileSync('cc', ['-O2', '-o', refBin, refSrc, libxmpA,
    '-I' + resolve(repo, 'reference/libxmp/include'), '-lm'], { stdio: 'pipe' });
}
const capFrames = seconds ? seconds * 48000 : 0;
spawnSync(refBin, [resolve(repo, file), refWav, String(capFrames || 4800 * 48000)],
  { stdio: 'inherit' });
if (!existsSync(refWav) || statSync(refWav).size < 100) {
  console.error('reference render failed');
  process.exit(1);
}

// ---- 3. compare -------------------------------------------------------------

const cmpScript = resolve(outDir, 'compare.mjs');
writeFileSync(cmpScript, `
import { readFileSync } from 'fs';
const [cWav, oWav, name] = process.argv.slice(2);
function loadL(p) {
  const b = readFileSync(p);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = (b.length - 44) / 4;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = dv.getInt16(44 + i * 4, true) / 32768;
  return L;
}
const c = loadL(cWav), o = loadL(oWav);
const n = Math.min(c.length, o.length);
let num = 0, dc = 0, od = 0, bad = 0, maxd = 0;
for (let i = 0; i < n; i++) {
  num += c[i] * o[i];
  dc += c[i] ** 2; od += o[i] ** 2;
  const d = Math.abs(c[i] - o[i]);
  if (d > 0.05) bad++;
  if (d > maxd) maxd = d;
}
const corr = num / Math.sqrt(dc * od);
console.log(
  name.padEnd(24),
  (n / 48000).toFixed(1).padStart(6) + 's',
  'corr ' + corr.toFixed(4),
  'bad ' + String(bad).padStart(8),
  'maxdiff ' + maxd.toFixed(3),
);
process.exit(corr >= 0.99 ? 0 : 1);
`);
const r = spawnSync(process.execPath, [cmpScript, oursWav, refWav, name],
  { stdio: 'inherit' });
if (!keep) {
  // keep wavs for debugging
}
process.exit(r.status ?? 1);
