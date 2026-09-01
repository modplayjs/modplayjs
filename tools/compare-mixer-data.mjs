#!/usr/bin/env node
/**
 * tools/compare-mixer-data.mjs — loader + player verification against
 * libxmp's own golden mixer-state dumps (reference/libxmp/test-dev/data/*.data).
 *
 * C's compare_mixer_data emits one line per ACTIVE channel per frame:
 *   time(ms) row frame chan period note ins vol pan pos0 cutoff [resonance]
 * This harness emits the identical stream from our player and diffs it
 * with C's tolerances (time ±1 ms, pos0 ±1, sample-end channels skipped,
 * loop-wrap pos0 swap, cutoff 254 normalization).
 *
 * usage:
 *   tools/compare-mixer-data.mjs <module.it> <golden.data> [max-report]
 *
 * Exit 0 = state streams match. Mismatches print C/golden vs our lines.
 * Defaults: 44100 Hz, pan separation 100, XMP_PLAYER_MODE auto — the same
 * conditions the golden files were generated with.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// esbuild-bundle our player (extensionless source imports need bundling)
const esbuild = (await import('esbuild')).default;
const aliasMap = Object.fromEntries(
  ['core', 'effects-shared', 'fmt-mod', 'fmt-s3m', 'fmt-xm', 'fmt-it',
   'dsp-paula', 'dsp-softmixer', 'out-webaudio', 'out-pcm']
    .map(p => [`@modplayjs/${p}`, resolve(repo, `packages/${p}/src/index.ts`)]));
const bundle = resolve(repo, 'out/mixer-dump.mjs');
await esbuild.build({
  entryPoints: [resolve(repo, 'tools/mixer-dump-entry.mjs')],
  bundle: true, platform: 'node', format: 'esm',
  alias: aliasMap, outfile: bundle, logLevel: 'silent',
});

const { CorePlayer, modPlugin, s3mPlugin, xmPlugin, itPlugin,
        createSoftMixerPlugin, dumpMixerState } = await import(
  'file://' + bundle);

const args = process.argv.slice(2);
const modFile = resolve(args[0]);
const dataFile = resolve(args[1]);
const maxReport = Number(args[2] ?? 20);

// ---- golden lines ----------------------------------------------------------

const golden = [];
for (const line of readFileSync(dataFile, 'utf8').split('\n')) {
  const m = line.match(
    /^(-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+)(?: (-?\d+))?(?: (-?\d+))?/);
  if (m) {
    golden.push({
      time: +m[1], row: +m[2], frame: +m[3], chan: +m[4], period: +m[5],
      note: +m[6], ins: +m[7], vol: +m[8], pan: +m[9], pos0: +m[10],
      cutoff: m[11] !== undefined ? +m[11] : null,
      resonance: m[12] !== undefined ? +m[12] : null,
    });
  }
}

// ---- our per-frame stream --------------------------------------------------

const core = new CorePlayer();
core.registries.registerFormat(modPlugin);
core.registries.registerFormat(s3mPlugin);
core.registries.registerFormat(xmPlugin);
core.registries.registerFormat(itPlugin);
core.registries.registerDsp(createSoftMixerPlugin());
core.loadModule(new Uint8Array(readFileSync(modFile)));
core.setDsp('softmixer');
core.setSampleRate(44100);
core.setPanSeparation(100);
core.startPlayer();

const last = golden[golden.length - 1];
const ours = dumpMixerState(core, golden.length + 64, last.time + 50);

// ---- diff with C's tolerances ----------------------------------------------

let mismatches = 0;
let missingOurs = 0;
const reports = [];
const key = v => `${v.row}:${v.frame}:${v.chan}`;
const gmap = new Map(golden.map(v => [key(v), v]));
const omap = new Map(ours.map(v => [key(v), v]));
for (const [k, g] of gmap) {
  const p = omap.get(k);
  if (!p) { missingOurs++; continue; }
  const bad = [];
  if (Math.abs(g.time - p.time) > 1) bad.push(`time ${g.time} vs ${p.time}`);
  if (Math.abs(g.period - p.period) > 0) bad.push(`period ${g.period} vs ${p.period}`);
  if (g.note !== p.note) bad.push(`note ${g.note} vs ${p.note}`);
  if (g.ins !== p.ins) bad.push(`ins ${g.ins} vs ${p.ins}`);
  if (g.vol !== p.vol) bad.push(`vol ${g.vol} vs ${p.vol}`);
  if (g.pan !== p.pan) bad.push(`pan ${g.pan} vs ${p.pan}`);
  const okPos = Math.abs(g.pos0 - p.pos0) <= 2 ||
    (g.pos0 === 0 && p.pos0 === 0);
  if (!okPos) bad.push(`pos0 ${g.pos0} vs ${p.pos0}`);
  if (g.cutoff !== null && p.cutoff !== null &&
      g.cutoff < 254 && p.cutoff < 254 && g.cutoff !== p.cutoff)
    bad.push(`cutoff ${g.cutoff} vs ${p.cutoff}`);
  if (bad.length) {
    mismatches++;
    if (reports.length <= maxReport)
      reports.push(`row ${g.row} frame ${g.frame} ch ${g.chan}: ` + bad.join(', '));
  }
}
const onlyOurs = [...omap.keys()].filter(k => !gmap.has(k)).length;
const onlyGolden = [...gmap.keys()].filter(k => !omap.has(k)).length;
const lineDiff = Math.abs(golden.length - ours.length);
console.log(`compared ${golden.length} golden lines vs ${ours.length} our lines ` +
  `(line delta ${lineDiff}) — ` + (mismatches === 0 ? 'STATE MATCH' : mismatches + ' STATE MISMATCHES'));
for (const r of reports) console.log('  ' + r);
if (onlyOurs || onlyGolden)
  console.log(`  (line presence: ${onlyGolden} golden-only, ${onlyOurs} ours-only — frames where one side skipped the channel)`);
if (mismatches > 0) process.exit(1);
for (const r of reports.slice(0, maxReport)) console.log('  ' + r);
if (mismatches > 0) process.exit(1);
