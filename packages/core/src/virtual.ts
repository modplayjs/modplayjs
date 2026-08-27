// Virtual channel / voice layer. Mirrors reference/libxmp/src/virtual.c.
//
// A "virtual channel" is a player channel slot the effects run on
import {
  Act,
  SampleFlags,
  VoiceFlag,
  type ChannelState,
  type Instrument,
  type VoiceState,
} from './model/model';

/** PERIOD_BASE (period.h:6) — C0 period for note_to_period_mix. */
const PERIOD_BASE = 13696.0;

/** libxmp_note_to_period_mix (period.c:205-209). */
function noteToPeriodMix(n: number, b: number): number {
  return PERIOD_BASE / Math.pow(2, (n + b / 12800) / 12);
}

/** maxvoc: maximum simultaneous voices (libxmp default 64). */
const MAXVOICES = 64;

/** Reason codes passed to virt_release, mirroring read_event.c pastnote usage. */
export const PastNote = {
  CUT: 0x00,
  OFF: 0x01,
  FADE: 0x02,
} as const;

/** Structural view of a stored sample used by loop-bound resolution. */
export interface SampleViewLike {
  length: number;
  loopStart: number;
  loopEnd: number;
  sustainStart: number;
  sustainEnd: number;
  flags: number;
}

/** Returned by cstat/mapChannel when the channel holds no voice. */
export const VIRT_INVALID = -1;
/** virtual.h:11 — status of any live root-track channel (virt_cstat). */
export const VIRT_ACTIVE = 0x100;

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
    queued: { smp: -1 },
    filter: {
      r1: 0, r2: 0, l1: 0, l2: 0, a0: 0, b0: 0, b1: 0, cutoff: 0xff, resonance: 0,
    },
  };
}

export class VirtualLayer {
  /** ctx->s.bidir_adjust (mixer.c:379) — IT ping-pong loops shortened by
   * one sample; 0 for the non-IT formats until T18 wires it. */
  bidirAdjust = 0;
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
    // alloc_voice (virtual.c:225) increments virt_used on allocation.
    this.used++;

    const v = this.voices[vidx]!;
    v.chn = chn;
    v.ins = insKey(ins);
    v.smp = sub.sid;
    v.note = note;
    v.key = note;
    v.root = chn; /* root is the ROOT CHANNEL (virtual.c:271), not the note */
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

  /**
   * libxmp_virt_seteffect (virtual.c:366-377) + libxmp_mixer_seteffect
   * (mixer.c:1000-1024). Writes an IT filter parameter directly to the
   * channel's voice. `type` is one of the DSP_EFFECT_* codes (common.h:447-451).
   */
  setEffect(chn: number, type: number, val: number): boolean {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return false;
    const f = this.voices[vi]!.filter;
    switch (type) {
      case 0x02: /* DSP_EFFECT_CUTOFF */ f.cutoff = val; break;
      case 0x03: /* DSP_EFFECT_RESONANCE */ f.resonance = val; break;
      case 0xb0: /* DSP_EFFECT_FILTER_A0 */ f.a0 = val; break;
      case 0xb1: /* DSP_EFFECT_FILTER_B0 */ f.b0 = val; break;
      case 0xb2: /* DSP_EFFECT_FILTER_B1 */ f.b1 = val; break;
    }
    return true;
  }

  /**
   * libxmp_virt_voicepos (virtual.c:588-598) → libxmp_mixer_voicepos
   * (mixer.c:789-838). Queued-branch first (queued swap takes effect on
   * position change), then pos set, adjust_voice_end, forward-loop
   * restart / reverse-0-maps-to-end hack, anticlick (ac=1 always here).
   */
  voicePos(chn: number, pos: number): boolean {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return false;
    const v = this.voices[vi]!;

    // Position changes e.g. retrigger make the new sample take effect if
    // queued (OpenMPT InstrSwapRetrigger.mod) — mixer.c:795-806.
    if ((v.flags & VoiceFlag.SAMPLE_QUEUED) !== 0) {
      v.flags &= ~VoiceFlag.SAMPLE_QUEUED;
      if (v.queued.smp < 0) {
        v.flags |= VoiceFlag.SAMPLE_PAUSED;
      } else if (v.smp !== v.queued.smp) {
        this.hotswapSample(v, v.queued.smp);
      }
      v.flags |= VoiceFlag.SAMPLE_LOOP;
    }

    const xxs = this.getSampleFor(v.smp);
    if (!xxs) return true;

    v.pos = pos;
    v.pos0 = pos;

    this.adjustVoiceEndV(v, xxs);

    if (v.pos >= v.end) {
      v.pos = v.end;
      // Restart forward sample loops (mixer.c:825-828): forward && active
      // loop → loop_reposition without the SAMPLE_LOOP flag bookkeeping
      // already done above.
      if (
        (v.flags & VoiceFlag.VOICE_REVERSE) === 0 &&
        this.hasActiveLoop(v, xxs)
      ) {
        this.loopRepositionV(v, xxs);
      }
    } else if (
      (v.flags & VoiceFlag.VOICE_REVERSE) !== 0 &&
      v.pos <= 0.1
    ) {
      // Hack: 0 maps to the end for reversed samples (mixer.c:829-833).
      v.pos = v.end;
    }

    // ac (virt_voicepos passes 1): anticlick(vi) — float model folds this
    // into the old_vl/old_vr ramp reset.
    v.old_vl = 0;
    v.old_vr = 0;
    return true;
  }

  /**
   * has_active_loop (mixer.c:326-330): sample LOOP flag OR an active
   * sustain loop. has_active_sustain_loop (mixer.c:315-324): module
   * sample, SLOOP set, voice not in release.
   */
  private hasActiveLoop(v: VoiceState, xxs: SampleViewLike): boolean {
    if ((xxs.flags & SampleFlags.LOOP) !== 0) return true;
    return (
      v.smp >= 0 &&
      (xxs.flags & SampleFlags.SUSTAIN) !== 0 &&
      (v.flags & VoiceFlag.RELEASE) === 0
    );
  }

  /**
   * adjust_voice_end (mixer.c:333-355) for the virtual layer: recompute
   * v.start/v.end from the sample's loop state; clear/set VOICE_BIDIR.
   */
  private adjustVoiceEndV(v: VoiceState, xxs: SampleViewLike): void {
    v.flags &= ~VoiceFlag.VOICE_BIDIR;

    const sustainActive =
      (xxs.flags & SampleFlags.SUSTAIN) !== 0 &&
      (v.flags & VoiceFlag.RELEASE) === 0;
    if (sustainActive) {
      v.start = xxs.sustainStart;
      v.end = xxs.sustainEnd;
      if ((xxs.flags & SampleFlags.SUSTAIN_BIDIR) !== 0) {
        v.flags |= VoiceFlag.VOICE_BIDIR;
      }
    } else if ((xxs.flags & SampleFlags.LOOP) !== 0) {
      v.start = xxs.loopStart;
      if (
        (xxs.flags & SampleFlags.LOOP_FULL) !== 0 &&
        (v.flags & VoiceFlag.SAMPLE_LOOP) === 0
      ) {
        v.end = xxs.length;
      } else {
        v.end = xxs.loopEnd;
        if ((xxs.flags & SampleFlags.BIDIR) !== 0) {
          v.flags |= VoiceFlag.VOICE_BIDIR;
        }
      }
    } else {
      v.start = 0;
      v.end = xxs.length;
    }
  }

  /**
   * loop_reposition (mixer.c:357-393): set SAMPLE_LOOP (adjust endpoints
   * on first entry), then wrap/flip position around the loop bounds.
   * Safety clamp vs sample length + 1 (:388-391).
   */
  private loopRepositionV(v: VoiceState, xxs: SampleViewLike): void {
    const loopChanged = (v.flags & VoiceFlag.SAMPLE_LOOP) === 0;
    v.flags |= VoiceFlag.SAMPLE_LOOP;
    if (loopChanged) this.adjustVoiceEndV(v, xxs);

    if ((v.flags & VoiceFlag.VOICE_BIDIR) === 0) {
      // Reposition for next loop.
      if ((v.flags & VoiceFlag.VOICE_REVERSE) === 0) {
        v.pos -= v.end - v.start;
      } else {
        v.pos += v.end - v.start;
      }
    } else {
      // Bidirectional loop: switch directions.
      v.flags ^= VoiceFlag.VOICE_REVERSE;
      if ((v.flags & VoiceFlag.VOICE_REVERSE) !== 0) {
        v.pos = v.end * 2 - this.bidirAdjust - v.pos;
      } else {
        v.pos = v.start * 2 - v.pos;
      }
    }
    if (v.pos > xxs.length + 1) {
      v.pos = xxs.length + 1;
    }
  }

  /**
   * hotswap_sample (mixer.c:395-405): save vol/pan, setpatch (which zeros
   * them), force SAMPLE_LOOP, restore vol/pan.
   */
  private hotswapSample(v: VoiceState, smp: number): void {
    const voc = this.voices.indexOf(v);
    const vol = v.vol;
    const pan = v.pan;
    this.setPatchVoice(voc, smp, false);
    v.flags |= VoiceFlag.SAMPLE_LOOP;
    v.vol = vol;
    v.pan = pan;
  }

  /** Voice status (virt_cstat virtual.c:631-645): no voice → VIRT_INVALID;
   * root tracks (< num_tracks) → always VIRT_ACTIVE; else the voice act. */
  cstat(chn: number): number {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return VIRT_INVALID;
    if (chn < this.numTracks) return VIRT_ACTIVE;
    return this.voices[vi]!.act;
  }

  /**
   * libxmp_virt_release (virtual.c:330-340) + libxmp_mixer_release
   * (mixer.c:958-981): set/clear the voice RELEASE flag. `rel` is the
   * NOTE_SAMPLE_RELEASE test result (play_channel player.c:1683).
   */
  releaseFlag(chn: number, rel: number): void {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return;
    const v = this.voices[vi]!;
    if (rel) {
      v.flags |= VoiceFlag.RELEASE;
    } else {
      v.flags &= ~VoiceFlag.RELEASE;
    }
  }

  /**
   * libxmp_virt_getvoicepos (virtual.c:378-388) + libxmp_mixer_getvoicepos
   * (mixer.c:840-855): current sample position of the channel's voice.
   */
  getVoicePos(chn: number): number {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return 0;
    return this.voices[vi]!.pos;
  }

  /** Direct voice access for the DSP mixer. */
  voiceAt(idx: number): VoiceState | undefined {
    return this.voices[idx];
  }

  get numVoices(): number {
    return this.voices.length;
  }

  /**
   * do_virt_resetvoice (virtual.c:53-78) + libxmp_virt_resetvoice (:79-97).
   * Wipes the voice but preserves anticlick decay (sleft/sright + ANTICLICK
   * flag). `mute` ramps volume to 0 through the mixer first.
   */
  private resetVoice(vi: number, mute: boolean): void {
    if (vi < 0 || vi >= this.voices.length) return;
    const v = this.voices[vi]!;
    if (mute) {
      v.vol = 0;
    }
    if (v.act !== Act.NONE && this.used > 0) {
      this.used--;
    }
    if (v.root >= 0 && v.root < this.map.length && this.map[v.root]) {
      // virt_channel[vi->root].count-- — the TS map has no per-root count;
      // allocation is implicit in the voice pool. No-op.
    }
    if (v.chn >= 0 && v.chn < this.map.length) {
      if (this.map[v.chn]!.voice === vi) this.map[v.chn]!.voice = VIRT_INVALID;
    }
    // do_virt_resetvoice: preserve anticlick decay state through note cut.
    const anticlickL = v.sleft;
    const anticlickR = v.sright;
    const flags = v.flags & VoiceFlag.ANTICLICK;
    const queued = v.queued;
    const fresh = makeVoice(v.chn);
    // memcpy(vi, 0, sizeof) — full wipe:
    v.chn = fresh.chn;
    v.root = fresh.root;
    v.note = fresh.note;
    v.pan = fresh.pan;
    v.vol = fresh.vol;
    v.period = fresh.period;
    v.pos = fresh.pos;
    v.pos0 = fresh.pos0;
    v.fidx = fresh.fidx;
    v.ins = fresh.ins;
    v.smp = fresh.smp;
    v.start = fresh.start;
    v.end = fresh.end;
    v.act = fresh.act;
    v.key = fresh.key;
    v.old_vl = fresh.old_vl;
    v.old_vr = fresh.old_vr;
    v.filter = fresh.filter;
    v.queued = queued;
    // restore preserved state:
    v.sleft = anticlickL;
    v.sright = anticlickR;
    v.flags = flags;
    v.chn = VIRT_INVALID;
    v.root = VIRT_INVALID;
  }

  /**
   * libxmp_virt_resetchannel (virtual.c:298-307): reset the channel's
   * current voice, muting it.
   */
  resetChannel(chn: number): void {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return;
    this.resetVoice(vi, true);
  }

  /**
   * libxmp_mixer_setpatch (mixer.c:855-900) semantics on a voice: assign
   * sample, zero vol/pan, clear loop/queue/reverse flags, reset fidx,
   * position 0 via voicepos(ac) semantics. Returns the sample for the
   * caller to refresh loop bounds (softmixer recomputes per tick).
   */
  private setPatchVoice(vi: number, smp: number, ac: boolean): void {
    const v = this.voices[vi]!;
    v.smp = smp;
    v.vol = 0;
    v.pan = 0;
    v.flags &= ~(
      VoiceFlag.SAMPLE_LOOP |
      VoiceFlag.SAMPLE_QUEUED |
      VoiceFlag.SAMPLE_PAUSED |
      VoiceFlag.VOICE_REVERSE |
      VoiceFlag.VOICE_BIDIR
    );
    v.fidx = 0;
    v.pos = 0;
    v.pos0 = 0;
    if (ac) {
      // anticlick(vi): ramp from current output to zero; float model
      // folds this into old_vl/old_vr reset.
      v.old_vl = 0;
      v.old_vr = 0;
    }
    // libxmp_mixer_voicepos(ctx, voc, 0, ac) tail: adjust_voice_end +
    // pos>=end clamp. Loop bounds are recomputed by the softmixer each
    // tick; clamp against the new sample's loop/len here.
    const smpData = this.getSampleFor(vi);
    if (smpData) {
      if ((smpData.flags & SampleFlags.LOOP) !== 0) {
        v.start = smpData.loopStart;
        v.end =
          (smpData.flags & SampleFlags.LOOP_FULL) !== 0 &&
          (~v.flags & VoiceFlag.SAMPLE_LOOP) !== 0
            ? smpData.length
            : smpData.loopEnd;
        if ((smpData.flags & SampleFlags.BIDIR) !== 0) {
          v.flags |= VoiceFlag.VOICE_BIDIR;
        }
      } else {
        v.start = 0;
        v.end = smpData.length;
      }
      if (v.pos >= v.end) {
        v.pos = v.end;
        if ((~v.flags & VoiceFlag.VOICE_REVERSE) !== 0 && (smpData.flags & SampleFlags.LOOP) !== 0) {
          v.pos = v.start;
        }
      }
    }
  }

  /** Sample lookup hook installed by Core (avoids import cycle). */
  private sampleLookup: ((id: number) => SampleViewLike | undefined) | null = null;

  /** Install the sample resolver (Core wires this at construction). */
  setSampleLookup(fn: (id: number) => SampleViewLike | undefined): void {
    this.sampleLookup = fn;
  }

  private getSampleFor(smpId: number): SampleViewLike | undefined {
    if (smpId < 0 || !this.sampleLookup) return undefined;
    try {
      return this.sampleLookup(smpId);
    } catch {
      return undefined;
    }
  }

  /**
   * libxmp_virt_queuepatch (virtual.c:546-581): Protracker 1/2 instrument
   * swap — volume/finetune apply now, sample change waits for loop end.
   */
  queuePatch(chn: number, insNum: number, smp: number, note: number): number {
    if (chn < 0 || chn >= this.virtChannels) return VIRT_INVALID;
    if (insNum < 0) smp = -1;

    const voc = this.map[chn]!.voice;
    if (voc > VIRT_INVALID) {
      const v = this.voices[voc]!;
      // libxmp_mixer_queuepatch (mixer.c:909-919).
      if (smp !== v.smp || (v.flags & VoiceFlag.SAMPLE_PAUSED) !== 0) {
        v.queued.smp = smp;
        v.flags |= VoiceFlag.SAMPLE_QUEUED;
      }
      if (insNum >= 0) {
        v.ins = insNum;
      }
      return chn;
    }
    // Original sample stopped — start a new note.
    if (smp < 0) return VIRT_INVALID;
    return this.setPatchSmp(chn, insNum, smp, note);
  }

  /**
   * libxmp_virt_setpatch (virtual.c:484-540) with the loader/player
   * call-shape (chn, ins, smp, note): resolves the instrument by number
   * and the sub-instrument by sample id (sub.sid === smp), then runs the
   * dct/dca check and voice allocation.
   */
  setPatchSmp(chn: number, insNum: number, smp: number, note: number): number {
    if (chn < 0 || chn >= this.virtChannels) return VIRT_INVALID;
    if (insNum < 0) smp = -1;
    const mod = this.moduleRef?.();

    // dct is 0 for every MOD/S3M call site of set_patch — no duplicate
    // check needed (read_event_mod/read_event_st3 pass 0/0).

    let voc = this.map[chn]!.voice;
    if (voc > VIRT_INVALID) {
      if (this.voices[voc]!.act !== Act.NONE) {
        // NNA split path: MOD/ST3 set_patch callers never set nna, and
        // player-side set_patch uses key/act from xc — for the loader-side
        // helpers this branch is unreachable (voice would be act==NOTE
        // with a live map). Fall back to stealing the current voice slot
        // after releasing it (CUT), matching alloc_voice failure-free path
        // for the single-voice-per-channel MOD case.
        const old = voc;
        this.release(old, 0 /* CUT */);
        voc = this.allocVoice();
        if (voc === VIRT_INVALID) {
          // restore mapping semantics: old voice gone, channel free
          return VIRT_INVALID;
        }
        this.map[chn]!.voice = voc;
        void old;
      }
    } else {
      voc = this.allocVoice();
      if (voc === VIRT_INVALID) return VIRT_INVALID;
      this.map[chn]!.voice = voc;
      this.used++;
    }

    if (smp < 0) {
      this.resetVoice(voc, true);
      return chn;
    }

    // libxmp_mixer_setpatch + libxmp_mixer_setnote + ins/act/key assigns.
    this.setPatchVoice(voc, smp, true);
    const v = this.voices[voc]!;
    // mixer_setnote: clamp note > 149 (mixer.c:920-935).
    const clampedNote = note > 149 ? 149 : note;
    v.note = clampedNote;
    v.period = noteToPeriodMix(clampedNote, 0);
    // anticlick(vi) inside mixer_setnote is folded into old_vl/vr reset.
    if (mod) {
      const ins = mod.instruments[insNum];
      v.ins = insNum >= 0 && ins ? insKey(ins) : -1;
    } else {
      v.ins = insNum;
    }
    v.act = Act.NOTE;
    v.key = note;

    return chn;
  }

  /** Module reference hook (Core wires this; avoids a module-data import). */
  private moduleRef: (() => { instruments: Instrument[] } | null) | null = null;

  /** Install the module resolver (Core wires this at construction). */
  setModuleRef(fn: () => { instruments: Instrument[] } | null): void {
    this.moduleRef = fn;
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

