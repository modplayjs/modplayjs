// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/player.c (play_channel/process_fx) + effects.c (process_fx).
// libxmp_process_fx dispatcher (reference/libxmp/src/effects.c:108-1149).
// T12 scope: note/pitch effects. The full switch is here so format readers
// call exactly one function, like libxmp does; volume/pan/flow arms route
// through the vfx/fxts modules (T13) which share this signature set.

import type { Core, ChannelState, Event } from '@modplayjs/core';
import { FX, Quirk, PlayerFlag, FlowFlag, PastNote, VoiceFlag } from '@modplayjs/core';
import {
  MSN,
  LSN,
  SET,
  hasQuirk,
  lfoSetWaveform,
} from './helpers.js';
import { setLfoNotzero } from './helpers.js';
import { fxPanbrello, fxPanbrelloWf } from './fx.js';
import { VolSlideFlag as VF } from './state.js';
import {
  fxFPortaUp,
  fxFPortaDn,
  fxXfPortaUp,
  fxXfPortaDn,
} from './fx.js';
import {
  fxVolSlide,
  fxVslideUp2,
  fxVolSet,
  fxTrkVSlide,
  fxTrkFVSlide,
  fxSetPan,
  fxPanSlide,
  fxItPanSlide,
  fxTremor,
  exRetrig,
  exCut,
  fxMultiRetrig,
  fxGlobalVol,
  fxGvolSlide,
  fxKeyoff,
  fxEnvPos,
  fxS3mSpeed,
  fxS3mBpm,
  fxItBpm,
  fxItRowDelay,
  fxSurround,
  fvslideUpShared,
  fvslideDnShared,
  XMP_MIN_BPM,
} from './vfx.js';
import { VolSlideFlag } from './state.js';

/** Structural subset of ModuleData/FlowState used by inline flow fallbacks. */
interface ModuleLike { flowMode: number; readEventType: number }
interface FlowStateLike {
  pbreak: number; jump: number; jumpline: number;
  delay: number; rowdelay: number; rowdelay_set: number;
  loop_dest: number;
  loop: ({ start: number; count: number } | undefined)[];
}
const PERIOD_BASE = 13696.0;
const NOTE_GLISSANDO_BIT = 1 << 9;


/**
 * Flow-effect callbacks: EX_PATTERN_LOOP / FX_JUMP / FX_BREAK / FX_PATT_DELAY
 * mutate Core-owned FlowState (flow.c ports live in @modplayjs/core/flow).
 * All optional: when absent, this module applies the generic port inline.
 */
export interface FlowHooks {
  patternLoop?(core: Core, chn: number, row: number, fxp: number): void;
  patternJump?(core: Core, ord: number): void;
  patternBreak?(core: Core, row: number): void;
  pattDelay?(core: Core, xc: ChannelState, fxp: number): void;
}

/**
 * libxmp_process_fx (effects.c:108-1149).
 * fnum: 0 = primary effect column, 1 = secondary (XM volume-column bridge
 * happens in the readers themselves, mirroring read_event.c:430-431 order).
 */
export function processFx(
  core: Core,
  xc: ChannelState,
  chn: number,
  ev: Event,
  fnum: number,
  hooks: FlowHooks = {},
): void {
  const mod = core.module!;

  /* key_porta is IT only (effects.c:116-119). */
  if (mod.readEventType !== 3 /* READ_EVENT_IT */) {
    xc.key_porta = xc.key;
  }

  const note = ev.note;
  let fxt: number;
  let fxp: number;
  if (fnum === 0) {
    fxt = ev.fxt;
    fxp = ev.fxp;
  } else {
    fxt = ev.f2t;
    fxp = ev.f2p;
  }

  switch (fxt) {
    case FX.FX_ARPEGGIO:
      // fx_arpeggio label (effects.c:134-141)
      if (!hasQuirk(core, Quirk.ARPMEM) || fxp !== 0) {
        xc.arpeggio.val[0] = 0;
        xc.arpeggio.val[1] = MSN(fxp);
        xc.arpeggio.val[2] = LSN(fxp);
        xc.arpeggio.size = 3;
      }
      break;

    case FX.FX_S3M_ARPEGGIO:
      // EFFECT_MEMORY then goto fx_arpeggio
      if (fxp === 0) {
        fxp = hasQuirk(core, Quirk.ST3BUGS) ? xc.vol.memory : xc.arpeggio.memory;
      } else if (hasQuirk(core, Quirk.ST3BUGS)) {
        xc.vol.memory = fxp;
        xc.arpeggio.memory = fxp;
      } else {
        xc.arpeggio.memory = fxp;
      }
      if (!hasQuirk(core, Quirk.ARPMEM) || fxp !== 0) {
        xc.arpeggio.val[0] = 0;
        xc.arpeggio.val[1] = MSN(fxp);
        xc.arpeggio.val[2] = LSN(fxp);
        xc.arpeggio.size = 3;
      }
      break;

    case FX.FX_OKT_ARP3:
      if (fxp !== 0) {
        xc.arpeggio.val[0] = -MSN(fxp);
        xc.arpeggio.val[1] = 0;
        xc.arpeggio.val[2] = LSN(fxp);
        xc.arpeggio.size = 3;
      }
      break;

    case FX.FX_OKT_ARP4:
      if (fxp !== 0) {
        xc.arpeggio.val[0] = 0;
        xc.arpeggio.val[1] = LSN(fxp);
        xc.arpeggio.val[2] = 0;
        xc.arpeggio.val[3] = -MSN(fxp);
        xc.arpeggio.size = 4;
      }
      break;

    case FX.FX_OKT_ARP5:
      if (fxp !== 0) {
        xc.arpeggio.val[0] = LSN(fxp);
        xc.arpeggio.val[1] = LSN(fxp);
        xc.arpeggio.val[2] = 0;
        xc.arpeggio.size = 3;
      }
      break;

    case FX.FX_PORTA_UP:
      processPortaUp(core, xc, fxp, fnum);
      break;

    case FX.FX_PORTA_DN:
      processPortaDn(core, xc, fxp, fnum);
      break;

    case FX.FX_TONEPORTA:
      toneportaShared(core, xc, fxp, note);
      break;

    case FX.FX_VIBRATO:
      vibratoShared(core, xc, fxp, false);
      break;

    case FX.FX_FINE_VIBRATO:
      vibratoShared(core, xc, fxp, true);
      break;

    case FX.FX_TREMOLO:
      tremoloShared(core, xc, fxp);
      break;

    case FX.FX_OFFSET: {
      let val = fxp;
      if (hasQuirk(core, Quirk.FT2BUGS)) {
        /* FT2: only set memory when offset activates (ft2_offset_memory.xm). */
        val = val ? val : xc.offset.memory;
      } else if (val === 0) {
        val = xc.offset.memory;
      } else {
        xc.offset.memory = val;
      }
      SET(xc, VolSlideFlag.OFFSET);
      if (note) {
        // effects.c:298-301 — clears low bits then ORs.
        xc.offset.val &= ~0xffff;
        xc.offset.val |= val << 8;
        xc.offset.val2 = val << 8;
      }
      if (ev.ins) {
        xc.offset.val2 = val << 8;
      }
      break;
    }

    case FX.FX_XF_PORTA: {
      const h = MSN(fxp);
      let fp = fxp & 0x0f;
      switch (h) {
        case 1: /* XX_XF_PORTA_UP */
          // EFFECT_MEMORY(fxp, fine_porta.xf_up_memory) — note the reference
          // applies memory BEFORE the label body (effects.c:733-735).
          if (fp === 0) {
            fp = xc.fine_porta.xf_up_memory;
          } else {
            xc.fine_porta.xf_up_memory = fp;
          }
          fxXfPortaUp(core, xc, fp);
          break;
        case 2: /* XX_XF_PORTA_DN */
          if (fp === 0) {
            fp = xc.fine_porta.xf_down_memory;
          } else {
            xc.fine_porta.xf_down_memory = fp;
          }
          fxXfPortaDn(core, xc, fp);
          break;
      }
      break;
    }

    default:
      processRest(core, xc, chn, ev, fnum, fxt, fxp, note, hooks);
      break;
  }
}

// Shared goto-target bodies reused by dispatch above ------------------------

function processPortaUp(core: Core, xc: ChannelState, fxpIn: number, fnum: number): void {
  let fxp = fxpIn;
  if (fxp === 0) {
    fxp = xc.freq.memory;
  } else {
    xc.freq.memory = fxp;
  }

  if (hasQuirk(core, Quirk.FINEFX) && (fnum === 0 || !hasQuirk(core, Quirk.ITPOR))) {
    switch (MSN(fxp)) {
      case 0xf:
        fxFPortaUp(core, xc, fxp & 0x0f);
        return;
      case 0xe:
        fxXfPortaUp(core, xc, fxp & 0x0f);
        return;
    }
  }

  if (fxp !== 0) {
    SET(xc, VolSlideFlag.PITCHBEND);
    xc.freq.slide = -fxp;
    if (hasQuirk(core, Quirk.UNISLD)) xc.porta.memory = fxp;
  }
}

function processPortaDn(core: Core, xc: ChannelState, fxpIn: number, fnum: number): void {
  let fxp = fxpIn;
  if (hasQuirk(core, Quirk.FT2BUGS)) {
    if (fxp === 0) fxp = xc.freq.down_memory;
    else xc.freq.down_memory = fxp;
  } else {
    if (fxp === 0) fxp = xc.freq.memory;
    else xc.freq.memory = fxp;
  }

  if (hasQuirk(core, Quirk.FINEFX) && (fnum === 0 || !hasQuirk(core, Quirk.ITPOR))) {
    switch (MSN(fxp)) {
      case 0xf:
        fxFPortaDn(core, xc, fxp & 0x0f);
        return;
      case 0xe:
        fxXfPortaDn(core, xc, fxp & 0x0f);
        return;
    }
  }

  if (fxp !== 0) {
    SET(xc, VolSlideFlag.PITCHBEND);
    xc.freq.slide = fxp;
    if (hasQuirk(core, Quirk.UNISLD)) xc.porta.memory = fxp;
  }
}

function toneportaShared(core: Core, xc: ChannelState, fxpIn: number, note: number): void {
  let fxp = fxpIn;
  // EFFECT_MEMORY_SETONLY(fxp, xc->porta.memory)
  if (fxp === 0) {
    fxp = xc.porta.memory;
  } else {
    xc.porta.memory = fxp;
  }
  if (hasQuirk(core, Quirk.ST3BUGS) && fxp !== 0) {
    xc.vol.memory = fxp;
  }

  if (fxp !== 0) {
    if (hasQuirk(core, Quirk.UNISLD)) xc.freq.memory = fxp;
    xc.porta.slide += fxp;
  }

  if (hasQuirk(core, Quirk.IGSTPOR)) {
    if (note === 0 && xc.porta.dir === 0) return;
  }

  if (!(xc.ins >= 0 && xc.ins < core.module!.instruments.length)) return;

  doToneportaCore(core, xc, note);
  SET(xc, VolSlideFlag.TONEPORTA);
}

function vibratoShared(core: Core, xc: ChannelState, fxpIn: number, fine: boolean): void {
  let fxp = fxpIn;
  if (fxp === 0) {
    fxp = xc.vibrato.memory;
  } else {
    xc.vibrato.memory = fxp;
  }
  if (hasQuirk(core, Quirk.ST3BUGS) && fxp !== 0) {
    xc.vol.memory = fxp;
  }
  SET(xc, VolSlideFlag.VIBRATO);
  setLfoNotzero(
    xc.vibrato.lfo,
    fine ? LSN(fxp) : LSN(fxp) << 2,
    MSN(fxp),
  );
}

function tremoloShared(core: Core, xc: ChannelState, fxpIn: number): void {
  let fxp = fxpIn;
  if (fxp === 0) {
    fxp = hasQuirk(core, Quirk.ST3BUGS) ? xc.vol.memory : xc.tremolo.memory;
  } else if (hasQuirk(core, Quirk.ST3BUGS)) {
    xc.vol.memory = fxp;
    xc.tremolo.memory = fxp;
  } else {
    xc.tremolo.memory = fxp;
  }
  SET(xc, VolSlideFlag.TREMOLO);
  setLfoNotzero(xc.tremolo.lfo, LSN(fxp), MSN(fxp));
}

/** E6x/Bxx/Cxx/Dxx/Fxx flow arm routing through flow hooks. */
function processRest(
  core: Core,
  xc: ChannelState,
  chn: number,
  ev: Event,
  _fnum: number,
  fxt: number,
  fxpIn: number,
  note: number,
  hooks: FlowHooks,
): void {
  const mod = core.module!;
  let fxp = fxpIn;

  switch (fxt) {
    /* Dual effects. C (effects.c:257-267):
     *   Lxy TONE_VSLIDE: EFFECT_MEMORY_GET(porta.memory); porta.slide += l;
     *     do_toneporta; SET(TONEPORTA); goto fx_volslide (full fxp).
     *   6xy VIBRA_VSLIDE: SET(VIBRATO) only — no LFO update, no memory —
     *     then goto fx_volslide (full fxp).
     * The volslide label runs the shared FX_VOLSLIDE body with the whole
     * parameter (both nibbles: x = up, y = down). */
    case FX.FX_TONE_VSLIDE: {
      const l = hasQuirk(core, Quirk.ST3BUGS) ? xc.vol.memory : LSN(fxp);
      xc.porta.slide += l;
      if (xc.ins >= 0 && xc.ins < mod.instruments.length) {
        doToneportaCore(core, xc, note);
        SET(xc, VolSlideFlag.TONEPORTA);
      }
      fxVolSlide(core, xc, fxp);
      break;
    }
    case FX.FX_VIBRA_VSLIDE:
      SET(xc, VolSlideFlag.VIBRATO);
      fxVolSlide(core, xc, fxp);
      break;
    case FX.FX_VOLSLIDE:
      fxVolSlide(core, xc, fxp);
      break;
    /* OpenMPT VolColMemory.it: a/b/c/d share one memory NOT shared with Dxy.
     * effects.c:560-572 gate these through vol.memory2 via the reader for IT;
     * the arm itself applies directly. */
    case FX.FX_VOLSLIDE_2:
      fxVslideUp2(xc, fxp);
      break;
    case FX.FX_F_VSLIDE_UP_2:
      if (fxp !== 0) {
        xc.vol.memory2 = fxp;
        SET(xc, VolSlideFlag.FINE_VOLS_2);
        xc.vol.fslide2 = fxp;
      }
      break;
    case FX.FX_F_VSLIDE_DN_2:
      if (fxp !== 0) {
        xc.vol.memory2 = fxp;
        SET(xc, VolSlideFlag.FINE_VOLS_2);
        xc.vol.fslide2 = -fxp;
      }
      break;
    case FX.FX_JUMP:
      hooks.patternJump ? hooks.patternJump(core, fxp) : flowPatternJump(mod, core.ctx.p.flow, fxp);
      break;
    case FX.FX_VOLSET:
      fxVolSet(core, xc, fxp);
      break;
    case FX.FX_TRK_VOL: /* Track volume setting (effects.c:726-730) */
      if (fxp <= mod.volbase) {
        xc.mastervol = fxp;
      }
      break;
    case FX.FX_TRK_VSLIDE: /* Track volume slide (effects.c:731-763) */
      fxTrkVSlide(core, xc, fxp);
      break;
    case FX.FX_TRK_FVSLIDE: /* Track fine volume slide (effects.c:764-772) */
      fxTrkFVSlide(xc, fxp);
      break;
    case FX.FX_BREAK:
      hooks.patternBreak
        ? hooks.patternBreak(core, 10 * MSN(fxp) + LSN(fxp))
        : flowPatternBreak(mod, core.ctx.p.flow, 10 * MSN(fxp) + LSN(fxp));
      break;
    case FX.FX_EXTENDED:
      extendedFx(core, xc, chn, ev, fxp, note, hooks);
      break;
    case FX.FX_S3M_SPEED:
      fxS3mSpeed(core, fxp);
      break;
    case FX.FX_S3M_BPM:
      fxS3mBpm(core, fxp);
      break;
    case FX.FX_IT_BPM:
      fxItBpm(core, xc, fxp);
      break;
    case FX.FX_IT_ROWDELAY:
      fxItRowDelay(core, fxp);
      break;
    case FX.FX_SURROUND:
      fxSurround(xc, fxp);
      break;
    case FX.FX_SPEED:
      speedArmImpl(core, fxp);
      break;
    case FX.FX_SETPAN:
      if (!hasQuirk(core, Quirk.PROTRACK)) {
        setPanArmImpl(core, xc, fxp);
      }
      break;
    case FX.FX_GLOBALVOL:
      fxGlobalVol(core, fxp);
      break;
    case FX.FX_GVOL_SLIDE:
      fxGvolSlide(core, xc, fxp);
      break;
    case FX.FX_KEYOFF:
      fxKeyoff(xc, fxp);
      break;
    case FX.FX_ENVPOS:
      fxEnvPos(core, xc, fxp);
      break;
    case FX.FX_IT_PANSLIDE:
      // it.ts emits FX_IT_PANSLIDE directly for IT Pxx (it_load.c:78).
      fxItPanSlide(xc, fxp);
      break;
    case FX.FX_IT_INSTFUNC:
      // S7x instrument functions (effects.c:773-813).
      switch (LSN(fxp)) {
        case 0: // Past note cut
          core.virt.releaseChannel(chn, PastNote.CUT);
          break;
        case 1: // Past note off
          core.virt.releaseChannel(chn, PastNote.OFF);
          break;
        case 2: // Past note fade
          core.virt.releaseChannel(chn, PastNote.FADE);
          break;
        case 3: // Set NNA to note cut
          core.virt.setNna(chn, 0);
          break;
        case 4: // Set NNA to continue
          core.virt.setNna(chn, 1);
          break;
        case 5: // Set NNA to note off
          core.virt.setNna(chn, 2);
          break;
        case 6: // Set NNA to note fade
          core.virt.setNna(chn, 3);
          break;
        case 7: // Turn off volume envelope
          SET(xc, VF.VENV_PAUSE);
          break;
        case 8: // Turn on volume envelope
          xc.per_flags &= ~VF.VENV_PAUSE;
          break;
        case 9: // Turn off pan envelope
          SET(xc, VF.PENV_PAUSE);
          break;
        case 0xa: // Turn on pan envelope
          xc.per_flags &= ~VF.PENV_PAUSE;
          break;
        case 0xb: // Turn off pitch envelope
          SET(xc, VF.FENV_PAUSE);
          break;
        case 0xc: // Turn on pitch envelope
          xc.per_flags &= ~VF.FENV_PAUSE;
          break;
      }
      break;
    case FX.FX_PANSLIDE:
      // XM/IT Pxx: IT files emit FX_IT_PANSLIDE (handled above); the generic
      // FX_PANSLIDE is emitted by the XM loader (xm_load.c maps Pxx directly).
      fxPanSlide(core, xc, fxp, true);
      break;
    case FX.FX_PANBRELLO:
      fxPanbrello(core, xc, fxp);
      break;
    case FX.FX_PANBRELLO_WF:
      fxPanbrelloWf(xc, fxp);
      break;
    case FX.FX_REVERSE: {
      // S9E/S9F (MPT): play sample forward/reverse. mixer_reverse
      // (mixer.c:981-997): reverse only affects samples that have not
      // already ended. voc is the channel's mapped voice.
      const voc = core.virt.mapChannel(chn);
      if (voc >= 0) {
        const v = core.virt.voiceAt(voc)!;
        // Don't reverse samples that have already ended (smp < 0 = ended).
        if (v.smp >= 0) {
          if (fxp === 1) {
            v.flags |= VoiceFlag.VOICE_REVERSE;
            // Reverse restart: pos maps to end (mixer_reverse does not
            // reposition; reverse plays pos downward from where it is).
          } else {
            v.flags &= ~VoiceFlag.VOICE_REVERSE;
          }
        }
      }
      break;
    }
    case FX.FX_HIOFFSET: {
      // SAy (effects.c:844-847): high bits of the sample offset. No
      // immediate reposition — the offset applies at the next note.
      xc.offset.val = (xc.offset.val & 0xffff) | (fxp << 16);
      break;
    }
    case FX.FX_IT_BREAK:
      // it.ts emits FX_IT_BREAK for IT Cxx; identical flow semantics to
      // FX_BREAK (fxp = row, decimal).
      hooks.patternBreak
        ? hooks.patternBreak(core, 10 * MSN(fxp) + LSN(fxp))
        : flowPatternBreak(mod, core.ctx.p.flow, 10 * MSN(fxp) + LSN(fxp));
      break;
    case FX.FX_MULTI_RETRIG:
      fxMultiRetrig(core, xc, fxp, note);
      break;
    case FX.FX_TREMOR:
      fxTremor(core, xc, fxp);
      break;
    case FX.FX_MACRO_SET:
      xc.macro.active = LSN(fxp);
      break;
    case FX.FX_MACRO:
      SET(xc, VolSlideFlag.MIDI_MACRO);
      xc.macro.val = fxp;
      xc.macro.slide = 0;
      break;
    case FX.FX_MACROSMOOTH:
      if (core.ctx.p.speed !== 0 && xc.macro.val < 0x80) {
        SET(xc, VolSlideFlag.MIDI_MACRO);
        xc.macro.target = fxp;
        xc.macro.slide = (fxp - xc.macro.val) / core.ctx.p.speed;
      }
      break;
  }
}
// Generic flow fallbacks (flow.c ports live in core/flow.ts as pure
// functions over module+FlowState) -------------------------------------------

function flowPatternJump(mod: ModuleLike, f: FlowStateLike, ord: number): void {
  // flow.c:138-153
  if ((mod.flowMode & FlowFlag.LOOP_DELAY_JUMP) !== 0 && f.loop_dest >= 0) return;
  f.pbreak = 1;
  f.jump = ord;
  if ((mod.flowMode & FlowFlag.JUMP_NO_ROW_SET) === 0) f.jumpline = 0;
}

function flowPatternBreak(mod: ModuleLike, f: FlowStateLike, row: number): void {
  // flow.c:155-171
  if ((mod.flowMode & FlowFlag.LOOP_DELAY_BREAK) !== 0 && f.loop_dest >= 0) return;
  f.pbreak = 1;
  f.jumpline = row;
}

function flowPatternLoop(core: Core, chn: number, row: number, fxp: number): void {
  // Delegates to Core's full port when running inside a real Core instance;
  // unit-test cores without it get flagless loop semantics inline.
  const anyCore = core as unknown as { applyPatternLoop?: (...a: unknown[]) => void };
  if (typeof anyCore.applyPatternLoop === 'function') {
    anyCore.applyPatternLoop.call(core, chn, row, fxp);
    return;
  }
  const f = core.ctx.p.flow;
  const lt = f.loop[chn];
  if (!lt) return;
  if (fxp === 0) {
    lt.start = row;
    lt.count = -1;
  } else if (lt.count === -1 || lt.count > 0) {
    lt.count = lt.count === -1 ? fxp : lt.count - 1;
    if (lt.count > 0) f.loop_dest = lt.start;
  }
}

function flowPattDelay(core: Core, fxp: number): void {
  const f = core.ctx.p.flow;
  if (core.module!.readEventType !== 2 /* READ_EVENT_ST3 */ || !f.delay) {
    f.delay = fxp;
  }
}

/** FX_SPEED arm (effects.c:463-476): NOBPM/VBLANK or <0x20 → s3m_speed. */
function speedArmImpl(core: Core, fxp: number): void {
  const vblank = (core.ctx.p.flags & PlayerFlag.VBLANK) !== 0;
  if (hasQuirk(core, Quirk.NOBPM) || vblank || fxp < 0x20) {
    s3mSpeedShared(core, fxp);
    return;
  }
  s3mBpmShared(core, fxp);
}

function s3mSpeedShared(core: Core, fxp: number): void {
  if (fxp) core.ctx.p.speed = fxp;
}

function s3mBpmShared(core: Core, fxpIn: number): void {
  let fxp = fxpIn;
  // Lower time factor in MED allows lower BPM values (effects.c:525).
  const minBpm = Math.trunc(0.5 + (core.module!.time_factor ?? 10) * XMP_MIN_BPM / 10);
  if (fxp < minBpm) fxp = minBpm;
  core.ctx.p.bpm = fxp;
}

/** FX_SETPAN body (effects.c:279-283). */
function setPanArmImpl(_core: Core, xc: ChannelState, fxp: number): void {
  fxSetPan(xc, fxp);
}

function doToneportaCore(core: Core, xc: ChannelState, note: number): void {
  const mod = core.module!;
  const instrument = mod.instruments[xc.ins];
  if (!instrument) return;
  let mappedXpo = 0;
  let mapped = 0;
  if (xc.key >= 0 && xc.key <= 119) {
    mapped = instrument.map[xc.key] ?? 0;
  }
  if (mapped >= instrument.nsm) mapped = 0;
  const sub = instrument.sub[mapped];
  if (isValidNoteRange(note - 1) && xc.ins < mod.instruments.length) {
    const n = note - 1;
    if (isValidNoteRange(xc.key_porta)) {
      mappedXpo = instrument.mapXpo[xc.key_porta] ?? 0;
    }
    xc.porta.target = noteToPeriodMod(mod.periodType, n + (sub?.xpo ?? 0) + mappedXpo, xc.finetune, xc.per_adj);
  }
  xc.porta.dir = xc.period < xc.porta.target ? 1 : -1;
}

/** IS_VALID_NOTE (player.h:82). */
function isValidNoteRange(n: number): boolean {
  return (n >>> 0) < 121;
}

function noteToPeriodMod(periodType: number, n: number, f: number, adj: number): number {
  const d = n + f / 128;
  switch (periodType) {
    case 2 /* LINEAR */:
      return (240.0 - d) * 16;
    case 3 /* CSPD */:
      return (8363.0 * Math.pow(2, n / 12.0)) / 32 + f;
    default:
      return PERIOD_BASE / Math.pow(2, d / 12) * (adj > 0.1 ? adj : 1);
  }
}

/** Extended effect sub-dispatch (effects.c:388-463). */
function extendedFx(
  core: Core,
  xc: ChannelState,
  chn: number,
  ev: Event,
  fxpRaw: number,
  note: number,
  hooks: FlowHooks,
): void {
  // EFFECT_MEMORY_S3M (effects.c:389): applies to whole fxp before split
  let fxp = fxpRaw;
  if (hasQuirk(core, Quirk.ST3BUGS)) {
    if (fxp === 0) {
      fxp = xc.vol.memory;
    } else {
      xc.vol.memory = fxp;
    }
  }

  const fxt = fxp >> 4;
  fxp &= 0x0f;
  switch (fxt) {
    case FX.EX_FILTER:
      exFilterAmiga(core, fxp);
      break;
    case FX.EX_F_PORTA_UP:
      if (fxp === 0) fxp = xc.fine_porta.up_memory;
      else xc.fine_porta.up_memory = fxp;
      fxFPortaUp(core, xc, fxp);
      break;
    case FX.EX_F_PORTA_DN:
      if (fxp === 0) fxp = xc.fine_porta.down_memory;
      else xc.fine_porta.down_memory = fxp;
      fxFPortaDn(core, xc, fxp);
      break;
    case FX.EX_GLISS:
      if (fxp) xc.note_flags |= NOTE_GLISSANDO_BIT;
      else xc.note_flags &= ~NOTE_GLISSANDO_BIT;
      break;
    case FX.EX_VIBRATO_WF:
      lfoSetWaveform(xc.vibrato.lfo, fxp & 3);
      break;
    case FX.EX_FINETUNE:
      if (!hasQuirk(core, Quirk.FT2BUGS) || note > 0) {
        const v = (fxp << 4) & 0xff;
        xc.finetune = v >= 0x80 ? v - 0x100 : v;
      }
      break;
    case FX.EX_PATTERN_LOOP:
      if (hooks.patternLoop) {
        hooks.patternLoop(core, chn, core.ctx.p.row, fxp);
      } else {
        flowPatternLoop(core, chn, core.ctx.p.row, fxp);
      }
      break;
    case FX.EX_TREMOLO_WF:
      lfoSetWaveform(xc.tremolo.lfo, fxp & 3);
      break;
    case FX.EX_SETPAN:
      setPanArmImpl(core, xc, fxp << 4);
      break;
    case FX.EX_RETRIG:
      exRetrig(core, xc, fxp);
      break;
    case FX.EX_F_VSLIDE_UP:
      if (fxp === 0) fxp = xc.fine_vol.up_memory;
      else xc.fine_vol.up_memory = fxp;
      fvslideUpShared(core, xc, fxp);
      break;
    case FX.EX_F_VSLIDE_DN:
      if (fxp === 0) fxp = xc.fine_vol.down_memory;
      else xc.fine_vol.down_memory = fxp;
      fvslideDnShared(core, xc, fxp);
      break;
    case FX.EX_CUT:
      exCut(xc, fxp);
      break;
    case FX.EX_DELAY:
      /* computed at frame loop (read_row/check_delay) */
      break;
    case FX.EX_PATT_DELAY:
      if (hooks.pattDelay) {
        hooks.pattDelay(core, xc, fxp);
      } else {
        flowPattDelay(core, fxp);
      }
      break;
    case FX.EX_INVLOOP:
      xc.invloop.speed = fxp;
      break;
  }
  void ev;
}

function exFilterAmiga(core: Core, fxp: number): void {
  const mod = core.module!;
  if (
    mod.readEventType === 0 &&
    mod.periodType === 1
  ) {
    core.ctx.p.filter = fxp & 1 ? 0 : 1;
  }
}

