// Bundle entry for the mixer-data harness: player + formats + a dump()
// that emits C's per-frame mixer-state lines.
export { CorePlayer } from '@modplayjs/core';
export { plugin as modPlugin } from '@modplayjs/fmt-mod';
export { plugin as s3mPlugin } from '@modplayjs/fmt-s3m';
export { plugin as xmPlugin } from '@modplayjs/fmt-xm';
export { plugin as itPlugin } from '@modplayjs/fmt-it';
export { createSoftMixerPlugin } from '@modplayjs/dsp-softmixer';

export function dumpMixerState(core, maxLines, maxTimeMs = Infinity) {
  const out = new Float32Array(core.ticksize * 2 + 4096);
  const lines = [];
  let ended = false;
  let maxRow = 0;
  for (let f = 0; lines.length < maxLines && !ended; f++) {
    if (core.playState.timeMs > maxTimeMs) break;
    // Stop at the first loop (row wraps back after having advanced)
    const row = core.playState.row;
    if (row < maxRow) break;
    if (row > maxRow) maxRow = row;
    let n = 0;
    try { n = core.frame(out.subarray(0, core.ticksize * 2)); } catch { break; }
    if (n <= 0) break;
    const ps = core.playState;
    for (let ch = 0; ch < core.channels; ch++) {
      const voc = core.virt.mapChannel(ch);
      if (voc < 0) continue;
      const v = core.virt.voiceAt(voc);
      // Skip idle voices (never played / one-shot dead): C's map_channel
      // returns < 0 for channels whose voice slot is FREE, so those lines
      // never appear in the golden dump.
      if (!v || v.smp < 0 || v.act === 0) continue;
      const xc = core._xc ? core._xc[ch] : null;
      // C skips channels with NOTE_SAMPLE_END
      const noteFlags = xc ? xc.note_flags : 0;
      if (noteFlags & 4) continue; // NOTE_SAMPLE_END
      lines.push(
        `${Math.round(ps.timeMs)} ${ps.row} ${ps.frame} ${ch} ` +
        `${Math.round(xc?.info_period ?? 0)} ${v.note} ${v.ins - 1} ${v.vol} ` +
        `${v.pan} ${Math.round(v.pos0 ?? 0)} ${v.filter?.cutoff ?? 255} ` +
        `${v.filter?.resonance ?? 0}`);
    }
  }
  return lines;
}
