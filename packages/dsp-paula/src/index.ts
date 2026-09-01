// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: Paula-Tracker paulalib/audio-engine.js.
// @modplayjs/dsp-paula — Paula sound engine for MOD.
//
// Ported 1:1 from the Paula-Tracker mixing kernel ONLY
// (reference/Paula-Tracker/paulalib/audio-engine.js):
//   - PAULA_FREQUENCY = 7093789.2 / 2 (PAL)          audio-engine.js:83
//   - periodToRate = PF / (period * sampleRate)      audio-engine.js:208-211
//   - linear interpolation + loop wrap               audio-engine.js:783-815
//   - tremolo added to volume pre-scale              audio-engine.js:821-824
//   - per-channel volume sample * (volume/64)        audio-engine.js:841
//   - fixed 4-ch Amiga pan 0.7/0.3                   audio-engine.js:748-755
//   - master clamp(+-1) * 0.5                        audio-engine.js:759-760
//
// Its tick/row/effect sequencer (processTick/processRow/processEffects,
// :223-511) is deliberately NOT ported — MOD sequencing is the Core's job.

import type { Core as CoreIface, DspPlugin } from '@modplayjs/core';
import { NoteFlag } from '@modplayjs/core';

/** PAL colorburst / 2 (audio-engine.js:83). */
export const PAULA_FREQUENCY = 7093789.2 / 2;

/** Audio-engine.js:208-211. Per-frame fraction of one sample step. */
export function periodToRate(period: number, sampleRate: number): number {
  if (period === 0) return 0;
  return PAULA_FREQUENCY / (period * sampleRate);
}

const PAN_L0 = 0.7; // ch 0,3 left gain
const PAN_R0 = 0.3; // ch 0,3 right gain

/** One mixed channel's transient state (audio-engine.js channelStates). */
interface ChannelState {
  /** Sample id in the core store, or -1 = silent. */
  instrument: number;
  /** Amiga period (0 = stop). */
  period: number;
  /** Fractional position inside sampleData. */
  samplePos: number;
  /** Volume 0-64 (tremolo applied at mix time). */
  volume: number;
  /** Signed tremolo delta clamped against volume. */
  tremoloValue: number | undefined;
}

export class Paula implements DspPlugin {
  readonly name = 'paula';
  readonly channels = 4;

  private states: ChannelState[] = [];
  private muted = [false, false, false, false];

  constructor() {
    this.reset();
  }

  reset(): void {
    this.states = [0, 1, 2, 3].map(() => ({
      instrument: 0, period: 0, samplePos: 0, volume: 64, tremoloValue: undefined,
    }));
    this.muted = [false, false, false, false];
  }

  setChannel(ch: number, state: Partial<ChannelState>): void {
    Object.assign(this.states[ch]!, state);
  }

  toggleMute(channel: number): void {
    this.muted[channel] = !this.muted[channel];
  }

  /**
   * Per-row hook (T8 DspPlugin.onRow): a note on this channel restarts
   * the paula's sample position — the core's voice pos was reset by
   * setpatch, and the paula's own accumulator must follow.
   */
  onRow(_core: CoreIface, chn: number, ev: { note: number }): void {
    if (chn < 4 && ev.note !== 0) {
      this.states[chn]!.samplePos = 0;
    }
  }

  renderFrame(core: CoreIface, out: Float32Array, ticks: number): void {
    const sr = core.sampleRate;
    const ticksize = core.ticksize;
    let o = 0;
    for (let t = 0; t < ticks; t++) {
      for (let ch = 0; ch < 4 && ch < core.channels; ch++) {
        // Per-tick channel state (the C paula simulator reads the same
        // xc fields: info_period, info_finalvol, info_position, smp).
        this.syncFromCore(core, ch);
      }
      for (let i = 0; i < ticksize; i++) {
        let left = 0;
        let right = 0;
        for (let ch = 0; ch < 4 && ch < core.channels; ch++) {
          if (this.muted[ch]) continue;
          const sample = this.getChannelSample(core, ch, sr);
          // Amiga stereo panning: channels 0,3 left, 1,2 right (:748-755)
          if (ch === 0 || ch === 3) {
            left += sample * PAN_L0;
            right += sample * PAN_R0;
          } else {
            left += sample * PAN_R0;
            right += sample * PAN_L0;
          }
        }
        // Master volume and clipping (:759-761)
        out[o++] = Math.max(-1, Math.min(1, left * 0.5));
        out[o++] = Math.max(-1, Math.min(1, right * 0.5));
      }
    }
  }

  /** Sync one Amiga channel from the core's player state (per tick). */
  private syncFromCore(core: CoreIface, ch: number): void {
    const xc = core.channelStates[ch];
    const st = this.states[ch]!;
    if (!xc) {
      st.instrument = 0;
      st.period = 0;
      return;
    }
    // xc.smp = the sample id the channel plays (player.c info: c->smp).
    st.instrument = xc.smp;
    // xc.period = the raw amiga period (MOD periods 108..907).
    st.period = xc.period > 0 ? xc.period : 0;
    // info_finalvol = the player's per-tick final volume (0..1024 scale;
    // /16 → 0..64 for the paula's volume/64 mixing).
    st.volume = Math.max(0, Math.min(64, Math.round(xc.info_finalvol / 16)));
  }

  /**
   * getChannelSample port (:769-846). Reads by sample ID from the core
   * store; the position comes from the core's info_position (the voice's
   * fractional sample position, advanced by the mixer/player per tick).
   */
  private getChannelSample(core: CoreIface, ch: number, sr: number): number {
    const st = this.states[ch]!;
    if (st.period === 0 || st.instrument <= 0) return 0;

    const smp = core.getSample(st.instrument);
    const data = smp.data;
    if (!data || data.length === 0) return 0;

    // Paula self-advances the fractional position per output frame
    // (audio-engine.js: the samplePos accumulator).
    st.samplePos += periodToRate(st.period, sr ?? 44100);
    const pos = st.samplePos;
    const intPos = Math.floor(pos);
    const frac = pos - intPos;

    // Bounds + loop wrap (:786-815)
    let pos1 = intPos;
    let pos2 = intPos + 1;
    if (pos1 >= smp.length) {
      if ((smp.flags & /* LOOP */ 2) !== 0 && smp.loopEnd > smp.loopStart) {
        const loopPos = (pos1 - smp.loopStart) % (smp.loopEnd - smp.loopStart);
        pos1 = smp.loopStart + loopPos;
        pos2 = pos1 + 1;
        if (pos2 >= smp.loopEnd) pos2 = smp.loopStart;
      } else {
        // One-shot exhausted: C set_sample_end(ctx, voc, 1) (mixer.c:711)
        // — mark the channel so process_volume zeroes info_finalvol and
        // play_channel propagates NOTE_END.
        this.setSampleEnd(core, ch);
        return 0; // No loop, silence
      }
    } else if (pos2 >= smp.length) {
      if ((smp.flags & /* LOOP */ 2) !== 0 && smp.loopEnd > smp.loopStart) {
        pos2 = smp.loopStart;
      } else {
        pos2 = pos1; // Clamp to last sample
      }
    }

    // Linear interpolation (:817-820)
    const sample1 = data[pos1] ?? 0;
    const sample2 = data[pos2] ?? 0;
    const sample = sample1 + (sample2 - sample1) * frac;

    // Tremolo pre-scale (:822-825)
    let volume = st.volume;
    if (st.tremoloValue !== undefined) {
      volume = Math.max(0, Math.min(64, volume + st.tremoloValue));
    }

    return sample * (volume / 64);
  }

  /**
   * set_sample_end (mixer.c:197-217, end=1): mark the channel's
   * NOTE_SAMPLE_END when a one-shot sample runs out. With QUIRK_RSTCHN
   * (set for S3M/XM/IT, not MOD) C also frees the voice slot; MOD keeps
   * the channel bound like C's paula path.
   */
  private setSampleEnd(core: CoreIface, ch: number): void {
    const xc = core.channelStates[ch];
    if (!xc) return;
    xc.note_flags |= NoteFlag.SAMPLE_END;
  }
}

export function createPaulaPlugin(): DspPlugin {
  return new Paula();
}
