// Virtual channel / voice layer. Mirrors reference/libxmp/src/virtual.c.
//
// A "virtual channel" is a player channel slot the effects run on
import {
  Act,
  NoteFlag,
  SampleFlags,
  VoiceFlag,
  type VoiceState,
  type ChannelState,
  type Instrument,
} from './model/model';

/** PERIOD_BASE (period.h:6) — C0 period for note_to_period_mix. */
const PERIOD_BASE = 13696.0;

/** libxmp_note_to_period_mix (period.c:205-209). */
function noteToPeriodMix(n: number, b: number): number {
  return PERIOD_BASE / Math.pow(2, (n + b / 12800) / 12);
}

/** SMIX_NUMVOC (mixer.h:8) — libxmp's default softmixer voice count. */
const MAXVOICES = 128;

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
    nnaAct: 0,
    note: 0,
    pan: 0x80,
    vol: 0,
    period: 0,
    pos: 0,
    frac: 0,
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


  /** QUIRK_VIRTUAL — module requests NNA overflow channels. */
  extChannels = false;

  /** Allocate/reset for a new module + play session (virt_on, virtual.c:100). */
  on(numTracks: number, quirkVirtual = false): void {
    this.off();
    this.numTracks = numTracks;
    this.extChannels = quirkVirtual;
    // virtual.c:107-114: virt_channels = num_tracks, plus the mixer voice
    // pool as overflow channels when QUIRK_VIRTUAL is set (IT). C uses the
    // mixer's voice count; our pool cap is MAXVOICES (64).
    this.virtChannels = numTracks + (quirkVirtual ? MAXVOICES : 0);
    for (let i = 0; i < this.virtChannels; i++) {
      this.map.push({ voice: VIRT_INVALID, tail: VIRT_INVALID });
    }
    this.used = 0;
    // virtual.c:119-126: C calloc's ALL maxvoc slots upfront so alloc_voice
    // always finds a free slot instead of having to lazily grow the pool.
    for (let i = 0; i < MAXVOICES; i++) {
      this.voices.push(makeVoice(i));
    }
    this.setChannelMute([]);
  }

  /** Free everything (virt_off, virtual.c:170). */
  off(): void {
    this.map = [];
    this.voices.length = 0;
    this.extChannels = false;
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

  private allocVoice(): number {
    if (this.used < MAXVOICES && this.used >= this.voices.length) {
      this.voices.push(makeVoice(this.voices.length));
    }
    // Free slots: reset voices (chn = FREE).
    for (let i = 0; i < this.voices.length; i++) {
      if (this.voices[i]!.chn === VIRT_INVALID) {
        this.used++; /* alloc_voice (virtual.c:225): virt_used++ */
        return i;
      }
    }
    // Garbage-collect dead slots: act cleared but the slot still bound
    // to a channel whose map has moved on (one-shot samples that ran to
    // their end keep chn set in C until reset — but C recycles them via
    // free_voice when the pool runs dry). A slot whose channel's map no
    // longer references it is unreachable and safe to reuse.
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i]!;
      if (v.act === Act.NONE && v.chn >= 0 && v.chn < this.map.length && this.map[v.chn]!.voice !== i) {
        this.resetVoice(i, false);
        this.used++; /* slot recycled: alloc_voice's virt_used++ */
        return i;
      }
    }
    // C free_voice (virtual.c:241-282): no free slot — steal the
    // background voice (chn >= num_tracks) with the lowest volume.
    let steal = -1;
    let stealVol = Number.MAX_VALUE;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i]!;
      if (v.chn >= this.numTracks && v.vol < stealVol) {
        stealVol = v.vol;
        steal = i;
      }
    }
    if (steal >= 0) {
      this.resetVoice(steal, false);
      this.used++; /* slot recycled: alloc_voice's virt_used++ */
      return steal;
    }
    if (this.voices.length < MAXVOICES) {
      const idx = this.voices.length;
      this.voices.push(makeVoice(idx));
      this.used++; /* alloc_voice (virtual.c:225): virt_used++ */
      return idx;
    }
    return VIRT_INVALID;
  }

  /**
   * libxmp_virt_setpatch (virtual.c:484-546): assign instrument+sample+note
   * to a virtual channel. `smp` is the sample number (sub.sid space);
   * `key` is the player note key (virtual.c:541 v.key = key). Duplicate
   * check runs the DCT against the channel's current voice; DCA decides
   * the loser's fate. smp < 0 resets the voice (virtual.c:528-530).
   */
  setPatch(
    chn: number,
    ins: Instrument,
    smp: number,
    note: number,
    key: number,
    nna: number,
    dct: number,
    dca: number,
  ): number {
    if (chn < 0 || chn >= this.virtChannels) return VIRT_INVALID;
    if (ins.nsm === 0) smp = -1; /* C: ins < 0 → smp = -1; invalid ins has no subs */
    const curVoice = this.map[chn]!.voice;
    // check_dct (virtual.c:434-471) — C sweeps ALL voice slots
    // (virt_setpatch :499-506 loops i over maxvoc), matching each voice
    // whose ROOT is this channel and instrument matches; it also catches
    // leaked voices whose map entry was overwritten by a later note.
    // C order matters: check_dct runs only when the new note's
    // instrument has a duplicate-check type (virtual.c:499 'if (dct)'),
    // then per voice: the nna==CUT hard reset, 'vi->act = nna', and the
    // dct-gated DCA adjustments.
    if (dct !== 0 /* XMP_INST_DCT_OFF */) {
      for (let i = 0; i < this.voices.length; i++) {
        const v = this.voices[i]!;
        if (v.root !== chn || v.ins !== insKey(ins)) continue;
        if (nna === 0 /* XMP_INST_NNA_CUT */) {
          this.resetVoice(i, true);
          continue;
        }
        // C: vi->act = nna (virtual.c:511) — the NNA action BECOMES the
        // voice's act. Map NNA codes onto the player-facing Act enum so
        // cstat reports OFF/FADE for background voices and process_volume
        // actually fades them (VIRT_ACTION_OFF/FADE paths).
        v.nnaAct = nna;
        if (nna === 2 /* NNA_OFF */) v.act = Act.KEY;
        else if (nna === 3 /* NNA_FADE */) v.act = Act.VOL;
        let match = false;
        switch (dct) {
          case 3 /* DCT_INST */: match = true; break;
          case 2 /* DCT_SMP  */: match = v.smp === smp; break;
          case 1 /* DCT_NOTE */: match = v.key === key; break;
        }
        if (match) {
          if (nna === 2 /* NNA_OFF */ && dca === 3 /* DCA_FADE */) {
            v.nnaAct = 2; // VIRT_ACTION_OFF
            v.act = Act.KEY;
          } else if (dca !== 0) {
            // C: i != voc || vi->act — the mapped voice has act set by the
            // line above; background voices have i != voc.
            v.nnaAct = dca;
            if (dca === 2 /* DCA_OFF */) v.act = Act.KEY;
            else if (dca === 3 /* DCA_FADE */) v.act = Act.VOL;
            else v.act = Act.NOTE; // DCA_CONT
          } else {
            this.resetVoice(i, true);
          }
          if (dca === 1 /* DCA_CONT */ && i === (this.map[chn]!.voice)) {
            this.map[chn]!.tail = i;
          }
        }
      }
    }
    // C alloc_voice(ctx, chn) (virtual.c:509) — the new voice replaces the
    // channel's map; the OLD active voice (voc) is then re-homed to a free
    // overflow channel and setpatch returns THAT channel (the local `chn`
    // is reassigned by the re-home loop, virtual.c:505-517, 546 return chn).
    const oldVoice = curVoice;
    // C tests the voice's CURRENT act (virtual.c:512): any live voice —
    // NOTE/KEY/VOL — is re-homed, not just one with an NNA queued.
    const oldActive =
      oldVoice !== VIRT_INVALID && this.voices[oldVoice]!.act !== Act.NONE;
    const vidx = this.allocVoice();
    if (vidx === VIRT_INVALID) return VIRT_INVALID;
    this.map[chn]!.voice = vidx;

    let to = chn;
    if (oldVoice !== VIRT_INVALID && oldActive) {
      // Re-home the old voice: first overflow channel with map <= FREE
      // (virtual.c:515-517). C's loop leaves `chn` at virt_channels when no
      // free slot exists, so --chn lands on the LAST channel — port that
      // edge case exactly.
      // C: for (chn = num_tracks; chn < virt_channels &&
      //        virt_channel[chn++].map > FREE;) ; — the slot is TESTED,
      // then chn increments REGARDLESS. On exit chn is one PAST the free
      // slot (or virt_channels when the pool is full), so --chn lands ON
      // the free slot (or the last channel). Port the post-increment.
      let hunt = this.numTracks;
      while (
        hunt < this.virtChannels &&
        this.map[hunt++]!.voice !== VIRT_INVALID
      ) {
      }
      to = hunt - 1;
      const ov = this.voices[oldVoice]!;
      ov.chn = to;
      this.map[to]!.voice = oldVoice;
      // If the re-home landed on a real track, that track's old map entry
      // is the same voice only when to == chn; otherwise the displaced map
      // is dropped, matching C's overwrite.
    }

    if (smp < 0) {
      /* virtual.c:528-530: libxmp_virt_resetvoice(voc, 1) then return chn. */
      this.resetVoice(vidx, true);
      return to;
    }

    const v = this.voices[vidx]!;
    v.chn = chn;
    v.ins = insKey(ins);
    v.smp = smp;
    v.note = note;
    v.key = key;
    // mixer_setpatch tail (mixer.c:878): set_sample_end(ctx, voc, 0) —
    // clear the channel's NOTE_SAMPLE_END on every voice start so a fresh
    // note isn't muted by the previous one-shot's end mark.
    this.channelStatesHook?.(chn, (xc) => {
      xc.note_flags &= ~NoteFlag.SAMPLE_END;
    });
    v.root = chn; /* root is the ROOT CHANNEL (virtual.c:271), not the note */
    // C virtual.c:547: voice_array[voc].act = nna — the voice's act IS its
    // NNA code from allocation. For a root-track voice cstat reports
    // VIRT_ACTIVE regardless, but once the voice is re-homed to an
    // overflow channel (new note on its root), play_channel sees this act:
    // NNA_OFF → VIRT_ACTION_OFF (fadeout), NNA_FADE → VIRT_ACTION_FADE.
    // Map NNA onto our Act enum: CONT→NOTE (cstat default → ACTIVE),
    // OFF→KEY, FADE→VOL.
    v.act = nna === 2 /* NNA_OFF */ ? Act.KEY : nna === 3 /* NNA_FADE */ ? Act.VOL : Act.NOTE;
    v.nnaAct = nna;
    v.flags = 0;
    v.pos = 0;
    v.pos0 = 0;
    v.old_vl = 0;
    v.old_vr = 0;
    return to;
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
    const v = this.voices[vi];
    if (!v) return false;
    // virt_setvol (virtual.c:311-325): a muted ROOT channel is silenced at
    // the mixer input; background voices of a muted root die when they hit 0.
    const root = v.root;
    if (root >= 0 && root < this.channelMute.length && this.channelMute[root]) {
      vol = 0;
    }
    v.vol = vol;
    if (vol === 0 && chn >= this.numTracks) {
      this.resetVoice(vi, true);
    }
    return true;
  }

  /** PlayState.channel_mute, mirrored by Core before startPlayer. */
  channelMute: readonly boolean[] = [];

  /** Install the mute table (Core wires this at startPlayer). */
  setChannelMute(mute: readonly boolean[]): void {
    this.channelMute = mute;
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

    v.pos = pos; // mixer_voicepos double pos (mixer.c:821)
    v.frac = pos - Math.trunc(pos); // round-trip only; mixer re-derives
    v.pos0 = Math.trunc(pos);
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
  resetVoice(vi: number, mute: boolean): void {
    if (vi < 0 || vi >= this.voices.length) return;
    const v = this.voices[vi]!;
    // virt_resetvoice (:79-97): virt_used-- on EVERY reset; `mute` only
    // ramps the volume first. Gating the decrement on `mute` leaked the
    // pool counter, which then steered allocVoice differently from C.
    this.used--;
    if (mute) {
      v.vol = 0;
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
    // set_sample_end(ctx, voc, 0) (mixer.c:878): every voice start clears
    // the channel's NOTE_SAMPLE_END so process_volume reports/mixes it.
    this.channelStatesHook?.(v.chn, (xc) => {
      xc.note_flags &= ~NoteFlag.SAMPLE_END;
    });
  }

  /**
   * Channel-state hook installed by Core (avoids an import cycle). Used by
   * setPatchVoice to mirror mixer.c:878 set_sample_end(ctx, voc, 0).
   * Returns false when the channel index is out of range.
   */
  private channelStatesHook:
    | ((chn: number, fn: (xc: ChannelState) => void) => boolean)
    | null = null;

  setChannelStatesHook(
    fn: (chn: number, apply: (xc: ChannelState) => void) => boolean,
  ): void {
    this.channelStatesHook = fn;
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

    // C setpatch flow (virtual.c:500-546): the channel's CURRENT voice
    // slot is reused in place — a fresh allocation happens only when the
    // channel had no voice (map empty). The old note is simply
    // overwritten (MOD NNA = CUT), so the pool never exhausts.
    let voc = this.map[chn]!.voice;
    if (voc <= VIRT_INVALID) {
      voc = this.allocVoice();
      if (voc === VIRT_INVALID) return VIRT_INVALID;
      this.map[chn]!.voice = voc;
    }

    if (smp < 0) {
      this.resetVoice(voc, true);
      return chn;
    }

    // C virt_setpatch (virtual.c:531): vi->chn = chn — the voice is bound
    // to its virtual channel BEFORE mixer_setpatch runs (alloc_voice set
    // voice_array[i].chn inside alloc_voice). The binding must precede
    // setPatchVoice: its set_sample_end(0) hook clears the channel's
    // NOTE_SAMPLE_END via v.chn — with a stale chn the fresh note would
    // inherit the previous one-shot's SAMPLE_END mute.
    const v = this.voices[voc]!;
    v.chn = chn;
    v.root = chn;
    this.setPatchVoice(voc, smp, true);
    // mixer_setnote: clamp note > 149 (mixer.c:920-935).
    const clampedNote = note > 149 ? 149 : note;
    v.note = clampedNote;
    v.period = noteToPeriodMix(clampedNote, 0);
    if (mod) {
      const ins = mod.instruments[insNum];
      v.ins = insNum >= 0 && ins ? insKey(ins) : -1;
    }
    v.nnaAct = 0; // queuePatch keeps/starts a plain CUT-action voice
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
        // C: VIRT_ACTION_CUT → libxmp_virt_resetvoice(ctx, voc, 1) — the
        // slot becomes fully reusable (chn = FREE) and virt_used drops.
        // Wiping the fields inline skipped the reset, leaking pool slots.
        this.resetVoice(vi, true);
        return;
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

