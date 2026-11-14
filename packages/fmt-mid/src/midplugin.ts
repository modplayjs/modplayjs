// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// @modplayjs/fmt-mid — plugin surface (glue around the tml.ts/tsf.ts ports).
//
// Like SID, MIDI is not a tracker format: the integration is
//   - FormatPlugin: signature test + load; produces a stub ModuleData whose
//     single pattern loops forever (restart=0, len=1) so CorePlayer keeps
//     ticking a bare tracker; the MIDI DSP ignores tracker state entirely.
//     mod.endless keeps the real tune length (tml_get_info time_length) as
//     the sequence duration (core.ts endlessDurations path).
//   - DspPlugin 'mid': renderFrame(out, ticks) plays the SMF event stream
//     into the SoundFont synth at exact host-buffer pacing.
//
// Playback semantics are 1:1 with TinySoundFont's examples/example3.c
// AudioCallback: progress g_Msec by block*(1000/rate) BEFORE
// dispatching all messages with time <= g_Msec, then render the block with
// tsf_render_float. The block size is TSF_RENDER_EFFECTSAMPLEBLOCK (64)
// from sample 0 onward — the DSP keeps a small FIFO so the synth's
// 64-sample effect blocks stay aligned no matter how the host chunking
// falls. Channel 10 (index 9) is initialised to the percussion bank
// (tsf_channel_set_bank_preset(9, 128, 0)) and PROGRAM_CHANGE uses the
// drum preset lookup for channel 9, exactly like example3.c.

import type { Core as CoreIface, DspPlugin, FormatPlugin, LoadCtx, ModuleData, Pattern } from '@modplayjs/core';

import {
  TML_NOTE_OFF,
  TML_NOTE_ON,
  TML_CONTROL_CHANGE,
  TML_PROGRAM_CHANGE,
  TML_PITCH_BEND,
  tml_load_memory,
  tml_get_info,
  type TmlMessage,
} from './tml.js';
import {
  Tsf,
  tsf_load_memory,
  tsf_set_output,
  tsf_reset,
  tsf_channel_set_bank_preset,
  tsf_channel_set_presetnumber,
  tsf_channel_note_on,
  tsf_channel_note_off,
  tsf_channel_set_pitchwheel,
  tsf_channel_midi_control,
  tsf_render_float,
  TSF_RENDER_EFFECTSAMPLEBLOCK,
  TSF_STEREO_INTERLEAVED,
} from './tsf.js';

/** Track count for the stub pattern: one silent channel. */
const MID_STUB_CHANNELS = 1;
/** Rows per stub pattern (64 = typical tracker pattern height). */
const MID_STUB_ROWS = 64;
/** example3.c: tsf_set_output(..., -10.0f) global gain in dB. */
const MID_DEFAULT_GAIN_DB = -10.0;
/** example3.c: tsf_channel_set_bank_preset(f, 9, 128, 0) — percussion bank. */
const MID_DRUM_CHANNEL = 9;

const f32 = Math.fround;

/** tml.h tml_load header validation (test() is the cheap gate). */
export function midTest(bytes: Uint8Array): boolean {
  if (bytes.length < 14) return false;
  if (bytes[0] !== 0x4d /* M */ || bytes[1] !== 0x54 /* T */) return false;
  if (bytes[2] !== 0x68 /* h */ || bytes[3] !== 0x64 /* d */) return false;
  return bytes[7] === 6 && bytes[9]! <= 2 && !(bytes[12]! & 0x80);
}

export function midLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  void ctx;
  const first = tml_load_memory(bytes);
  if (!first) {
    throw new Error('fmt-mid: not a valid MIDI file');
  }
  const info: {
    used_channels?: number;
    used_programs?: number;
    total_notes?: number;
    time_first_note?: number;
    time_length?: number;
  } = {};
  tml_get_info(first, info);
  const tuneMs = info.time_length ?? 0;

  // Stub tracker module: 1 order, 1 pattern, silent; the MIDI DSP produces
  // all audio. speed/bpm chosen so ticksize ≈ 25 samples/tick at 44.1kHz
  // (irrelevant to output, only paces playBuffer chunks — same as fmt-sid).
  const tracks = [];
  for (let c = 0; c < MID_STUB_CHANNELS; ++c) {
    const event = [];
    for (let r = 0; r < MID_STUB_ROWS; ++r) event.push({ note: 0, ins: 0, vol: -1, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
    tracks.push({ rows: MID_STUB_ROWS, event });
  }
  const patterns: Pattern[] = [{ rows: MID_STUB_ROWS, tracks }];
  const channels = [];
  for (let c = 0; c < MID_STUB_CHANNELS; ++c) channels.push({ pan: 0x80, vol: 0x40, flg: 0 });

  const mod: ModuleData = {
    title: '',
    format: 'mid',
    comment: `SMF: ${info.used_channels ?? 0} channels, ${info.used_programs ?? 0} programs, ${info.total_notes ?? 0} notes`,
    chn: MID_STUB_CHANNELS,
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
        duration: Math.round(tuneMs),
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
    tracker: 'TinySoundFont (SMF)',
    endless: true, // MIDI tunes end via sequence duration — playBuffer treats loop as infinite
  };
  return mod;
}

// ---------------------------------------------------------------------------
// Playback engine state (mirrors example3.c globals)
// ---------------------------------------------------------------------------

/** The loaded SoundFont instance (g_TinySoundFont). */
let g_TinySoundFont: Tsf | null = null;
/** Next message to be played (g_MidiMessage). */
let g_MidiMessage: TmlMessage | null = null;
/** Current playback time in milliseconds (g_Msec). */
let g_Msec = 0;
/** Output sample rate for the g_Msec step (example3 uses 44100). */
let g_Rate = 44100;
/** First message of the loaded tune (restart point for seeks). */
let g_MidiFirst: TmlMessage | null = null;

/**
 * Load a SoundFont 2 bank (.sf2). Required before midStartTune; the
 * instance is kept and reused across tunes (tsf.h tsf_load_memory).
 * Returns the preset count.
 */
export function midSetSoundfont(sf2: Uint8Array): number {
  const f = tsf_load_memory(sf2);
  if (!f) throw new Error('fmt-mid: not a valid SoundFont (.sf2)');
  g_TinySoundFont = f;
  return f.presetNum;
}

/** True when a SoundFont bank is loaded. */
export function midHasSoundfont(): boolean {
  return g_TinySoundFont !== null;
}

/** example3.c main() setup: message pointer, drums channel, output mode. */
export function midStartTune(bytes: Uint8Array, sampleRate: number, gainDb: number = MID_DEFAULT_GAIN_DB): void {
  const f = g_TinySoundFont;
  if (!f) throw new Error('fmt-mid: no soundfont loaded (call midSetSoundfont first)');
  const first = tml_load_memory(bytes);
  if (!first) throw new Error('fmt-mid: not a valid MIDI file');
  g_MidiFirst = first;
  g_MidiMessage = first;
  g_Msec = 0;
  g_Rate = sampleRate;
  tsf_reset(f);
  //Initialize preset on special 10th MIDI channel to use percussion sound bank (128) if available
  tsf_channel_set_bank_preset(f, MID_DRUM_CHANNEL, 128, 0);
  // Set the SoundFont rendering output mode
  tsf_set_output(f, TSF_STEREO_INTERLEAVED, sampleRate, f32(gainDb));
}

/** Engine playback time in milliseconds (example3's g_Msec). */
export function getMidPlayTimeMs(): number {
  return g_Msec;
}

/**
 * Dispatch all MIDI messages due at the current g_Msec (example3.c
 * AudioCallback inner for-loop).
 */
function midDispatch(): void {
  const f = g_TinySoundFont!;
  for (; g_MidiMessage && g_Msec >= g_MidiMessage.time; g_MidiMessage = g_MidiMessage.next) {
    const m = g_MidiMessage;
    switch (m.type) {
      case TML_PROGRAM_CHANGE: //channel program (preset) change (special handling for 10th MIDI channel with drums)
        tsf_channel_set_presetnumber(f, m.channel, m.key, m.channel === MID_DRUM_CHANNEL);
        break;
      case TML_NOTE_ON: //play a note
        tsf_channel_note_on(f, m.channel, m.key, f32(m.velocity / 127));
        break;
      case TML_NOTE_OFF: //stop a note
        tsf_channel_note_off(f, m.channel, m.key);
        break;
      case TML_PITCH_BEND: //pitch wheel modification
        tsf_channel_set_pitchwheel(f, m.channel, m.pitch_bend);
        break;
      case TML_CONTROL_CHANGE: //MIDI controller messages
        tsf_channel_midi_control(f, m.channel, m.key, m.velocity);
        break;
    }
  }
}

/**
 * Render one TSF_RENDER_EFFECTSAMPLEBLOCK frame block at the current
 * engine position: advance g_Msec, dispatch, render (example3.c callback
 * body). Writes 2*blockSamples interleaved floats into `out` at `off`.
 */
function midRenderBlock(out: Float32Array, off: number, blockSamples: number): void {
  //We progress the MIDI playback and then process TSF_RENDER_EFFECTSAMPLEBLOCK samples at once
  //Loop through all MIDI messages which need to be played up until the current playback time
  g_Msec += blockSamples * (1000.0 / g_Rate);
  midDispatch();
  // Render the block of audio samples in float format
  tsf_render_float(g_TinySoundFont!, out, off, blockSamples, false);
}

/**
 * Seek the engine to the given runtime in milliseconds. cRSID-style
 * fast-forward (plugin-original glue, no tml.h equivalent): backwards seeks
 * restart the tune from 0, then the engine renders forward in 64-sample
 * blocks into a discard buffer so envelopes/LFOs evolve exactly as they
 * would in live playback.
 */
export function midSeek(targetMs: number): void {
  if (!g_TinySoundFont || !g_MidiFirst) return;
  const target = Math.max(0, targetMs);
  midFifoReset();
  if (target < g_Msec) {
    // backwards: restart the tune, then fast-forward from 0
    g_MidiMessage = g_MidiFirst;
    g_Msec = 0;
    tsf_reset(g_TinySoundFont);
    tsf_channel_set_bank_preset(g_TinySoundFont, MID_DRUM_CHANNEL, 128, 0);
    tsf_set_output(g_TinySoundFont, TSF_STEREO_INTERLEAVED, g_Rate, f32(MID_DEFAULT_GAIN_DB));
  }
  const sink = new Float32Array(TSF_RENDER_EFFECTSAMPLEBLOCK * 2);
  while (g_MidiMessage && g_Msec < target) {
    midRenderBlock(sink, 0, TSF_RENDER_EFFECTSAMPLEBLOCK);
  }
}

/** The DSP: renders the MIDI engine at exact host-buffer pacing. */

// 64-frame FIFO tail: tsf_render_float is always called with a full
// TSF_RENDER_EFFECTSAMPLEBLOCK so the synth's internal effect blocks stay
// aligned to sample 0 regardless of the host's tick chunking (the C oracle
// renders continuous 64-sample blocks; a shorter tsf_render_float call
// would end a block early and diverge).
const g_Fifo = new Float32Array(TSF_RENDER_EFFECTSAMPLEBLOCK * 2);
let g_FifoPos = TSF_RENDER_EFFECTSAMPLEBLOCK;
let g_FifoLen = TSF_RENDER_EFFECTSAMPLEBLOCK;

function midFifoReset(): void {
  g_FifoPos = TSF_RENDER_EFFECTSAMPLEBLOCK;
  g_FifoLen = TSF_RENDER_EFFECTSAMPLEBLOCK;
}

export const midDsp: DspPlugin = {
  name: 'mid',
  channels: 1,
  renderFrame(core: CoreIface, out: Float32Array, ticks: number): void {
    // DSP contract: render exactly ticks × ticksize frames (the caller may
    // hand a larger scratch buffer; the player consumes a fixed
    // ticksize×2 slice).
    const frames = ticks * core.ticksize;
    let written = 0;
    while (written < frames) {
      if (g_FifoPos >= g_FifoLen) {
        midRenderBlock(g_Fifo, 0, TSF_RENDER_EFFECTSAMPLEBLOCK);
        g_FifoPos = 0;
        g_FifoLen = TSF_RENDER_EFFECTSAMPLEBLOCK;
      }
      const take = Math.min(frames - written, g_FifoLen - g_FifoPos);
      out.set(g_Fifo.subarray(g_FifoPos * 2, (g_FifoPos + take) * 2), written * 2);
      g_FifoPos += take;
      written += take;
    }
  },
  reset(): void {
    // Player restart: rewind the message cursor and the synth (fresh
    // playback from t=0; plugin-original glue — example3 has no restart).
    midFifoReset();
    if (g_TinySoundFont && g_MidiFirst) {
      g_MidiMessage = g_MidiFirst;
      g_Msec = 0;
      tsf_reset(g_TinySoundFont);
      tsf_channel_set_bank_preset(g_TinySoundFont, MID_DRUM_CHANNEL, 128, 0);
      tsf_set_output(g_TinySoundFont, TSF_STEREO_INTERLEAVED, g_Rate, f32(MID_DEFAULT_GAIN_DB));
    }
  },
  onRow(_core: CoreIface, _chn: number, _ev: unknown): void {
    // MIDI has no per-row DSP hook semantics (the paula DSP uses it for
    // sample-position resets); C equivalent: none in example3.c.
  },
};

export const plugin: FormatPlugin = {
  name: 'mid',
  test: midTest,
  load: midLoad,
  readEvent(): void {
    // MIDI has no tracker events; the stub module's single silent event
    // reader is a no-op (the MIDI DSP owns all audio).
  },
};
