#!/usr/bin/env node
/**
 * tools/render-mid.mjs — render a .mid through OUR fmt-mid engine (the
 * tml.ts/tsf.ts ports) with the exact reference quantization, so the WAV
 * can be compared byte-for-byte with tools/midref.c output (cmp(1)).
 *
 * The float->s16 conversion is tsf_render_short's (tsf.h:1710), NOT
 * out-pcm's encodeWavStereo (round(x*32768)): the reference truncates
 * (int)(v * 32767.5f) with its own threshold clamps.
 *
 * Playback is driven exactly like reference/tinysoundfont/examples/
 * example3.c through midDsp: 64-sample blocks from sample 0.
 *
 * usage:
 *   node tools/render-mid.mjs <file.mid> <font.sf2> <out.wav> <frames> [rate] [gain-db]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const esbuild = (await import('esbuild')).default;

const bundle = resolve(repo, 'out/render-mid-bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(repo, 'packages/fmt-mid/src/index.ts')],
  bundle: true, platform: 'node', format: 'esm',
  outfile: bundle, logLevel: 'silent',
});
const m = await import('file://' + bundle);

const [midFile, sf2File, outFile, framesArg, rateArg, gainArg] = process.argv.slice(2);
if (!midFile || !sf2File || !outFile) {
  console.error('usage: node tools/render-mid.mjs <file.mid> <font.sf2> <out.wav> <frames> [rate] [gain-db]');
  process.exit(2);
}
const rate = Number(rateArg ?? 48000);
const gain = Number(gainArg ?? -10);
const totalFrames = Number(framesArg ?? 48000 * 15);

// tsf_render_short thresholds (float literals in tsf.h:1726/1733).
const F_THRES_LO = Math.fround(-1.00004566);
const F_THRES_HI = Math.fround(1.00001514);
const F_32767_5 = Math.fround(32767.5);
function toS16(v) {
  return v < F_THRES_LO ? -32768 : v > F_THRES_HI ? 32767 : Math.trunc(Math.fround(v * F_32767_5));
}

m.midSetSoundfont(new Uint8Array(readFileSync(sf2File)));
m.midStartTune(new Uint8Array(readFileSync(midFile)), rate, gain);

// Drive midDsp at 64 frames/call so the synth block cadence is exactly the
// example3.c loop (midDsp's FIFO keeps the cadence at any chunking, this
// just avoids pulling extra frames).
const core = { ticksize: 64 };
const out = new Float32Array(64 * 2);
const pcm = new Int16Array(totalFrames * 2);
for (let frames = 0; frames < totalFrames; ) {
  m.midDsp.renderFrame(core, out, 1);
  for (let i = 0; i < 64 * 2; i++) pcm[frames * 2 + i] = toS16(out[i]);
  frames += 64;
}

// WAV header (same layout as tools/midref.c / tools/xmpref.c)
const dataSize = totalFrames * 4;
const data = new Uint8Array(44 + dataSize);
const view = new DataView(data.buffer);
const ws = (off, s) => { for (let i = 0; i < s.length; i++) data[off + i] = s.charCodeAt(i); };
ws(0, 'RIFF');
view.setUint32(4, 36 + dataSize, true);
ws(8, 'WAVEfmt ');
view.setUint32(16, 16, true);
view.setInt16(20, 1, true);
view.setInt16(22, 2, true);
view.setUint32(24, rate, true);
view.setUint32(28, rate * 4, true);
view.setInt16(32, 4, true);
view.setInt16(34, 16, true);
ws(36, 'data');
view.setUint32(40, dataSize, true);
for (let i = 0; i < totalFrames * 2; i++) view.setInt16(44 + i * 2, pcm[i], true);
writeFileSync(outFile, data);
console.error(`rendered ${totalFrames} frames @ ${rate} Hz (gain ${gain} dB) -> ${outFile}`);
