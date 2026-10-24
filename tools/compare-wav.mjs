#!/usr/bin/env node
/**
 * tools/compare-wav.mjs — bit-compare two 16-bit PCM WAV files and report
 * exactly where they differ.
 *
 * usage: node tools/compare-wav.mjs <a.wav> <b.wav> [maxRuns]
 *
 * Prints: frame counts, differing frame count, first difference (frame and
 * time), peak sample difference, which channel(s) differ, and the first few
 * contiguous runs of differing frames.
 */
import { readFileSync } from 'node:fs';

function load(path) {
  const b = readFileSync(path);
  let off = 12, fmt = null, dataOff = 0, dataLen = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const sz = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = b.subarray(off + 8, off + 8 + sz);
    if (id === 'data') { dataOff = off + 8; dataLen = sz; break; }
    off += 8 + sz + (sz & 1);
  }
  if (!fmt) throw new Error(`no fmt chunk in ${path}`);
  const channels = fmt.readUInt16LE(2);
  const bits = fmt.readUInt16LE(14);
  if (bits !== 16) throw new Error(`only 16-bit PCM supported (${bits})`);
  return { b, dataOff, frames: Math.floor(dataLen / (channels * 2)), rate: fmt.readUInt32LE(4), channels };
}

const A = load(process.argv[2]);
const B = load(process.argv[3]);
const maxRuns = Number(process.argv[4] ?? 8);
const n = Math.min(A.frames, B.frames);

let firstFrame = -1, diffFrames = 0, maxAbs = 0, diffL = 0, diffR = 0;
const runs = [];
let cur = null;
for (let f = 0; f < n; f++) {
  const ia = A.dataOff + f * 4, ib = B.dataOff + f * 4;
  const dl = Math.abs(A.b.readInt16LE(ia) - B.b.readInt16LE(ib));
  const dr = Math.abs(A.b.readInt16LE(ia + 2) - B.b.readInt16LE(ib + 2));
  if (dl) diffL++;
  if (dr) diffR++;
  const d = Math.max(dl, dr);
  if (d === 0) { if (cur) { runs.push(cur); cur = null; } continue; }
  diffFrames++;
  if (firstFrame < 0) firstFrame = f;
  if (d > maxAbs) maxAbs = d;
  if (cur && f === cur.end + 1) cur.end = f;
  else { if (cur) runs.push(cur); cur = { start: f, end: f }; }
}
if (cur) runs.push(cur);

console.log(`A frames ${A.frames}  B frames ${B.frames}  compared ${n}`);
console.log(`identical frames ${n - diffFrames}  differing ${diffFrames}` +
  (firstFrame >= 0 ? `  first ${firstFrame} (t=${(firstFrame / A.rate).toFixed(4)}s)` : ''));
console.log(`peak |diff| ${maxAbs}   differing frames L ${diffL} R ${diffR}   runs ${runs.length}`);
for (const r of runs.slice(0, maxRuns)) {
  console.log(`  run t=${(r.start / A.rate).toFixed(4)}..${(r.end / A.rate).toFixed(4)}s frames=${r.end - r.start + 1}`);
}
process.exit(diffFrames === 0 ? 0 : 1);
