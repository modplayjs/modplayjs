// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/mix_paula.c + it_load.c MIDI macro config.
// IT MIDI macro machinery (reference/libxmp/src/player.c:328-545):
// midi_nibble, midi_byte, apply_midi_macro_effect, execute_midi_macro,
// update_midi_macro. Update is hooked into the per-tick channel stage
// (player.c:1627) BEFORE the voice-state check.

import type { ChannelState, Core } from '@modplayjs/core';
import { VoiceFlag, Quirk } from '@modplayjs/core';
import { TEST, hasQuirk } from './helpers.js';
import { VolSlideFlag } from './state.js';

const CLAMP = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/** struct midi_stream (player.c:334-338). */
interface MidiStream {
  pos: number; // index into the macro string
  buffer: number;
  param: number;
}

/** midi_nibble (player.c:340-410). */
function midiNibble(
  core: Core,
  xc: ChannelState,
  chn: number,
  midiStr: string,
  inSt: MidiStream,
): number {
  if (inSt.buffer >= 0) {
    const val = inSt.buffer;
    inSt.buffer = -1;
    return val;
  }

  while (midiStr.charCodeAt(inSt.pos) !== 0 && inSt.pos < midiStr.length) {
    const val = midiStr.charCodeAt(inSt.pos);
    inSt.pos++;
    if (val >= 0x30 && val <= 0x39) return val - 0x30; // '0'..'9'
    if (val >= 0x41 && val <= 0x46) return val - 0x41 + 10; // 'A'..'F'
    let byte = -1;
    switch (val) {
      case 0x7a: // 'z' — Macro parameter
        byte = inSt.param;
        break;
      case 0x6e: // 'n' — Host key
        byte = xc.key & 0x7f;
        break;
      case 0x68: // 'h' — Host channel
        byte = chn;
        break;
      case 0x6f: // 'o' — Offset effect memory
        // Intentionally not clamped, see ZxxSecrets.it
        byte = xc.offset.memory;
        break;
      case 0x6d: {
        // 'm' — Voice reverse flag
        const voc = core.virt.mapChannel(chn);
        byte = voc >= 0 && (core.virt.voices[voc]!.flags & VoiceFlag.VOICE_REVERSE) !== 0 ? 1 : 0;
        break;
      }
      case 0x76: {
        // 'v' — Note velocity
        const xxi = core.module!.instruments[xc.ins];
        const vol = xxi ? xxi.volume : 0x40;
        byte =
          ((core.ctx.p.gvol >>> 0) *
            (xc.volume >>> 0) *
            (xc.mastervol >>> 0) *
            (xc.gvl >>> 0) *
            (vol >>> 0)) >>>
          24;
        byte = CLAMP(byte, 1, 127);
        break;
      }
      case 0x75: // 'u' — Computed velocity
        byte = CLAMP(xc.macro.finalvol >> 3, 1, 127);
        break;
      case 0x78: // 'x' — Note panning
        byte = CLAMP(xc.macro.notepan >> 1, 0, 127);
        break;
      case 0x79: // 'y' — Computed panning
        byte = CLAMP(xc.info_finalpan >> 1, 0, 127);
        break;
      case 0x61: // 'a' — Ins MIDI Bank hi
      case 0x62: // 'b' — Ins MIDI Bank lo
      case 0x70: // 'p' — Ins MIDI Program
      case 0x73: // 's' — MPT: SysEx checksum
        byte = 0;
        break;
      case 0x63: // 'c' — Ins MIDI Channel
        return 0;
    }

    // Byte output
    if (byte >= 0) {
      inSt.buffer = byte & 0xf;
      return (byte >> 4) & 0xf;
    }
  }
  return -1;
}

/** midi_byte (player.c:412-416). */
function midiByte(
  core: Core,
  xc: ChannelState,
  chn: number,
  midiStr: string,
  inSt: MidiStream,
): number {
  const a = midiNibble(core, xc, chn, midiStr, inSt);
  const b = midiNibble(core, xc, chn, midiStr, inSt);
  return a >= 0 && b >= 0 ? (a << 4) | b : -1;
}

/** apply_midi_macro_effect (player.c:418-428). */
function applyMidiMacroEffect(xc: ChannelState, type: number, val: number): void {
  switch (type) {
    case 0: // Filter cutoff
      xc.filter.cutoff = val << 1;
      break;
    case 1: // Filter resonance
      xc.filter.resonance = val << 1;
      break;
  }
}

/** execute_midi_macro (player.c:430-487). */
function executeMidiMacro(
  core: Core,
  xc: ChannelState,
  chn: number,
  data: Uint8Array,
  param: number,
): void {
  // macro->data is a NUL-terminated byte string; decode as latin-1-ish
  // chars (only ASCII letters/digits are significant).
  let end = 0;
  while (end < 32 && data[end] !== 0) end++;
  const midiStr = String.fromCharCode(...data.subarray(0, end));

  const inSt: MidiStream = { pos: 0, buffer: -1, param };

  while (inSt.pos < midiStr.length) {
    // Very simple MIDI 1.0 parser (player.c:442-455).
    let cmd = -1;
    let byte = midiByte(core, xc, chn, midiStr, inSt);
    if (byte === 0xf0) {
      byte = midiByte(core, xc, chn, midiStr, inSt);
      if (byte === 0xf0 || byte === 0xf1) cmd = byte & 0xf;
    }
    if (cmd < 0) {
      if (byte === 0xfa || byte === 0xfc || byte === 0xff) {
        // Real time statuses reset the channel filter params
        // (player.c:461-466, see OpenMPT ZxxSecrets.it).
        applyMidiMacroEffect(xc, 0, 127);
        applyMidiMacroEffect(xc, 1, 0);
      }
      continue;
    }
    cmd = midiByte(core, xc, chn, midiStr, inSt) | (cmd << 8);
    const val = midiByte(core, xc, chn, midiStr, inSt);
    if (cmd < 0 || cmd >= 0x80 || val < 0 || val >= 0x80) {
      continue;
    }
    applyMidiMacroEffect(xc, cmd, val);
  }
}

/**
 * update_midi_macro (player.c:494-545). Needs to occur before all
 * process_* functions: it modifies filter parameters used by
 * process_frequency, and process_volume/process_pan apply slide effects
 * that expect filter parsing to have happened first.
 */
export function updateMidiMacro(core: Core, chn: number): void {
  const p = core.ctx.p;
  const mod = core.module!;
  const xc = core.ctx.channelStates[chn]!;
  const midicfg = mod.midi;

  if (TEST(xc, VolSlideFlag.MIDI_MACRO) !== 0 && hasQuirk(core, Quirk.FILTER)) {
    if (xc.macro.slide > 0) {
      xc.macro.val += xc.macro.slide;
      if (xc.macro.val > xc.macro.target) {
        xc.macro.val = xc.macro.target;
        xc.macro.slide = 0;
      }
    } else if (xc.macro.slide < 0) {
      xc.macro.val += xc.macro.slide;
      if (xc.macro.val < xc.macro.target) {
        xc.macro.val = xc.macro.target;
        xc.macro.slide = 0;
      }
    } else if (p.frame !== 0) {
      // Execute non-smooth macros on frame 0 only
      return;
    }

    const val = Math.trunc(xc.macro.val);
    if (val >= 0x80) {
      if (midicfg) {
        executeMidiMacro(core, xc, chn, midicfg.fixed[val - 0x80]!, val);
      } else if (val < 0x90) {
        // Default fixed macro: set resonance
        applyMidiMacroEffect(xc, 1, (val - 0x80) << 3);
      }
    } else if (midicfg) {
      executeMidiMacro(core, xc, chn, midicfg.param[xc.macro.active]!, val);
    } else if (xc.macro.active === 0) {
      // Default parameterized macro 0: set filter cutoff
      applyMidiMacroEffect(xc, 0, val);
    }
  }
}
