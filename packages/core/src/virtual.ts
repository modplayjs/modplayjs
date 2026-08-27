// Virtual channel / voice layer. Mirrors reference/libxmp/src/virtual.c.
//
// A "virtual channel" is a player channel slot the effects run on
import {
  Act,
  VoiceFlag,
  type ChannelState,
  type Instrument,
  type VoiceState,
} from './model/model';

/** maxvoc: maximum simultaneous voices (libxmp default 64). */
const MAXVOICES = 64;

/** Reason codes passed to virt_release, mirroring read_event.c pastnote usage. */
export const PastNote = {
  CUT: 0x00,
  OFF: 0x01,
  FADE: 0x02,
} as const;

/** Returned by cstat/mapChannel when the channel holds no voice. */
export const VIRT_INVALID = -1;

/**
 * One entry per virtual channel: which voice (if any) is the channel's
 * primary, mirroring libxmp virt_channel[] mapping.
 */
interface VirtChannelEntry {
  /** Current primary voice for this virtual channel, or INVALID. */
  voice: number;
  /** Tail voices still sounding after NNA split (single-linked), or INVALID. */
  tail: number;
}

/** Instrument identity token for DCT match comparisons. */
const insKeys = new WeakMap<Instrument, number>();
let nextInsKey = 1;
function insKey(ins: Instrument): number {
  let k = insKeys.get(ins);
  if (k === undefined) {
    k = nextInsKey++;
    insKeys.set(ins, k);
  }
  return k;
}

function makeVoice(chn: number): VoiceState {
  return {
    chn,
    root: 0,
    note: 0,
    pan: 0x80,
    vol: 0,
    period: 0,
    pos: 0,
    pos0: 0,
    fidx: 0,
    ins: -1,
    smp: -1,
    start: 0,
    end: 0,
    act: Act.NONE,
    key: 0,
    old_vl: 0,
    old_vr: 0,
    sleft: 0,
    sright: 0,
    flags: 0,
    filter: {
      r1: 0, r2: 0, l1: 0, l2: 0, a0: 0, b0: 0, b1: 0, cutoff: 0xff, resonance: 0,
    },
  };
}

export class VirtualLayer {
  /** Player channel count (= module channels; IT may exceed via NNA overflow). */
  numTracks = 0;
  /** Total virtual channels (tracks + overflow channels for NNA). */
  virtChannels = 0;
  private map: VirtChannelEntry[] = [];
  /** Voice pool (preallocated one per channel; NNA reuses/steals slots). */
  readonly voices: VoiceState[] = [];
  private used = 0;

  /** Allocate/reset for a new module + play session (virt_on, virtual.c:100). */
  on(numTracks: number): void {
    this.off();
    this.numTracks = numTracks;
    this.virtChannels = numTracks;
    for (let i = 0; i < this.virtChannels; i++) {
      this.map.push({ voice: VIRT_INVALID, tail: VIRT_INVALID });
      this.voices.push(makeVoice(i));
    }
    this.used = 0;
  }

  /** Free everything (virt_off, virtual.c:170). */
  off(): void {
    this.map = [];
    this.voices.length = 0;
    this.numTracks = 0;
    this.virtChannels = 0;
    this.used = 0;
  }

  /** Reset all voices/mappings without resizing (virt_reset, virtual.c:195). */
  reset(): void {
    for (let i = 0; i < this.map.length; i++) {
      this.map[i]!.voice = VIRT_INVALID;
      this.map[i]!.tail = VIRT_INVALID;
    }
    for (const v of this.voices) {
      v.act = Act.NONE;
      v.flags = 0;
      v.smp = -1;
      v.ins = -1;
      v.pos = 0;
      v.pos0 = 0;
      v.vol = 0;
    }
    this.used = 0;
  }

  /** Map a virtual channel to its active voice index, or VIRT_INVALID (virt_mapchannel :293). */
  mapChannel(chn: number): number {
    if (chn < 0 || chn >= this.virtChannels) return VIRT_INVALID;
    return this.map[chn]!.voice;
  }

  get usedVoices(): number {
    return this.used;
  }

  /** Find a free voice slot; none → VIRT_INVALID (graceful silence, no OOB). */
  private allocVoice(): number {
    if (this.used < MAXVOICES && this.used >= this.voices.length) {
      this.voices.push(makeVoice(this.voices.length));
    }
    // First preference: an ended slot.
    for (let i = 0; i < this.voices.length; i++) {
      if (this.voices[i]!.act === Act.NONE) return i;
    }
    if (this.voices.length < MAXVOICES) {
      const idx = this.voices.length;
      this.voices.push(makeVoice(idx));
      return idx;
    }
    return VIRT_INVALID;
  }

  /**
   * Assign a patch (instrument+sample+note) to a virtual channel
   * (virt_setpatch :484 + libxmp_virt_dct :419-471). Duplicate-check runs
   * against the channel's current voice; DCA decides the loser's fate.
   */
  setPatch(
    chn: number,
    ins: Instrument,
    subIndex: number,
    note: number,
    _nna: number,
    dct: number,
    dca: number,
    _xc: ChannelState | null,
  ): number {
    if (chn < 0 || chn >= this.virtChannels || ins.nsm === 0) return VIRT_INVALID;
    const sub = ins.sub[subIndex];
    if (!sub) return VIRT_INVALID;

    const curVoice = this.map[chn]!.voice;
    if (curVoice !== VIRT_INVALID && dct !== 0 /* DCT_OFF */) {
      const v = this.voices[curVoice]!;
      let match = false;
      switch (dct) {
        case 1: /* NOTE */ match = v.key === note; break;
        case 2: /* SMP  */ match = v.smp === sub.sid; break;
        case 3: /* INST */ match = v.ins === insKey(ins) && v.chn === chn; break;
      }
      if (match) {
        switch (dca) {
          case 0: /* CUT */ this.release(curVoice, PastNote.CUT); break;
          case 2: /* OFF */ this.release(curVoice, PastNote.OFF); break;
          case 3: /* FADE */ this.release(curVoice, PastNote.FADE); break;
          case 1: /* CONT — old voice keeps playing as a tail */
            this.map[chn]!.tail = curVoice;
            break;
        }
        if (this.map[chn]!.voice === curVoice) this.map[chn]!.voice = VIRT_INVALID;
      }
    }

    const vidx = this.allocVoice();
    if (vidx === VIRT_INVALID) return VIRT_INVALID;

    const v = this.voices[vidx]!;
    v.chn = chn;
    v.ins = insKey(ins);
    v.smp = sub.sid;
    v.note = note;
    v.key = note;
    v.root = note;
    v.act = Act.NOTE;
    v.flags = 0;
    v.pos = 0;
    v.pos0 = 0;
    v.old_vl = 0;
    v.old_vr = 0;
    this.map[chn]!.voice = vidx;
    return vidx;
  }

  /**
   * Set the NNA used when this channel's voice is later released
   * (virt_setnna :417). NNA is applied at release time through
   * releaseChannel's action argument; the setter exists for API parity.
   */
  setNna(_chn: number, _nna: number): void {
    // applied at release time — see release()
  }

  /** Set the note played by the channel's voice (virt_setnote :472). */
  setNote(chn: number, note: number): boolean {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return false;
    this.voices[vi]!.note = note;
    return true;
  }

  /** Set final volume on the channel's voice, 0..volbase (virt_setvol :309). */
  setVol(chn: number, vol: number): boolean {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return false;
    this.voices[vi]!.vol = vol;
    return true;
  }

  /** Set pan 0..255 on the channel's voice. */
  setPan(chn: number, pan: number): boolean {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return false;
    this.voices[vi]!.pan = pan;
    return true;
  }

  /** Set the mixing period on the channel's voice. */
  setPeriod(chn: number, period: number): boolean {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return false;
    this.voices[vi]!.period = period;
    return true;
  }

  /** Seek the voice into the sample (virt_voicepos :590). */
  voicePos(chn: number, pos: number): boolean {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return false;
    const v = this.voices[vi]!;
    v.pos = pos;
    v.pos0 = pos;
    return true;
  }

  /** Voice status: Act.NOTE/etc when live, VIRT_INVALID when none (virt_cstat :631). */
  cstat(chn: number): number {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return VIRT_INVALID;
    return this.voices[vi]!.act;
  }

  /** Direct voice access for the DSP mixer. */
  voiceAt(idx: number): VoiceState | undefined {
    return this.voices[idx];
  }

  get numVoices(): number {
    return this.voices.length;
  }

  /**
   * Key off / release a resolved voice per the past-note action
   * (virt_release :330 + libxmp_virt_pastnote). CUT stops immediately; OFF
   * starts release with note-off semantics; FADE only engages fadeout.
   */
  release(vi: number, action: number): void {
    const v = this.voices[vi];
    if (!v || v.act === Act.NONE) return;
    switch (action) {
      case PastNote.CUT:
        v.act = Act.NONE;
        v.vol = 0;
        v.flags |= VoiceFlag.ANTICLICK;
        break;
      case PastNote.OFF:
        v.act = Act.KEY;
        v.flags |= VoiceFlag.RELEASE | VoiceFlag.ANTICLICK;
        break;
      case PastNote.FADE:
        v.act = Act.VOL;
        v.flags |= VoiceFlag.RELEASE | VoiceFlag.ANTICLICK;
        break;
    }
    if (this.map[v.chn]?.voice === vi) {
      this.map[v.chn]!.voice = VIRT_INVALID;
    }
  }

  /** Mark the channel's current voice released (player KEY_OFF/NNA paths). */
  releaseChannel(chn: number, action: number): void {
    const vi = this.mapChannel(chn);
    if (vi !== VIRT_INVALID) this.release(vi, action);
  }

  /** Per-mix-pass voice iteration: active voices plus anticlick-draining ones. */
  forEachActive(fn: (v: VoiceState) => void): void {
    for (const v of this.voices) {
      if (v.act !== Act.NONE || (v.flags & VoiceFlag.ANTICLICK) !== 0) fn(v);
    }
  }
}

