// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// End-to-end check for @modplayjs/playhead against the REAL player.
//
// Renders a module tick by tick to build ground truth (which row sounds at
// every output frame), then replays the same render through the playhead
// the way out-webaudio drives it — one mark per playBuffer pull, queried
// while the stream advances against a sink that is `depth` frames behind —
// and reports the row error in rows at several pipeline depths.
//
//   node tools/playhead-sync.mjs "testfiles/<module>" [seconds]

import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const repo = resolve(import.meta.dirname, '..');
const esbuild = (await import('esbuild')).default;
const PACKAGES = [
  'core', 'effects-shared', 'fmt-mod', 'fmt-s3m', 'fmt-xm', 'fmt-it', 'dsp-paula',
  'dsp-softmixer', 'fmt-prowizard', 'out-webaudio', 'out-pcm', 'fmt-st', 'fmt-sid',
  'fmt-mtm', 'fmt-stm', 'fmt-669', 'fmt-sfx', 'fmt-digi', 'fmt-asylum', 'fmt-ice',
  'fmt-med', 'fmt-mo3', 'fmt-fc', 'stb-vorbis', 'stream-audio', 'playhead',
];
const alias = Object.fromEntries(
  PACKAGES.map((p) => [`@modplayjs/${p}`, resolve(repo, `packages/${p}/src/index.ts`)]),
);
await esbuild.build({
  entryPoints: [resolve(import.meta.dirname, 'playhead-sync-entry.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  alias,
  outfile: '/tmp/opencode/playhead-sync.mjs',
  logLevel: 'silent',
});
const m = await import('file:///tmp/opencode/playhead-sync.mjs?' + Date.now());

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error('usage: node tools/playhead-sync.mjs <module> [seconds]');
  process.exit(2);
}
const seconds = Number(process.argv[3] || 20);
const bytes = new Uint8Array(readFileSync(file));
const RATE = 48000;

function makeCore() {
  const c = new m.CorePlayer();
  for (const p of [m.modPlugin, m.hmnPlugin, m.fltPlugin, m.pwPlugin, m.s3mPlugin,
    m.xmPlugin, m.itPlugin, m.stPlugin, m.mtmPlugin, m.stmPlugin, m.s69Plugin,
    m.sfxPlugin, m.digiPlugin, m.asylumPlugin, m.icePlugin, m.medPlugin,
    m.mmd3Plugin, m.med2Plugin, m.med3Plugin, m.med4Plugin, m.mo3Plugin,
    m.fcPlugin]) c.registries.registerFormat(p);
  c.registries.registerDsp(m.createSoftMixerPlugin());
  c.setSampleRate(RATE);
  c.loadModule(bytes);
  c.setDsp('softmixer');
  c.startPlayer();
  return c;
}

// ---- ground truth: one tick at a time --------------------------------
const at = []; // tick-end frame
const truth = []; // { ord, row } sounding during that tick
{
  const c = makeCore();
  const buf = new Float32Array(8192);
  let frame = 0;
  while (frame < seconds * RATE) {
    const n = c.frame(buf);
    if (n <= 0) break;
    frame += n / 2;
    const ps = c.playState;
    at.push(frame);
    truth.push({ ord: ps.ord, row: ps.row });
  }
}
if (at.length < 50) {
  console.error('module too short / render failed');
  process.exit(1);
}

/** Row sounding at the moment `f` frames have been played: the newest
 *  played frame is `f − 1`, which belongs to the first tick whose end frame
 *  is `>= f`. */
function truthAt(f) {
  let lo = 0;
  let hi = at.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at[mid] < f) lo = mid + 1;
    else hi = mid;
  }
  return truth[lo];
}

/** Row error, treating an order change as a full-pattern miss. */
function rowError(got, want) {
  if (got.ord !== want.ord) return 64;
  return Math.abs(got.row - want.row);
}

// ---- same render, marked per playBuffer pull ------------------------
const core = makeCore();
const PULL = 2048; // out-webaudio CHUNK_FRAMES
const ph = new m.Playhead({ rate: RATE });
const scratch = new Float32Array(PULL * 2 * 4);
const depthsMs = [0, 20, 50, 120, 300, 680];
const stats = depthsMs.map(() => ({ n: 0, exact: 0, sum: 0, worst: 0 }));
let written = 0;
let t = 0;
let pulls = 0;
const lastFrame = at[at.length - 1];
while (written < lastFrame) {
  const n = core.playBuffer(scratch, PULL * 2, 0);
  if (n <= 0) break;
  written += n / 2;
  t += (n / 2 / RATE) * 1000;
  ph.setRate(RATE);
  ph.mark(written, core.playState, t);
  pulls++;
  if (pulls % 7 !== 0) continue;
  // Probe every depth at this instant, as a UI at 60 fps would.
  for (let d = 0; d < depthsMs.length; d++) {
    const depth = (depthsMs[d] * RATE) / 1000;
    const consumed = Math.max(0, written - depth);
    ph.setConsumedProvider(() => consumed);
    const ap = ph.positionAt(t);
    if (!ap) continue;
    const err = rowError(ap, truthAt(consumed));
    const s = stats[d];
    s.n++;
    s.sum += err;
    if (err === 0) s.exact++;
    if (err > s.worst) s.worst = err;
  }
}

console.log(
  `rendered  ${(lastFrame / RATE).toFixed(1)}s, ${at.length} ticks, ${written} frames, ${pulls} pulls`,
);
for (let d = 0; d < depthsMs.length; d++) {
  const s = stats[d];
  if (s.n === 0) continue;
  const pct = ((s.exact / s.n) * 100).toFixed(1);
  const mean = (s.sum / s.n).toFixed(3);
  console.log(
    `depth ${String(depthsMs[d]).padStart(4)}ms: ${String(s.n).padStart(4)} probes  ` +
      `exact ${pct.padStart(5)}%  mean ${mean}  worst ${s.worst} row(s)`,
  );
}

// Baseline for the same probes: what the UI used to show (the RENDER head
// position, i.e. `core.playState` at query time). Reported as how many rows
// AHEAD of the audible row it is (positive = highlight runs early).
{
  const depth = (depthsMs[depthsMs.length - 1] * RATE) / 1000;
  let n = 0;
  let early = 0;
  let sum = 0;
  let worst = 0;
  let written2 = 0;
  let pulls2 = 0;
  const core3 = makeCore();
  const buf = new Float32Array(PULL * 2 * 4);
  while (written2 < lastFrame) {
    const k = core3.playBuffer(buf, PULL * 2, 0);
    if (k <= 0) break;
    written2 += k / 2;
    pulls2++;
    if (pulls2 % 7 !== 0) continue;
    const consumed = Math.max(0, written2 - depth);
    const want = truthAt(consumed);
    const got = core3.playState;
    n++;
    if (got.ord !== want.ord) continue;
    const lead = got.row - want.row;
    sum += lead;
    if (lead > 0) early++;
    if (lead > worst) worst = lead;
  }
  console.log(
    `naive ${String(depthsMs[depthsMs.length - 1]).padStart(4)}ms: ${String(n).padStart(4)} probes  ` +
      `mean ${(sum / Math.max(1, early)).toFixed(2)} rows early, ` +
      `worst ${worst}  (ord-change probes excluded)   ← before this change`,
  );
}
