// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// dsp-softmixer — libxmp-parity software mixer.
//
// Ported 1:1 from the C sources in reference/libxmp/src:
//   - mixer.c       libxmp_mixer_softmixer: per-voice loop, gain/pan
//     splitting, chunk loop, anticlick, queued swaps, loop reposition,
//     wraparound patching, integer downmix (downmix_int_16bit).
//   - mix_all.c     the eight interpolation mixers (+ IT filter variants):
//     NEAREST_8BIT/16BIT, LINEAR_8BIT/16BIT, SPLINE_* with the verbatim
//     integer macro math (VAR_NORM 16.16 chunk-local pos/frac, UPDATE_POS,
//     MIX_STEREO_AC ramps at old_vl >> 8 + delta_l, FILTER_LEFT/RIGHT).
//   - precomp_lut.h verbatim cubic spline tables (lut.ts).
//   - paula.h + mix_paula.c + precomp_blep.h the LIBXMP_PAULA_SIMULATOR
//     path: A500 BLEP band-limited-step output (paula.ts + blep-tables.ts),
//     selected behind SoftMixerOptions.mode = 'paula' with the
//     XMP_FLAGS_A500 semantics (Amiga 4-channel MOD only).
//
// Everything mixes in the exact C integer domain: the per-tick buffer is
// int32, samples are materialized to native int16/int8 (with the C guard
// bytes), gains are those C integers (vol_l >> 8), and the downmix is
// >> (DOWNMIX_SHIFT - amplify) with int16 clamping. Only the final output
// handed to the OutputPlugin is converted to float (smp / 32768).

import type { Core as CoreIface, DspPlugin } from '@modplayjs/core';
import {
  SampleFlags,
  VoiceFlag,
  Quirk,
  NoteFlag,
  type VoiceState,
  type SampleData,
  type ChannelState,
} from '@modplayjs/core';
import { PaulaState, BLEP_TABLE, MINIMUM_INTERVAL } from './paula.js';
import {
  cubic_spline_lut0,
  cubic_spline_lut1,
  cubic_spline_lut2,
  cubic_spline_lut3,
} from './lut.js';

/** mixer.h:9-10 — fixed-point fractional shift/mask (16.16). */
const SMIX_SHIFT = 16;
const SMIX_MASK = 0xffff;
/** mixer.h:6. */
const C4_PERIOD = 428.0;
/** mixer.c:36 — the C downmix shift. */
const DOWNMIX_SHIFT = 12;
/** mixer.c:148 ANTICLICK_FPSHIFT. */
const ANTICLICK_FPSHIFT = 24;
/** mix_all.c:63 PREAMP_BITS. */
const PREAMP_BITS = 15;
/** mixer.h:12 FILTER_SHIFT. */
const FILTER_SHIFT = 22;
/** LIM16_* (mixer.c:33-35). */
const LIM16_HI = 32767;
const LIM16_LO = -32768;
/** FILTER_MIN/MAX (mix_all.c:66-67). */
const FILTER_MIN = -65536 * (1 << PREAMP_BITS);
const FILTER_MAX = 65535 * (1 << PREAMP_BITS);
/** SPLINE constants (mix_all.c:59-64). */
const SPLINE_SHIFT = 14;
const SPLINE_FRACBITS = 10;
const SPLINE_FRACSHIFT = SMIX_SHIFT - SPLINE_FRACBITS - 2;
const SPLINE_FRACMASK = (((1 << (SMIX_SHIFT - SPLINE_FRACSHIFT)) - 1) & ~3);

/** libxmp DEFAULT_AMPLIFY (common.h:143). */
const DEFAULT_AMPLIFY = 1;

const SHRT_MAX = 0x7fff;

/**
 * Mixer behaviour configuration. Everything off = libxmp defaults.
 */
export interface SoftMixerOptions {
  /**
   * Rendering engine for resampling:
   *  - `'libxmp'` (default): exact libxmp mix_all.c interpolation mixers
   *    (nearest/linear/spline per the core's interp setting).
   *  - `'paula'`: the LIBXMP_PAULA_SIMULATOR A500 path (BLEP synthesis on
   *    the Paula clock, nearest-stepped source at PAULA_HZ granularity).
   *    Intended for 4-channel Amiga MOD; the A500 mixers only support
   *    mono 8-bit sources — other voices are skipped, exactly like the C
   *    NULL entries in libxmp_a500_mixers[].
   */
  mode?: 'libxmp' | 'paula';
  /**
   * Output channel layout:
   *  - `'panned'` (default): module pans (libxmp semantics).
   *  - `'lrlr'`: hard left/right alternate — ch0 L, ch1 R, ch2 L, ch3 R
   *    (chn < 4 only; channels 4+ keep their module pan).
   *  - `'lrrl'`: OpenMPT/PaulaLib Amiga default — ch0 L, ch1 R, ch2 R,
   *    ch3 L.
   */
  layout?: 'panned' | 'lrlr' | 'lrrl';
  /**
   * Paula mode filter table: `'a500'` (LED off) or `'a500led'` (LED on,
   * the classic dimmed-power-light lowpass). Only meaningful with
   * mode = 'paula'.
   */
  amigaFilter?: 'a500' | 'a500led';
  /**
   * libxmp XMP_PLAYER_AMPLIFY (s.amplify, DEFAULT_AMPLIFY = 1). Scales
   * the integer downmix. 0 = default.
   */
  amplify?: number;
}

/** A materialized native sample: the C xxs->data layout —
 *  [guard slots = 4 zero bytes][frames][tail ≥ 4 slots]. */
interface NativeSample {
  /** int16 or int8 view incl. pre-guard; data starts at slot `pre`. */
  data: Int16Array | Int8Array;
  pre: number;
}

const nativeCache = new WeakMap<SampleData, NativeSample>();

const TAIL_SLOTS = 8;

/**
 * Materialize xxs->data in the C layout. Stored floats are exactly
 * int/32768 (16-bit) or int/128 (8-bit), so the native ints are recovered
 * losslessly with rounding — only values already out of int range clamp.
 */
function nativeOf(xxs: SampleData): NativeSample {
  let nat = nativeCache.get(xxs);
  if (nat) return nat;
  const bits16 = (xxs.flags & SampleFlags.BITS16) !== 0;
  const stereo = (xxs.flags & SampleFlags.STEREO) !== 0;
  const chn = stereo ? 2 : 1;
  const len = xxs.length * chn;
  const scale = bits16 ? 32768 : 128;
  if (bits16) {
    const buf = new Int16Array(2 + len + TAIL_SLOTS * chn);
    for (let i = 0; i < len; i++) {
      let v = Math.round((xxs.data[i] ?? 0) * scale);
      if (v > 32767) v = 32767;
      else if (v < -32768) v = -32768;
      buf[2 + i] = v;
    }
    nat = { data: buf, pre: 2 };
  } else {
    const buf = new Int8Array(4 + len + TAIL_SLOTS * chn);
    for (let i = 0; i < len; i++) {
      let v = Math.round((xxs.data[i] ?? 0) * scale);
      if (v > 127) v = 127;
      else if (v < -128) v = -128;
      buf[4 + i] = v;
    }
    nat = { data: buf, pre: 4 };
  }
  nativeCache.set(xxs, nat);
  return nat;
}

/**
 * init_sample_wraparound storage (mixer.c:52-62 struct loop_data +
 * :224-283 init_sample_wraparound). Slots are typed-array ELEMENTS
 * (int16/int8): C's prologue_num/epilogue_num are in samples, ×2 for
 * stereo (mixer.c:242-243) and ×2 for 16-bit byte multiplicities
 * (:246-248, :252-253) — the byte counts divide back to the same slot
 * counts, so one slot-based implementation covers both resolutions.
 */
const LOOP_PROLOGUE = 1;
const LOOP_EPILOGUE = 2;

interface LoopData {
  active: boolean;
  nat: NativeSample;
  /** slot index of loop start (start * chn + pre). */
  start: number;
  /** slot index of loop end (end * chn + pre). */
  end: number;
  firstLoop: boolean;
  bidir: boolean;
  prologueNum: number;
  epilogueNum: number;
  prologue: number[];
  epilogue: number[];
}

function newLoopData(): LoopData {
  return {
    active: false,
    nat: { data: new Int16Array(0), pre: 0 },
    start: 0,
    end: 0,
    firstLoop: false,
    bidir: false,
    prologueNum: 0,
    epilogueNum: 0,
    prologue: [],
    epilogue: [],
  };
}

/** Host interp mirror (synced each frame from core.ctx.s.interp). */
let coreInterp = 1;

/** init_sample_wraparound (mixer.c:224-283). */
function initSampleWraparound(
  ld: LoopData,
  xxs: SampleData,
  vi: VoiceState,
  interp: number,
): void {
  ld.active = false;
  if (interp === 0 /* XMP_INTERP_NEAREST */ ||
    (xxs.flags & SampleFlags.LOOP) === 0) {
    return;
  }
  const nat = nativeOf(xxs);
  ld.nat = nat;
  const stereo = (xxs.flags & SampleFlags.STEREO) !== 0;
  ld.start = nat.pre + vi.start * (stereo ? 2 : 1);
  ld.end = nat.pre + vi.end * (stereo ? 2 : 1);
  ld.firstLoop = (vi.flags & VoiceFlag.SAMPLE_LOOP) === 0;
  ld.active = true;

  ld.prologueNum = LOOP_PROLOGUE * (stereo ? 2 : 1);
  ld.epilogueNum = LOOP_EPILOGUE * (stereo ? 2 : 1);
  ld.bidir = (vi.flags & VoiceFlag.VOICE_BIDIR) !== 0;

  const sptr = nat.data;
  const { start, end, prologueNum, epilogueNum } = ld;

  for (let i = 0; i < prologueNum; i++) {
    ld.prologue[i] = sptr[start - prologueNum + i]!;
  }
  for (let i = 0; i < epilogueNum; i++) {
    ld.epilogue[i] = sptr[end + i]!;
  }

  if (!ld.firstLoop) {
    for (let i = 0; i < prologueNum; i++) {
      sptr[start - prologueNum + i] = ld.bidir
        ? sptr[start + i]!
        : sptr[end - prologueNum + i]!;
    }
  }
  for (let i = 0; i < epilogueNum; i++) {
    sptr[end + i] = ld.bidir ? sptr[end - 1 - i]! : sptr[start + i]!;
  }
}

/** reset_sample_wraparound (mixer.c:289-310). */
function resetSampleWraparound(ld: LoopData): void {
  if (!ld.active) return;
  const sptr = ld.nat.data;
  for (let i = 0; i < ld.prologueNum; i++) {
    sptr[ld.start - ld.prologueNum + i] = ld.prologue[i]!;
  }
  for (let i = 0; i < ld.epilogueNum; i++) {
    sptr[ld.end + i] = ld.epilogue[i]!;
  }
}

export class SoftMixer implements DspPlugin {
  readonly name = 'softmixer';
  readonly channels = 64;

  /**
   * Interpolation setting mirror: 0 nearest, 1 linear, 2 spline
   * (XMP_INTERP_*). Synced from `core.ctx.s.interp` at the top of every
   * renderFrame; set it via CoreConfig.interp or setInterpolation().
   */
  interp = 1;
  /** Master volume ratio m.mvol/m.mvolbase parity (default = no change). */
  mvol = 0;
  mvolbase = 0;
  /** libxmp XMP_PLAYER_AMPLIFY (s.amplify, DEFAULT_AMPLIFY = 1). */
  amplify = DEFAULT_AMPLIFY;
  /** Runtime-safe mode/layout mirrors (set via configure()). */
  mode: 'libxmp' | 'paula' = 'libxmp';
  layout: 'panned' | 'lrlr' | 'lrrl' = 'panned';
  amigaFilter: 'a500' | 'a500led' = 'a500';

  private bidirAdjust = 0;
  /** ticksize >> ANTICLICK_SHIFT — do_anticlick's tail length (:150). */
  private dischargeFrames = 0;
  /** ticksize × 2 int accumulators (s->buf32). */
  private buf32 = new Int32Array(0);
  /** Per-voice Paula state (vi->paula; one per voice slot). */
  private paula: PaulaState[] = [];
  private paulaVoicesInited = -1;

  private opts: Required<SoftMixerOptions> = {
    mode: 'libxmp',
    layout: 'panned',
    amigaFilter: 'a500',
    amplify: DEFAULT_AMPLIFY,
  };

  constructor(options?: SoftMixerOptions) {
    this.applyOpts(options);
  }

  private applyOpts(options?: SoftMixerOptions): void {
    if (options?.mode !== undefined) this.opts.mode = options.mode;
    if (options?.layout !== undefined) this.opts.layout = options.layout;
    if (options?.amigaFilter !== undefined) this.opts.amigaFilter = options.amigaFilter;
    if (options?.amplify !== undefined && options.amplify > 0) this.opts.amplify = options.amplify;
    this.mode = this.opts.mode;
    this.layout = this.opts.layout;
    this.amigaFilter = this.opts.amigaFilter;
    this.amplify = this.opts.amplify;
  }

  /** Runtime re-configuration (safe while stopped; applies next frame). */
  configure(options: SoftMixerOptions): void {
    this.applyOpts(options);
  }

  reset(): void {
    // Paula states re-init with the sample rate at the next frame
    // (libxmp_paula_init runs from mixer_reset).
    this.paulaVoicesInited = -1;
  }

  /** Per-voice paula init (libxmp_paula_init; one paula_state per voice). */
  private initPaula(core: CoreIface): void {
    const voices = core.voiceStates.length;
    if (this.paulaVoicesInited !== voices) {
      this.paula = Array.from({ length: voices }, () => new PaulaState());
      this.paulaVoicesInited = voices;
    }
    const freq = core.sampleRate;
    for (const p of this.paula) p!.init(freq);
  }

  renderFrame(core: CoreIface, out: Float32Array, ticks: number): void {
    const mod = core.module!;
    const s = core.ctx.s;

    coreInterp = s.interp;
    this.interp = s.interp;

    // mixer_prepare (mixer.c): mvol/mvolbase from the module (IT
    // it_load.c:1528-1530; S3M s3m_load.c:714-715). 0 = no scaling.
    this.mvol = mod.mvol ?? 0;
    this.mvolbase = mod.mvolbase ?? 0;

    // IT bidir shorten (mixer.c:520-523): IS_PLAYER_MODE_IT.
    this.bidirAdjust = mod.readEventType === 3 /* IT */ ? 1 : 0;

    const ticksize = s.ticksize;
    this.dischargeFrames = ticksize >> 3 /* ANTICLICK_SHIFT */;

    if (this.mode === 'paula') this.initPaula(core);

    if (this.buf32.length < ticksize * 2) this.buf32 = new Int32Array(ticksize * 2);
    const buf32 = this.buf32;

    for (let t = 0; t < ticks; t++) {
      this.renderTick(core, buf32, ticksize);

      // downmix_int_16bit (mixer.c:106-131): shift = DOWNMIX_SHIFT - amp.
      const shift = DOWNMIX_SHIFT - this.amplify;
      for (let i = 0; i < ticksize * 2; i++) {
        let smp = buf32[i]! >> shift;
        if (smp > LIM16_HI) smp = LIM16_HI;
        else if (smp < LIM16_LO) smp = LIM16_LO;
        const fi = t * ticksize * 2 + i;
        if (fi < out.length) out[fi] = smp / 32768;
      }
    }
  }

  /** libxmp_mixer_softmixer core: one tick of mixing into buf32. */
  private renderTick(core: CoreIface, buf32: Int32Array, ticksize: number): void {
    const mod = core.module!;
    const voices = core.voiceStates;
    const xcArr = core.channelStates;

    // libxmp_mixer_prepare (mixer.c:449-469): clear the tick buffer.
    buf32.fill(0, 0, ticksize * 2);

    for (let voc = 0; voc < voices.length; voc++) {
      const vi = voices[voc]!;

      // do_anticlick discharge of a cut voice (mixer.c:535-541): only
      // when interp > NEAREST (mixer.c:537-539). C discharges into the
      // NEXT tick's buffer (s->buf32 is cleared at prepare) — here the
      // buffer is cleared per tick, and the discharge lands at its start.
      if ((vi.flags & VoiceFlag.ANTICLICK) !== 0) {
        if (coreInterp > 0) {
          this.doAnticlick(buf32, 0, vi, this.dischargeFrames);
        }
        vi.flags &= ~VoiceFlag.ANTICLICK;
      }

      // mixer.c:543-545: C checks vi->chn < 0 (unbound slot).
      if (vi.chn < 0) continue;

      if (vi.period < 1) {
        // :546-550 — invalid period kills the voice.
        core.virt?.resetVoice(voc, true);
        continue;
      }

      // Negative positions clamp (mixer.c:552-555).
      if (vi.pos < 0.0) vi.pos = 0.0;
      vi.pos0 = vi.pos;

      let vol = vi.vol;

      // Mix volume (S3M and IT) (mixer.c:556-560). C: int division.
      if (this.mvolbase > 0 && this.mvol !== this.mvolbase) {
        vol = Math.trunc((vol * this.mvol) / this.mvolbase);
      }

      // Pan → vol split (mixer.c:562-569). Pan domain: signed -0x80..0x7f
      // (player.c:1413 finalpan = finalpan - 0x80). PAN_SURROUND 0x8000.
      let pan = vi.pan;
      // Layout overrides (Amiga hard panning). Only meaningful in the
      // Paula mode: the Amiga wiring exists to route the channels to the
      // correct A500 speaker. With the libxmp mixers the module pans are
      // the reference, and forcing hard L/R here would double the
      // per-speaker amplitude and clip the output.
      if (this.mode === 'paula' && this.layout !== 'panned' && pan !== 0x8000 && vi.chn < 4) {
        const hardLeft = this.layout === 'lrlr'
          ? vi.chn % 2 === 0
          : vi.chn === 0 || vi.chn === 3;
        pan = hardLeft ? -0x80 : 0x7f;
      }
      let volL: number, volR: number;
      if (pan === 0x8000) {
        volL = vol * 0x80;
        volR = -vol * 0x80;
      } else {
        volL = vol * (0x80 - pan);
        volR = vol * (0x80 + pan);
      }

      // The unbound/released voices (smp = -1 after virt_resetvoice):
      // the C's = the slot freed (chn = FREE = -1) and skipped by the
      // chn < 0 check; ours keeps the slot bound with the stale sample
      // id — skip before getSample (which throws on the negative ids).
      if (vi.smp < 0) continue;

      let xxs: SampleData;
      // Sample is paused — skip channel unless queued (mixer.c:571-583).
      if ((vi.flags & VoiceFlag.SAMPLE_PAUSED) !== 0) {
        if ((vi.flags & VoiceFlag.SAMPLE_QUEUED) === 0 || vi.queued.smp < 0) {
          vi.flags &= ~VoiceFlag.SAMPLE_QUEUED;
          continue;
        }
        this.hotswapSample(vi, vi.queued.smp, core);
        xxs = core.getSample(vi.smp);
        this.adjustVoiceEnd(vi, xxs);
        vi.pos = vi.start;
      } else {
        xxs = core.getSample(vi.smp);
      }

      // get_current_sample tail (mixer.c:406-422): adjust_voice_end runs
      // EVERY frame — when the voice releases, the loop bounds switch
      // from the sustain loop to the sample's regular loop (IT sustain
      // → ping-pong release, e.g. pattern_loop_it100).
      this.adjustVoiceEnd(vi, xxs);

      // step (mixer.c:584) + sanity (:586-588). C keeps the double step
      // for the chunk-boundary pos commit and converts to fixed point for
      // the mix_fn call.
      const c5spd = xxs.c5spd ?? mod.c4rate;
      const stepDouble = (C4_PERIOD * c5spd) / core.sampleRate / vi.period;
      if (!Number.isFinite(stepDouble) || stepDouble < 0.001 || stepDouble > SHRT_MAX) {
        continue;
      }

      // init_sample_wraparound (mixer.c:593).
      const ld = newLoopData();
      initSampleWraparound(ld, xxs, vi, coreInterp);

      // Ramp size + deltas (mixer.c:595-597). C: int division. The
      // ramp budget carries across chunks (mixer.c:672-680).
      let rampBudget = ticksize >> 3 /* ANTICLICK_SHIFT */;
      const rampsize = rampBudget;
      const deltaL = rampsize > 0 ? Math.trunc((volL - vi.old_vl) / rampsize) : 0;
      const deltaR = rampsize > 0 ? Math.trunc((volR - vi.old_vr) / rampsize) : 0;

      let size = ticksize;
      let usmp = ticksize;

      const paula = this.mode === 'paula' ? this.paula[voc] ?? null : null;
      const tabnum = this.amigaFilter === 'a500led' ? BLEP_TABLE.A500_LED : BLEP_TABLE.A500;

      while (size > 0) {
        // split_noloop (mixer.c:598-600): channel split forces loop split.
        const splitNoloop =
          vi.chn >= 0 && vi.chn < xcArr.length && xcArr[vi.chn]!.split !== 0;

        // How many samples until loop break / sample end (mixer.c:603-629).
        let samples: number;
        let stepDir: number;
        const reverse = (vi.flags & VoiceFlag.VOICE_REVERSE) !== 0;
        if (!reverse) {
          if (vi.pos >= vi.end) {
            samples = 0;
            if (--usmp <= 0) break;
          } else {
            let c = Math.ceil((vi.end - vi.pos) / stepDouble);
            if (c > size) c = size;
            samples = c;
          }
          stepDir = stepDouble;
        } else {
          if (vi.pos <= vi.start) {
            samples = 0;
            if (--usmp <= 0) break;
          } else {
            let c = Math.ceil((vi.pos - vi.start) / stepDouble);
            if (c > size) c = size;
            samples = c;
          }
          stepDir = -stepDouble;
        }

        let bufPos = (ticksize - size) * 2;

        if (vi.vol !== 0) {
          // mixer.c:631-761 — the C exact mixer body.
          if (samples > 0) {
            // VAR_NORM (mix_all.c:179-184): chunk-local int pos + frac.
            // C's vi->pos is in SAMPLE units (one channel); the chunk pos
            // multiplies by chn once (mix_all.c:180).
            const chn = (xxs.flags & SampleFlags.STEREO) !== 0 ? 2 : 1;
            const posInt = Math.trunc(vi.pos) * chn + nativeOf(xxs).pre;
            const frac = Math.trunc((1 << SMIX_SHIFT) * (vi.pos - Math.trunc(vi.pos)));
            const bits16 = (xxs.flags & SampleFlags.BITS16) !== 0;
            const stereo = (xxs.flags & SampleFlags.STEREO) !== 0;
            // mix_fn step: step_dir * (1 << SMIX_SHIFT) (mixer.c:704).
            const stepFixed = Math.trunc(stepDir * (1 << SMIX_SHIFT));

            // rsize = frames WITHOUT ramping (mixer.c:656-671). The
            // rampsize budget carries across chunks of the same tick.
            let rsize = 0;
            if (rampBudget > samples) {
              rampBudget -= samples;
            } else {
              rsize = samples - rampBudget;
              rampBudget = 0;
            }
            if (deltaL === 0 && deltaR === 0) rsize = samples;

            // Hipolito capture pre-values (mixer.c:645-653): the LAST
            // frame of this chunk, before this voice's mix.
            const lastNeg = bufPos + (samples - 1) * 2;
            const prevL = buf32[lastNeg] ?? 0;
            const prevR = buf32[lastNeg + 1] ?? 0;

            if (paula !== null && !bits16 && !stereo) {
              // The C's libxmp_a500_mixers[] only has mono 8-bit entries;
              // other voices hit NULL mix_fn and are skipped silently
              // (mixer.c:685 `if (mix_fn != NULL)`).
              this.mixPaula(
                buf32, bufPos, nativeOf(xxs), posInt, frac,
                vlOf(volL), vrOf(volR), stepFixed, samples, tabnum, paula,
              );
            } else if (paula === null) {
              this.mixSample(
                buf32, bufPos, xxs, posInt, frac, vi,
                volL, volR, deltaL, deltaR,
                stepFixed, samples, rsize,
              );
            }

            // Hipolito post-capture (mixer.c:716-718): the voice's own
            // last-frame contribution = post − pre of the LAST frame.
            vi.sleft = (buf32[lastNeg] ?? 0) - prevL;
            vi.sright = (buf32[lastNeg + 1] ?? 0) - prevR;

            // old_vl bookkeeping (mixer.c:710-711).
            vi.old_vl += samples * deltaL;
            vi.old_vr += samples * deltaR;

            // pos commit (mixer.c:703): the double pos advances by the
            // chunk step × samples (the int/frac pair is discarded).
            vi.pos += stepDir * samples;
          } else {
            // mixer.c:577-582 + :604-610: samples == 0 with a live voice —
            // the --usmp guard; nothing mixed, pos unchanged.
          }
          size -= samples;
        } else {
          // Inaudible voice: pos advances without buffer writes (the C
          // skip happens via vi->vol check before the mix call).
          vi.pos += stepDir * samples;
          size -= samples;
        }

        // has_active_loop (mixer.c:326-335).
        const hasLoop =
          (xxs.flags & SampleFlags.LOOP) !== 0 ||
          ((xxs.flags & SampleFlags.SUSTAIN) !== 0 && (~vi.flags & VoiceFlag.RELEASE) !== 0);

        // One-shot samples do not loop (mixer.c:716-730).
        if (
          (!hasLoop || splitNoloop) &&
          (vi.flags & VoiceFlag.SAMPLE_QUEUED) === 0
        ) {
          if (size > 0) {
            // do_anticlick + set_sample_end(1) (mixer.c:720-726).
            this.doAnticlick(buf32, bufPos, vi, size);
            this.setSampleEnd(core, vi, 1);
          }
          size = 0;
          continue;
        }

        // Loop reposition / queued swap (mixer.c:730-762).
        const reverse2 = (vi.flags & VoiceFlag.VOICE_REVERSE) !== 0;
        if (
          size > 0 ||
          (!reverse2 && vi.pos >= vi.end) ||
          (reverse2 && vi.pos <= vi.start)
        ) {
          if ((vi.flags & VoiceFlag.SAMPLE_QUEUED) !== 0) {
            // Protracker sample swap (mixer.c:733-755).
            if (size > 0) {
              this.doAnticlick(buf32, bufPos, vi, size);
            }
            const queued = core.getSample(vi.queued.smp);
            if (
              vi.queued.smp < 0 ||
              (!hasLoop && queued && (queued.flags & SampleFlags.LOOP) === 0)
            ) {
              vi.flags &= ~VoiceFlag.SAMPLE_QUEUED;
              vi.flags |= VoiceFlag.SAMPLE_PAUSED;
              this.setSampleEnd(core, vi, 1);
              size = 0;
              continue;
            }
            resetSampleWraparound(ld);
            this.hotswapSample(vi, vi.queued.smp, core);
            const newXxs = core.getSample(vi.smp);
            this.adjustVoiceEnd(vi, newXxs);
            initSampleWraparound(ld, newXxs, vi, coreInterp);
            vi.pos = vi.start;
            xxs = newXxs;
            continue;
          }
          if (this.loopReposition(vi, xxs)) {
            resetSampleWraparound(ld);
            initSampleWraparound(ld, xxs, vi, coreInterp);
          }
        }
      } // while size

      // reset_sample_wraparound + old_vl/vr commit (mixer.c:765-767).
      resetSampleWraparound(ld);
      let panEnd = vi.pan;
      let volEnd = vi.vol;
      if (this.mvolbase > 0 && this.mvol !== this.mvolbase) {
        volEnd = Math.trunc((volEnd * this.mvol) / this.mvolbase);
      }
      let volL2: number, volR2: number;
      if (panEnd === 0x8000) {
        volL2 = volEnd * 0x80;
        volR2 = -volEnd * 0x80;
      } else {
        volL2 = volEnd * (0x80 - panEnd);
        volR2 = volEnd * (0x80 + panEnd);
      }
      vi.old_vl = volL2;
      vi.old_vr = volR2;
    } // voices
  }

  /**
   * adjust_voice_end (mixer.c:333-355; the xtra/sustain part mirrors
   * get_current_sample :406-422 semantics with our SampleData flags).
   */
  private adjustVoiceEnd(vi: VoiceState, xxs: SampleData): void {
    vi.flags &= ~VoiceFlag.VOICE_BIDIR;

    const sustainActive =
      (xxs.flags & SampleFlags.SUSTAIN) !== 0 &&
      (~vi.flags & VoiceFlag.RELEASE) !== 0;
    if (sustainActive) {
      vi.start = xxs.sustainStart;
      vi.end = xxs.sustainEnd;
      if ((xxs.flags & SampleFlags.SUSTAIN_BIDIR) !== 0) {
        vi.flags |= VoiceFlag.VOICE_BIDIR;
      }
    } else if ((xxs.flags & SampleFlags.LOOP) !== 0) {
      vi.start = xxs.loopStart;
      if (
        (xxs.flags & SampleFlags.LOOP_FULL) !== 0 &&
        (~vi.flags & VoiceFlag.SAMPLE_LOOP) !== 0
      ) {
        vi.end = xxs.length;
      } else {
        vi.end = xxs.loopEnd;
        if ((xxs.flags & SampleFlags.BIDIR) !== 0) {
          vi.flags |= VoiceFlag.VOICE_BIDIR;
        }
      }
    } else {
      vi.start = 0;
      vi.end = xxs.length;
    }
  }

  /** hotswap_sample (mixer.c:395-404) + libxmp_mixer_setpatch(:855-888). */
  private hotswapSample(vi: VoiceState, smp: number, core: CoreIface): void {
    const vol = vi.vol;
    const pan = vi.pan;
    // libxmp_mixer_setpatch(ctx, voc, smp, 0):
    vi.smp = smp;
    vi.vol = 0;
    vi.pan = 0;
    vi.flags &= ~(
      VoiceFlag.SAMPLE_LOOP |
      VoiceFlag.SAMPLE_QUEUED |
      VoiceFlag.SAMPLE_PAUSED |
      VoiceFlag.VOICE_REVERSE |
      VoiceFlag.VOICE_BIDIR
    );
    vi.fidx = 0;
    this.setSampleEnd(core, vi, 0);
    // mixer_voicepos(ctx, voc, 0, 0):
    vi.pos = 0;
    // hotswap_sample continues:
    vi.flags |= VoiceFlag.SAMPLE_LOOP;
    vi.vol = vol;
    vi.pan = pan;
    const xxs = core.getSample(vi.smp);
    this.adjustVoiceEnd(vi, xxs);
  }

  /**
   * loop_reposition (mixer.c:357-393): wrap or flip the position;
   * returns whether the loop state changed (C's return value gates the
   * caller's wraparound re-init).
   */
  private loopReposition(vi: VoiceState, xxs: SampleData): boolean {
    const loopChanged = (vi.flags & VoiceFlag.SAMPLE_LOOP) === 0;
    vi.flags |= VoiceFlag.SAMPLE_LOOP;
    if (loopChanged) this.adjustVoiceEnd(vi, xxs);

    if ((vi.flags & VoiceFlag.VOICE_BIDIR) === 0) {
      // Reposition for next loop.
      if ((vi.flags & VoiceFlag.VOICE_REVERSE) === 0) {
        vi.pos -= vi.end - vi.start;
      } else {
        vi.pos += vi.end - vi.start;
      }
    } else {
      // Bidirectional loop: switch directions.
      vi.flags ^= VoiceFlag.VOICE_REVERSE;
      if ((vi.flags & VoiceFlag.VOICE_REVERSE) !== 0) {
        // OpenMPT Bidi-Loops.it: IT ping-pong loops are one sample shorter.
        vi.pos = vi.end * 2 - this.bidirAdjust - vi.pos;
      } else {
        vi.pos = vi.start * 2 - vi.pos;
      }
    }
    // Safety check (mixer.c:387-391).
    if (vi.pos > xxs.length + 1) {
      vi.pos = xxs.length + 1;
    }
    return loopChanged;
  }

  /**
   * set_sample_end (mixer.c:197-217).
   */
  private setSampleEnd(core: CoreIface, vi: VoiceState, end: 0 | 1): void {
    const xcArr = core.channelStates;
    if (xcArr === undefined || vi.chn < 0 || vi.chn >= xcArr.length) return;
    const xc: ChannelState = xcArr[vi.chn]!;
    if (end) {
      xc.note_flags |= NoteFlag.SAMPLE_END;
      if ((core.module?.quirks ?? 0) & Quirk.RSTCHN) {
        core.virt?.resetVoice(core.voiceStates.indexOf(vi), false);
      }
    } else {
      xc.note_flags &= ~NoteFlag.SAMPLE_END;
    }
  }

  /**
   * do_anticlick (mixer.c:148-195). `atPos` is the slot offset; the
   * mixer.c:166-168 buf == NULL variant (discharge into the next tick's
   * buffer) lands at position 0 of the freshly cleared buffer here.
   */
  private doAnticlick(
    buf32: Int32Array,
    atPos: number,
    vi: VoiceState,
    count: number,
  ): void {
    const sl = vi.sleft;
    const sr = vi.sright;
    vi.sleft = 0;
    vi.sright = 0;
    if (sl === 0 && sr === 0) return;
    if (count > this.dischargeFrames) count = this.dischargeFrames;
    if (count <= 0) return;
    // C: stepval = (1 << ANTICLICK_FPSHIFT) / count; stepmul = stepval ×
    // count; per frame: stepmul -= stepval; level =
    // ((stepmul >> (FPSHIFT - 16))² × smp) >> 32 with smp the last mixed
    // output in the fixed domain. sleft/sright are int32-domain captures;
    // the float model note in the old port does not apply here.
    const stepval = Math.trunc((1 << ANTICLICK_FPSHIFT) / count);
    let stepmul = stepval * count;
    // C: while ((stepmul -= stepval) > 0) — the decrement happens FIRST,
    // so the first written frame carries (1 − 1/count)², not the full
    // level (the last mixed frame already contains it).
    let n = 0;
    while ((stepmul -= stepval) > 0 && n < count) {
      const stepmulShifted = stepmul >> (ANTICLICK_FPSHIFT - 16);
      // C: uint32 stepmul_sq = stepmul >> 8; stepmul_sq *= stepmul_sq —
      // the square is a 32-BIT UNSIGNED multiply and wraps mod 2^32. At
      // the max (stepmul>>8 = 65536) the square = 2^32 → 0: the C's
      // first discharge frame is silent where the naive exact square
      // would put the full level. Math.imul reproduces the wrap (the
      // signed bit pattern = the unsigned mod 2^32).
      const sm2 = Math.imul(stepmulShifted, stepmulShifted) >>> 0;
      const idx = atPos + n * 2;
      // C: *buf += (stepmul_sq * (int64)smp) >> 32 — the int64 product
      // with an ARITHMETIC right shift (floors toward negative infinity),
      // not truncation. JS doubles hold sm2*smp exactly (< 2^53), so
      // Math.floor reproduces the >> 32 shift.
      buf32[idx] = (buf32[idx] ?? 0) + Math.floor((sm2 * sl) / 0x100000000);
      buf32[idx + 1] = (buf32[idx + 1] ?? 0) + Math.floor((sm2 * sr) / 0x100000000);
      n++;
    }
  }

  /**
   * The eight libxmp interpolation mixers (mix_all.c), dispatched inline
   * by width/source. All math is the C integer domain: chunk-local
   * pos/frac 16.16, integer gains (vol_l >> 8), MIX_STEREO(_AC) ramps.
   */
  private mixSample(
    buf32: Int32Array,
    bufPos0: number,
    xxs: SampleData,
    posInt: number,
    frac: number,
    vi: VoiceState,
    volL: number,
    volR: number,
    deltaL: number,
    deltaR: number,
    stepFixed: number,
    samples: number,
    rsize: number,
  ): void {
    const nat = nativeOf(xxs);
    const sptr = nat.data;
    const bits16 = (xxs.flags & SampleFlags.BITS16) !== 0;
    const stereo = (xxs.flags & SampleFlags.STEREO) !== 0;
    const chn = stereo ? 2 : 1;

    // Filter selection (mixer.c:641-645 + mix_all.c LIST(linear_filter)):
    // QUIRK_FILTER && XMP_DSP_LOWPASS set FLAG_FILTER at setpatch; the
    // mixer applies the biquad when coefficients exist. See
    // env-flt-max.it: cutoff >= 0xfe with resonance 0 bypasses.
    const useFilter =
      (vi.filter.a0 !== 0 || vi.filter.b0 !== 0 || vi.filter.b1 !== 0) &&
      !(vi.filter.cutoff >= 0xfe && vi.filter.resonance === 0) &&
      coreInterp > 0;
    const family = coreInterp === 0 ? 0 : coreInterp === 2 ? 2 : 1;
    const filterActive = useFilter && family !== 0;

    const a0 = vi.filter.a0, b0 = vi.filter.b0, b1 = vi.filter.b1;
    let fl1 = vi.filter.l1, fl2 = vi.filter.l2;
    let fr1 = vi.filter.r1, fr2 = vi.filter.r2;

    // mix_fn receives vl = vol_l >> 8 (mixer.c:708). The AC deltas are
    // passed at full scale: MIX_*_AC adds delta_l to the running old_vl,
    // whose >> 8 forms the level (mix_all.c:150-158).
    const vl = Math.trunc(volL / 256);
    const vr = Math.trunc(volR / 256);
    const dvl = deltaL;
    const dvr = deltaR;

    let oldVlRun = vi.old_vl;
    let oldVrRun = vi.old_vr;

    let p = posInt;
    let f = frac;
    const rampFrames = samples - rsize;

    let bufPos = bufPos0;
    for (let n = 0; n < samples; n++) {
      let smpL: number;
      let smpR: number;
      if (family === 0) {
        // NEAREST_8BIT/16BIT (mix_all.c:40-46).
        if (bits16) {
          smpL = sptr[p]!;
          smpR = stereo ? sptr[p + 1]! : smpL;
        } else {
          smpL = sptr[p]! << 8;
          smpR = stereo ? (sptr[p + 1]! << 8) : smpL;
        }
      } else if (family === 1) {
        // LINEAR_8BIT/16BIT (mix_all.c:48-58).
        const l1 = bits16 ? sptr[p]! : sptr[p]! << 8;
        const l2 = bits16 ? sptr[p + chn]! : sptr[p + chn]! << 8;
        smpL = l1 + (((f >> 1) * (l2 - l1)) >> (SMIX_SHIFT - 1));
        if (stereo) {
          const r1 = bits16 ? sptr[p + 1]! : sptr[p + 1]! << 8;
          const r2 = bits16 ? sptr[p + 1 + chn]! : sptr[p + 1 + chn]! << 8;
          smpR = r1 + (((f >> 1) * (r2 - r1)) >> (SMIX_SHIFT - 1));
        } else {
          smpR = smpL;
        }
      } else {
        // SPLINE_8BIT/16BIT (mix_all.c:73-88).
        const fIdx = f >> SPLINE_FRACSHIFT;
        const f2 = (fIdx & SPLINE_FRACMASK) >> 2;
        const L0 = cubic_spline_lut0[f2]!;
        const L1 = cubic_spline_lut1[f2]!;
        const L2 = cubic_spline_lut2[f2]!;
        const L3 = cubic_spline_lut3[f2]!;
        const sh = bits16 ? SPLINE_SHIFT : SPLINE_SHIFT - 8;
        const conv = (idx: number): number =>
          (L0 * (sptr[idx - chn] ?? 0) + L1 * (sptr[idx] ?? 0) +
            L3 * (sptr[idx + (chn << 1)] ?? 0) + L2 * (sptr[idx + chn] ?? 0)) >> sh;
        smpL = conv(p);
        smpR = stereo ? conv(p + 1) : smpL;
      }

      if (filterActive) {
        // FILTER_LEFT (mix_all.c:111-117): C shifts (arithmetic), so
        // negative values floor — keep the >> semantics.
        let sl = (a0 * (smpL << PREAMP_BITS) + b0 * fl1 + b1 * fl2) >> FILTER_SHIFT;
        if (sl < FILTER_MIN) sl = FILTER_MIN;
        else if (sl > FILTER_MAX) sl = FILTER_MAX;
        fl2 = fl1; fl1 = sl;
        smpL = sl >> PREAMP_BITS;
        if (stereo) {
          // FILTER_RIGHT (mix_all.c:119-125).
          let sr = (a0 * (smpR << PREAMP_BITS) + b0 * fr1 + b1 * fr2) >> FILTER_SHIFT;
          if (sr < FILTER_MIN) sr = FILTER_MIN;
          else if (sr > FILTER_MAX) sr = FILTER_MAX;
          fr2 = fr1; fr1 = sr;
          smpR = sr >> PREAMP_BITS;
        }
      }

      // MIX_STEREO(_AC) (mix_all.c:146-159) — stereo out always.
      if (n < rampFrames) {
        // MIX_*_AC: level = old >> 8, stepped per frame.
        buf32[bufPos] = (buf32[bufPos] ?? 0) + smpL * (oldVlRun >> 8);
        buf32[bufPos + 1] = (buf32[bufPos + 1] ?? 0) + smpR * (oldVrRun >> 8);
        oldVlRun += dvl;
        oldVrRun += dvr;
      } else {
        buf32[bufPos] = (buf32[bufPos] ?? 0) + smpL * vl;
        buf32[bufPos + 1] = (buf32[bufPos + 1] ?? 0) + smpR * vr;
      }
      bufPos += 2;

      // UPDATE_POS (mix_all.c:94-98).
      f += stepFixed;
      p += f >> SMIX_SHIFT;
      f &= SMIX_MASK;
    }

    // SAVE_FILTER_* (mix_all.c:229-245).
    if (filterActive) {
      vi.filter.l1 = fl1;
      vi.filter.l2 = fl2;
      if (stereo) {
        vi.filter.r1 = fr1;
        vi.filter.r2 = fr2;
      } else {
        vi.filter.r1 = fl1;
        vi.filter.r2 = fl2;
      }
    }
  }

  /**
   * libxmp_paula mixers (mix_paula.c:132-170): PAULA_SIMULATION per
   * frame + MIX mono/stereo, int8 mono sources. The paula VAR re-shifts
   * the gains <<8 (mix_paula.c:118-128) — vl/vr arrive as vol_l>>8.
   * No AC ramp variants exist for the A500 mixers (mix_paula.c:172-180).
   */
  private mixPaula(
    buf32: Int32Array,
    bufPos0: number,
    nat: NativeSample,
    posInt: number,
    frac: number,
    vl: number,
    vr: number,
    stepFixed: number,
    samples: number,
    tabnum: number,
    paula: PaulaState,
  ): void {
    const vlFull = vl << 8;
    const vrFull = vr << 8;
    const sptr = nat.data;

    let pos = posInt;
    let f = frac;
    let count = samples;
    let bufPos = bufPos0;

    for (; count; count--) {
      // PAULA_SIMULATION (mix_paula.c:107-133); step = fixed int step.
      const step = stepFixed;
      const numIn = Math.trunc(paula.remainder / MINIMUM_INTERVAL);
      const ministep = numIn > 0 ? Math.trunc(step / numIn) : 0;

      // input is always sampled at a higher rate than output
      for (let i = 0; i < numIn - 1; i++) {
        paula.inputSample(sptr[pos]!);
        paula.doClock(MINIMUM_INTERVAL);
        // UPDATE_POS(ministep) (mix_paula.c:99-105) — mono, no chn.
        f += ministep;
        pos += f >> SMIX_SHIFT;
        f &= SMIX_MASK;
      }
      paula.inputSample(sptr[pos]!);
      paula.remainder -= numIn * MINIMUM_INTERVAL;

      paula.doClock(Math.trunc(paula.remainder));
      const smpIn = paula.outputSample(tabnum);
      paula.doClock(MINIMUM_INTERVAL - Math.trunc(paula.remainder));
      f += step - (numIn - 1) * ministep;
      pos += f >> SMIX_SHIFT;
      f &= SMIX_MASK;

      paula.remainder += paula.fdiv;

      // MIX_STEREO (mix_paula.c:135-140).
      buf32[bufPos] = (buf32[bufPos] ?? 0) + smpIn * vlFull;
      buf32[bufPos + 1] = (buf32[bufPos + 1] ?? 0) + smpIn * vrFull;
      bufPos += 2;
    }
  }
}

/** mix_fn gain arguments (mixer.c:708): vl = vol_l >> 8. */
function vlOf(volL: number): number {
  return Math.trunc(volL / 256);
}
function vrOf(volR: number): number {
  return Math.trunc(volR / 256);
}

export function createSoftMixerPlugin(options?: SoftMixerOptions): DspPlugin {
  return new SoftMixer(options);
}

/** Raw Paula state introspection for players/tools. */
export { PaulaState, PAULA_HZ, MINIMUM_INTERVAL, BLEP_SIZE } from './paula.js';
