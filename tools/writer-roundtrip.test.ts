// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Round-trip tests: ModuleData → writer bytes → own loader → compare.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// esbuild-bundle the loader + writer + core
const esbuild = (await import('esbuild')).default;
const aliasMap = Object.fromEntries(
  ['core', 'effects-shared', 'fmt-mod', 'fmt-s3m', 'fmt-xm', 'fmt-it', 'dsp-softmixer']
    .map(p => [`@modplayjs/${p}`, resolve(repo, `packages/${p}/src/index.ts`)]));
await esbuild.build({
  entryPoints: [resolve(repo, 'packages/core/src/index.ts')],
  bundle: true, platform: 'node', format: 'esm',
  alias: aliasMap, outfile: resolve(repo, 'out/rt-core.mjs'), logLevel: 'silent',
});
const coreMod = await import('file://' + resolve(repo, 'out/rt-core.mjs'));

// Re-load the source and apply loaders one at a time — simpler: import
// each package's src directly via esbuild per-format bundles.
async function bundle(entry: any, outfile: any) {
  await esbuild.build({
    entryPoints: [entry], bundle: true, platform: 'node', format: 'esm',
    alias: aliasMap, outfile, logLevel: 'silent',
  });
  return import('file://' + outfile);
}

const it = await bundle(resolve(repo, 'packages/fmt-it/src/index.ts'), resolve(repo, 'out/rt-it.mjs'));
const s3m = await bundle(resolve(repo, 'packages/fmt-s3m/src/index.ts'), resolve(repo, 'out/rt-s3m.mjs'));
const modp = await bundle(resolve(repo, 'packages/fmt-mod/src/index.ts'), resolve(repo, 'out/rt-mod.mjs'));
const xm = await bundle(resolve(repo, 'packages/fmt-xm/src/index.ts'), resolve(repo, 'out/rt-xm.mjs'));

// --- helper: full loader context runner ---
function fail(name: any, msg: any): never {
  console.error(`FAIL ${name}: ${msg}`);
  process.exit(1);
}

// --- IT round trip ---
{
  const name = 'IT';
  // build a small module in memory
  const mod = makeItModule();
  const bytes = it.itExportPlugin().write(mod);
  // load it back with the real loader
  const core = new coreMod.CorePlayer();
  core.registries.registerFormat(it.plugin);
  core.registries.registerDsp((await bundle(resolve(repo, 'packages/dsp-softmixer/src/index.ts'), resolve(repo, 'out/rt-dsp.mjs'))).createSoftMixerPlugin());
  try {
    core.loadModule(bytes);
  } catch (e) {
    fail(name, 're-load threw: ' + (e as Error).message);
  }
  const m = core.module!;
  if (m.title !== mod.title) fail(name, `title: ${m.title} != ${mod.title}`);
  if (m.chn !== mod.chn) fail(name, `chn: ${m.chn} != ${mod.chn}`);
  if (m.pat !== mod.pat) fail(name, `pat: ${m.pat} != ${mod.pat}`);
  if (m.len !== mod.len) fail(name, `len: ${m.len} != ${mod.len}`);
  // pattern content
  const e0 = m.patterns[0]!.tracks[0]!.event[0]!;
  if (e0.note !== mod.patterns[0]!.tracks[0]!.event[0]!.note) {
    fail(name, `note row0: ${e0.note} != ${mod.patterns[0]!.tracks[0]!.event[0]!.note}`);
  }
  // sample data
  const s = core.samples.get(0);
  if (s.length !== mod.samples[0]!.length) fail(name, 'sample length mismatch');
  console.log(`PASS ${name} round-trip (${bytes.length} bytes)`);
}

// --- S3M round trip ---
{
  const name = 'S3M';
  const mod = makeS3mModule();
  const bytes = s3m.s3mExportPlugin().write(mod);
  const core = new coreMod.CorePlayer();
  core.registries.registerFormat(s3m.plugin);
  try { core.loadModule(bytes); } catch (e) { fail(name, 're-load threw: ' + (e as Error).message); }
  const m = core.module!;
  if (m.chn !== mod.chn) fail(name, `chn: ${m.chn} != ${mod.chn}`);
  if (m.pat !== mod.pat) fail(name, `pat: ${m.pat} != ${mod.pat}`);
  console.log(`PASS ${name} round-trip (${bytes.length} bytes)`);
}

// --- MOD round trip ---
{
  const name = 'MOD';
  const mod = makeModModule();
  const bytes = modp.modExportPlugin().write(mod);
  const core = new coreMod.CorePlayer();
  core.registries.registerFormat(modp.plugin);
  try { core.loadModule(bytes); } catch (e) { fail(name, 're-load threw: ' + (e as Error).message); }
  const m = core.module!;
  const stripDots = (t: any): string => t.replace(/\.+$/, '');
  if (stripDots(m.title) !== stripDots(mod.title)) fail(name, `title: '${m.title}' != '${mod.title}'`);
  if (m.chn !== 4) fail(name, `chn: ${m.chn} != 4`);
  if (m.pat !== mod.pat) fail(name, `pat: ${m.pat} != ${mod.pat}`);
  const e0 = m.patterns[0]!.tracks[0]!.event[0]!;
  if (e0.ins !== mod.patterns[0]!.tracks[0]!.event[0]!.ins) fail(name, 'ins mismatch row0');
  console.log(`PASS ${name} round-trip (${bytes.length} bytes)`);
}

// --- XM round trip ---
{
  const name = 'XM';
  const mod = makeXmModule();
  const bytes = xm.xmExportPlugin().write(mod);
  const core = new coreMod.CorePlayer();
  core.registries.registerFormat(xm.plugin);
  try { core.loadModule(bytes); } catch (e) { fail(name, 're-load threw: ' + (e as Error).message); }
  const m = core.module!;
  if (m.chn !== mod.chn) fail(name, `chn: ${m.chn} != ${mod.chn}`);
  // libxmp's XM loader allocates one extra blank pattern (pat+1)
  if (m.pat !== mod.pat + 1) fail(name, `pat: ${m.pat} != ${mod.pat + 1}`);
  if (m.ins !== mod.ins) fail(name, `ins: ${m.ins} != ${mod.ins}`);
  const e0 = m.patterns[0]!.tracks[0]!.event[0]!;
  if (e0.note !== mod.patterns[0]!.tracks[0]!.event[0]!.note) fail(name, 'note mismatch row0');
  console.log(`PASS ${name} round-trip (${bytes.length} bytes)`);
}

console.log('all writer round-trips passed');

// ============================ fixtures ============================

function makeItModule() {
  const len = 2000;
  const data = new Uint8Array(len);
  for (let i = 0; i < len; i++) data[i] = 128 + Math.round(100 * Math.sin((i * 2 * Math.PI * 440) / 22050));
  return {
    title: 'rt test it', format: 'it' as const, comment: '', chn: 2, pat: 1, ins: 1,
    len: 1, restart: 0, xxo: [0],
    channels: [{ pan: 0x80, vol: 0x40, flg: 0 }, { pan: 0x40, vol: 0x40, flg: 0 }],
    patterns: [{
      rows: 4,
      tracks: [
        { rows: 4, event: [ev(61, 1, 33), ev(0, 0, 0), ev(63, 1, 40), ev(0, 0, 0)] },
        { rows: 4, event: [ev(0, 0, 0), ev(65, 1, 20), ev(0, 0, 0), ev(67, 1, 25)] },
      ],
    }],
    instruments: [mkIns('it ins', 1, 0)],
    samples: [mkSample('it sample', data, true)],
    num_sequences: 0, sequences: [], speed: 6, bpm: 125,
    volbase: 64, gvolbase: 128, gvol: 128, quirks: 0, flowMode: 0,
    readEventType: 3, periodType: 1, defpan: 128, time_factor: 10, rrate: 250, c4rate: 8363,
  } as unknown as Parameters<typeof it.itExportPlugin>[0] extends never ? never : any;
}

function makeS3mModule() {
  const len = 1500;
  const data = new Uint8Array(len).fill(200);
  return {
    title: 'rt test s3m', format: 's3m' as const, comment: '', chn: 4, pat: 1, ins: 1,
    len: 1, restart: 0, xxo: [0],
    channels: Array.from({ length: 4 }, () => ({ pan: 0x80, vol: 0x40, flg: 0 })),
    patterns: [{
      rows: 4,
      tracks: Array.from({ length: 4 }, () => ({
        rows: 4, event: [ev(61, 1, 33), ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0)],
      })),
    }],
    instruments: [mkIns('s3m ins', 1, 0)],
    samples: [mkSample('s3m sample', data, true)],
    num_sequences: 0, sequences: [], speed: 4, bpm: 125,
    volbase: 64, gvolbase: 64, gvol: 64, quirks: 0, flowMode: 0,
    readEventType: 2, periodType: 0, defpan: 128, time_factor: 10, rrate: 250, c4rate: 8363,
  } as any;
}

function makeModModule() {
  const len = 1000;
  const data = new Uint8Array(len).fill(180);
  return {
    title: 'rt test mod', format: 'mod' as const, comment: '', chn: 4, pat: 1, ins: 1,
    len: 1, restart: 0, xxo: [0],
    channels: Array.from({ length: 4 }, () => ({ pan: 0x80, vol: 0x40, flg: 0 })),
    patterns: [{
      rows: 4,
      tracks: [
        { rows: 4, event: [ev(61, 1, 33), ev(0, 0, 0), ev(63, 1, 40), ev(0, 0, 0)] },
        { rows: 4, event: [ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0)] },
        { rows: 4, event: [ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0)] },
        { rows: 4, event: [ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0)] },
      ],
    }],
    instruments: [mkIns('mod ins', 1, 0)],
    samples: [mkSample('mod sample', data, true)],
    num_sequences: 0, sequences: [], speed: 6, bpm: 125,
    volbase: 64, gvolbase: 128, gvol: 128, quirks: 0, flowMode: 0,
    readEventType: 0, periodType: 0, defpan: 128, time_factor: 10, rrate: 250, c4rate: 8287,
  } as any;
}

function makeXmModule() {
  const len = 1200;
  const data = new Uint8Array(len).fill(160);
  return {
    title: 'rt test xm', format: 'xm' as const, comment: '', chn: 4, pat: 1, ins: 1,
    len: 1, restart: 0, xxo: [0],
    channels: Array.from({ length: 4 }, () => ({ pan: 0x80, vol: 0x40, flg: 0 })),
    patterns: [{
      rows: 4,
      tracks: [
        { rows: 4, event: [ev(61, 1, 33), ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0)] },
        { rows: 4, event: [ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0)] },
        { rows: 4, event: [ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0)] },
        { rows: 4, event: [ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0), ev(0, 0, 0)] },
      ],
    }],
    instruments: [mkIns('xm ins', 1, 0)],
    samples: [mkSample('xm sample', data, false)],
    num_sequences: 0, sequences: [], speed: 6, bpm: 125,
    volbase: 64, gvolbase: 128, gvol: 128, quirks: 0, flowMode: 0,
    readEventType: 1, periodType: 1, defpan: 128, time_factor: 10, rrate: 250, c4rate: 8363,
  } as any;
}

function ev(note: number, ins: number, vol: number) {
  return { note, ins, vol, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
}

function mkIns(name: string, nsm: number, sid: number) {
  return {
    name, volume: 0x40, nsm, rls: 0,
    map: Array(121).fill(0), mapXpo: Array(121).fill(0),
    sub: nsm > 0 ? [{
      vol: 64, gvl: 64, pan: -1, xpo: 0, fin: 0, sid, nna: 0, dct: 0, dca: 0,
      ifc: 0, ifr: 0, rvv: 0, vwf: 0, vde: 0, vra: 0, vsw: 0,
    }] : [],
    aei: env0(), pei: env0(), fei: env0(),
    vwf: 0, vde: 0, vra: 0, vsw: 0, dca: 0, dct: 0, nna: 0,
  };
}

function env0() {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}

function mkSample(name: string, data: Uint8Array, loop: boolean) {
  return {
    name, data, length: data.length,
    loopStart: 0, loopEnd: loop ? data.length : 0,
    sustainStart: 0, sustainEnd: 0, finetune: 0, volume: 64,
    flags: loop ? 3 : 1, c5spd: 22050,
  };
}
