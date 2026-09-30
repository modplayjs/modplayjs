// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/med2_load.c (med2_test :43-51,
// med2_load :53-195). MED 1.12 MED2 — 4-channel, external instruments.

import type {
  Channel,
  Instrument,
  LoadCtx,
  ModuleData,
  Pattern,
  RawSample,
  SubInstrument,
} from '@modplayjs/core';
import {
  ParseError,
  Quirk,
  ReadEventType,
  SampleFlags,
} from '@modplayjs/core';
import { MED_TIME_FACTOR } from './mmdCommon.js';

/** MAGIC_MED2 = "MED\x02". */
export function med2Test(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return bytes[0] === 0x4d && bytes[1] === 0x45 && bytes[2] === 0x44 && bytes[3] === 0x02;
}

function makeSub(vol: number, sid: number): SubInstrument {
  return {
    vol, gvl: 0x40, pan: -1, xpo: 0, fin: 0, vwf: 0, vde: 0,
    vra: 0, vsw: 0, sid, rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
  };
}

/**
 * med2_load (med2_load.c:53-195). Instrument data comes AFTER the pattern
 * data as raw external sample files concatenated — libxmp reuses the file
 * handle and calls med_load_external_instrument per instrument, which in
 * the MED2 case reads len/lps/lpe already parsed and loads from the stream.
 * Here the trailing sample blobs are read inline at their stored offsets.
 */
export function med2Load(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  let pos = 4; // skip magic
  const u16 = () => { const v = (bytes[pos]! << 8) | bytes[pos + 1]!; pos += 2; return v; };
  const u8 = () => bytes[pos++] ?? 0;

  const instruments: Instrument[] = [];
  for (let i = 0; i < 32; i++) {
    instruments.push({
      name: '',
      volume: 0x40,
      // med2_load never loads sample data (no med_load_external_instrument
      // call); nsm stays 0 from libxmp_init_instrument.
      nsm: 0,
      rls: 0,
      map: new Array<number>(121).fill(0),
      mapXpo: new Array<number>(121).fill(0),
      sub: [makeSub(0, i)],
      aei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      fei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      pei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
    });
  }

  // Read instrument names (med2_load.c:73-82): FIXED 40-byte reads
  // (hio_read(buf, 1, 40, f) — no NUL break; libxmp_instrument_name
  // clamps to 31 chars). The first (index 0) is skipped.
  pos += 40; // skip 0
  for (let i = 0; i < 31; i++) {
    if (pos + 40 > bytes.length) throw new ParseError('MED2: truncated names');
    const buf = bytes.subarray(pos, pos + 40);
    pos += 40;
    let s = '';
    for (let j = 0; j < 40; j++) {
      const c = buf[j]!;
      if (c === 0) break;
      s += c > 127 || c < 0x20 || c === 0x7f ? '.' : String.fromCharCode(c);
    }
    instruments[i]!.name = s.replace(/ +$/, '');
  }

  // Read instrument volumes (med2_load.c:84-91).
  pos += 1; // skip 0
  for (let i = 0; i < 31; i++) {
    const vol = u8();
    instruments[i]!.sub[0]!.vol = vol;
  }

  // Read instrument loops (med2_load.c:93-97).
  pos += 2; // skip 0
  const lps: number[] = new Array(32).fill(0);
  for (let i = 0; i < 31; i++) {
    lps[i] = u16();
  }

  // Read instrument loop length (med2_load.c:99-105).
  pos += 2; // skip 0
  const lpe: number[] = new Array(32).fill(0);
  const flg: number[] = new Array(32).fill(0);
  for (let i = 0; i < 31; i++) {
    const lsiz = u16();
    lpe[i] = lps[i]! + lsiz;
    flg[i] = lsiz > 1 ? SampleFlags.LOOP : 0;
  }

  const chn = 4;
  const pat = u16();

  // Order list (med2_load.c:111-114): fixed 100 bytes.
  const xxoRaw: number[] = [];
  for (let i = 0; i < 100; i++) xxoRaw.push(u8());
  const len = u16();

  // Sanity check.
  if (pat > 256 || len > 100) {
    throw new ParseError('MED2: invalid pattern count or song length');
  }
  const xxo = xxoRaw.slice(0, len);

  const k = u16(); // tempo
  if (k < 1) throw new ParseError('MED2: invalid tempo');

  const speed = 6;
  const bpm = k;
  const timeFactor = MED_TIME_FACTOR;

  pos += 2; // flags
  const sliding = u16();
  pos += 4; // jumping mask
  pos += 16; // rgb

  let quirks: number = 0;
  if (sliding === 6) quirks |= Quirk.VSALL | Quirk.PBALL;

  // Load and convert patterns (med2_load.c:144-181).
  const patterns: Pattern[] = [];
  for (let i = 0; i < pat; i++) {
    pos += 4; // pattern size? unused

    const perTrack: { note: number; ins: number; vol: number; fxt: number; fxp: number; f2t: number; f2p: number }[][] = [];
    for (let kk = 0; kk < 4; kk++) {
      const evs: { note: number; ins: number; vol: number; fxt: number; fxp: number; f2t: number; f2p: number }[] = [];
      for (let j = 0; j < 64; j++) {
        evs.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      }
      perTrack.push(evs);
    }

    for (let j = 0; j < 64; j++) {
      for (let kk = 0; kk < 4; kk++) {
        // event->note = libxmp_period_to_note(hio_read16b(f)).
        const period = u16();
        const x = u8();
        const fxp = u8();

        const e = perTrack[kk]![j]!;
        e.note = periodToNote(period);
        e.ins = x >> 4;
        e.fxt = x & 0x0f;

        switch (e.fxt) {
          case 0x00: // arpeggio
          case 0x01: // slide up
          case 0x02: // slide down
          case 0x03: // portamento
          case 0x04: // vibrato?
          case 0x0c: // volume
            break; // ...like protracker
          case 0x0d: // volslide
          case 0x0e: // volslide
            e.fxt = 0x0a; // FX_VOLSLIDE
            break;
          case 0x0f:
            e.fxt = 0xab; // FX_S3M_BPM
            break;
        }
        e.fxp = fxp;
      }
    }

    const tracksArr: Pattern['tracks'] = [];
    for (let kk = 0; kk < chn; kk++) tracksArr.push({ rows: 64, event: perTrack[kk]! });
    patterns.push({ rows: 64, tracks: tracksArr });
  }

  // Load samples (med2_load.c:183-192 → med_load_external_instrument,
  // mmd_common.c:995-1035): each instrument's data lives in a sibling
  // file named after the instrument, resolved via the harness's
  // externalInstrument hook (C searches the instrument path, then the
  // module dir). Missing files leave nsm=0 / len=0.
  const samples: RawSample[] = [];
  for (let i = 0; i < 32; i++) {
    const inst = instruments[i]!;
    const sub = inst.sub[0]!;
    sub.sid = i;
    const s: RawSample = {
      name: '',
      data: new Uint8Array(0),
      length: 0,
      loopStart: lps[i] ?? 0,
      loopEnd: lpe[i] ?? 0,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: sub.vol,
      flags: flg[i] ?? 0,
      c5spd: 8287,
    };
    const data = ctx.externalInstrument ? ctx.externalInstrument(inst.name) : null;
    if (data && data.length > 0) {
      s.length = data.length;
      s.data = data;
      inst.nsm = 1;
    }
    samples.push(s);
  }

  const channels: Channel[] = [];
  for (let i = 0; i < chn; i++) {
    // med2_load never touches channels — the prologue LRLR default
    // (load_helpers.c:334) applies.
    const pattern = Math.floor((i + 1) / 2) % 2 * 0xff;
    channels.push({ pan: Math.min(255, Math.max(0, 0x80 + (pattern - 0x80))), vol: 0x40, flg: 0 });
  }

  const mod: ModuleData = {
    title: '',
    format: 'med',
    comment: '',
    chn,
    pat,
    ins: 32,
    len,
    restart: 0,
    xxo,
    channels,
    patterns,
    instruments,
    samples,
    num_sequences: 0,
    sequences: [],
    speed,
    bpm,
    volbase: 0x40,
    gvolbase: 0x40,
    gvol: 0x40,
    quirks,
    flowMode: 0,
    // med2_load never sets read_event_type — prologue default (MOD) applies.
    readEventType: ReadEventType.MOD,
    periodType: 0,
    defpan: 0x80,
    time_factor: timeFactor,
    rrate: 250,
    c4rate: 8287,
    compare_vblank: false,
    tracker: 'MED 1.12 MED2',
    extras: { kind: 'med', trackerVersion: 0x0210 },
  };

  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

/** libxmp_period_to_note (period.c:213-220) with PERIOD_BASE 13696
 *  (period.h:6 — C0 period, NOT the 4096 mixer base). */
function periodToNote(period: number): number {
  if (period <= 0) return 0;
  return Math.round((12.0 * Math.log(13696 / period)) / Math.LN2) + 1;
}
