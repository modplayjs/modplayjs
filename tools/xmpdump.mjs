#!/usr/bin/env node
/**
 * tools/xmpdump.mjs — our-loader ModuleData dumper, mirrors tools xmpdump.c
 * (C libxmp) line-for-line so the two can be diffed directly:
 *
 *   xmpdump <module>            (C)   > a.dump
 *   node tools/xmpdump.mjs <module>   > b.dump
 *   diff a.dump b.dump
 *
 * Field mapping notes:
 * - C's sub.pan is 0x00-0xff with XMP_INST_NO_DEFAULT_PAN = 0xffff; ours
 *   stores -1 for NO_DEFAULT_PAN — normalized here to 0xffff to match C's
 *   %04x print. (C's dump of 0xffff is "ffff" — 4 chars, not 8.)
 * - C's m.defpan is a context default (control.c:42, defpan=100) consumed in
 *   libxmp_load_prologue's LRLR pan fill; our loaders bake that result into
 *   mod.channels directly and store 0x80. Reported identically (100).
 * - C's xmp_sample data is int8/int16 PCM; ours is normalized Float32 in the
 *   SampleStore. The sample FNV is computed over the store's SampleData
 *   re-encoded to C's storage format (8-bit signed / 16-bit LE).
 * - Sample flags: C XMP_SAMPLE_* vs our SampleFlags — same bit layout.
 */
const noPan = (pan) => (pan < 0 ? 0xffffffff : pan);

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = (await import('esbuild')).default;
const aliasMap = Object.fromEntries(
  ['core', 'effects-shared', 'fmt-mod', 'fmt-s3m', 'fmt-xm', 'fmt-it']
    .map(p => [`@modplayjs/${p}`, resolve(repo, `packages/${p}/src/index.ts`)]));
const bundle = resolve(repo, 'out/xmpdump-core.mjs');
await esbuild.build({
  entryPoints: [resolve(repo, 'tools/xmpdump-entry.mjs')],
  bundle: true, platform: 'node', format: 'esm',
  alias: aliasMap, outfile: bundle, logLevel: 'silent',
});
const { CorePlayer, modPlugin, s3mPlugin, xmPlugin, itPlugin } = await import(
  'file://' + bundle);

const file = resolve(process.argv[2]);
const bytes = readFileSync(file);

const core = new CorePlayer();
core.registries.registerFormat(modPlugin);
core.registries.registerFormat(s3mPlugin);
core.registries.registerFormat(xmPlugin);
core.registries.registerFormat(itPlugin);
core.loadModule(new Uint8Array(bytes));

const mod = core.module;
const store = core.samples;
const out = [];


out.push(`TYPE ${mod.tracker}`);
out.push(`TITLE ${mod.title}`);
out.push(`H len=${mod.len} chn=${mod.chn} pat=${mod.pat} ins=${mod.ins} smp=${mod.samples.length} spd=${mod.speed} bpm=${mod.bpm} rst=${mod.restart} gvl=${mod.gvol}`);
out.push(`M mvolbase=${mod.mvolbase ?? 0} mvol=${mod.mvol ?? 0} gvolbase=${mod.gvolbase} gvol=${mod.gvol} volbase=${mod.volbase} c4rate=${mod.c4rate} quirk=${(mod.quirks >>> 0).toString(16).padStart(8, '0')} flow=${(mod.flowMode >>> 0).toString(16).padStart(8, '0')} readev=${mod.readEventType} period=${mod.periodType} defpan=100 smpctl=0`);
out.push(`COMMENT ${mod.comment}`);

for (let i = 0; i < mod.len; i++) out.push(`ORD ${i} ${mod.xxo[i].toString(16).padStart(2, '0')}`);
for (let i = 0; i < mod.chn; i++) out.push(`CHN ${i} pan=${mod.channels[i].pan.toString(16).padStart(4, '0')} vol=${mod.channels[i].vol}`);

for (let i = 0; i < mod.ins; i++) {
  const ins = mod.instruments[i];
  out.push(`INS ${i} name=${ins.name} nsm=${ins.nsm} vol=${ins.volume} rls=${ins.rls}`);
  for (let k = 0; k < 121; k++) {
    if (ins.map[k] !== 0 || ins.mapXpo[k] !== 0)
      out.push(`INSMAP ${i} ${k} ins=${ins.map[k]} xpo=${ins.mapXpo[k]}`);
  }
  for (const [tag, env] of [['aei', ins.aei], ['pei', ins.pei], ['fei', ins.fei]]) {
    out.push(`ENV ${tag} flg=${env.flags.toString(16).padStart(2, '0')} npt=${env.npt} scl=${env.scl} sus=${env.sus} sue=${env.sue} lps=${env.lps} lpe=${env.lpe}`);
    for (let p = 0; p < env.npt; p++) out.push(`ENVPT ${tag} ${env.x[p]} ${env.y[p]}`);
  }
  for (let j = 0; j < ins.nsm && j < ins.sub.length; j++) {
    const sub = ins.sub[j];
    out.push(`SUB ${i}/${j} vol=${sub.vol} gvl=${sub.gvl} pan=${(noPan(sub.pan) >>> 0).toString(16).padStart(8, '0')} xpo=${sub.xpo} fin=${sub.fin} sid=${sub.sid} ifc=${sub.ifc} ifr=${sub.ifr} vwf=${sub.vwf} vde=${sub.vde} vra=${sub.vra} vsw=${sub.vsw} rvv=${sub.rvv} nna=${sub.nna} dct=${sub.dct} dca=${sub.dca}`);
  }
}

// Samples: C dumps xxs (len/lps/lpe/flg) + xtra (sus/sue) + FNV over the
// CONVERTED PCM in xxs->data (8-bit signed, or 16-bit LE; stereo interleaved
// post-load). Our store keeps Float32; re-encode exactly as samples.ts
// normalized (v/32768 and v/128 — lossless for the values produced).
for (let i = 0; i < mod.samples.length; i++) {
  const s = store.get(i);
  const is16 = (s.flags & 0x01) !== 0; // SampleFlags.BITS16 = 1 << 0
  const stereo = (s.flags & 0x80) !== 0; // SampleFlags.STEREO
  const frames = s.length * (stereo ? 2 : 1); // interleaved sample values
  const bytes = new Uint8Array(frames * (is16 ? 2 : 1));
  if (is16) {
    const dv = new DataView(bytes.buffer);
    for (let k = 0; k < frames; k++) dv.setInt16(k * 2, Math.round(s.data[k] * 32768), true);
  } else {
    for (let k = 0; k < frames; k++) bytes[k] = Math.round(s.data[k] * 128) & 0xff;
  }
  // C's unsigned long is 64-bit: FNV-1a accumulates mod 2^64.
  const M64 = (1n << 64n) - 1n;
  let h = 2166136261n;
  for (let k = 0; k < bytes.length; k++) { h ^= BigInt(bytes[k]); h = (h * 16777619n) & M64; }
  out.push(`SMP ${i} name=${s.name} len=${s.length} lps=${s.loopStart} lpe=${s.loopEnd} flg=${(s.flags & 0xff).toString(16).padStart(2, '0')} fnv=${h.toString(16).padStart(16, '0')}`);
  out.push(`SMPX ${i} sus=${s.sustainStart} sue=${s.sustainEnd}`);
}
for (let i = 0; i < mod.pat; i++) {
  const pat = mod.patterns[i];
  out.push(`PAT ${i} rows=${pat.rows}`);
  for (let r = 0; r < pat.rows; r++) {
    for (let c = 0; c < mod.chn; c++) {
      const e = pat.tracks[c]?.event[r];
      if (e && (e.note || e.ins || e.vol || e.fxt || e.fxp || e.f2t || e.f2p)) {
        const h2 = (v) => v.toString(16).padStart(2, '0');
        out.push(`EV ${i} ${r} ${c} n=${h2(e.note)} i=${h2(e.ins)} v=${h2(e.vol)} f=${h2(e.fxt)} p=${h2(e.fxp)} f2=${h2(e.f2t)} p2=${h2(e.f2p)}`);
      }
    }
  }
}

console.log(out.join('\n'));
