// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/effects.c (volume/pan/flow/tempo arms).
// Volume / pan / flow / tempo effect arms of libxmp_process_fx
// (reference/libxmp/src/effects.c). These complete the processFx switch
// started in fx.ts (T12): FX_VOLSLIDE family, tremor, retrig, pan, gvol,
// flow jumps and tempo.

import type { Core, ChannelState } from '@modplayjs/core';
import { Quirk } from '@modplayjs/core';
import { MSN, LSN, SET, hasQuirk, effectMemoryS3m, NOTE_CUT } from './helpers.js';
import { VolSlideFlag } from './state.js';

/** XMP_MIN_BPM (include/xmp.h:135). */
export const XMP_MIN_BPM = 20;
export const ROWDELAY_ON = 1 << 0;
export const ROWDELAY_FIRST_FRAME = 1 << 1;

// -- flow hooks: implemented against Core's flow.ts delegates ----------------

// -- volume -------------------------------------------------------------------

/** FX_VOLSLIDE incl. S3M fine-split + QUIRK_FINEFX (effects.c:302-355). */
export function fxVolSlide(core: Core, xc: ChannelState, fxpIn: number): void {
  let fxp = fxpIn;

  volslideLabel: while (true) {
    if (hasQuirk(core, Quirk.FINEFX)) {
      const h = MSN(fxp);
      const l = LSN(fxp);
      if (l === 0xf && h !== 0) {
        xc.vol.memory = fxp;
        fxp >>= 4;
        fvslideUpShared(core, xc, fxp);
        return;
      } else if (h === 0xf && l !== 0) {
        xc.vol.memory = fxp;
        fxp &= 0x0f;
        fvslideDnShared(core, xc, fxp);
        return;
      }
    }

    /* recover memory */
    if (fxp === 0x00) {
      if (xc.vol.memory !== 0) {
        fxp = xc.vol.memory;
        continue volslideLabel;
      }
    }

    if (fxp) {
      SET(xc, VolSlideFlag.VOL_SLIDE);
      xc.vol.memory = fxp;
      const h = MSN(fxp);
      const l = LSN(fxp);
      if (hasQuirk(core, Quirk.VOLPDN)) {
        xc.vol.slide = l ? -l : h;
      } else {
        xc.vol.slide = h ? h : -l;
      }
    }

    /* Mirko D0F hack (effects.c:349-355). */
    if (hasQuirk(core, Quirk.FINEFX)) {
      if (MSN(xc.vol.memory) === 0xf || LSN(xc.vol.memory) === 0xf) {
        SET(xc, VolSlideFlag.FINE_VOLS);
        xc.vol.fslide = xc.vol.slide;
      }
    }
    return;
  }
}

/** FX_F_VSLIDE_UP label target (effects.c:497-501). */
export function fvslideUpShared(_core: Core, xc: ChannelState, fxp: number): void {
  SET(xc, VolSlideFlag.FINE_VOLS);
  xc.vol.fslide = fxp;
}

/** FX_F_VSLIDE_DN label target (effects.c:502-505-ish, via :518-520). */
export function fvslideDnShared(_core: Core, xc: ChannelState, fxp: number): void {
  SET(xc, VolSlideFlag.FINE_VOLS);
  xc.vol.fslide = -fxp;
}

/** FX_VOLSET (effects.c:379-388). */
export function fxVolSet(core: Core, xc: ChannelState, fxp: number): void {
  SET(xc, VolSlideFlag.NEW_VOL);
  xc.volume = fxp;
  if (xc.split) {
    const pair = core.ctx.channelStates[xc.pair];
    if (pair) pair.volume = xc.volume;
  }
}

/** FX_TRK_VSLIDE (effects.c:731-763): IT "N" channel-volume slide. */
export function fxTrkVSlide(core: Core, xc: ChannelState, fxpIn: number): void {
  let fxp = fxpIn;

  if (fxp === 0) {
    const mem = xc.trackvol.memory;
    if (mem === 0) return;
    fxp = mem;
  }

  if (hasQuirk(core, Quirk.FINEFX)) {
    const h = MSN(fxp);
    const l = LSN(fxp);
    if (h === 0xf && l !== 0) {
      xc.trackvol.memory = fxp;
      fxTrkFVSlide(xc, fxp & 0x0f);
      return;
    } else if (l === 0xf && h !== 0) {
      xc.trackvol.memory = fxp;
      fxTrkFVSlide(xc, fxp & 0xf0);
      return;
    }
  }

  SET(xc, VolSlideFlag.TRK_VSLIDE);
  if (fxp) {
    const h = MSN(fxp);
    const l = LSN(fxp);
    xc.trackvol.memory = fxp;
    if (hasQuirk(core, Quirk.VOLPDN)) {
      xc.trackvol.slide = l ? -l : h;
    } else {
      xc.trackvol.slide = h ? h : -l;
    }
  }
}

/** FX_TRK_FVSLIDE (effects.c:764-772): IT channel-volume fine slide. */
export function fxTrkFVSlide(xc: ChannelState, fxp: number): void {
  SET(xc, VolSlideFlag.TRK_FVSLIDE);
  if (fxp) {
    xc.trackvol.fslide = MSN(fxp) - LSN(fxp);
  }
}
// -- pan ----------------------------------------------------------------------

/** FX_SETPAN body incl. EX_SETPAN target (effects.c:279-283). */
export function fxSetPan(xc: ChannelState, fxp: number): void {
  xc.pan.val = fxp;
  xc.pan.surround = 0;
  xc.rpv = 0; /* storlek_20: set pan overrides random pan */
}

/** FX_PANSLIDE (XM, effects.c:645-653) / FX_PANSL_NOMEM (:656-661). */
export function fxPanSlide(core: Core, xc: ChannelState, fxpIn: number, mem: boolean): void {
  void core;
  let fxp = fxpIn;
  if (mem) {
    if (fxp === 0) fxp = xc.pan.memory;
    else xc.pan.memory = fxp;
  }
  SET(xc, VolSlideFlag.PAN_SLIDE);
  xc.pan.slide = LSN(fxp) - MSN(fxp);
}

/** FX_IT_PANSLIDE (effects.c:662-682). */
export function fxItPanSlide(xc: ChannelState, fxp: number): void {
  SET(xc, VolSlideFlag.PAN_SLIDE);
  if (fxp) {
    if (MSN(fxp) === 0xf) {
      xc.pan.slide = 0;
      xc.pan.fslide = LSN(fxp);
    } else if (LSN(fxp) === 0xf) {
      xc.pan.slide = 0;
      xc.pan.fslide = -MSN(fxp);
    } else {
      SET(xc, VolSlideFlag.PAN_SLIDE);
      xc.pan.slide = LSN(fxp) - MSN(fxp);
      xc.pan.fslide = 0;
    }
  }
}

/** FX_SURROUND (effects.c:718-720). */
export function fxSurround(xc: ChannelState, fxp: number): void {
  xc.pan.surround = fxp;
}

// -- tremor/retrig --------------------------------------------------------------

/** FX_TREMOR (effects.c:686-700). */
export function fxTremor(core: Core, xc: ChannelState, fxpIn: number): void {
  let fxp = fxpIn;
  // EFFECT_MEMORY(fxp, xc->tremor.memory)
  if (fxp === 0) {
    fxp = hasQuirk(core, Quirk.ST3BUGS) ? xc.vol.memory : xc.tremor.memory;
  } else if (hasQuirk(core, Quirk.ST3BUGS)) {
    xc.vol.memory = fxp;
    xc.tremor.memory = fxp;
  } else {
    xc.tremor.memory = fxp;
  }
  xc.tremor.up = MSN(fxp);
  xc.tremor.down = LSN(fxp);
  if (core.module!.readEventType !== 1 /* not FT2 */) {
    if (xc.tremor.up === 0) xc.tremor.up++;
    if (xc.tremor.down === 0) xc.tremor.down++;
  }
  SET(xc, VolSlideFlag.TREMOR);
}

/** EX_RETRIG label target (effects.c:430-437). */
export function exRetrig(core: Core, xc: ChannelState, fxp: number): void {
  SET(xc, VolSlideFlag.RETRIG);
  xc.retrig.val = fxp;
  xc.retrig.count = fxp + 1;
  xc.retrig.type = 0;
  xc.retrig.limit = hasQuirk(core, Quirk.RTONCE) ? 1 : 0;
}

/** EX_CUT (effects.c:446-453). */
export function exCut(xc: ChannelState, fxp: number): void {
  SET(xc, VolSlideFlag.RETRIG);
  xc.note_flags |= NOTE_CUT;
  xc.retrig.val = fxp + 1;
  xc.retrig.count = xc.retrig.val;
  xc.retrig.type = 0x10;
}

/** FX_MULTI_RETRIG (effects.c:674-685). */
export function fxMultiRetrig(
  core: Core, xc: ChannelState, fxpIn: number, note: number,
): void {
  let fxp = effectMemoryS3m(core, fxpIn, {
    get: () => xc.vol.memory,
    set: (v) => { xc.vol.memory = v; },
  });
  if (fxp) {
    xc.retrig.val = LSN(fxp);
    xc.retrig.type = MSN(fxp);
  }
  if (note) {
    xc.retrig.count = xc.retrig.val + 1;
  }
  xc.retrig.limit = 0;
  SET(xc, VolSlideFlag.RETRIG);
}

// -- global volume -------------------------------------------------------------

/** FX_GLOBALVOL (effects.c:586-592). */
export function fxGlobalVol(core: Core, fxp: number): void {
  if (fxp > core.module!.gvolbase) {
    core.ctx.p.gvol = core.module!.gvolbase;
  } else {
    core.ctx.p.gvol = fxp;
  }
}

/** FX_GVOL_SLIDE with QUIRK_FINEFX fine split (effects.c:593-621). */
export function fxGvolSlide(core: Core, xc: ChannelState, fxpIn: number): void {
  let fxp = fxpIn;
  if (fxp) {
    gvolslideShared(core, xc, fxp);
    return;
  }
  if (xc.gvol.memory !== 0) {
    gvolslideShared(core, xc, xc.gvol.memory);
  }
}

function gvolslideShared(core: Core, xc: ChannelState, fxpIn: number): void {
  let fxp = fxpIn;
  SET(xc, VolSlideFlag.GVOL_SLIDE);
  xc.gvol.memory = fxp;
  const h = MSN(fxp);
  const l = LSN(fxp);

  if (hasQuirk(core, Quirk.FINEFX)) {
    if (l === 0xf && h !== 0) {
      xc.gvol.slide = 0;
      xc.gvol.fslide = h;
    } else if (h === 0xf && l !== 0) {
      xc.gvol.slide = 0;
      xc.gvol.fslide = -l;
    } else {
      xc.gvol.slide = h ? h : -l;
      xc.gvol.fslide = 0;
    }
  } else {
    xc.gvol.slide = h ? h : -l;
    xc.gvol.fslide = 0;
  }
  void fxp;
}

// -- keyoff/envpos --------------------------------------------------------------

/** FX_KEYOFF (effects.c:622-624). */
export function fxKeyoff(xc: ChannelState, fxp: number): void {
  xc.keyoff = fxp + 1;
}

/** FX_ENVPOS with FT2 sustain gate (effects.c:625-644). */
export function fxEnvPos(core: Core, xc: ChannelState, fxp: number): void {
  if (hasQuirk(core, Quirk.FT2BUGS)) {
    const instrument = core.module!.instruments[xc.ins];
    if (instrument) {
      // XMP_ENVELOPE_SUS check on volume envelope (instrument->aei.flg & XMP_ENVELOPE_SUS)
      const ENV_SUS = 1 << 1; // include/xmp.h XMP_ENVELOPE_SUS
      if ((instrument.aei.flags & ENV_SUS) !== 0) {
        xc.p_idx = fxp;
      }
    }
  } else {
    xc.p_idx = fxp;
  }
  xc.v_idx = fxp;
  xc.f_idx = fxp;
}

// -- tempo ----------------------------------------------------------------------

/** FX_SPEED arm (effects.c:463-476): NOBPM/VBLANK/fxp<0x20 → s3m_speed. */
export function fxSpeed(core: Core, fxp: number): void {
  const useVblank =
    hasQuirk(core, Quirk.NOBPM) ||
    (core.ctx.p.flags & 1 /* XMP_FLAGS_VBLANK */) !== 0;
  if (useVblank || fxp < 0x20) {
    s3mSpeedShared(core, fxp);
    return;
  }
  s3mBpmShared(core, fxp);
}

/** FX_S3M_SPEED (effects.c:512-520). */
export function fxS3mSpeed(core: Core, fxp: number): void {
  s3mSpeedShared(core, fxp);
}
function s3mSpeedShared(core: Core, fxp: number): void {
  if (fxp) {
    core.ctx.p.speed = fxp;
  }
}

/** FX_S3M_BPM (effects.c:522-531). */
export function fxS3mBpm(core: Core, fxp: number): void {
  s3mBpmShared(core, fxp);
}
function s3mBpmShared(core: Core, fxpIn: number): void {
  let fxp = fxpIn;
  // Lower time factor in MED allows lower BPM values
  const minBpm = Math.trunc(0.5 + core.module!.time_factor * XMP_MIN_BPM / 10);
  if (fxp < minBpm) fxp = minBpm;
  core.ctx.p.bpm = fxp;
}

/** FX_IT_BPM (effects.c:533-548). */
export function fxItBpm(core: Core, xc: ChannelState, fxp: number): void {
  if (MSN(fxp) === 0) {
    SET(xc, VolSlideFlag.TEMPO_SLIDE);
    if (LSN(fxp)) xc.tempo_slide = -LSN(fxp);
    /* T00 - Repeat previous slide */
  } else if (MSN(fxp) === 1) {
    SET(xc, VolSlideFlag.TEMPO_SLIDE);
    xc.tempo_slide = LSN(fxp);
  } else {
    let b = fxp;
    if (b < XMP_MIN_BPM) b = XMP_MIN_BPM;
    core.ctx.p.bpm = b;
  }
}

/** FX_IT_ROWDELAY (effects.c:549-553). */
export function fxItRowDelay(core: Core, fxp: number): void {
  const f = core.ctx.p.flow;
  if (!f.rowdelay_set) {
    f.rowdelay = fxp;
    f.rowdelay_set = ROWDELAY_ON | ROWDELAY_FIRST_FRAME;
  }
}

/** Secondary volume-slide arms (effects.c:560-572) — IT volume column. */
export function fxVslideUp2(xc: ChannelState, fxp: number): void {
  if (fxp) {
    SET(xc, VolSlideFlag.VOL_SLIDE_2);
    const h = MSN(fxp), l = LSN(fxp);
    xc.vol.slide2 = h ? h : -l;
  }
}

export function fxVslFslideUp2(xc: ChannelState, fxp: number): void {
  if (fxp) {
    xc.vol.memory2 = fxp;
    SET(xc, VolSlideFlag.FINE_VOLS_2);
    xc.vol.fslide2 = fxp;
  }
}

export function fxVslFslideDn2(xc: ChannelState, fxp: number): void {
  if (fxp) {
    xc.vol.memory2 = fxp;
    SET(xc, VolSlideFlag.FINE_VOLS_2);
    xc.vol.fslide2 = -fxp;
  }
}
