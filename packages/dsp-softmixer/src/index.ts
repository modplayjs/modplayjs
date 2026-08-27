// Softmixer — multi-voice mixer for S3M/XM/IT (+ MOD via generic path).
//
// Port of libxmp libxmp_mixer_softmixer (reference/libxmp/src/mixer.c:474-787):
//   - interp mixerset pick (:492-504)
//   - bidir_adjust for IT (:520-523)
//   - mixer_prepare: ticksize recompute + buffer clear (:449-469)
//   - per-voice loop (:527-762): anticlick on ANTICLICK flag, period<1 kill
//     (:546-550), pos clamp :552, step = C4_PERIOD*c5spd/freq/period (:584),
//     step sanity <0.001 || >SHRT_MAX (:586-588), pan→vol split (:563-569),
//     loop_reposition (:357-393), adjust_voice_end (:333-355),
//     has_active_sustain_loop (:315-324), do_anticlick ramp (:148-195)
//   - final downmix is float-domain here (downmix_int_* :73-138 semantics:
//     scale then clamp).
//
// Floating-point domain note: libxmp mixes in Q32 fixed point and downmixes
// with DOWNMIX_SHIFT=12; here samples are normalized floats [-1,1) and the
// voice volume ramps run in float. All thresholds/formulas preserve the C
// behavior (vol_l/vol_r are the SAME integers as libxmp before >>8).

import type { Core as CoreIface, DspPlugin } from '@modplayjs/core';
import {
  SampleFlags,
  VoiceFlag,
  Act,
  type VoiceState,
} from '@modplayjs/core';
import { KERNELS, C4_PERIOD, type KernelName } from './kernels';

/** mixer.c:36 DOWNMIX_SHIFT — float model keeps relative amplitude parity. */
const SHRT_MAX = 0x7fff;

interface ExtraSampleData {
  c5spd?: number;
}

export class SoftMixer implements DspPlugin {
  readonly name = 'softmixer';
  readonly channels = 64;

  /** Interpolation setting: 0 nearest, 1 linear, 2 spline (XMP_INTERP_*). */
  interp = 1;
  /** Master volume ratio m.mvol/m.mvolbase parity (default = no change). */
  mvol = 0;
  mvolbase = 0;
  /** IT bidirectional loop shortened by one sample (mixer.c:520-523). */
  private bidirAdjust = 0;

  reset(): void { /* per-voice state lives in the virtual layer */ }

  renderFrame(core: CoreIface, out: Float32Array, ticks: number): void {
    const mod = core.module!;
    const s = core.ctx.s;

    const kernelName: KernelName =
      this.interp === 0 ? 'nearest' : this.interp === 2 ? 'spline' : 'linear';
    const kernel = KERNELS[kernelName];

    // IT bidir shorten (mixer.c:520-523): IS_PLAYER_MODE_IT.
    this.bidirAdjust = mod.readEventType === 3 /* IT */ ? 1 : 0;

    // mixer_prepare: our Core already computed s.ticksize via getTicksize.

    // out holds ticks * ticksize * 2 interleaved frames.
    const ticksize = s.ticksize;
    let bufPos = 0;

    for (let t = 0; t < ticks; t++) {
      // Clear the tick's slice (memset :468).
      for (let i = 0; i < ticksize * 2; i++) out[bufPos + i] = 0;

      // Per-voice loop (:527).
      const voices = this.activeVoices(core);
      for (const vi of voices) {
        if ((vi.flags & VoiceFlag.ANTICLICK) !== 0 && this.interp > 0) {
          // do_anticlick(ctx, voc, NULL, 0) discharges into the next tick's
          // ramp start; float model folds this into old_vl/old_vr already 0.
          vi.flags &= ~VoiceFlag.ANTICLICK;
          vi.sleft = 0;
          vi.sright = 0;
        }

        if (vi.act === Act.NONE) continue;

        if (vi.period < 1) {
          // :546-550 — invalid period kills the voice.
          vi.act = Act.NONE;
          continue;
        }

        if (vi.pos < 0) vi.pos = 0;
        vi.pos0 = vi.pos;

        let sampleId = vi.smp;
        if (sampleId < 0) continue;
        let xxs = core.getSample(sampleId);

        // vol with S3M/IT global volume scaling (:556-560).
        let vol = vi.vol;
        if (this.mvolbase > 0 && this.mvol !== this.mvolbase) {
          vol = Math.trunc((vol * this.mvol) / this.mvolbase);
        }

        // Pan → vol split (:563-569). PAN_SURROUND == 0x8000.
        let volL: number, volR: number;
        if (vi.pan === 0x8000) {
          volL = vol * 0x80;
          volR = -vol * 0x80;
        } else {
          volL = vol * (0x80 - vi.pan);
          volR = vol * (0x80 + vi.pan);
        }

        // get_current_sample → adjust_voice_end (:406-422, :333-355).
        let sustainActive =
          (xxs.flags & SampleFlags.SUSTAIN) !== 0 &&
          (~vi.flags & VoiceFlag.RELEASE) !== 0;
        let start = 0, end = 0, bidir = false;
        if (sustainActive) {
          start = xxs.sustainStart;
          end = xxs.sustainEnd;
          bidir = (xxs.flags & SampleFlags.SUSTAIN_BIDIR) !== 0;
        } else if ((xxs.flags & SampleFlags.LOOP) !== 0) {
          start = xxs.loopStart;
          if (
            (xxs.flags & SampleFlags.LOOP_FULL) !== 0 &&
            (~vi.flags & VoiceFlag.SAMPLE_LOOP) !== 0
          ) {
            end = xxs.length;
          } else {
            end = xxs.loopEnd;
            bidir = (xxs.flags & SampleFlags.BIDIR) !== 0;
          }
        } else {
          start = 0;
          end = xxs.length;
        }
        if (bidir) vi.flags |= VoiceFlag.VOICE_BIDIR;
        else vi.flags &= ~VoiceFlag.VOICE_BIDIR;

        // step (:584) + sanity (:586-588).
        const c5spd = (xxs as ExtraSampleData).c5spd ?? mod.c4rate;
        const step = (C4_PERIOD * c5spd) / s.freq / vi.period;
        if (!Number.isFinite(step) || step < 0.001 || step > SHRT_MAX) {
          continue;
        }

        // Ramp setup (anticlick, :590-591 + :759-760 tail).
        const rampsize = ticksize >> 3 /* ANTICLICK_SHIFT */;
        const deltaL = rampsize > 0 ? (volL - vi.old_vl) / rampsize : 0;
        const deltaR = rampsize > 0 ? (volR - vi.old_vr) / rampsize : 0;

        let size = ticksize;
        let rampLeft = rampsize;
        const reverse = (vi.flags & VoiceFlag.VOICE_REVERSE) !== 0;

        while (size > 0) {
          // Samples until loop break/end (:604-629).
          let samples: number;
          let stepDir: number;
          if (!reverse) {
            if (vi.pos >= end) {
              samples = 0;
              size--;
              if (size <= 0) break;
              continue;
            } else {
              let c = Math.ceil((end - vi.pos) / step);
              if (c > size) c = size;
              samples = c;
            }
            stepDir = step;
          } else {
            if (vi.pos <= start) {
              samples = 0;
              size--;
              if (size <= 0) break;
              continue;
            } else {
              let c = Math.ceil((vi.pos - start) / step);
              if (c > size) c = size;
              samples = c;
            }
            stepDir = -step;
          }

          // Mix `samples` frames (:631-714), when audible.
          if (vi.vol !== 0) {
            const lVolF = volL / 0x8000;
            const rVolF = volR / 0x8000;
            const lRampF = deltaL / 0x8000 / rampsize;
            const rRampF = deltaR / 0x8000 / rampsize;
            for (let n = 0; n < samples; n++) {
              const idx = bufPos + n * 2;
              const doRamp = rampLeft > 0;
              const lSmp = kernel(xxs.data, vi.pos);
              // stereo output (always interleaved stereo here).
              out[idx] = (out[idx] ?? 0) + lSmp * (lVolF + (doRamp ? lRampF * n : 0));
              out[idx + 1] = (out[idx + 1] ?? 0) + lSmp * (rVolF + (doRamp ? rRampF * n : 0));
              // Fractional accumulator UPDATE_POS (mix_all.c:94-98).
              vi.pos += stepDir;
            }
            if (rampLeft >= samples) rampLeft -= samples;
            else rampLeft = 0;
            vi.old_vl += samples * deltaL;
            vi.old_vr += samples * deltaR;
            // Anticlick bookkeeping: last-sample deltas (:708-712).
            const lastIdx = bufPos + (samples - 1) * 2;
            vi.sleft = (out[lastIdx] ?? 0) - 0;
            vi.sright = (out[lastIdx + 1] ?? 0) - 0;
          }

          vi.pos += stepDir * samples;
          size -= samples;

          // One-shot end handling (:716-730).
          const hasLoop = sustainActive || (xxs.flags & SampleFlags.LOOP) !== 0;
          if (!hasLoop) {
            if (size > 0) {
              // anticlick discharge to zero over remaining size.
              this.discharge(out, bufPos + (ticksize - size) * 2, size, vi);
              vi.flags |= VoiceFlag.ANTICLICK;
            }
            vi.act = Act.NONE;
            size = 0;
            continue;
          }

          // Loop reposition / queued swap (:731-762).
          if (
            size > 0 ||
            (!reverse && vi.pos >= end) ||
            (reverse && vi.pos <= start)
          ) {
            this.loopReposition(vi, { start, end, bidir });
          }
        } // while size

        vi.old_vl = volL;
        vi.old_vr = volR;
      } // voices

      bufPos += ticksize * 2;
    }
  }

  /** loop_reposition (mixer.c:357-393). */
  private loopReposition(
    vi: VoiceState,
    loop: { start: number; end: number; bidir: boolean },
  ): void {
    if (!loop.bidir) {
      if ((vi.flags & VoiceFlag.VOICE_REVERSE) !== 0) {
        vi.pos += loop.end - loop.start;
      } else {
        vi.pos -= loop.end - loop.start;
      }
    } else {
      vi.flags ^= VoiceFlag.VOICE_REVERSE;
      if ((vi.flags & VoiceFlag.VOICE_REVERSE) !== 0) {
        vi.pos = loop.end * 2 - this.bidirAdjust - vi.pos;
      } else {
        vi.pos = loop.start * 2 - vi.pos;
      }
    }
    // Safety (:388-391).
    if (vi.pos > loop.end + 1) vi.pos = loop.end + 1;
  }

  /** Linear fade of the last held values across `count` frames. */
  private discharge(
    out: Float32Array,
    at: number,
    count: number,
    vi: VoiceState,
  ): void {
    const sl = vi.sleft / 0x8000;
    const sr = vi.sright / 0x8000;
    vi.sleft = 0;
    vi.sright = 0;
    if (sl === 0 && sr === 0) return;
    for (let n = 0; n < count; n++) {
      const k = 1 - n / count;
      const idx = at + n * 2;
      out[idx] = (out[idx] ?? 0) + sl * k;
      out[idx + 1] = (out[idx + 1] ?? 0) + sr * k;
    }
  }

  private activeVoices(core: CoreIface): readonly VoiceState[] {
    // All allocated voices incl. tails (NNA); act flags drive skipping.
    return core.voiceStates;
  }
}

export function createSoftMixerPlugin(): DspPlugin {
  return new SoftMixer();
}
