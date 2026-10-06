// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// @modplayjs/fmt-sid — plugin surface.
//
// The SID engine is sample-paced (the 6510 play routine is called every
// FrameCycles CPU cycles inside cRSID_emulateC64), not row/tick paced. The
// integration therefore is:
//   - FormatPlugin: signature test + load; produces a stub ModuleData whose
//     single pattern loops forever (restart=0, len=1) so CorePlayer keeps
//     ticking a bare tracker; the SID DSP ignores tracker state entirely and
//     drives cRSID_generateSample() at exact host-buffer pacing.
//   - DspPlugin 'sid': renderFrame(out, ticks) fills out with
//     out.length/2 samples from cRSID_generateSample() — out.length/2 is
//     authoritative (ticks*ticksize is only an upper bound).
//
// Loop semantics: playBuffer(loop) stops when loop_count >= loop. The stub
// module loops the single pattern through restart=0 (sequence loop), which
// increments loop_count once per pass; drivers that pass loop=1 therefore
// stop after one tracker pass — for SID the demo passes loop=0 (infinite).
// The engine has no song-end concept beyond cRSID.PlayTime vs
// SubtuneDurations (no SongLengths database is loaded).

import type { Core as CoreIface, DspPlugin, FormatPlugin, LoadCtx, ModuleData, Pattern } from '@modplayjs/core';

import { cRSID_init, cRSID_initSIDtune, cRSID_generateSample, cRSID_processSIDfileData, cRSID_playSIDtune } from './loader.js';
import { sidApplyInitOverrides } from './settings.js';
import type { CRSIDheader } from './instance.js';

/** Track count for the stub pattern: one silent channel. */
const SID_STUB_CHANNELS = 1;
/** Rows per stub pattern (64 = typical tracker pattern height). */
const SID_STUB_ROWS = 64;

export function cRSID_sidTest(bytes: Uint8Array): boolean {
  // host/file.c cRSID_processSIDfileData magic check (P/R + "SID"), plus the
  // v1 header-size gate (files shorter than 0x7C cannot be v2 headers).
  if (bytes.length < 0x7c) return false;
  if (bytes[0] !== 0x50 /* P */ && bytes[0] !== 0x52 /* R */) return false;
  return bytes[1] === 0x53 /* S */ && bytes[2] === 0x49 /* I */ && bytes[3] === 0x44 /* D */;
}

/** Header strings are latin1 (C char[] fields printed via %s). */
function headerString(b: Uint8Array, off: number): string {
  let s = '';
  for (let i = 0; i < 32; ++i) {
    const c = b[off + i]!;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

export function cRSID_sidLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  void ctx;
  const header: CRSIDheader = cRSID_processSIDfileData(bytes, bytes.length)!;
  if (header === null) {
    throw new Error('fmt-sid: not a PSID/RSID file');
  }

  // Stub tracker module: 1 order, 1 pattern, silent; the SID DSP produces
  // all audio. speed/bpm chosen so ticksize ≈ 25 samples/tick at 44.1kHz
  // (irrelevant to output, only paces playBuffer chunks).
  const tracks = [];
  for (let c = 0; c < SID_STUB_CHANNELS; ++c) {
    const event = [];
    for (let r = 0; r < SID_STUB_ROWS; ++r) event.push({ note: 0, ins: 0, vol: -1, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
    tracks.push({ rows: SID_STUB_ROWS, event });
  }
  const patterns: Pattern[] = [{ rows: SID_STUB_ROWS, tracks }];
  const channels = [];
  for (let c = 0; c < SID_STUB_CHANNELS; ++c) channels.push({ pan: 0x80, vol: 0x40, flg: 0 });

  const mod: ModuleData = {
    title: headerString(bytes, 0x16),
    format: 'sid',
    comment: `${headerString(bytes, 0x36)}${headerString(bytes, 0x56) ? ' — ' + headerString(bytes, 0x56) : ''}`,
    chn: SID_STUB_CHANNELS,
    pat: 1,
    ins: 0,
    len: 1,
    restart: 0,
    xxo: [0],
    channels,
    patterns,
    instruments: [],
    samples: [],
    num_sequences: 1,
    sequences: [
      {
        ord: 0,
        entry_point: 0,
        duration: 0,
        time: 0,
        speed: 6,
        bpm: 125,
        gvl: -1,
        start_row: 0,
      },
    ],
    speed: 6,
    bpm: 125,
    volbase: 0x40,
    gvolbase: 0x80,
    gvol: 0x80,
    quirks: 0,
    flowMode: 0,
    readEventType: 0 as 0 /* ReadEventType.MOD (const-enum value inline for isolatedModules) */,
    periodType: 0 as 0,
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate: 8363,
    compare_vblank: false,
    tracker: `cRSID (PSID v${header.Version})`,
    endless: true, // SID tunes never end — playBuffer treats loop as infinite
  };
  return mod;
}

/**
 * Start (or restart) SID playback for a previously-loaded SID file. Call
 * after core.loadModule(sidPlugin.load(bytes, ctx)).
 *
 * The C player calls (host/file.c → libcRSID.c):
 *   cRSID_init(rate, 0)      — once, on first use
 *   cRSID_processSIDfileData — during load
 *   cRSID_initSIDtune(hdr, subtune) — init-routine + playaddress
 *   cRSID_playSIDtune()      — unpause
 */
export function sidStartTune(bytes: Uint8Array, sampleRate: number, subtune = 1): void {
  cRSID_init(sampleRate, 0);
  sidApplyInitOverrides(); // re-apply after cRSID_init wipes the globals
  const header = cRSID_processSIDfileData(bytes, bytes.length)!;
  cRSID_initSIDtune(header, subtune);
  cRSID_playSIDtune();
}

/** The DSP: renders the SID engine at exact host-buffer pacing. */
export const sidDsp: DspPlugin = {
  name: 'sid',
  channels: 1,
  renderFrame(core: CoreIface, out: Float32Array, ticks: number): void {
    void core;
    // DSP contract: render exactly ticks × ticksize frames (the caller may
    // hand a larger scratch buffer; the player consumes a fixed
    // ticksize×2 slice — over-rendering would drift the engine).
    const frames = ticks * core.ticksize;
    for (let i = 0; i < frames; ++i) {
      const s = cRSID_generateSample();
      out[i * 2] = s.L / 32768;
      out[i * 2 + 1] = s.R / 32768;
    }
  },
  reset(): void {
    // C: nothing to reset on the host side (emulation state is reset by
    // cRSID_initSIDtune); keep the engine running across player restarts.
  },
  onRow(_core: CoreIface, _chn: number, _ev: unknown): void {
    // SID has no per-row DSP hook semantics (the paula DSP uses it for
    // sample-position resets); C equivalent: none in libcRSID.
  },
};

export const plugin: FormatPlugin = {
  name: 'sid',
  test: cRSID_sidTest,
  load: cRSID_sidLoad,
  readEvent(): void {
    // SID has no tracker events; the stub module's single silent event
    // reader is a no-op (the SID DSP owns all audio).
  },
};
