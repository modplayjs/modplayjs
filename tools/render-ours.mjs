#!/usr/bin/env node
/**
 * tools/render-ours.mjs — render a module through OUR player to a 48 kHz
 * stereo s16 WAV, with the same options tools/xmpref.c gives the C
 * reference (play_buffer, 48 kHz, no loop cap), so the two WAVs can be
 * compared with cmp(1) for bit-exactness.
 *
 * usage:
 *   node tools/render-ours.mjs <module> <out.wav> [seconds] [mask]
 *
 *   seconds  stop after this many seconds (default: until the player ends)
 *   mask     channel mask, '1' = audible, e.g. 0100 (channel 1 only);
 *            matches tools/xmpchmask.c's mask argument
 *
 * The output is written with @modpayjs/out-pcm's encodeWavStereo, which
 * recovers the exact int16 PCM the mixer produced (out-pcm/src/pcm.ts).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const esbuild = (await import('esbuild')).default;

const aliasMap = Object.fromEntries(
  ['core', 'effects-shared', 'fmt-mod', 'fmt-s3m', 'fmt-xm', 'fmt-it',
   'dsp-paula', 'dsp-softmixer', 'fmt-prowizard', 'out-webaudio', 'out-pcm',
   'fmt-st', 'fmt-sid', 'fmt-mtm', 'fmt-stm', 'fmt-669', 'fmt-sfx', 'fmt-digi',
   'fmt-asylum', 'fmt-ice', 'fmt-med', 'fmt-mo3', 'fmt-fc', 'stb-vorbis',
   'stream-audio']
    .map(p => [`@modplayjs/${p}`, resolve(repo, `packages/${p}/src/index.ts`)]));

const bundle = resolve(repo, 'out/render-ours-bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(repo, 'tools/our-player-entry.mjs')],
  bundle: true, platform: 'node', format: 'esm',
  alias: aliasMap, outfile: bundle, logLevel: 'silent',
});
const m = await import('file://' + bundle);

const [file, outFile, secondsArg, maskArg] = process.argv.slice(2);
if (!file || !outFile) {
  console.error('usage: node tools/render-ours.mjs <module> <out.wav> [seconds] [mask]');
  process.exit(2);
}
const seconds = Number(secondsArg ?? 0) || 0;
const mask = maskArg ?? null;

const core = new m.CorePlayer();
for (const p of [m.modPlugin, m.hmnPlugin, m.fltPlugin, m.pwPlugin, m.s3mPlugin,
  m.xmPlugin, m.itPlugin, m.stPlugin, m.mtmPlugin, m.stmPlugin, m.s69Plugin,
  m.sfxPlugin, m.digiPlugin, m.asylumPlugin, m.icePlugin, m.medPlugin,
  m.mmd3Plugin, m.med2Plugin, m.med3Plugin, m.med4Plugin, m.mo3Plugin,
  m.fcPlugin, m.sidPlugin]) core.registries.registerFormat(p);
core.registries.registerEffect(m.fcEffect);
core.registries.registerDsp(m.createSoftMixerPlugin());
core.registries.registerDsp(m.sidDsp);

const path = resolve(repo, file);
const isSid = path.toLowerCase().endsWith('.sid');
core.loadModule(new Uint8Array(readFileSync(path)), {});
core.setSampleRate(48000);

if (isSid) {
  core.setDsp('sid');
  core.startPlayer();
  m.sidStartTune(new Uint8Array(readFileSync(path)), 48000, 1);
} else {
  core.setDsp('softmixer');
  core.startPlayer();
}

if (mask !== null && mask !== 'all') {
  for (let c = 0; c < core.module.chn; c++) {
    const keep = c < mask.length && mask[c] === '1';
    core.setChannelMute(c, !keep);
  }
}

// playBuffer() returns interleaved SAMPLES (2 per frame).
const capFrames = seconds ? Math.round(seconds * 48000) : Infinity;
const chunk = new Float32Array(48000);
const parts = [];
let frames = 0;
for (let i = 0; i < 1000000 && frames < capFrames; i++) {
  const n = core.playBuffer(chunk, chunk.length, 0);
  if (n <= 0) break;
  const take = Math.min(Math.floor(n / 2), capFrames - frames);
  parts.push(Float32Array.from(chunk.subarray(0, take * 2)));
  frames += take;
}
const pcm = new Float32Array(frames * 2);
let off = 0;
for (const part of parts) { pcm.set(part, off); off += part.length; }

writeFileSync(outFile, Buffer.from(m.encodeWavStereo(pcm, 48000)));
console.error(`rendered ${(frames / 48000).toFixed(3)}s (${frames} frames) -> ${outFile}`);
