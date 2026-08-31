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
  Quirk,
  NoteFlag,
  type VoiceState,
  type SampleData,
  type ChannelState,
} from '@modplayjs/core';
import { KERNELS, C4_PERIOD, SMIX_SHIFT, SMIX_MASK, type KernelName } from './kernels';

/** mixer.c:36 DOWNMIX_SHIFT — float model keeps relative amplitude parity. */
const SHRT_MAX = 0x7fff;

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
  /** ticksize >> ANTICLICK_SHIFT — do_anticlick's tail length (:150). */
  private dischargeFrames = 0;

  reset(): void { /* per-voice state lives in the virtual layer */ }

  renderFrame(core: CoreIface, out: Float32Array, ticks: number): void {
    const mod = core.module!;
    const s = core.ctx.s;

    // mixer_prepare (mixer.c): mvol/mvolbase come from the module (IT
    // it_load.c:1528-1530; S3M s3m_load.c:714-715). 0 = no scaling.
    this.mvol = mod.mvol ?? 0;
    this.mvolbase = mod.mvolbase ?? 0;

    const kernelName: KernelName =
      this.interp === 0 ? 'nearest' : this.interp === 2 ? 'spline' : 'linear';
    const kernel = KERNELS[kernelName];

    // IT bidir shorten (mixer.c:520-523): IS_PLAYER_MODE_IT.
    this.bidirAdjust = mod.readEventType === 3 /* IT */ ? 1 : 0;

    // mixer_prepare: our Core already computed s.ticksize via getTicksize.
    // out holds ticks * ticksize * 2 interleaved frames.
    const ticksize = s.ticksize;
    this.dischargeFrames = ticksize >> 3 /* ANTICLICK_SHIFT */;
    let bufPos = 0;

    for (let t = 0; t < ticks; t++) {
      // Clear the tick's slice (memset :468).
      for (let i = 0; i < ticksize * 2; i++) out[bufPos + i] = 0;

      // Per-voice loop (:527).
      const voices = this.activeVoices(core);
      const xcArr = core.channelStates;
      for (let idx = 0; idx < voices.length; idx++) {
        const vi = voices[idx]!;
        if ((vi.flags & VoiceFlag.ANTICLICK) !== 0 && this.interp > 0) {
          // do_anticlick(ctx, voc, NULL, 0) discharges into the next tick's
          // ramp start; float model folds this into old_vl/old_vr already 0.
          vi.flags &= ~VoiceFlag.ANTICLICK;
          vi.sleft = 0;
          vi.sright = 0;
        }

        if (vi.act === Act.NONE) continue;

        let xxsRef: SampleData;
        if (vi.period < 1) {
          // :546-550 — invalid period kills the voice via a FULL
          // virt_resetvoice: act wipe alone would leave the voice's map
          // slot bound (stale alias) while the slot gets re-allocated.
          core.virt?.resetVoice(idx, true);
          continue;
        }

        // Sample is paused — skip channel unless a new sample is queued
        // (mixer.c:572-582).
        if ((vi.flags & VoiceFlag.SAMPLE_PAUSED) !== 0) {
          if (
            (vi.flags & VoiceFlag.SAMPLE_QUEUED) === 0 ||
            vi.queued.smp < 0
          ) {
            vi.flags &= ~VoiceFlag.SAMPLE_QUEUED;
            continue;
          }
          this.hotswap(vi, vi.queued.smp);
          xxsRef = core.getSample(vi.smp);
          this.adjustVoiceEnd(vi, xxsRef);
          vi.pos = vi.start;
        } else {
          xxsRef = core.getSample(vi.smp);
        }

        if (vi.pos < 0) vi.pos = 0;
        vi.pos0 = vi.pos;

        if (vi.smp < 0) continue;
        let xxs = xxsRef;

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
        this.adjustVoiceEnd(vi, xxs);
        // mixer.c:825-829: pos past end → clamp, and restart forward loops.
        if (vi.pos >= vi.end) {
          vi.pos = vi.end;
          if (
            (vi.flags & VoiceFlag.VOICE_REVERSE) === 0 &&
            ((xxs.flags & SampleFlags.LOOP) !== 0 ||
              ((xxs.flags & SampleFlags.SUSTAIN) !== 0 &&
                (~vi.flags & VoiceFlag.RELEASE) !== 0))
          ) {
            this.loopReposition(vi, xxs);
          }
        }
        const sustainActiveRef = { v: false };
        sustainActiveRef.v =
          (xxs.flags & SampleFlags.SUSTAIN) !== 0 &&
          (~vi.flags & VoiceFlag.RELEASE) !== 0;
        let start = vi.start, end = vi.end;

        // step (:584) + sanity (:586-588). C converts the float step to
        // 16.16 fixed point: step_dir × (1 << SMIX_SHIFT) (mixer.c:704).
        const c5spd = xxs.c5spd ?? mod.c4rate;
        const stepFloat = (C4_PERIOD * c5spd) / s.freq / vi.period;
        if (!Number.isFinite(stepFloat) || stepFloat < 0.001 || stepFloat > SHRT_MAX) {
          continue;
        }
        const stepFixed = Math.trunc(stepFloat * (1 << SMIX_SHIFT));

        // Ramp setup (anticlick, :590-591 + :759-760 tail).
        const rampsize = ticksize >> 3 /* ANTICLICK_SHIFT */;
        const deltaL = rampsize > 0 ? (volL - vi.old_vl) / rampsize : 0;
        const deltaR = rampsize > 0 ? (volR - vi.old_vr) / rampsize : 0;

        let size = ticksize;
        let rampLeft = rampsize;
        // Frames of the anti-click ramp already consumed this tick — the
        // ramp level is old_vl + delta × (frames into the ramp).
        let rampDone = 0;
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
              let c = Math.ceil((end - vi.pos) / stepFloat);
              if (c > size) c = size;
              samples = c;
            }
            stepDir = stepFixed;
          } else {
            if (vi.pos <= start) {
              samples = 0;
              size--;
              if (size <= 0) break;
              continue;
            } else {
              let c = Math.ceil((vi.pos - start) / stepFloat);
              if (c > size) c = size;
              samples = c;
            }
            stepDir = -stepFixed;
          }

          // Mix `samples` frames (:631-714), when audible.
          if (vi.vol !== 0) {
            // C gain chain (mixer.c:686): kernels receive vol_l >> 8 and
            // the fixed-point output is downshifted 11 bits, netting a
            // per-channel float gain of vol/4096 over a ±1 sample.
            // volL = vol × (0x80 − pan) → divisor 128 × 4096 = 0x80000.
            const lVolF = volL / 0x80000;
            const rVolF = volR / 0x80000;
            // C MIX_STEREO_AC (mix_all.c:153-157): the ramp starts at the
            // voice's OLD level (old_vl) and steps delta per frame toward
            // vol_l — the anti-click fade between the previous and new
            // gain. The mix output must use the RAMPED level, not volL.
            const oldVlF = vi.old_vl / 0x80000;
            const oldVrF = vi.old_vr / 0x80000;
            const lRampF = deltaL / 0x80000;
            const rRampF = deltaR / 0x80000;
            // Hipolito anticlick capture (mixer.c:645-653): C samples the
            // buffer at buf_pos[mix_size-1] — the LAST frame of this chunk,
            // not the frame before it — then subtracts that pre-mix value
            // from the post-mix value (buf_pos[-1]) to isolate the voice's
            // own contribution.
            const chunkPos = bufPos + (ticksize - size) * 2;
            const probeIdx = chunkPos + samples * 2 - 1;
            const prevL = out[probeIdx - 1] ?? 0;
            const prevR = out[probeIdx] ?? 0;
            // C LOOP_AC / LOOP split (mix_all.c:90,92): within a chunk the
            // ramped macro runs for `ramp` frames and the plain macro for
            // the rest; the level starts at old_vl and steps delta per
            // frame — it never runs past the ramp budget (that would keep
            // multiplying delta by the frame index and blow the gain up).
            const rampFrames = Math.min(samples, rampLeft);
            for (let n = 0; n < samples; n++) {
              const idx = chunkPos + n * 2;
              const lSmp = kernel(xxs.data, vi.pos, vi.frac);
              const gainL = n < rampFrames ? oldVlF + lRampF * (rampDone + n) : lVolF;
              const gainR = n < rampFrames ? oldVrF + rRampF * (rampDone + n) : rVolF;
              // stereo output (always interleaved stereo here).
              out[idx] = (out[idx] ?? 0) + lSmp * gainL;
              out[idx + 1] = (out[idx + 1] ?? 0) + lSmp * gainR;
              // UPDATE_POS (mix_all.c:94-98): frac += step; pos += frac>>16;
              // frac &= 0xFFFF. Runs once per frame for audible AND silent
              // voices (C's no-op mixer fn still advances pos).
              vi.frac += stepDir;
              vi.pos += vi.frac >> SMIX_SHIFT;
              vi.frac &= SMIX_MASK;
            }
            rampDone += rampFrames;
            rampLeft -= rampFrames;
            vi.old_vl += samples * deltaL;
            vi.old_vr += samples * deltaR;
            // Anticlick bookkeeping (mixer.c:708-712): buffer delta across
            // the chunk = the voice's own last contribution.
            const lastIdx = chunkPos + (samples - 1) * 2;
            vi.sleft = (out[lastIdx] ?? 0) - prevL;
            vi.sright = (out[lastIdx + 1] ?? 0) - prevR;
          } else {
            // Inaudible voice: C's zero-gain mixer fn still advances pos.
            for (let n = 0; n < samples; n++) {
              vi.frac += stepDir;
              vi.pos += vi.frac >> SMIX_SHIFT;
              vi.frac &= SMIX_MASK;
            }
          }

          size -= samples;

          // has_active_loop (mixer.c:326-330): LOOP flag OR active sustain
          // loop — no lps<lpe guard (loop sanity is guaranteed at load).
          const hasLoop = sustainActiveRef.v || (xxs.flags & SampleFlags.LOOP) !== 0;
          // split_noloop (mixer.c:600-605): channel split forces loop split.
          const splitNoloop =
            vi.chn >= 0 &&
            xcArr !== undefined &&
            vi.chn < xcArr.length &&
            xcArr[vi.chn]!.split !== 0;
          // One-shot samples do not loop (:716-730); queued swap defers.
          if (
            (!hasLoop || splitNoloop) &&
            (vi.flags & VoiceFlag.SAMPLE_QUEUED) === 0
          ) {
          if (size > 0) {
            // The sample ended WITHIN this tick (leftover tick space):
            // C runs do_anticlick + set_sample_end(1) — the voice is
            // retired with a ramp (mixer.c:716-726). The voice slot is
            // marked dead but keeps its channel (C: chn stays set; the
            // slot is only reusable after a full reset_voice).
            this.discharge(out, bufPos + (ticksize - size) * 2, size, vi);
            vi.flags |= VoiceFlag.ANTICLICK;
            this.setSampleEnd(core, vi, 1);
            size = 0;
            continue;
          }
          // size == 0: the sample filled the whole tick and is still
          // mid-stream — the voice keeps playing (C: set_sample_end only
          // runs when the tick has leftover space; the note continues).
          break;
          }

          // Loop reposition / queued swap (:731-762).
          if (
            size > 0 ||
            (!reverse && vi.pos >= end) ||
            (reverse && vi.pos <= start)
          ) {
            if ((vi.flags & VoiceFlag.SAMPLE_QUEUED) !== 0) {
              // Protracker sample swap (:734-755).
              if (size > 0) {
                this.discharge(out, bufPos + (ticksize - size) * 2, size, vi);
              }
              if (
                vi.queued.smp < 0 ||
                (!hasLoop &&
                  !((core.getSample(vi.queued.smp).flags & SampleFlags.LOOP) !== 0))
              ) {
                // Invalid/one-shot→one-shot swaps stop the voice; a looped
                // current sample pauses instead (PTStoppedSwap.mod).
                vi.flags &= ~VoiceFlag.SAMPLE_QUEUED;
                vi.flags |= VoiceFlag.SAMPLE_PAUSED;
                vi.act = Act.NONE;
                this.setSampleEnd(core, vi, 1);
                vi.flags |= VoiceFlag.ANTICLICK;
                size = 0;
                continue;
              }
              this.hotswap(vi, vi.queued.smp);
              const newXxs = core.getSample(vi.smp);
              this.adjustVoiceEnd(vi, newXxs);
              vi.pos = vi.start;
              // Refresh local loop vars for the rest of this tick.
              sustainActiveRef.v =
                (newXxs.flags & SampleFlags.SUSTAIN) !== 0 &&
                (~vi.flags & VoiceFlag.RELEASE) !== 0;
              xxs = newXxs;
              start = vi.start;
              end = vi.end;
              continue;
            }
            this.loopReposition(vi, xxs);
          }
        } // while size

        vi.old_vl = volL;
        vi.old_vr = volR;
      } // voices

      // Render final frame (mixer.c:764-784 downmix_int_*): C clamps every
      // frame to LIM16_HI/LIM16_LO (±32767) — the float model clamps ±1.0.
      // Without it our unbounded float sum drives the browser's output
      // device into hard clipping (audible distortion).
      const end = bufPos + ticksize * 2;
      for (let i = bufPos; i < end && i < out.length; i++) {
        const v = out[i]!;
        if (v > 1) out[i] = 1;
        else if (v < -1) out[i] = -1;
      }

      bufPos += ticksize * 2;
    }
  }

  /**
   * adjust_voice_end (mixer.c:333-355): recompute vi.start/end from the
   * sample's loop state; clear/set VOICE_BIDIR.
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

  /**
   * hotswap_sample (mixer.c:393-404): replace the playing sample keeping
   * vol/pan; forces SAMPLE_LOOP so the swap lands in the new sample's loop.
   */
  private hotswap(vi: VoiceState, smp: number): void {
    const vol = vi.vol;
    const pan = vi.pan;
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
    vi.pos = 0;
    vi.flags |= VoiceFlag.SAMPLE_LOOP;
    vi.vol = vol;
    vi.pan = pan;
  }

  /**
   * loop_reposition (mixer.c:357-393): set SAMPLE_LOOP (recomputing the
   * voice endpoints on first entry — matters for LOOP_FULL), then wrap or
   * flip the position around vi.start/vi.end. Safety clamp is against the
   * SAMPLE length + 1, not the loop end (:388-391).
   */
  private loopReposition(vi: VoiceState, xxs: SampleData): void {
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
    // Safety check: pos should not be excessively past the sample end
    // (:387-391). Only seems to happen with very low sample rates.
    if (vi.pos > xxs.length + 1) {
      vi.pos = xxs.length + 1;
    }
  }

  /**
   * do_anticlick (mixer.c:148-195): fade the voice's last level out over at
   * most `ticksize >> ANTICLICK_SHIFT` frames. C clamps count to that
   * discharge length (a full-tail request would otherwise smear one note's
   * level across most of a tick and stack against the live mix), and
   * decrements stepmul BEFORE each sample (:181-187) — so the first frame
   * written carries (1 - 1/count)^2 and the full-level sample is dropped
   * (the last mixed frame already contains it). The slope is squared.
   */
  private discharge(
    out: Float32Array,
    at: number,
    count: number,
    vi: VoiceState,
  ): void {
    // sleft/sright are captured from the mixed float output — already in
    // the output domain; no fixed-point conversion.
    const sl = vi.sleft;
    const sr = vi.sright;
    vi.sleft = 0;
    vi.sright = 0;
    if (sl === 0 && sr === 0) return;
    if (count > this.dischargeFrames) count = this.dischargeFrames;
    if (count <= 0) return;
    for (let n = 1; n <= count; n++) {
      const stepmul = 1 - n / count;
      const k = stepmul * stepmul;
      const idx = at + (n - 1) * 2;
      out[idx] = (out[idx] ?? 0) + sl * k;
      out[idx + 1] = (out[idx + 1] ?? 0) + sr * k;
    }
  }

  /**
   * set_sample_end (mixer.c:197-217). `end` = 1: mark the channel's
   * NOTE_SAMPLE_END (process_volume zeroes info_finalvol for it, and
   * play_channel propagates NOTE_END); with QUIRK_RSTCHN the voice slot
   * is fully freed (virt_resetvoice). `end` = 0: clear the flag — runs on
   * every voice start (mixer.c:878).
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

  private activeVoices(core: CoreIface): readonly VoiceState[] {
    // All allocated voices incl. tails (NNA); act flags drive skipping.
    return core.voiceStates;
  }
}

export function createSoftMixerPlugin(): DspPlugin {
  return new SoftMixer();
}
