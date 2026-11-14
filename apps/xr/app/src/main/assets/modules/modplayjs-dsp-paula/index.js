// packages/dsp-paula/src/index.ts
import { NoteFlag } from "@modplayjs/core";
var PAULA_FREQUENCY = 70937892e-1 / 2;
function periodToRate(period, sampleRate) {
  if (period === 0) return 0;
  return PAULA_FREQUENCY / (period * sampleRate);
}
var PAN_L0 = 0.7;
var PAN_R0 = 0.3;
var Paula = class {
  name = "paula";
  channels = 4;
  states = [];
  muted = [false, false, false, false];
  constructor() {
    this.reset();
  }
  reset() {
    this.states = [0, 1, 2, 3].map(() => ({
      instrument: 0,
      period: 0,
      samplePos: 0,
      volume: 64,
      tremoloValue: void 0
    }));
    this.muted = [false, false, false, false];
  }
  setChannel(ch, state) {
    Object.assign(this.states[ch], state);
  }
  toggleMute(channel) {
    this.muted[channel] = !this.muted[channel];
  }
  /**
   * Per-row hook (T8 DspPlugin.onRow): a note on this channel restarts
   * the paula's sample position — the core's voice pos was reset by
   * setpatch, and the paula's own accumulator must follow.
   */
  onRow(_core, chn, ev) {
    if (chn < 4 && ev.note !== 0) {
      this.states[chn].samplePos = 0;
    }
  }
  renderFrame(core, out, ticks) {
    const sr = core.sampleRate;
    const ticksize = core.ticksize;
    let o = 0;
    for (let t = 0; t < ticks; t++) {
      for (let ch = 0; ch < 4 && ch < core.channels; ch++) {
        this.syncFromCore(core, ch);
      }
      for (let i = 0; i < ticksize; i++) {
        let left = 0;
        let right = 0;
        for (let ch = 0; ch < 4 && ch < core.channels; ch++) {
          if (this.muted[ch]) continue;
          const sample = this.getChannelSample(core, ch, sr);
          if (ch === 0 || ch === 3) {
            left += sample * PAN_L0;
            right += sample * PAN_R0;
          } else {
            left += sample * PAN_R0;
            right += sample * PAN_L0;
          }
        }
        out[o++] = Math.max(-1, Math.min(1, left * 0.5));
        out[o++] = Math.max(-1, Math.min(1, right * 0.5));
      }
    }
  }
  /** Sync one Amiga channel from the core's player state (per tick). */
  syncFromCore(core, ch) {
    const xc = core.channelStates[ch];
    const st = this.states[ch];
    if (!xc) {
      st.instrument = 0;
      st.period = 0;
      return;
    }
    st.instrument = xc.smp;
    st.period = xc.period > 0 ? xc.period : 0;
    st.volume = Math.max(0, Math.min(64, Math.round(xc.info_finalvol / 16)));
  }
  /**
   * getChannelSample port (:769-846). Reads by sample ID from the core
   * store; the position comes from the core's info_position (the voice's
   * fractional sample position, advanced by the mixer/player per tick).
   */
  getChannelSample(core, ch, sr) {
    const st = this.states[ch];
    if (st.period === 0 || st.instrument <= 0) return 0;
    const smp = core.getSample(st.instrument);
    const data = smp.data;
    if (!data || data.length === 0) return 0;
    st.samplePos += periodToRate(st.period, sr ?? 44100);
    const pos = st.samplePos;
    const intPos = Math.floor(pos);
    const frac = pos - intPos;
    let pos1 = intPos;
    let pos2 = intPos + 1;
    if (pos1 >= smp.length) {
      if ((smp.flags & /* LOOP */
      2) !== 0 && smp.loopEnd > smp.loopStart) {
        const loopPos = (pos1 - smp.loopStart) % (smp.loopEnd - smp.loopStart);
        pos1 = smp.loopStart + loopPos;
        pos2 = pos1 + 1;
        if (pos2 >= smp.loopEnd) pos2 = smp.loopStart;
      } else {
        this.setSampleEnd(core, ch);
        return 0;
      }
    } else if (pos2 >= smp.length) {
      if ((smp.flags & /* LOOP */
      2) !== 0 && smp.loopEnd > smp.loopStart) {
        pos2 = smp.loopStart;
      } else {
        pos2 = pos1;
      }
    }
    const sample1 = data[pos1] ?? 0;
    const sample2 = data[pos2] ?? 0;
    const sample = sample1 + (sample2 - sample1) * frac;
    let volume = st.volume;
    if (st.tremoloValue !== void 0) {
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
  setSampleEnd(core, ch) {
    const xc = core.channelStates[ch];
    if (!xc) return;
    xc.note_flags |= NoteFlag.SAMPLE_END;
  }
};
function createPaulaPlugin() {
  const g = globalThis;
  if (!g.__MODPLAYJS_PAULA_DEPRECATION_WARNED) {
    g.__MODPLAYJS_PAULA_DEPRECATION_WARNED = true;
    g.console?.warn?.('[modplayjs] dsp-paula is deprecated \u2014 use createSoftMixerPlugin({ mode: "paula" }) from @modplayjs/dsp-softmixer');
  }
  return new Paula();
}
export {
  PAULA_FREQUENCY,
  Paula,
  createPaulaPlugin,
  periodToRate
};
