export { pwCheck, pwWizardry, pwFormats, type PwFormat } from './prowiz.js';
export { loadDepackedMod } from '@modplayjs/fmt-mod';
export { CorePlayer } from '@modplayjs/core';
import { pwWizardry } from './prowiz.js';
import { loadDepackedMod } from '@modplayjs/fmt-mod';

/** Depack + parse; returns a compact ModuleData summary for golden diffs. */
export function depackModule(bytes, name) {
  const nameBox = {};
  const depacked = pwWizardry(bytes, 0, nameBox);
  const shimCtx = { sampleRate: 44100, outputRate: 44100, addSample: () => 0 };
  const mod = loadDepackedMod(depacked, shimCtx, nameBox.name ?? name);
  return {
    type: mod.tracker,
    title: mod.title,
    header: [mod.pat, mod.chn * mod.pat, mod.chn, mod.ins, mod.samples.length, mod.speed, mod.bpm, mod.len, mod.restart, mod.gvol].join(' '),
    xxo: mod.xxo.join(' '),
    ins: mod.instruments.map(x => `${x.volume} ${x.nsm} ${x.rls} ${x.name}`),
    smp: mod.samples.map(s => `${s.length} ${s.loopStart} ${s.loopEnd} ${s.flags.toString(16)}`),
    ev: mod.patterns.flatMap((p, i) => p.tracks.flatMap((t, c) =>
      t.event.flatMap((e, r) => (e.note || e.ins || e.vol || e.fxt || e.fxp || e.f2t || e.f2p)
        ? [`${i} ${r} ${c} ${e.note} ${e.ins} ${e.vol} ${e.fxt} ${e.fxp} ${e.f2t} ${e.f2p}`] : []))),
  };
}
