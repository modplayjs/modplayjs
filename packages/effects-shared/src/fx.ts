// libxmp_process_fx port (reference/libxmp/src/effects.c:108-1149).
// T12 scope: quirk infrastructure + note/pitch effects. Volume/pan/flow
// effects live in vfx.ts (T13); this module also carries the EX_* extended
// sub-operations that belong to note/pitch handling (gliss, finetune, LFO
// waveforms). Flow-relevant subops route into fxts.ts via callbacks supplied
// by the format readers.

import type { Core, ChannelState, Event } from '@modplayjs/core';
import { Quirk, ReadEventType } from '@modplayjs/core';
import {
  MSN,
  LSN,
  SET,
  RESET_NOTE,
  SET_NOTE,
  hasQuirk,
  lfoSetWaveform,
  doToneporta,
  setLfoNotzero as setLfoNotzeroShared,
  NOTE_GLISSANDO,
} from './helpers.js';
import { VolSlideFlag } from './state.js';

/**
 * FX_ARPEGGIO / FX_S3M_ARPEGGIO (effects.c:133-149).
 * S3M arpeggio shares one memory slot via EFFECT_MEMORY; plain arpeggio only
 * stores when HAS_QUIRK(ARPMEM) is false or fxp != 0.
 */
export function fxArpeggio(core: Core, xc: ChannelState, fxpIn: number, s3mMem: boolean): void {
  let fxp = fxpIn;
  if (s3mMem) {
    // EFFECT_MEMORY(fxp, xc->arpeggio.memory)
    if (fxp === 0) {
      fxp = xc.arpeggio.memory;
    } else if (hasQuirk(core, Quirk.ST3BUGS)) {
      xc.vol.memory = fxp;
      xc.arpeggio.memory = fxp;
    } else {
      xc.arpeggio.memory = fxp;
    }
  }
  if (!hasQuirk(core, Quirk.ARPMEM) || fxp !== 0) {
    xc.arpeggio.val[0] = 0;
    xc.arpeggio.val[1] = MSN(fxp);
    xc.arpeggio.val[2] = LSN(fxp);
    xc.arpeggio.size = 3;
  }
}

/** FX_OKT_ARP3/4/5 (effects.c:153-180). variant = 3|4|5. */
export function fxOktArp(xc: ChannelState, variant: number, fxp: number): void {
  if (fxp === 0) return;
  switch (variant) {
    case 3:
      xc.arpeggio.val[0] = -MSN(fxp);
      xc.arpeggio.val[1] = 0;
      xc.arpeggio.val[2] = LSN(fxp);
      xc.arpeggio.size = 3;
      break;
    case 4:
      xc.arpeggio.val[0] = 0;
      xc.arpeggio.val[1] = LSN(fxp);
      xc.arpeggio.val[2] = 0;
      xc.arpeggio.val[3] = -MSN(fxp);
      xc.arpeggio.size = 4;
      break;
    case 5:
      xc.arpeggio.val[0] = LSN(fxp);
      xc.arpeggio.val[1] = LSN(fxp);
      xc.arpeggio.val[2] = 0;
      xc.arpeggio.size = 3;
      break;
  }
}

/** FX_PORTA_UP (effects.c:173-194 incl. fine split under QUIRK_FINEFX). */
export function fxPortaUp(
  core: Core, xc: ChannelState, fxpIn: number, fnum: number,
): void {
  let fxp = fxpIn;
  // EFFECT_MEMORY(fxp, xc->freq.memory)
  if (fxp === 0) {
    fxp = xc.freq.memory;
  } else {
    xc.freq.memory = fxp;
  }

  if (
    hasQuirk(core, Quirk.FINEFX) &&
    (fnum === 0 || !hasQuirk(core, Quirk.ITPOR))
  ) {
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

/** FX_PORTA_DN (effects.c:195-217): FT2 keeps separate down memory. */
export function fxPortaDn(
  core: Core, xc: ChannelState, fxpIn: number, fnum: number,
): void {
  let fxp = fxpIn;
  if (hasQuirk(core, Quirk.FT2BUGS)) {
    if (fxp === 0) {
      fxp = xc.freq.down_memory;
    } else {
      xc.freq.down_memory = fxp;
    }
  } else {
    if (fxp === 0) {
      fxp = xc.freq.memory;
    } else {
      xc.freq.memory = fxp;
    }
  }

  if (
    hasQuirk(core, Quirk.FINEFX) &&
    (fnum === 0 || !hasQuirk(core, Quirk.ITPOR))
  ) {
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

/** FX_TONEPORTA (effects.c:222-243). */
export function fxToneporta(
  core: Core, xc: ChannelState, fxpIn: number, note: number,
): void {
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

  doToneporta(core, xc, note);
  SET(xc, VolSlideFlag.TONEPORTA);
}

/** FX_VIBRATO (effects.c:244-249). */
export function fxVibrato(core: Core, xc: ChannelState, fxpIn: number): void {
  let fxp = fxpIn;
  // EFFECT_MEMORY_SETONLY
  if (fxp === 0) {
    fxp = xc.vibrato.memory;
  } else {
    xc.vibrato.memory = fxp;
  }
  if (hasQuirk(core, Quirk.ST3BUGS) && fxp !== 0) {
    xc.vol.memory = fxp;
  }
  SET(xc, VolSlideFlag.VIBRATO);
  setLfoNotzeroShared(xc.vibrato.lfo, LSN(fxp) << 2, MSN(fxp));
}

/** FX_FINE_VIBRATO (effects.c:250-255): depth not shifted. */
export function fxFineVibrato(core: Core, xc: ChannelState, fxpIn: number): void {
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
  setLfoNotzeroShared(xc.vibrato.lfo, LSN(fxp), MSN(fxp));
}

/** FX_TREMOLO (effects.c:269-274). */
export function fxTremolo(core: Core, xc: ChannelState, fxpIn: number): void {
  let fxp = fxpIn;
  // EFFECT_MEMORY
  if (fxp === 0) {
    fxp = hasQuirk(core, Quirk.ST3BUGS) ? xc.vol.memory : xc.tremolo.memory;
  } else {
    if (hasQuirk(core, Quirk.ST3BUGS)) xc.vol.memory = fxp;
    else xc.tremolo.memory = fxp;
  }
  SET(xc, VolSlideFlag.TREMOLO);
  setLfoNotzeroShared(xc.tremolo.lfo, LSN(fxp), MSN(fxp));
}

/** FX_OFFSET (effects.c:284-306). needsEvent: pass e for ins/note checks. */
export function fxOffset(core: Core, xc: ChannelState, fxpIn: number, ev: Event): void {
  let fxp = fxpIn;
  if (hasQuirk(core, Quirk.FT2BUGS)) {
    /* FT2: only set memory when offset activates (ft2_offset_memory.xm). */
    fxp = fxp ? fxp : xc.offset.memory;
  } else if (fxp === 0) {
    fxp = xc.offset.memory;
  } else {
    xc.offset.memory = fxp;
  }
  SET(xc, VolSlideFlag.OFFSET);
  if (ev.note) {
    // Note: libxmp does `xc->offset.val &= xc->offset.val & ~0xffff` which
    // clears low bits then ORs — identical to val &= ~0xffff.
    xc.offset.val |= fxp << 8;
    xc.offset.val2 = fxp << 8;
  }
  if (ev.ins) {
    xc.offset.val2 = fxp << 8;
  }
}

/** FX_PANBRELLO (effects.c:837-842). */
export function fxPanbrello(_core: Core, xc: ChannelState, fxp: number): void {
  SET(xc, VolSlideFlag.PANBRELLO);
  setLfoNotzeroShared(xc.panbrello.lfo, LSN(fxp) << 4, MSN(fxp));
}

/** FX_PANBRELLO_WF (effects.c:843-845). */
export function fxPanbrelloWf(xc: ChannelState, fxp: number): void {
  lfoSetWaveform(xc.panbrello.lfo, fxp & 3);
}

/** FX_FINETUNE (effects.c:493-496): E5x-free S3M form. */
export function fxFinetune(xc: ChannelState, fxp: number): void {
  xc.finetune = fxp - 0x80 | 0;
}

/** EX_FINETUNE (effects.c:416-420). */
export function exFinetune(core: Core, xc: ChannelState, fxp: number, note: number): void {
  if (!hasQuirk(core, Quirk.FT2BUGS) || note > 0) {
    // int8 cast of (fxp << 4)
    const v = (fxp << 4) & 0xff;
    xc.finetune = v >= 0x80 ? v - 0x100 : v;
  }
}

/** FX_F_PORTA_UP shared label target (effects.c:506-512). */
export function fxFPortaUp(_core: Core, xc: ChannelState, fxp: number): void {
  if (fxp) {
    SET(xc, VolSlideFlag.FINE_BEND);
    xc.freq.fslide = -fxp;
  }
}

/** FX_F_PORTA_DN label target (effects.c:513-519). */
export function fxFPortaDn(_core: Core, xc: ChannelState, fxp: number): void {
  if (fxp) {
    SET(xc, VolSlideFlag.FINE_BEND);
    xc.freq.fslide = fxp;
  }
}

/** FX_XF_PORTA (effects.c:727-744). */
export function fxXfPorta(core: Core, xc: ChannelState, fxpIn: number): void {
  const h = MSN(fxpIn);
  const fxp = fxpIn & 0x0f;
  switch (h) {
    case 1: /* XX_XF_PORTA_UP */
      // EFFECT_MEMORY into fine_porta.xf_up_memory happens in the caller
      // (only XM routes here directly with memory semantics).
      fxXfPortaUp(core, xc, fxp);
      break;
    case 2: /* XX_XF_PORTA_DN */
      fxXfPortaDn(core, xc, fxp);
      break;
  }
}

/** Label target fx_xf_porta_up (effects.c:731-736). */
export function fxXfPortaUp(_core: Core, xc: ChannelState, fxp: number): void {
  SET(xc, VolSlideFlag.FINE_BEND);
  xc.freq.fslide = -0.25 * fxp;
}

/** Label target fx_xf_porta_dn (effects.c:737-743). */
export function fxXfPortaDn(_core: Core, xc: ChannelState, fxp: number): void {
  SET(xc, VolSlideFlag.FINE_BEND);
  xc.freq.fslide = 0.25 * fxp;
}

/** EX_GLISS (effects.c:397-402). */
export function exGliss(xc: ChannelState, fxp: number): void {
  if (fxp) {
    SET_NOTE(xc, NOTE_GLISSANDO);
  } else {
    RESET_NOTE(xc, NOTE_GLISSANDO);
  }
}

/** EX_VIBRATO_WF (effects.c:403-406) / EX_TREMOLO_WF (:410-412). */
export function exVibratoWf(xc: ChannelState, fxp: number): void {
  lfoSetWaveform(xc.vibrato.lfo, fxp & 3);
}

export function exTremoloWf(xc: ChannelState, fxp: number): void {
  lfoSetWaveform(xc.tremolo.lfo, fxp & 3);
}

/** EX_FILTER — Amiga LED filter (effects.c:389-396). Needs PlayState write. */
export function exFilter(core: Core, fxp: number): void {
  // IS_AMIGA_MOD(): period MODRNG + paula-ish formats.
  const mod = core.module!;
  const amigaMod =
    mod.readEventType === ReadEventType.MOD && mod.periodType === 1 /* MODRNG */;
  if (amigaMod) {
    core.ctx.p.filter = fxp & 1 ? 0 : 1;
  }
}

/** EX_INVLOOP (effects.c:460-463). */
export function exInvloop(xc: ChannelState, fxp: number): void {
  xc.invloop.speed = fxp;
}

// Shared local -------------------------------------------------------------
