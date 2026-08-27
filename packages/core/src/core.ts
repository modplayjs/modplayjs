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
  XMP_KEY_OFF,
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
    volume: 0, gvl: 0, rvv: 0, rpv: 0, split: 0, pair: 0,
    v_idx: 0, p_idx: 0, f_idx: 0, key_porta: 0,
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
    mix: 50,
    numvoc: 32,
    ticksize: 0,
    dtright: 0,
    dtleft: 0,
    bidir_adjust: 0,
    pbase: 6847,
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

    // Scan sequences (scan.c libxmp_scan_sequences entry point semantics).
    const sc = new Scanner();
    const res = sc.scan(mod);
    this.ordInfo = res.xxo_info;
    mod.num_sequences = res.num_sequences;
    mod.sequences = res.sequences.filter(Boolean);
    this.scanEnd = { ord: 0, row: 0, num: 0 };
    const seq0 = res.sequences[0];
    if (seq0 && res.sequence_control[seq0.entry_point] === 0) {
      // End point comes from where scanning stopped for chain 0; scan.c
      // stores it in p->scan[chain].ord/.row/.num — recovered here from
      // sequence_control walk.
      let endOrd = seq0.entry_point;
      for (let i = seq0.entry_point; i < res.sequence_control.length; i++) {
        if (res.sequence_control[i] !== 0) break;
        endOrd = i;
      }
      this.scanEnd.ord = endOrd;
      this.scanEnd.row = 0;
      this.scanEnd.num = 1;
    }

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

    this.virt.on(mod.chn);
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

  /**
   * Render exactly one tick into out (play_frame → softmixer). Returns
   * interleaved floats written, or -1 at end-of-module.
   */
  frame(out: Float32Array): number {
    if (this._state < CoreState.PLAYING) {
      throw new StateError('player not started');
    }
    const rc = this.playFrame();
    if (rc < 0) return rc;
    return this.mixTick(out);
  }

  /**
   * Render whole ticks until out is filled or the module ends (libxmp's
   * xmp_play_buffer pull loop). Returns interleaved floats written.
   */
  playBuffer(out: Float32Array, size: number): number {
    let total = 0;
    while (total + this.ticksize * 2 <= size) {
      const n = this.frame(out.subarray(total));
      if (n < 0) break;
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

    for (let i = 0; i < mod.chn; i++) {
      this._xc[i]!.flags &= ~XMP_KEY_OFF;
    }

    if (p.frame === 0) {
      this.checkEndOfModule();
      this.readRow(mod.xxo[p.ord] ?? 0, p.row);
    }

    this.injectEvent();

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
        // Reset Kxx even if delayed (ft2_kxx.xm); reset tremor likewise.
        xc.keyoff = 0;
        xc.tremor.count = 0;
      }

      if (!this.checkDelay(event, chn)) {
        if (
          f.rowdelay_set === 0 ||
          ((f.rowdelay_set & RowDelay.FIRST_FRAME) !== 0 && f.rowdelay > 0)
        ) {
          // Format plugin event reader (read_event_MOD/FT2/ST3/IT).
          const fmtName = mod.format;
          try {
            this.registries.format(fmtName).readEvent(this, chn, row);
          } catch (err) {
            if (!(err instanceof StateError)) throw err;
            // No plugin-bound reader installed yet (T15-T18 pending).
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
    // The format plugin owns read_event_*; route through it when available.
    const mod = this._module!;
    this.eventScratch[chn] = ev;
    try {
      this.registries.format(mod.format).readEvent(this, chn, 0);
    } catch (err) {
      if (!(err instanceof StateError)) throw err;
    }
    void chn;
    void ev;
    this.eventScratch[chn] = undefined;
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

  /** Render one tick worth of audio via the active DSP. */
  private mixTick(out: Float32Array): number {
    const dsp = this.dsp();
    dsp.renderFrame(this as unknown as CoreIface, out, 1);
    return out.length;
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
