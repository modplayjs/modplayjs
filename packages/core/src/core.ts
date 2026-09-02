// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp player.c (frame loop) + control.c (lifecycle).
// Core player. Ports libxmp's context lifecycle and frame loop:
// - xmp_start_player (player.c:1940-2054)
// - xmp_play_frame (player.c:2064-2176) incl. next_order (:1736-1813),
//   next_row (:1815-1849), read_row (:814-857), check_delay (:744-812),
//   inject_event (:1715-1730), check_end_of_module (:2047-2061),
//   reset_channels (:683-742)
// - set_position (control.c:63-132)
// Scan integration mirrors load.c epilogue → libxmp_scan_sequences.
//
// Timing model (binding): ticksize = (int)(freq × time_factor × rrate /
// bpm / 1000), truncated, min 1<<ANTICLICK_SHIFT = 8 (mixer.h:13).
// time_factor=10 (DEFAULT_TIME_FACTOR), rrate=250 (PAL_RATE).

import { CoreState, Quirk } from './model/constants';
import { ChannelFlags } from './model/model';

import {
  RowDelay,
  EMPTY_EVENT,
  type ChannelState,
  type Event,
  type ModuleData,
  type PlayState,
  type FlowState,
  type MixerState,
  type VoiceState,
  type SampleData,
  type SampleMeta,
} from './model/model';
import * as FX from './model/fx';
import type {
  Core as CoreIface,
  CoreConfig,
  FormatPlugin,
  DspPlugin,
  OutputPlugin,
  LoadCtx,
} from './types/index';
import {
  ModplayError,
  StateError,
} from './errors';
import { Registries } from './registry';
import { VirtualLayer } from './virtual';
import { SampleStore } from './samples';
import { Scanner, OrdInfo } from './scan';
import { resetFlow, processPatternLoop, processPatternJump, processPatternBreak } from './flow';
import {
  processTick,
  VolSlideFlag,
  TREMOR_FLAG,
  RESET_PER,
} from '@modplayjs/effects-shared';

const MSN = (v: number) => (v >> 4) & 0x0f;
const LSN = (v: number) => v & 0x0f;

const XMP_MARK_END = 0xff;
const ANTICLICK_SHIFT = 3;
/** DEFAULT_TIME_FACTOR common.h:454; PAL_RATE common.h:135. */
const DEFAULT_TIME_FACTOR = 10;
const PAL_RATE = 250;

/** mixer.c:426-446 libxmp_mixer_get_ticksize. */
function getTicksize(freq: number, timeFactor: number, rrate: number, bpm: number): number {
  if (freq <= 0 || bpm <= 0 || timeFactor <= 0 || rrate <= 0) return -1;
  const calc = freq * timeFactor * rrate / bpm / 1000;
  if (!Number.isFinite(calc)) return -1;
  let ticksize = Math.trunc(calc);
  if (ticksize < (1 << ANTICLICK_SHIFT)) ticksize = 1 << ANTICLICK_SHIFT;
  return ticksize;
}

function makeChannelState(): ChannelState {
  return {
    flags: 0, per_flags: 0, note_flags: 0, note: 0, key: 0,
    period: 0, finalPeriod: 0, ins: -1, old_ins: 0, smp: -1,
    mastervol: 0, delay: 0, keyoff: 0, fadeout: 0, ins_fade: 0,
    macro: { val: 0, target: 0, slide: 0, active: 0, finalvol: 0, notepan: 0 },
    noteslide: { slide: 0, fslide: 0, count: 0, speed: 0 },
    volume: 0, gvl: 0, rvv: 0, rpv: 0, split: 0, pair: 0,
    v_idx: 0, p_idx: 0, f_idx: 0, key_porta: 0,
    finetune: 0, per_adj: 0,
    vibrato: { lfo: { type: 0, rate: 0, depth: 0, phase: 0 }, memory: 0 },
    tremolo: { lfo: { type: 0, rate: 0, depth: 0, phase: 0 }, memory: 0 },
    panbrello: { lfo: { type: 0, rate: 0, depth: 0, phase: 0 }, memory: 0 },
    arpeggio: { val: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], size: 0, count: 0, memory: 0 },
    insvib: { lfo: { type: 0, rate: 0, depth: 0, phase: 0 }, sweep: 0 },
    offset: { val: 0, val2: 0, memory: 0 },
    retrig: { val: 0, count: 0, type: 0, limit: 0 },
    tremor: { up: 0, down: 0, count: 0, memory: 0 },
    vol: { slide: 0, fslide: 0, slide2: 0, memory: 0, fslide2: 0, memory2: 0 },
    fine_vol: { up_memory: 0, down_memory: 0 },
    gvol: { slide: 0, fslide: 0, memory: 0 },
    trackvol: { slide: 0, fslide: 0, memory: 0 },
    freq: { slide: 0, fslide: 0, memory: 0, down_memory: 0 },
    porta: { target: 0, dir: 0, slide: 0, memory: 0, note_memory: 0 },
    fine_porta: { up_memory: 0, down_memory: 0, xf_up_memory: 0, xf_down_memory: 0 },
    pan: { val: 0x80, slide: 0, fslide: 0, memory: 0, surround: 0 },
    invloop: { speed: 0, count: 0, pos: 0 },
    tempo_slide: 0,
    filter: { cutoff: 0xff, resonance: 0, envelope: 0, can_disable: 0 },
    delayed_event: { ...EMPTY_EVENT },
    delayed_ins: 0,
    key_memory: 0,
    info_period: 0, info_pitchbend: 0, info_position: 0,
    info_finalvol: 0, info_finalpan: 0, info_notepan: 0,
  };
}

export class Core implements CoreIface {
  readonly registries = new Registries();
  readonly samples = new SampleStore();
  readonly virt = new VirtualLayer();

  private _timeFactorRelative = 1.0;
  private activeDspName = 'softmixer';
  private eventScratch: (Event | undefined)[] = [];
  private _state: number = CoreState.UNLOADED;
  private _module: ModuleData | null = null;
  /** scan result keyed by order (xxo_info). */
  private ordInfo: OrdInfo[] = [];
  /** scan[seq] end ord/row/num per sequence — flattened for sequence 0 use. */
  private scanEnd = { ord: 0, row: 0, num: 0 };

  private _p!: PlayState;
  private _flow!: FlowState;
  private _xc: ChannelState[] = [];
  private _s = {
    freq: 44100,
    format: 0,
    interp: 1,
    amplify: 1,
    mix: 100,
    numvoc: 128,
    ticksize: 0,
    dtright: 0,
    dtleft: 0,
    bidir_adjust: 0,
  };

  constructor(config?: CoreConfig) {
    this.initPlayerState();
    if (config?.sampleRate) this._s.freq = config.sampleRate;
    if (config?.interp !== undefined) this._s.interp = config.interp;
    if (config?.numVoices) this._s.numvoc = config.numVoices;
  }

  private initPlayerState(): void {
    this._p = {
      ord: 0,
      pos: 0,
      row: 0,
      frame: -1,
      speed: 6,
      bpm: 125,
      sequence: 0,
      loop_count: 0,
      sequence_control: [],
      gvol: 64,
      master_vol: 100,
      smix_vol: 100,
      channel_vol: [],
      channel_mute: [],
      inject_event: [],
      flow: {
        pbreak: 0, jump: -1, delay: 0, jumpline: 0, loop_dest: -1,
        loop_param: -1, loop_start: -1, loop_count: 0, loop_active_num: 0,
        loop: [], num_rows: 0, end_point: 0, rowdelay: 0, rowdelay_set: 0,
        force_reposition: 0,
      },
      current_time: 0,
      filter: 0,
      flags: 0,
    };
    this._flow = this._p.flow;
  }

  get mixerState(): MixerState { return this._s as MixerState; }

  // ------------------------------------------------------------------
  // state views
  // ------------------------------------------------------------------

  get state(): CoreState { return this._state as CoreState; }
  get module(): ModuleData | null { return this._module; }
  get channels(): number { return this._module?.chn ?? 0; }
  get quirks(): number { return this._module?.quirks ?? 0; }

  get playState() {
    return {
      ord: this._p.ord,
      row: this._p.row,
      frame: this._p.frame,
      speed: this._p.speed,
      bpm: this._p.bpm,
      timeMs: this._p.current_time,
      loopCount: this._p.loop_count,
    };
  }

  get channelStates(): readonly ChannelState[] { return this._xc; }
  get voiceStates(): readonly VoiceState[] { return this.virt.voices; }
  get sampleRate(): number { return this._s.freq; }
  get ticksize(): number { return this._s.ticksize; }
  get ctx() {
    const self = this;
    return {
      get p() { return self.internalP; },
      get s() { return self.mixerState; },
      get m() { return self._module!; },
      get channelStates() { return self._xc; },
      get voiceStates(): readonly VoiceState[] { return self.virt.voices; },
      get state() { return self._state as CoreState; },
      get quirks() { return self.quirks; },
    };
  }

  // ------------------------------------------------------------------
  // loading
  // ------------------------------------------------------------------

  /**
   * Load via registered format plugins (load.c:233-332): probe → parse →
   * scan sequences. Parser fills ModuleData + RawSamples through LoadCtx;
   * the core normalizes samples into the store and rewrites mod.samples to
   * stored ids.
   */
  loadModule(bytes: Uint8Array): void {
    if (this._state === CoreState.PLAYING) this.stopPlayer();
    // xmp_load_module releases the previous module first (load.c:584-604):
    // its samples are freed. Our store keys samples by a running ID, so
    // without this a second load's voices resolve STALE samples from the
    // previous module (wrong pitch / wrong data — the demo file-switch
    // regression). Reset the ID counter too.
    this.samples.clear();
    const fmt = this.registries.formatFor(bytes);
    if (!fmt) {
      // Match unknown-format error semantics of libxmp_load_module.
      throw new ModplayError('unknown module format');
    }

    const loaderCtx: LoadCtx = {
      sampleRate: this._s.freq,
      outputRate: this._s.freq,
      addSample: (raw) => this.samples.add(raw),
    };

    const mod = fmt.load(bytes, loaderCtx);

    // Scan sequences (libxmp_scan_sequences): scan[chain] carries the
    // end point ord/row/num written by scan_module's end_module block.
    const sc = new Scanner();
    const res = sc.scan(mod);
    this.ordInfo = res.xxo_info;
    this._sequenceControl = res.sequence_control;
    mod.num_sequences = res.num_sequences;
    mod.sequences = [];
    for (let i = 0; i < res.num_sequences; i++) {
      const epOrd = res.entry_points[i] ?? 0;
      mod.sequences.push({
        ord: i,
        entry_point: epOrd,
        duration: Math.max(0, Math.min(res.scan[i]?.time ?? 0, 2147483647)),
        time: res.scan[i]?.time ?? 0,
        speed: res.xxo_info[epOrd]?.speed ?? 0,
        bpm: res.xxo_info[epOrd]?.bpm ?? 0,
        gvl: res.xxo_info[epOrd]?.gvl ?? -1,
        start_row: res.xxo_info[epOrd]?.start_row ?? 0,
      });
    }
    const s0 = res.scan[0];
    this.scanEnd = { ord: s0?.ord ?? 0, row: s0?.row ?? 0, num: s0?.num ?? 0 };

    this._module = mod;
    this._state = CoreState.LOADED;
  }

  // ------------------------------------------------------------------
  // lifecycle
  // ------------------------------------------------------------------

  startPlayer(): void {
    if (this._state < CoreState.LOADED) {
      throw new StateError('no module loaded');
    }
    if (this._state > CoreState.LOADED) this.stopPlayer();
    const mod = this.module!;
    const p = this._p;

    this._timeFactorRelative = 1.0;
    p.master_vol = 100;
    p.gvol = this._module!.volbase;
    p.pos = p.ord = 0;
    p.frame = -1;
    p.row = 0;
    p.current_time = 0;
    p.loop_count = 0;
    p.sequence = 0;

    for (let i = 0; i < mod.chn; i++) {
      p.channel_mute[i] = (mod.channels[i]?.flg ?? 0) & 0x04 /* MUTE */ ? true : false;
      p.channel_vol[i] = 100;
    }
    this.virt.setChannelMute(p.channel_mute);

    // Skip invalid patterns at start (player.c:1986-1992).
    while (p.ord < mod.len && (mod.xxo[p.ord] ?? Infinity) >= mod.pat) {
      p.ord++;
    }
    if (p.ord >= mod.len) mod.len = 0;

    if (mod.len === 0) {
      p.ord = this.scanEnd.ord = 0;
      p.row = this.scanEnd.row = 0;
      this._flow.end_point = 0;
      this._flow.num_rows = 0;
    } else {
      this._flow.num_rows = mod.patterns[mod.xxo[p.ord]!]?.rows ?? 0;
      this._flow.end_point = this.scanEnd.num;
    }

    this.updateFromOrdInfo();

    this.virt.setSampleLookup((id) => this.samples.get(id));
    this.virt.setModuleRef(() => this._module);
    this.virt.setChannelStatesHook((chn, apply) => {
      const xc = this._xc[chn];
      if (xc === undefined) return false;
      apply(xc);
      return true;
    });
    this.virt.on(mod.chn, (mod.quirks & Quirk.VIRTUAL) !== 0);
    // f->loop = calloc(virt_channels) (player.c:2004) — the player's flow
    // state owns per-channel pattern-loop slots; scan uses its own copy.
    this._flow.loop = Array.from({ length: this.virt.virtChannels }, () => ({
      start: 0,
      count: 0,
    }));
    resetFlow(this._flow);
    this.resetChannels();
    this.recomputeTicksize();

    this._state = CoreState.PLAYING;
  }

  stopPlayer(): void {
    if (this._state < CoreState.PLAYING) return;
    this._state = CoreState.LOADED;
    this.virt.off();
  }

  destroy(): void {
    this.stopPlayer();
    this._module = null;
    this._state = CoreState.UNLOADED;
    this.samples.clear();
  }

  // ------------------------------------------------------------------
  // tempo/speed/rate
  // ------------------------------------------------------------------

  setTempo(bpm: number): void {
    this._p.bpm = bpm;
    this.recomputeTicksize();
  }

  setSpeed(speed: number): void {
    this._p.speed = speed;
  }

  setSampleRate(hz: number): void {
    this._s.freq = hz;
    this.recomputeTicksize();
  }

  /** Stereo mixing / pan separation (xmp_set_player XMP_PLAYER_MIX,
   * control.c:446 → s->mix). 100 = full stereo field as panned; 0 =
   * mono downmix; values above 100 push the field wider. Consumed in
   * process_pan (player.c:1402): finalpan = (finalpan - 0x80) × mix / 100. */
  setPanSeparation(v: number): void {
    this._s.mix = Math.max(0, Math.min(v, 200));
  }

  getPanSeparation(): number {
    return this._s.mix;
  }

  setTempoFactor(f: number): void {
    this._timeFactorRelative = f;
    this.recomputeTicksize();
  }

  // ------------------------------------------------------------------
  // plugin accessors
  // ------------------------------------------------------------------

  setDsp(name: string): void {
    if (this._state === CoreState.PLAYING) {
      throw new StateError('cannot switch DSP while playing');
    }
    this.registries.dsp(name); // validate existence
    this.activeDspName = name;
  }

  dsp(name?: string): DspPlugin {
    return this.registries.dsp(name ?? this.activeDspName);
  }

  output(name: string): OutputPlugin { return this.registries.output(name); }
  format(name: string): FormatPlugin { return this.registries.format(name); }

  // ------------------------------------------------------------------
  // samples
  // ------------------------------------------------------------------

  swapSample(id: number, data: Float32Array, meta?: SampleMeta): void {
    this.samples.swap(id, data, meta);
  }

  getSample(id: number): SampleData {
    return this.samples.get(id);
  }

  // ------------------------------------------------------------------
  // rendering
  // ------------------------------------------------------------------

  /** Render exactly one tick into out (play_frame → softmixer). Returns
   * interleaved floats written, or -1 at end-of-module. ticksize is
   * recomputed EVERY tick (mixer.c:525 libxmp_mixer_prepare → :456
   * get_ticksize) so a tempo change on the current row applies to the
   * current tick's mix. */
  frame(out: Float32Array): number {
    if (this._state < CoreState.PLAYING) {
      throw new StateError('player not started');
    }
    const rc = this.playFrame();
    if (rc < 0) return rc;
    this.recomputeTicksize();
    return this.mixTick(out);
  }

  /**
   * xmp_play_buffer (player.c:2178-2233): render whole ticks until out is
   * filled. `loop` > 0 stops replay once loop_count reaches it (module end);
   * -1 return signals end-of-replay with nothing written. C pads the tail
   * of the LAST buffer with silence before returning 0 — preserved here by
   * writing zeros into the remainder (out is caller-owned; we only stop).
   */
  playBuffer(out: Float32Array, size: number, loop = 1): number {
    let total = 0;
    const frameSamples = this.ticksize * 2;
    while (total + frameSamples <= size) {
      const n = this.frame(out.subarray(total));
      // C checks ret<0 || loop_count>=loop BEFORE copying the frame;
      // the crossing frame is discarded, and the NEXT call (filled==0)
      // returns -1 (player.c:2196-2206).
      if (n < 0 || (loop > 0 && this._p.loop_count >= loop)) {
        if (total === 0) return -1; // start of buffer → end of replay
        break; // last buffer: caller sees a short read
      }
      total += n;
    }
    return total;
  }

  // ------------------------------------------------------------------
  // internals — frame sequencing (all anchors in reference/libxmp/src/player.c)
  // ------------------------------------------------------------------

  /** xmp_play_frame body minus mixer call (player.c:2064-2171). */
  private playFrame(): number {
    const p = this._p;
    const f = this._flow;
    const mod = this._module!;
    if (mod.len <= 0) return -1;

    // check reposition
    if (p.ord !== p.pos || f.force_reposition) {
      const start = this._module!.sequences[p.sequence]?.entry_point ?? 0;
      f.force_reposition = 0;

      if (p.pos === -2) return -1; /* that's all folks */

      if (p.pos === -1) {
        p.pos = start; /* restart sequence */
      }

      if (p.pos === start) {
        f.end_point = this.scanEnd.num;
      }
      if (p.pos > this.scanEnd.ord) {
        f.end_point = 0;
      }
      f.jump = -1;
      p.ord = p.pos - 1;
      if (p.ord < start) p.ord = start - 1;

      this.nextOrder(-1);
      this.updateFromOrdInfo();
      this.virt.reset();
      this.resetChannels();
    } else {
      p.frame++;
      if (p.frame >= p.speed * (1 + f.delay)) {
        // If break during pattern delay, next row is skipped
        // (corruption.mod order 1D pattern 0D last line).
        if ((this.quirks & Quirk.PROTRACK) !== 0 && f.delay && f.pbreak) {
          this.nextRow();
          this.checkEndOfModule();
        }
        this.nextRow();
      }
    }

    // player.c clears the KEY_OFF channel flag each tick (player.c clears
    // xc->flags &= ~FLAG_KEY_OFF via the per-tick prologue), not the note
    // marker constant.
    for (let i = 0; i < mod.chn; i++) {
      this._xc[i]!.flags &= ~VolSlideFlag.KEY_OFF;
    }

    if (p.frame === 0) {
      this.checkEndOfModule();
      this.readRow(mod.xxo[p.ord] ?? 0, p.row);
    }

    this.injectEvent();

    /* play_frame (player.c:2165-2168): per-channel per-tick stage.
     * C runs libxmp_play_extras at the START of play_channel (player.c:1646,
     * before process_volume) — EffectPlugin.onTick gets the same ordering:
     * its volume writes survive into the mixer (processTick ends in
     * virt_setVol). */
    for (let i = 0; i < this.virt.virtChannels; i++) {
      for (const ep of this.registries.effectPlugins()) {
        ep.onTick?.(this, i);
      }
      processTick(this, i);
    }

    /* player.c:2170 — clear after the per-channel loop. */
    f.rowdelay_set &= ~RowDelay.FIRST_FRAME;

    /* player.c:2171 — current_time += libxmp_get_frame_time (player.c:1877):
     * scan_time_factor * rrate / bpm, 0 when bpm == 0. scan_time_factor is
     * m.time_factor after scan (scan.c:788). */
    if (p.bpm !== 0) {
      const mod2 = this._module!;
      p.current_time += (mod2.time_factor * mod2.rrate) / p.bpm;
    }

    return 0;
  }

  /** next_order (player.c:1736-1813). */
  private nextOrder(lastOrd: number): void {
    const p = this._p;
    const f = this._flow;
    const mod = this._module!;
    let resetGvol = false;

    do {
      p.ord++;
      const mark = (this.quirks & Quirk.MARKER) !== 0 && p.ord < mod.len &&
        mod.xxo[p.ord] === XMP_MARK_END;
      if (p.ord >= mod.len || mark) {
        const ep = this._module!.sequences[p.sequence]?.entry_point ?? 0;
        if (
          mod.restart > mod.len ||
          (mod.xxo[mod.restart] ?? Infinity) >= mod.pat ||
          p.ord < ep
        ) {
          p.ord = ep;
        } else if (this.getSequence(mod.restart) === p.sequence) {
          p.ord = mod.restart;
        } else {
          p.ord = ep;
        }
        resetGvol = true;
        lastOrd = -1;
      }
    } while ((mod.xxo[p.ord] ?? Infinity) >= mod.pat);

    if (resetGvol) p.gvol = this.ordInfo[p.ord]?.gvl ?? this._module!.gvol;

    if (lastOrd !== p.ord) p.current_time = this.ordInfo[p.ord]?.time ?? 0;

    const pat = mod.patterns[mod.xxo[p.ord]!];
    f.num_rows = pat?.rows ?? 0;
    if (f.jumpline >= f.num_rows) f.jumpline = 0;
    p.row = f.jumpline;
    f.jumpline = 0;
    p.pos = p.ord;
    p.frame = 0;

    if ((this._module!.flowMode & 0x40 /* FLOW_LOOP_PATTERN_RESET */) !== 0) {
      f.loop_start = -1;
      f.loop_count = 0;
      for (let i = 0; i < mod.chn; i++) {
        f.loop[i]!.start = 0;
        f.loop[i]!.count = 0;
      }
    }

    if ((this.quirks & Quirk.PERPAT) !== 0) {
      for (let chn = 0; chn < mod.chn; chn++) this._xc[chn]!.per_flags = 0;
    }
  }

  /** next_row (player.c:1815-1849). */
  private nextRow(): void {
    const p = this._p;
    const f = this._flow;
    const lastOrd = p.ord;

    p.frame = 0;
    f.delay = 0;
    f.loop_param = -1;

    if (f.pbreak) {
      f.pbreak = 0;
      f.loop_dest = -1;
      if (f.jump !== -1) {
        p.ord = f.jump - 1;
        f.jump = -1;
      }
      this.nextOrder(lastOrd);
    } else {
      if (f.rowdelay === 0) {
        p.row++;
        f.rowdelay_set = 0;
      } else {
        f.rowdelay--;
      }
      if (f.loop_dest >= 0) {
        p.row = f.loop_dest;
        f.loop_dest = -1;
      }
      if (p.row >= f.num_rows) {
        this.nextOrder(lastOrd);
      }
    }
  }

  /** check_end_of_module (player.c:2047-2061). */
  private checkEndOfModule(): void {
    const p = this._p;
    const f = this._flow;
    if (p.ord === this.scanEnd.ord && p.row === this.scanEnd.row) {
      if (f.end_point === 0) {
        p.loop_count++;
        f.end_point = this.scanEnd.num;
      }
      f.end_point--;
    }
  }

  /** read_row (player.c:814-857). Dispatches to the format plugin's reader. */
  private readRow(patIdx: number, row: number): void {
    const f = this._flow;
    const mod = this._module!;
    const pat = mod.patterns[patIdx];
    const isFt2 = mod.readEventType === 1;

    for (let chn = 0; chn < mod.chn; chn++) {
      const xc = this._xc[chn]!;
      const track = pat?.tracks[chn];
      let event: Event;
      if (track && row < track.rows) {
        event = track.event[row] ?? EMPTY_EVENT;
      } else {
        event = EMPTY_EVENT;
      }

      if (isFt2) {
        // Reset Kxx even if delayed (ft2_kxx.xm); reset tremor FLAG likewise
        // (player.c:829-832: RESET(TREMOR) clears per_flags, NOT tremor.count
        // — zeroing the count would gate every post-note row's volume to 0
        // in tremorFt2).
        xc.keyoff = 0;
        RESET_PER(xc, TREMOR_FLAG);
      }

      if (!this.checkDelay(event, chn)) {
        if (
          f.rowdelay_set === 0 ||
          ((f.rowdelay_set & RowDelay.FIRST_FRAME) !== 0 && f.rowdelay > 0)
        ) {
          // Format plugin event reader (read_event_MOD/FT2/ST3/IT).
          this.registries.format(mod.format).readEvent(this, chn, row);
          // Effect AND dsp plugin per-row hook (T8 contract: DspPlugin.onRow).
          // The paula DSP needs onRow to restart its sample accumulator on
          // new notes (its position lives outside the core voice state).
          for (const ep of this.registries.effectPlugins()) {
            ep.onRow?.(this, chn, event);
          }
          for (const dp of this.registries.dspPlugins()) {
            dp.onRow?.(this, chn, event);
          }
        }
      } else if (mod.readEventType === 3 /* IT */) {
        xc.flags = 0;
      }
    }
  }

  /** check_delay (player.c:744-812). Returns 1 when the event was delayed. */
  private checkDelay(e: Event, chn: number): number {
    const p = this._p;
    const xc = this._xc[chn]!;

    // Tempo affects delay and must be computed first.
    if ((e.fxt === FX.FX_SPEED && e.fxp < 0x20) || e.fxt === FX.FX_S3M_SPEED) {
      if (e.fxp) p.speed = e.fxp;
    }
    if ((e.f2t === FX.FX_SPEED && e.f2p < 0x20) || e.f2t === FX.FX_S3M_SPEED) {
      if (e.f2p) p.speed = e.f2p;
    }

    let delayed = false;
    if (e.fxt === FX.FX_EXTENDED && MSN(e.fxp) === FX.EX_DELAY && LSN(e.fxp) !== 0) {
      xc.delay = LSN(e.fxp) + 1;
      delayed = true;
    } else if (e.f2t === FX.FX_EXTENDED && MSN(e.f2p) === FX.EX_DELAY && LSN(e.f2p) !== 0) {
      xc.delay = LSN(e.f2p) + 1;
      delayed = true;
    }
    if (!delayed) return 0;

    xc.delayed_event = { ...e };
    if (e.ins) xc.delayed_ins = e.ins;
    return 1;
  }

  /** inject_event (player.c:1715-1730). */
  private injectEvent(): void {
    const p = this._p;
    const mod = this._module!;
    for (let chn = 0; chn < mod.chn; chn++) {
      const e = p.inject_event[chn];
      if (e && (e.note !== 0 || e.ins !== 0 || e.vol !== 0 || e.fxt !== 0 || e.f2t !== 0)) {
        this.readSingleEvent(chn, e);
        p.inject_event[chn] = { ...EMPTY_EVENT };
      }
    }
  }

  /** Single-channel event application shared by inject_event + delayed events. */
  readSingleEvent(chn: number, ev: Event): void {
    // The format plugin owns read_event_*.
    const mod = this._module!;
    this.eventScratch[chn] = ev;
    this.registries.format(mod.format).readEvent(this, chn, 0);
    this.eventScratch[chn] = undefined;
  }

  /**
   * play_channel delay arm (player.c:1619-1623):
   * libxmp_read_event(ctx, &xc->delayed_event, chn) — the STORED delayed
   * event, when the EDx count expires. No FT2 keyoff/tremor reset here; that
   * happens only in read_row (player.c:838-844). The format plugin's
   * readEvent() pulls the event from readEventScratch(chn).
   */
  readEvent(chn: number): void {
    const xc = this._xc[chn]!;
    this.readSingleEvent(chn, xc.delayed_event);
  }

  /** Event source for format readers: the delayed/injected scratch event. */
  readEventScratch(chn: number): Event | undefined {
    return this.eventScratch[chn];
  }

  /** Event source for format readers: pattern track cell (read_row path). */
  readEventAt(patIdx: number, chn: number, row: number): Event {
    const mod = this._module!;
    const pat = mod.patterns[patIdx];
    const track = pat?.tracks[chn];
    if (track && row < track.rows) {
      return track.event[row] ?? EMPTY_EVENT;
    }
    return EMPTY_EVENT;
  }


  /** reset_channels (player.c:683-742). */
  private resetChannels(): void {
    const mod = this._module!;
    const xcAll: ChannelState[] = [];
    for (let i = 0; i < this.virt.virtChannels; i++) {
      xcAll.push(makeChannelState());
      const xc = xcAll[i]!;
      xc.ins = -1;
      xc.old_ins = 0;
      xc.key = -1;
      xc.volume = this._module!.volbase;
    }
    this._xc = xcAll;

    for (let i = 0; i < this.virt.numTracks; i++) {
      const xc = this._xc[i]!;
      xc.mastervol = mod.channels[i]?.vol ?? 0x40;
      xc.pan.val = mod.channels[i]?.pan ?? 0x80;
      xc.filter.cutoff = 0xff;

      const flg = mod.channels[i]?.flg ?? 0;
      if (flg & ChannelFlags.SPLIT) {
        xc.split = ((flg & 0x30) >> 4) + 1;
        for (let j = 0; j < i; j++) {
          if ((mod.channels[j]?.flg ?? 0) & ChannelFlags.SPLIT && this._xc[j]!.split === xc.split) {
            this._xc[j]!.pair = i;
            xc.pair = j;
          }
        }
      } else {
        xc.split = 0;
      }
      if (flg & ChannelFlags.SURROUND) xc.pan.surround = 1;
    }
  }

  /** update_from_ord_info (player.c:1886-1900). */
  private updateFromOrdInfo(): void {
    const p = this._p;
    const oi = this.ordInfo[p.ord];
    if (!oi) return;
    if (oi.speed) p.speed = oi.speed;
    p.bpm = oi.bpm;
    p.gvol = oi.gvl;
    p.current_time = oi.time;
  }

  /** get_sequence parity via stored control array. */
  getSequence(ord: number): number {
    const ctrl = this._sequenceControl;
    if (ctrl.length === 0) return 255;
    return ctrl[ord] ?? 255;
  }

  private _sequenceControl: number[] = [];

  /** Recompute ticksize per binding formula with relative factor. */
  private recomputeTicksize(): void {
    const m = this._module;
    const tf = (m?.time_factor ?? DEFAULT_TIME_FACTOR) * this._timeFactorRelative;
    const ts = getTicksize(this._s.freq, tf, m?.rrate ?? PAL_RATE, this._p.bpm);
    this._s.ticksize = ts > 0 ? ts : 1 << ANTICLICK_SHIFT;
  }

  /** Render one tick worth of audio via the active DSP (fixed ticksize return). */
  private mixTick(out: Float32Array): number {
    this.dsp().renderFrame(this as unknown as CoreIface, out, 1);
    // C xmp_play_buffer advances by fi.buffer_size = ticksize × chn × sample_size —
    // the FIXED per-tick byte count, not the caller's buffer length. Returning
    // out.length here made playBuffer believe one tick filled the whole buffer
    // (5× stretched output with an uninitialized tail).
    return this.ticksize * 2;
  }

  // Internal accessors used by DSP/effect plumbing.
  get internalP(): PlayState { return this._p; }
  get internalFlow(): FlowState { return this._flow; }

  /** Expose flow handlers for effects (T13 will dispatch Bxx/Dxx/E6x here). */
  applyPatternLoop(chn: number, row: number, fxp: number): void {
    processPatternLoop(this._module!, this._flow, chn, row, fxp);
  }
  applyPatternJump(fxp: number): void { processPatternJump(this._module!, this._flow, fxp); }
  applyPatternBreak(fxp: number): void { processPatternBreak(this._module!, this._flow, fxp); }
}
