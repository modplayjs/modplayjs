// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/sfx_load.c (sfx_test :39-53,
// sfx_13_20_load :96-258, sfx_translate_effect :66-94, sfx_load :260-265).
//
// Reverse engineered from Delitracker mods disk + Future Wars / Twinworld /
// Operation Stealth music (C header comment). SoundFX 2.0 = 1.3 with 31
// samples instead of 15 (ExoticRipper docs).

import type { Core, FormatPlugin, LoadCtx, ModuleData } from '@modplayjs/core';
import type { Channel, Event, Instrument, Pattern, RawSample, SubInstrument } from '@modplayjs/core';
import { SampleFlags } from '@modplayjs/core';
import { LSN, MSN, PERIOD_BASE, EMPTY_EVENT } from '@modplayjs/core';
import { ParseError } from '@modplayjs/core';
import {
  FX_ARPEGGIO,
  FX_PORTA_DN,
  FX_PORTA_UP,
  FX_PITCH_ADD,
  FX_PITCH_SUB,
  FX_VOL_ADD,
  FX_VOL_SUB,
} from '@modplayjs/core';
import { Quirk } from '@modplayjs/core';
import { readEventMod } from '@modplayjs/fmt-mod';

/** MAGIC_SONG (sfx_load.c:24). */
const MAGIC_SONG = 0x534f4e47; // 'SONG'

/** libxmp_period_to_note (period.c:213-220). */
function periodToNote(p: number): number {
  if (p <= 0) return 0;
  return Math.round(12.0 * Math.log(PERIOD_BASE / p) / Math.LN2) + 1;
}

/** Zeroed envelope (libxmp_init_instrument calloc semantics). */
function zeroEnvelope(): Instrument['aei'] {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}

function zeroInstrument(name: string, sub: SubInstrument[]): Instrument {
  return {
    name,
    volume: 0x40,
    nsm: 0,
    rls: 0,
    map: new Array<number>(121).fill(0),
    mapXpo: new Array<number>(121).fill(0),
    sub,
    aei: zeroEnvelope(),
    fei: zeroEnvelope(),
    pei: zeroEnvelope(),
  };
}

/** libxmp_copy_adjust (common.c:237-253): printable ASCII, trim. */
function copyAdjust(r: Uint8Array, n: number): string {
  let s = '';
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i]!;
    s += c > 127 || c < 0x20 || c === 0x7f ? ' ' : String.fromCharCode(c);
  }
  return s.replace(/ +$/, '');
}

/** readmem32b (dataio.c:190-198) — big-endian. */
function readmem32b(m: Uint8Array, off: number): number {
  return ((m[off]! << 24) | (m[off + 1]! << 16) | (m[off + 2]! << 8) | m[off + 3]!) >>> 0;
}

/** readmem16b (dataio.c:168-175) — big-endian. */
function readmem16b(m: Uint8Array, off: number): number {
  return (m[off]! << 8) | m[off + 1]!;
}

// ---------------------------------------------------------------------------
// sfx_test (sfx_load.c:39-53): 'SONG' at 4*15+4 or 4*31+4.
// ---------------------------------------------------------------------------

export function sfxTest(bytes: Uint8Array): boolean {
  if (bytes.length < 136) return false;
  const a = readmem32b(bytes, 4 * 15);
  const b = readmem32b(bytes, 4 * 31);
  return a === MAGIC_SONG || b === MAGIC_SONG;
}

// ---------------------------------------------------------------------------
// sfx_translate_effect (sfx_load.c:66-94)
// ---------------------------------------------------------------------------

function sfxTranslateEffect(e: Event, fxt: number, fxp: number): void {
  e.fxp = fxp;

  switch (fxt) {
    case 0x01: // Arpeggio
      e.fxt = FX_ARPEGGIO;
      break;
    case 0x02: // Pitch bend
      if (e.fxp >> 4) {
        e.fxt = FX_PORTA_DN;
        e.fxp >>= 4;
      } else if (e.fxp & 0x0f) {
        e.fxt = FX_PORTA_UP;
        e.fxp &= 0x0f;
      }
      break;
    case 0x5: // Add to volume
      e.fxt = FX_VOL_ADD;
      break;
    case 0x6: // Subtract from volume
      e.fxt = FX_VOL_SUB;
      break;
    case 0x7: // Add semitones to period
      e.fxt = FX_PITCH_ADD;
      break;
    case 0x8: // Subtract semitones from period
      e.fxt = FX_PITCH_SUB;
      break;
    default: // 0x03 LED on, 0x04 LED off, anything else
      e.fxt = 0;
      e.fxp = 0;
      break;
  }
}

// ---------------------------------------------------------------------------
// sfx_13_20_load (sfx_load.c:96-258)
// ---------------------------------------------------------------------------

function sfx1320Load(bytes: Uint8Array, ctx: LoadCtx, nins: number): ModuleData {
  let pos = 0;
  const u8 = () => bytes[pos++]!;
  const u16 = () => { const v = readmem16b(bytes, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32b(bytes, pos); pos += 4; return v; };
  const raw = (n: number) => { const s = bytes.subarray(pos, pos + n); pos += n; return s; };

  // Sample sizes precede the header (sfx_load.c:126-127)
  const insSize: number[] = [];
  for (let i = 0; i < nins; i++) insSize.push(u32());

  const magic = u32();
  const delay = u16();
  if (delay < 178) throw new ParseError('SFX: delay < 178'); // min for 10000bpm
  raw(14); // unknown[7]

  if (magic !== MAGIC_SONG) throw new ParseError('SFX: bad magic');

  const chn = 4;
  const ins = nins;
  // mod->bpm = 14565 * 122 / delay (sfx_load.c:136)
  const bpm = Math.trunc((14565 * 122) / delay);

  // Instrument headers (sfx_load.c:139-146)
  interface SfxIns {
    name: Uint8Array;
    len: number; // words
    finetune: number;
    volume: number;
    loopStart: number; // bytes
    loopLength: number; // words
  }
  const insHeaders: SfxIns[] = [];
  for (let i = 0; i < ins; i++) {
    insHeaders.push({
      name: raw(22),
      len: u16(),
      finetune: u8(),
      volume: u8(),
      loopStart: u16(),
      loopLength: u16(),
    });
  }

  // header2 (sfx_load.c:148-152)
  const songLen = u8();
  const restart = u8();
  const order = raw(128);
  if (order.length < 128) throw new ParseError('SFX: order truncated');

  if (songLen > 0x7f) throw new ParseError('SFX: song length > 0x7f');
  const len = songLen;
  const xxo: number[] = [];
  for (let i = 0; i < len; i++) xxo.push(order[i]!);

  // pat = max(xxo)+1 (sfx_load.c:155-158)
  let pat = 0;
  for (let i = 0; i < len; i++) {
    if (xxo[i]! > pat) pat = xxo[i]!;
  }
  pat++;

  const typeStr = ins === 15 ? 'SoundFX 1.3' : 'SoundFX 2.0';

  // Instruments + samples (sfx_load.c:169-201)
  const instruments: Instrument[] = [];
  const rawSamples: RawSample[] = [];
  for (let i = 0; i < ins; i++) {
    const h = insHeaders[i]!;
    const xlen = insSize[i]!;
    const lps = h.loopStart;
    const lpe = lps + 2 * h.loopLength;
    const xflg = h.loopLength > 1 ? SampleFlags.LOOP : 0;

    const sub: SubInstrument = {
      vol: h.volume,
      gvl: 0,
      pan: -1, // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: (((h.finetune << 4) & 0xff) << 24) >> 24, // (int8)(finetune << 4) — "unsure"
      vwf: 0, vde: 0, vra: 0, vsw: 0,
      sid: i,
      rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
    };
    const nameStr = copyAdjust(h.name, 22);
    const xi = zeroInstrument(nameStr, [sub]);
    xi.nsm = 1; // sfx_load.c:182 — unconditionally
    instruments.push(xi);

    rawSamples.push({
      name: nameStr,
      data: new Uint8Array(0),
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: sub.fin,
      volume: h.volume,
      flags: xflg,
      c5spd: 8363,
    });
  }

  // Patterns (sfx_load.c:206-237): 4-byte cells, MOD-style period.
  const patterns: Pattern[] = [];
  for (let i = 0; i < pat; i++) {
    const tracksArr: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) {
      const events: Event[] = [];
      for (let j = 0; j < 64; j++) events.push({ ...EMPTY_EVENT });
      tracksArr.push({ rows: 64, event: events });
    }
    const pattern: Pattern = { rows: 64, tracks: tracksArr };

    for (let j = 0; j < 64; j++) {
      for (let k = 0; k < chn; k++) {
        const e = pattern.tracks[k]!.event[j]!;
        const ev = raw(4);
        if (ev.length < 4) throw new ParseError(`SFX: read error at pattern ${i}`);

        e.note = periodToNote((LSN(ev[0]!) << 8) | ev[1]!);
        e.ins = (MSN(ev[0]!) << 4) | MSN(ev[2]!);

        sfxTranslateEffect(e, LSN(ev[2]!), ev[3]!);
      }
    }
    patterns.push(pattern);
  }

  // Samples (sfx_load.c:244-252): skip len <= 2; no flags (signed PCM).
  let samplePos = pos;
  for (let i = 0; i < ins; i++) {
    const rawS = rawSamples[i]!;
    if (rawS.length <= 2) {
      ctx.addSample(rawS);
      continue;
    }
    const take = Math.min(rawS.length, Math.max(0, bytes.length - samplePos));
    rawS.data = bytes.subarray(samplePos, samplePos + take);
    samplePos += rawS.length;
    ctx.addSample(rawS);
  }

  // m->quirk |= QUIRK_PBALL; m->period_type = PERIOD_MODRNG (:239-240)
  const quirkFlags = Quirk.PBALL;

  // Channel defaults: prologue LRLR
  const chan: Channel[] = [];
  for (let k = 0; k < chn; k++) {
    const pan = Math.floor((k + 1) / 2) % 2 * 0xff;
    chan.push({ pan: Math.min(255, Math.max(0, 0x80 + (pan - 0x80))), vol: 0x40, flg: 0 });
  }

  const mod: ModuleData = {
    title: '',
    format: 'sfx',
    comment: '',
    chn,
    pat,
    ins,
    len,
    restart,
    xxo,
    channels: chan,
    patterns,
    instruments,
    samples: rawSamples,
    num_sequences: 0,
    sequences: [],
    speed: 6,
    bpm,
    volbase: 0x40,
    gvolbase: 0x40,
    gvol: 0x40,
    quirks: quirkFlags,
    flowMode: 0,
    readEventType: 0, // READ_EVENT_MOD
    periodType: 1, // PERIOD_MODRNG
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate: 8363, // prologue PAL default (sfx_load.c never sets c4rate)
    compare_vblank: false,
    tracker: typeStr,
  };

  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

// ---------------------------------------------------------------------------
// sfx_load (sfx_load.c:260-265): try 15, then 31 instruments.
// ---------------------------------------------------------------------------

export function sfxLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  try {
    return sfx1320Load(bytes, ctx, 15);
  } catch {
    return sfx1320Load(bytes, ctx, 31);
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/** SoundFX format plugin (libxmp loaders/sfx_load.c + read_event MOD). */
export const plugin: FormatPlugin = {
  name: 'sfx',
  test: sfxTest,
  load: sfxLoad,
  readEvent(core: Core, chn: number, row: number): void {
    const mod = core.module as ModuleData;
    const e =
      core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventMod(core, e, chn);
  },
};
