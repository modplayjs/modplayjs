// read_event_it (reference/libxmp/src/read_event.c:933-1371) plus the
// IT-only static helpers it depends on (read_event.c:76-131 and :860-931):
// reset_envelope_volume, reset_envelopes_carry, copy_channel, check_fadeout,
// check_invalid_sample, fix_period, is_same_sid.

import type { ChannelState, Core, Event, SubInstrument } from '@modplayjs/core';
import { Quirk } from '@modplayjs/core';
import {
  RESET_NOTE,
  SET,
  SET_NOTE,
  TEST,
  TEST_NOTE,
  getRandom,
  isValidNote,
  noteToPeriod,
} from './helpers.js';
import { NoteFlag, VolSlideFlag } from './state.js';
import {
  getInstrument,
  getSubinstrument,
  isToneportaFx,
  isValidInstrument,
  isValidSample,
  resetEnvelopes,
  setChannelPan,
  setChannelVolume,
  setEffectDefaults,
  setPeriod,
  sustainCheckEnv,
} from './readevent.js';
import { processFx } from './process.js';

const XMP_KEY_OFF = 0x81;
const XMP_KEY_CUT = 0x82;
const XMP_KEY_FADE = 0x83;

/** XMP_INST_NNA_CONT (xmp.h). */
const NNA_CONT = 0x01;
/** XMP_INST_NNA_CUT. */
const NNA_CUT = 0x00;
/** XMP_INST_DCT_OFF. */
const DCT_OFF = 0x00;

/**
 * reset_envelope_volume (read_event.c:76-86): clear NOTE_ENV_END and reset
 * only the volume envelope position (it_fade_env_reset_carry.it).
 */
function resetEnvelopeVolume(core: Core, xc: ChannelState): void {
  if (!isValidInstrument(core, xc.ins)) return;

  RESET_NOTE(xc, NoteFlag.ENV_END);

  xc.v_idx = -1;
}

/**
 * reset_envelopes_carry (read_event.c:90-110): clear NOTE_ENV_END and reset
 * each envelope position whose envelope lacks CARRY.
 */
function resetEnvelopesCarry(core: Core, xc: ChannelState): void {
  if (!isValidInstrument(core, xc.ins)) return;

  RESET_NOTE(xc, NoteFlag.ENV_END);

  const xxi = getInstrument(core, xc.ins);
  if (!xxi) return;

  /* Reset envelope positions */
  if ((~xxi.aei.flags & 1 << 5 /* XMP_ENVELOPE_CARRY */) !== 0) {
    xc.v_idx = -1;
  }
  if ((~xxi.pei.flags & 1 << 5) !== 0) {
    xc.p_idx = -1;
  }
  if ((~xxi.fei.flags & 1 << 5) !== 0) {
    xc.f_idx = -1;
  }
}

/**
 * copy_channel (read_event.c:873-878): full channel_data copy for NNA
 * virtual channels. to > 0 && to != from.
 */
function copyChannel(core: Core, to: number, from: number): void {
  if (to > 0 && to !== from) {
    const arr = core.channelStates as ChannelState[];
    const src = arr[from];
    const dst = arr[to];
    if (!src || !dst) return;
    // C memcpy semantics: plain-data struct copy. ChannelState holds only
    // plain fields, nested plain objects and one Event (delayed_event).
    deepCopyChannel(src, dst);
  }
}

function deepCopyChannel(src: ChannelState, dst: ChannelState): void {
  dst.flags = src.flags;
  dst.per_flags = src.per_flags;
  dst.note_flags = src.note_flags;
  dst.note = src.note;
  dst.key = src.key;
  dst.period = src.period;
  dst.finalPeriod = src.finalPeriod;
  dst.ins = src.ins;
  dst.old_ins = src.old_ins;
  dst.smp = src.smp;
  dst.mastervol = src.mastervol;
  dst.delay = src.delay;
  dst.keyoff = src.keyoff;
  dst.fadeout = src.fadeout;
  dst.ins_fade = src.ins_fade;
  Object.assign(dst.macro, src.macro);
  Object.assign(dst.noteslide, src.noteslide);
  dst.volume = src.volume;
  dst.gvl = src.gvl;
  dst.rvv = src.rvv;
  dst.rpv = src.rpv;
  dst.split = src.split;
  dst.pair = src.pair;
  dst.v_idx = src.v_idx;
  dst.p_idx = src.p_idx;
  dst.f_idx = src.f_idx;
  dst.key_porta = src.key_porta;
  dst.finetune = src.finetune;
  dst.per_adj = src.per_adj;
  Object.assign(dst.vibrato.lfo, src.vibrato.lfo);
  dst.vibrato.memory = src.vibrato.memory;
  Object.assign(dst.tremolo.lfo, src.tremolo.lfo);
  dst.tremolo.memory = src.tremolo.memory;
  Object.assign(dst.panbrello.lfo, src.panbrello.lfo);
  dst.panbrello.memory = src.panbrello.memory;
  dst.arpeggio.val = src.arpeggio.val.slice();
  dst.arpeggio.size = src.arpeggio.size;
  dst.arpeggio.count = src.arpeggio.count;
  dst.arpeggio.memory = src.arpeggio.memory;
  Object.assign(dst.insvib.lfo, src.insvib.lfo);
  dst.insvib.sweep = src.insvib.sweep;
  Object.assign(dst.offset, src.offset);
  Object.assign(dst.retrig, src.retrig);
  Object.assign(dst.tremor, src.tremor);
  Object.assign(dst.vol, src.vol);
  Object.assign(dst.fine_vol, src.fine_vol);
  Object.assign(dst.gvol, src.gvol);
  Object.assign(dst.trackvol, src.trackvol);
  Object.assign(dst.freq, src.freq);
  Object.assign(dst.porta, src.porta);
  Object.assign(dst.fine_porta, src.fine_porta);
  Object.assign(dst.pan, src.pan);
  Object.assign(dst.invloop, src.invloop);
  dst.tempo_slide = src.tempo_slide;
  Object.assign(dst.filter, src.filter);
  Object.assign(dst.delayed_event, src.delayed_event);
  dst.delayed_ins = src.delayed_ins;
  dst.key_memory = src.key_memory;
  dst.info_period = src.info_period;
  dst.info_pitchbend = src.info_pitchbend;
  dst.info_position = src.info_position;
  dst.info_finalvol = src.info_finalvol;
  dst.info_finalpan = src.info_finalpan;
  dst.info_notepan = src.info_notepan;
}

/**
 * check_fadeout (read_event.c:880-892).
 */
function checkFadeout(core: Core, xc: ChannelState, ins: number): boolean {
  const xxi = getInstrument(core, ins);
  if (xxi === null) {
    return true;
  }

  const ON = 1 << 0;
  const CARRY = 1 << 5;
  return (
    (~xxi.aei.flags & ON) !== 0 ||
    (~xxi.aei.flags & CARRY) !== 0 ||
    xc.ins_fade === 0 ||
    xc.fadeout <= xc.ins_fade
  );
}

/**
 * check_invalid_sample (read_event.c:894-907): map[key].ins == 0xff or
 * points past the sample list.
 */
function checkInvalidSample(core: Core, ins: number, key: number): boolean {
  const mod = core.module!;
  if (ins >= 0 && ins < mod.ins) {
    const xxi = mod.instruments[ins];
    if (!xxi) return true;
    const smp = xxi.map[key] ?? 0xff;
    if (smp === 0xff || smp >= mod.samples.length) {
      return true;
    }
  }
  return false;
}

/**
 * fix_period (read_event.c:909-919): NNA_CONT recompute of the period from
 * the key_porta transposition.
 */
function fixPeriod(core: Core, chn: number, sub: SubInstrument): void {
  if (sub.nna === NNA_CONT) {
    const mod = core.module!;
    const xc = core.channelStates[chn]!;
    const xxi = getInstrument(core, xc.ins);
    if (!xxi) return;

    xc.period = noteToPeriod(
      mod.periodType,
      xc.key + sub.xpo + (xxi.mapXpo[xc.key_porta] ?? 0),
      xc.finetune,
      xc.per_adj,
    );
  }
}

/**
 * is_same_sid (read_event.c:921-931).
 */
function isSameSid(core: Core, chn: number, ins: number, key: number): boolean {
  const xc = core.channelStates[chn]!;
  const s1 = getSubinstrument(core, ins, key);
  const s2 = getSubinstrument(core, xc.ins, xc.key);

  return !!(s1 && s2 && s1.sid === s2.sid);
}

/**
 * read_event_it (read_event.c:933-1371).
 */
export function readEventIt(core: Core, e: Event, chn: number): void {
  const mod = core.module!;
  const xc = core.channelStates[chn]!;
  let sub: SubInstrument | null;
  let note = -1;
  let key = e.note;
  let notSameIns = 0;
  let notSameSmp = 0;
  let newInvalidIns = 0;
  let isToneporta = 0;
  let isRelease = 0;
  let resetEnv = 0;
  let resetSusloop = 0;
  let useInsVol = 0;
  let candidateIns = xc.ins;
  const sampleMode = (core.quirks & Quirk.VIRTUAL) === 0 ? 1 : 0;
  let toneportaOffset = 0;
  let retrigIns = 0;

  const ev: Event = { ...e };

  /* Emulate Impulse Tracker "always read instrument" bug */
  if (ev.ins) {
    xc.delayed_ins = 0;
  } else if (ev.note && xc.delayed_ins) {
    ev.ins = xc.delayed_ins;
    xc.delayed_ins = 0;
  }

  xc.flags = 0;

  /* Keyoff + instrument retrigs current instrument in old fx mode */
  if ((core.quirks & Quirk.ITOLDFX) !== 0) {
    if (ev.note === XMP_KEY_OFF && isValidInstrument(core, ev.ins - 1)) {
      retrigIns = 1;
    }
  }

  /* Notes with unmapped instruments are ignored */
  if (ev.ins) {
    if (ev.ins <= mod.ins && isValidNote(ev.note - 1)) {
      const ins = ev.ins - 1;
      if (checkInvalidSample(core, ins, ev.note - 1)) {
        candidateIns = ins;
        ev.note = 0; ev.ins = 0; ev.vol = 0; ev.fxt = 0; ev.fxp = 0; ev.f2t = 0; ev.f2p = 0;
      }
    }
  } else {
    if (isValidNote(ev.note - 1)) {
      const ins = xc.old_ins - 1;
      if (!isValidInstrument(core, ins)) {
        newInvalidIns = 1;
      } else if (checkInvalidSample(core, ins, ev.note - 1)) {
        ev.note = 0; ev.ins = 0; ev.vol = 0; ev.fxt = 0; ev.fxp = 0; ev.f2t = 0; ev.f2p = 0;
      }
    }
  }

  if (isToneportaFx(ev.fxt) || isToneportaFx(ev.f2t)) {
    isToneporta = 1;
  }

  if (TEST_NOTE(xc, NoteFlag.ENV_RELEASE | NoteFlag.FADEOUT) !== 0) {
    isRelease = 1;
  }

  if (xc.period <= 0 || TEST_NOTE(xc, NoteFlag.END) !== 0) {
    isToneporta = 0;
  }

  /* Off-Porta.it */
  if (isToneporta && ev.fxt === 9 /* FX_OFFSET */) {
    toneportaOffset = 1;
    if ((core.quirks & Quirk.PRENV) === 0) {
      RESET_NOTE(xc, NoteFlag.ENV_END);
    }
  }

  /* Check instrument */

  if (ev.ins) {
    const ins = ev.ins - 1;
    let setNewIns = 1;

    /* portamento_after_keyoff.it test case */
    if (isRelease && !key) {
      if (isToneporta) {
        if ((core.quirks & Quirk.PRENV) !== 0 || TEST_NOTE(xc, NoteFlag.SET) !== 0) {
          isToneporta = 0;
          resetEnvelopesCarry(core, xc);
        }
      } else {
        /* fixes OpenMPT wnoteoff.it */
        resetEnvelopesCarry(core, xc);
      }
    }

    if (isToneporta && xc.ins === ins) {
      if ((core.quirks & Quirk.PRENV) === 0) {
        if (isSameSid(core, chn, ins, key - 1)) {
          /* same instrument and same sample */
          setNewIns = isRelease ? 0 : 1;
        } else {
          /* same instrument, different sample */
          notSameIns = 1; /* need this too */
          notSameSmp = 1;
        }
      }
    }

    if (setNewIns) {
      SET(xc, VolSlideFlag.NEW_INS);
      resetEnv = 1;
    }
    /* Sample default volume is always enabled if a valid sample
     * is provided (Atomic Playboy, default_volume.it). */
    useInsVol = 1;
    xc.per_flags = 0;

    if (isValidInstrument(core, ins)) {
      /* valid ins */

      /* See OpenMPT StoppedInstrSwap.it for cut case */
      if (!key && TEST_NOTE(xc, NoteFlag.KEY_CUT) === 0) {
        /* Retrig in new ins in sample mode */
        if (sampleMode && TEST_NOTE(xc, NoteFlag.END) !== 0) {
          core.virt.voicePos(chn, 0);
        }

        /* IT: Reset note for every new != ins */
        if (xc.ins === ins) {
          SET(xc, VolSlideFlag.NEW_INS);
          useInsVol = 1;
        } else {
          key = xc.key + 1;
        }

        RESET_NOTE(xc, NoteFlag.SET);
      }

      if (xc.ins !== ins && ((isToneporta === 0) || (core.quirks & Quirk.PRENV) === 0)) {
        candidateIns = ins;

        if (!isSameSid(core, chn, ins, key - 1)) {
          notSameIns = 1;
          if (isToneporta) {
            /* Get new instrument volume */
            sub = getSubinstrument(core, ins, key);
            if (sub !== null) {
              xc.volume = sub.vol;
              useInsVol = 0;
            }
          }
        }
      }
    } else {
      /* In sample mode invalid instruments cut the current
       * note (OpenMPT SampleNumberChange.it). */
      if (sampleMode) {
        xc.volume = 0;
      }

      /* Ignore invalid instruments */
      newInvalidIns = 1;
      xc.flags = 0;
      useInsVol = 0;
    }
  }

  /* Check note */

  if (key) {
    SET(xc, VolSlideFlag.NEW_NOTE);
    SET_NOTE(xc, NoteFlag.SET);

    if (key === XMP_KEY_FADE) {
      SET_NOTE(xc, NoteFlag.FADEOUT);
      resetEnv = 0;
      resetSusloop = 0;
      useInsVol = 0;
    } else if (key === XMP_KEY_CUT) {
      SET_NOTE(xc, NoteFlag.END | NoteFlag.CUT | NoteFlag.KEY_CUT);
      xc.period = 0;
      core.virt.resetChannel(chn);
    } else if (key === XMP_KEY_OFF) {
      let env = null;
      if (isValidInstrument(core, xc.ins)) {
        env = mod.instruments[xc.ins]!.aei;
      }
      /* C calls sustain_check(env, v_idx) directly: it returns 0 for a
       * null envelope or one without ON/SUS — and the else branch then
       * sets NOTE_RELEASE (read_event.c:1139-1143). No outer guard. */
      if (sustainCheckEnv(env, xc.v_idx)) {
        SET_NOTE(xc, NoteFlag.SUSEXIT);
      } else {
        SET_NOTE(xc, NoteFlag.RELEASE);
      }
      SET(xc, VolSlideFlag.KEY_OFF);
      /* Use instrument volume if an instrument was explicitly
       * provided on this row (see OpenMPT NoteOffInstr.it row 4).
       * However, never reset the envelope (see OpenMPT wnoteoff.it).
       */
      resetEnv = 0;
      resetSusloop = 0;
      if (!ev.ins) {
        useInsVol = 0;
      }
    } else if (!newInvalidIns) {
      /* Sample sustain release should always carry for tone
       * portamento, and is not reset unless a note is
       * present (Atomic Playboy, portamento_sustain.it). */
      /* portamento_after_keyoff.it test case */
      /* also see suburban_streets o13 c45 */
      if (!isToneporta) {
        resetEnv = 1;
        resetSusloop = 1;
      }

      if (isToneporta) {
        if (notSameIns || TEST_NOTE(xc, NoteFlag.END) !== 0) {
          SET(xc, VolSlideFlag.NEW_INS);
          RESET_NOTE(xc, NoteFlag.ENV_RELEASE | NoteFlag.SUSEXIT | NoteFlag.FADEOUT);
        } else {
          if (isValidNote(key - 1)) {
            xc.key_porta = key - 1;
          }
          key = 0;
        }
      }
    }
  }

  /* TODO: instrument change+porta(+release?) doesn't require a key.
   * Order 3/row 11 of portamento_sustain.it should change the sample. */
  if (isValidNote(key - 1) && !newInvalidIns) {
    if (TEST_NOTE(xc, NoteFlag.CUT) !== 0) {
      useInsVol = 1; /* See OpenMPT NoteOffInstr.it */
    }
    xc.key = --key;
    RESET_NOTE(xc, NoteFlag.END);

    sub = getSubinstrument(core, candidateIns, key);

    if (sub !== null) {
      const transp = mod.instruments[candidateIns]!.mapXpo[key] ?? 0;
      let smp: number;
      let to: number;
      let dct: number;

      /* Clear note delay before duplicating channels:
       * it_note_delay_nna.it */
      xc.delay = 0;

      note = key + sub.xpo + transp;
      smp = sub.sid;
      if (!isValidSample(core, smp)) {
        smp = -1;
      }
      dct = sub.dct;

      if (notSameSmp) {
        fixPeriod(core, chn, sub);
        /* Toneporta, even when not executed, disables
         * NNA and DCAs for the current note:
         * portamento_nna_sample.it, gxsmp2.it */
        core.virt.setNna(chn, NNA_CUT);
        dct = DCT_OFF;
      }
      const insObj = mod.instruments[candidateIns]!;
      to = core.virt.setPatch(
        chn, insObj, smp, note, key, sub.nna, dct, sub.dca,
      );

      /* Random value for volume swing */
      let rvv = sub.rvv !== undefined ? sub.rvv & 0xff : 0;
      if (rvv) {
        rvv = rvv < 0 ? 0 : rvv > 100 ? 100 : rvv;
        xc.rvv = getRandom(rvv + 1);
      } else {
        xc.rvv = 0;
      }

      /* Random value for pan swing */
      let rpv = sub.rvv !== undefined ? (sub.rvv & 0xff00) >> 8 : 0;
      if (rpv) {
        rpv = rpv < 0 ? 0 : rpv > 64 ? 64 : rpv;
        xc.rpv = getRandom(rpv + 1) - Math.trunc(rpv / 2);
      } else {
        xc.rpv = 0;
      }

      if (to < 0) return;
      if (to !== chn) {
        copyChannel(core, to, chn);
        (core.channelStates as ChannelState[])[to]!.flags = 0;
      }

      if (smp >= 0) { /* Not sure if needed */
        xc.smp = smp;
      }
    } else {
      xc.flags = 0;
      useInsVol = 0;
    }
  }

  /* Do after virtual channel copy */
  if (isToneporta || retrigIns) {
    if ((core.quirks & Quirk.PRENV) !== 0 && ev.ins) {
      resetEnvelopesCarry(core, xc);
    }
  }

  if (isValidInstrument(core, candidateIns)) {
    if (xc.ins !== candidateIns) {
      /* Reset envelopes if instrument changes */
      resetEnvelopes(core, xc);
    }
    xc.ins = candidateIns;
    xc.ins_fade = mod.instruments[candidateIns]!.rls;
  }

  /* Reset in case of new instrument and the previous envelope has
   * finished (OpenMPT test EnvReset.it). This must take place after
   * channel copies in case of NNA (see test/test.it)
   * Also if we have envelope in carry mode, check fadeout
   * Also, only reset the volume envelope. (it_fade_env_reset_carry.it)
   */
  if (ev.ins && TEST_NOTE(xc, NoteFlag.ENV_END) !== 0) {
    if (checkFadeout(core, xc, candidateIns)) {
      resetEnvelopeVolume(core, xc);
    } else {
      resetEnv = 0;
    }
  }

  if (resetEnv) {
    if (ev.note) {
      RESET_NOTE(xc, NoteFlag.ENV_RELEASE | NoteFlag.SUSEXIT | NoteFlag.FADEOUT);
    }
    /* Set after copying to new virtual channel (see ambio.it) */
    xc.fadeout = 0x10000;
  }
  if (resetSusloop && ev.note) {
    RESET_NOTE(xc, NoteFlag.SAMPLE_RELEASE);
  }

  /* See OpenMPT wnoteoff.it vs noteoff3.it */
  if (retrigIns && notSameIns) {
    SET(xc, VolSlideFlag.NEW_INS);
    core.virt.voicePos(chn, 0);
    xc.fadeout = 0x10000;
    RESET_NOTE(xc, NoteFlag.RELEASE | NoteFlag.SUSEXIT | NoteFlag.FADEOUT);
  }

  sub = getSubinstrument(core, xc.ins, xc.key);

  setEffectDefaults(core, note, sub, xc, isToneporta !== 0);
  if (sub !== null) {
    if (note >= 0) {
      /* Reset pan, see OpenMPT PanReset.it */
      setChannelPan(xc, sub.pan);

      if (TEST_NOTE(xc, NoteFlag.CUT) !== 0) {
        resetEnvelopes(core, xc);
      } else if (toneportaOffset === 0 || (core.quirks & Quirk.PRENV) !== 0) {
        resetEnvelopesCarry(core, xc);
      }
      RESET_NOTE(xc, NoteFlag.CUT);
    }
  }

  /* Process new volume */
  if (ev.vol && (TEST_NOTE(xc, NoteFlag.CUT) === 0 || ev.ins !== 0)) {
    /* Do this even for XMP_KEY_OFF (see OpenMPT NoteOffInstr.it row 4). */
    setChannelVolume(xc, ev.vol - 1);
  }

  /* IT: always reset sample offset */
  xc.offset.val &= ~0xffff;

  /* According to Storlek test 25, Impulse Tracker handles the volume
   * column effects after the standard effects. */
  processFx(core, xc, chn, ev, 0);
  processFx(core, xc, chn, ev, 1);
  setPeriod(core, note, sub, xc, isToneporta !== 0);

  if (sub === null) {
    return;
  }

  if (note >= 0) {
    xc.note = note;
  }
  if (note >= 0 || toneportaOffset) {
    let off = 0;
    /* Offset >length starts at 0 (it_high_offset_memory.it) or at
     * sample end for old FX (it_high_offset_memory_oldfx.it). */
    if (
      TEST(xc, VolSlideFlag.OFFSET) !== 0 &&
      ((core.quirks & Quirk.ITOLDFX) !== 0 ||
        (isValidSample(core, xc.smp) && xc.offset.val < (mod.samples[xc.smp]?.length ?? 0)))
    ) {
      off = xc.offset.val;
    }
    core.virt.voicePos(chn, off);
  }

  if (useInsVol && TEST(xc, VolSlideFlag.NEW_VOL) === 0) {
    xc.volume = sub.vol;
  }
}

