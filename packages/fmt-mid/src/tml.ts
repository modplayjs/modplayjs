// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: TinySoundFont tml.h (TinyMidiLoader v0.7).
// SMF parser. Verbatim port of reference/tinysoundfont/tml.h
// (tml_readbyte :265, tml_readvariablelength :270, tml_parsemessage :284,
// tml_load_memory :229, tml_load :384, tml_get_info :491,
// tml_get_tempo_value :514). Deviations are mechanical only:
//   - The realloc'd message array is a plain TS array (see tml_load).
//   - The tml_message union (key/control/program/channel_pressure share
//     one byte; velocity/key_pressure/control_value share the next) is
//     modelled as separate fields; parse writes evt->key for all of them
//     exactly as the C union write does, and evt->pitch_bend overwrites
//     the pair like the unsigned-short union member.
//   - The tml_tempomsg overlay is a real `tempo` field on the message.
//
// zlib-licensed TinyMidiLoader by Bernhard Schelling (2017-2018-2020) —
// see NOTICE.md. https://github.com/schellingb/TinySoundFont

// Channel message type (tml.h TMLMessageType)
export const TML_NOTE_OFF = 0x80;
export const TML_NOTE_ON = 0x90;
export const TML_KEY_PRESSURE = 0xa0;
export const TML_CONTROL_CHANGE = 0xb0;
export const TML_PROGRAM_CHANGE = 0xc0;
export const TML_CHANNEL_PRESSURE = 0xd0;
export const TML_PITCH_BEND = 0xe0;
export const TML_SET_TEMPO = 0x51;

// Midi controller numbers (tml.h TMLController) — kept verbatim; the
// playback dispatch passes values through to tsf_channel_midi_control.
export const TML_BANK_SELECT_MSB = 0;
export const TML_MODULATIONWHEEL_MSB = 1;
export const TML_BREATH_MSB = 2;
export const TML_FOOT_MSB = 4;
export const TML_PORTAMENTO_TIME_MSB = 5;
export const TML_DATA_ENTRY_MSB = 6;
export const TML_VOLUME_MSB = 7;
export const TML_BALANCE_MSB = 8;
export const TML_PAN_MSB = 10;
export const TML_EXPRESSION_MSB = 11;
export const TML_EFFECTS1_MSB = 12;
export const TML_EFFECTS2_MSB = 13;
export const TML_GPC1_MSB = 16;
export const TML_GPC2_MSB = 17;
export const TML_GPC3_MSB = 18;
export const TML_GPC4_MSB = 19;
export const TML_BANK_SELECT_LSB = 32;
export const TML_MODULATIONWHEEL_LSB = 33;
export const TML_BREATH_LSB = 34;
export const TML_FOOT_LSB = 36;
export const TML_PORTAMENTO_TIME_LSB = 37;
export const TML_DATA_ENTRY_LSB = 38;
export const TML_VOLUME_LSB = 39;
export const TML_BALANCE_LSB = 40;
export const TML_PAN_LSB = 42;
export const TML_EXPRESSION_LSB = 43;
export const TML_EFFECTS1_LSB = 44;
export const TML_EFFECTS2_LSB = 45;
export const TML_GPC1_LSB = 48;
export const TML_GPC2_LSB = 49;
export const TML_GPC3_LSB = 50;
export const TML_GPC4_LSB = 51;
export const TML_SUSTAIN_SWITCH = 64;
export const TML_PORTAMENTO_SWITCH = 65;
export const TML_SOSTENUTO_SWITCH = 66;
export const TML_SOFT_PEDAL_SWITCH = 67;
export const TML_LEGATO_SWITCH = 68;
export const TML_HOLD2_SWITCH = 69;
export const TML_SOUND_CTRL1 = 70;
export const TML_SOUND_CTRL2 = 71;
export const TML_SOUND_CTRL3 = 72;
export const TML_SOUND_CTRL4 = 73;
export const TML_SOUND_CTRL5 = 74;
export const TML_SOUND_CTRL6 = 75;
export const TML_SOUND_CTRL7 = 76;
export const TML_SOUND_CTRL8 = 77;
export const TML_SOUND_CTRL9 = 78;
export const TML_SOUND_CTRL10 = 79;
export const TML_GPC5 = 80;
export const TML_GPC6 = 81;
export const TML_GPC7 = 82;
export const TML_GPC8 = 83;
export const TML_PORTAMENTO_CTRL = 84;
export const TML_FX_REVERB = 91;
export const TML_FX_TREMOLO = 92;
export const TML_FX_CHORUS = 93;
export const TML_FX_CELESTE_DETUNE = 94;
export const TML_FX_PHASER = 95;
export const TML_DATA_ENTRY_INCR = 96;
export const TML_DATA_ENTRY_DECR = 97;
export const TML_NRPN_LSB = 98;
export const TML_NRPN_MSB = 99;
export const TML_RPN_LSB = 100;
export const TML_RPN_MSB = 101;
export const TML_ALL_SOUND_OFF = 120;
export const TML_ALL_CTRL_OFF = 121;
export const TML_LOCAL_CONTROL = 122;
export const TML_ALL_NOTES_OFF = 123;
export const TML_OMNI_OFF = 124;
export const TML_OMNI_ON = 125;
export const TML_POLY_OFF = 126;
export const TML_POLY_ON = 127;

// System/meta types (tml.h TMLSystemType) — only EOT/SET_TEMPO are stored.
const TML_EOT = 0x2f;
const TML_SYSEX = 0xf0;
const TML_EOX = 0xf7;

/**
 * A single MIDI message linked to the next message in time (tml.h
 * tml_message). `time` is the time of the message in milliseconds.
 * The C union is flattened: `key` holds the first parameter byte (key /
 * control / program / channel_pressure) and `velocity` the second
 * (velocity / key_pressure / control_value); `pitch_bend` occupies the
 * same two bytes as a little-endian unsigned short in C and is kept as
 * its own field here (set from `key` exactly like the C code).
 */
export class TmlMessage {
  /** Time of the message in milliseconds. */
  time = 0;
  /** Type (see TMLMessageType) and channel number. */
  type = 0;
  channel = 0;
  /** key / control / program / channel_pressure (C union first byte). */
  key = 0;
  /** velocity / key_pressure / control_value (C union second byte). */
  velocity = 0;
  /** TML_PITCH_BEND value 0..16383 (C unsigned-short union member). */
  pitch_bend = 0;
  /** TML_SET_TEMPO only: raw 3-byte tempo (tml_tempomsg overlay). */
  tempo: [number, number, number] = [0, 0, 0];
  /** The pointer to the next message in time following this event. */
  next: TmlMessage | null = null;
}

class TmlParser {
  buf = 0;
  buf_end = 0;
  last_status = 0;
  message_array_size = 0;
  message_count = 0;
}

interface TmlTrack {
  Idx: number;
  End: number;
  Ticks: number;
}

/** tml.h:265 tml_readbyte */
function tml_readbyte(p: TmlParser, mem: Uint8Array): number {
  return p.buf === p.buf_end ? -1 : mem[p.buf++]!;
}

/** tml.h:270 tml_readvariablelength */
function tml_readvariablelength(p: TmlParser, mem: Uint8Array): number {
  let res = 0,
    i = 0;
  for (; i !== 4; i++) {
    if (p.buf === p.buf_end) return -1; // TML_WARN("Unexpected end of file")
    const c = mem[p.buf++]!;
    if (c & 0x80) res = (res | (c & 0x7f)) << 7;
    else return res | c;
  }
  return -1; // TML_WARN("Invalid variable length byte count")
}

/**
 * tml.h:284 tml_parsemessage. `messages` is the realloc'd array
 * (TML_REALLOC(*f, ...) in C): entries are appended like the C slots and
 * the caller keeps the array as the message store. Returns the message
 * type, TML_EOT for end-of-track, or -1 on error.
 */
function tml_parsemessage(
  messages: TmlMessage[],
  p: TmlParser,
  mem: Uint8Array,
): number {
  let deltatime = tml_readvariablelength(p, mem);
  let status = tml_readbyte(p, mem);
  let evt: TmlMessage;

  if (deltatime & 0xfff00000) deltatime = 0; //throw away delays that are insanely high for malformatted midis
  if (status < 0) return -1;
  if ((status & 0x80) === 0) {
    // Invalid, use same status as before
    if ((p.last_status & 0x80) === 0) return -1;
    p.buf--;
    status = p.last_status;
  } else p.last_status = status;

  if (p.message_array_size === p.message_count) {
    //start allocated memory size of message array at 64, double each time until 8192, then add 1024 entries until done
    p.message_array_size +=
      p.message_array_size === 0 ? 64 : p.message_array_size > 4096 ? 1024 : p.message_array_size;
    // TML_REALLOC(*f, p->message_array_size * sizeof(tml_message)) — the TS
    // array grows on commit below; only message_count slots are ever live.
    if (p.message_array_size < p.message_count + 1) return -1; // Out of memory
  }
  evt = new TmlMessage();

  //check what message we have
  if (status === TML_SYSEX || status === TML_EOX) {
    //sysex messages are not handled
    // C: `p->buf += tml_readvariablelength(p);` — the += reloads p->buf AFTER
    // the call (which already advanced past the length bytes). A single JS
    // `p.buf += tml_readvariablelength(...)` would snapshot p.buf BEFORE the
    // call and skip one byte short, so split the statements.
    const sysexlen = tml_readvariablelength(p, mem);
    p.buf += sysexlen;
    if (p.buf > p.buf_end) {
      p.buf = p.buf_end;
      return -1;
    }
    evt.type = 0;
  } else if (status === 0xff) {
    //meta events
    const meta_type = tml_readbyte(p, mem);
    const buflen = tml_readvariablelength(p, mem);
    const metadata = p.buf;
    if (meta_type < 0) return -1;
    if (buflen > 0 && (p.buf += buflen) > p.buf_end) {
      p.buf = p.buf_end;
      return -1;
    }

    switch (meta_type) {
      case TML_EOT:
        if (buflen !== 0) return -1; // TML_WARN("Invalid length for EndOfTrack event")
        if (!deltatime) return TML_EOT; //no need to store this message
        evt.type = TML_EOT;
        break;

      case TML_SET_TEMPO:
        if (buflen !== 3) return -1; // TML_WARN("Invalid length for SetTempo meta event")
        evt.type = TML_SET_TEMPO;
        evt.tempo[0] = mem[metadata]!;
        evt.tempo[1] = mem[metadata + 1]!;
        evt.tempo[2] = mem[metadata + 2]!;
        break;

      default:
        evt.type = 0;
    }
  } else {
    //channel message
    const param = tml_readbyte(p, mem);
    if (param < 0) return -1;
    evt.key = param & 0x7f;
    evt.channel = status & 0x0f;
    switch ((evt.type = status & 0xf0)) {
      case TML_NOTE_OFF:
      case TML_NOTE_ON:
      case TML_KEY_PRESSURE:
      case TML_CONTROL_CHANGE: {
        const param2 = tml_readbyte(p, mem);
        if (param2 < 0) return -1;
        evt.velocity = param2 & 0x7f;
        break;
      }

      case TML_PITCH_BEND: {
        const param2 = tml_readbyte(p, mem);
        if (param2 < 0) return -1;
        evt.pitch_bend = ((param2 & 0x7f) << 7) | evt.key;
        break;
      }

      case TML_PROGRAM_CHANGE:
      case TML_CHANNEL_PRESSURE:
        evt.velocity = 0;
        break;

      default: //ignore system/manufacture messages
        evt.type = 0;
        break;
    }
  }

  if (deltatime || evt.type) {
    evt.time = deltatime;
    messages[p.message_count] = evt;
    p.message_count++;
  }
  return evt.type;
}

/**
 * tml.h:384 tml_load. Parses a MIDI stream and returns the linked message
 * list, or null on error. The C code builds a realloc'd array and then
 * links it in place (including the Swap trick that moves the first live
 * message to slot 0 so the returned pointer is the list head); the TS port
 * keeps the same array + index algorithm, swapping array references where
 * the C swaps struct contents.
 */
export function tml_load_stream(
  read: (ptr: Uint8Array, size: number) => number,
): TmlMessage | null {
  let num_tracks: number,
    division: number,
    trackbufsize = 0;
  let trackbuf: Uint8Array | null = null;
  const messages: TmlMessage[] = [];
  const p = new TmlParser();

  // Parse MIDI header
  const midi_header = new Uint8Array(14);
  if (read(midi_header, 14) !== 14) return messages.length ? messages[0]! : null;
  if (
    midi_header[0] !== 0x4d /* M */ ||
    midi_header[1] !== 0x54 /* T */ ||
    midi_header[2] !== 0x68 /* h */ ||
    midi_header[3] !== 0x64 /* d */ ||
    midi_header[7] !== 6 ||
    midi_header[9]! > 2
  ) {
    return messages.length ? messages[0]! : null; // TML_ERROR("Doesn't look like a MIDI file: invalid MThd header")
  }
  if (midi_header[12]! & 0x80) return messages.length ? messages[0]! : null; // TML_ERROR("File uses unsupported SMPTE timing")
  num_tracks = (midi_header[10]! << 8) | midi_header[11]!;
  division = (midi_header[12]! << 8) | midi_header[13]!; //division is ticks per beat (quarter-note)
  if (num_tracks <= 0 && division <= 0) return messages.length ? messages[0]! : null;

  // Allocate temporary tracks array for parsing
  const tracks: TmlTrack[] = [];
  for (let i = 0; i !== num_tracks; i++) tracks.push({ Idx: 0, End: 0, Ticks: 0 });
  const tracksEnd = num_tracks;

  // Read all messages for all tracks
  for (let ti = 0; ti !== tracksEnd; ti++) {
    const t = tracks[ti]!;
    const track_header = new Uint8Array(8);
    if (read(track_header, 8) !== 8) break; // TML_WARN("Unexpected end of file")
    if (
      track_header[0] !== 0x4d /* M */ ||
      track_header[1] !== 0x54 /* T */ ||
      track_header[2] !== 0x72 /* r */ ||
      track_header[3] !== 0x6b /* k */
    )
      break; // TML_WARN("Invalid MTrk header")

    // Get size of track data and read into buffer (allocate bigger buffer if needed)
    const track_length =
      track_header[7]! | (track_header[6]! << 8) | (track_header[5]! << 16) | (track_header[4]! << 24);
    if (track_length < 0) break; // TML_WARN("Invalid MTrk header")
    if (trackbufsize < track_length) {
      trackbuf = new Uint8Array((trackbufsize = track_length));
    }
    if (read(trackbuf!, track_length) !== track_length) break; // TML_WARN("Unexpected end of file")

    t.Idx = p.message_count;
    p.buf = 0;
    p.buf_end = track_length;
    for (; p.buf !== p.buf_end; ) {
      const type = tml_parsemessage(messages, p, trackbuf!);
      if (type === TML_EOT || type < 0) break; //file end or illegal data encountered
    }
    t.End = p.message_count;
  }

  // Change message time signature from delta ticks to actual msec values and link messages ordered by time
  if (p.message_count) {
    let PrevMessage: TmlMessage | null = null;
    let ticks = 0,
      tempo_ticks = 0; //tick counter and value at last tempo change
    let msec = 0,
      tempo_msec = 0; //msec value at last tempo change
    let ticks2time = 500000 / (1000.0 * division); //milliseconds per tick

    // Loop through all messages over all tracks ordered by time
    for (let step_smallest = 0; step_smallest !== 0x7fffffff; ticks += step_smallest) {
      step_smallest = 0x7fffffff;
      msec = tempo_msec + Math.trunc((ticks - tempo_ticks) * ticks2time);
      for (let ti = 0; ti !== tracksEnd; ti++) {
        const t = tracks[ti]!;
        if (t.Idx === t.End) continue;
        let j = t.Idx;
        const jEnd = t.End;
        for (; j !== jEnd && t.Ticks + messages[j]!.time === ticks; j++, t.Idx++) {
          const Msg = messages[j]!;
          t.Ticks += Msg.time;
          if (Msg.type === TML_SET_TEMPO) {
            const Tempo = Msg.tempo;
            ticks2time = ((Tempo[0]! << 16) | (Tempo[1]! << 8) | Tempo[2]!) / (1000.0 * division);
            tempo_msec = msec;
            tempo_ticks = ticks;
          }
          if (Msg.type) {
            Msg.time = msec;
            if (PrevMessage) {
              PrevMessage.next = Msg;
              PrevMessage = Msg;
            } else {
              // Swap = *Msg; *Msg = *messages; *messages = Swap; the first
              // live message moves to slot 0 (the returned list head).
              const Swap = messages[j]!;
              messages[j] = messages[0]!;
              messages[0] = Swap;
              PrevMessage = messages[0]!;
            }
          }
        }
        if (j !== jEnd && t.Ticks + messages[j]!.time > ticks) {
          const step = Math.trunc(t.Ticks + messages[j]!.time - ticks);
          if (step < step_smallest) step_smallest = step;
        }
      }
    }
    if (PrevMessage) PrevMessage.next = null;
    else p.message_count = 0;
  }

  if (p.message_count === 0) return null;

  return messages[0]!;
}

/** tml.h:229 tml_load_memory — load a MIDI file from a block of memory. */
export function tml_load_memory(buffer: Uint8Array): TmlMessage | null {
  const total = buffer.length;
  let pos = 0;
  return tml_load_stream((ptr, size) => {
    if (size > total - pos) size = total - pos;
    ptr.set(buffer.subarray(pos, pos + size));
    pos += size;
    return size;
  });
}

/**
 * tml.h:491 tml_get_info — get infos about this loaded MIDI file, returns
 * the note count. Any output may be omitted.
 */
export function tml_get_info(
  Msg: TmlMessage | null,
  out?:
    | {
        used_channels?: number;
        used_programs?: number;
        total_notes?: number;
        time_first_note?: number;
        time_length?: number;
      }
    | undefined,
): number {
  let used_programs = 0,
    used_channels = 0,
    total_notes = 0;
  let time_first_note = 0xffffffff,
    time_length = 0;
  const channels = new Uint8Array(16);
  const programs = new Uint8Array(128);
  for (; Msg; Msg = Msg.next) {
    time_length = Msg.time;
    if (Msg.type === TML_PROGRAM_CHANGE && !programs[Msg.key]) {
      programs[Msg.key] = 1;
      used_programs++;
    }
    if (Msg.type !== TML_NOTE_ON) continue;
    if (time_first_note === 0xffffffff) time_first_note = time_length;
    if (!channels[Msg.channel]) {
      channels[Msg.channel] = 1;
      used_channels++;
    }
    total_notes++;
  }
  if (time_first_note === 0xffffffff) time_first_note = 0;
  if (out) {
    out.used_channels = used_channels;
    out.used_programs = used_programs;
    out.total_notes = total_notes;
    out.time_first_note = time_first_note;
    out.time_length = time_length;
  }
  return total_notes;
}

/**
 * tml.h:514 tml_get_tempo_value — read the tempo (microseconds per quarter
 * note) value from a message with the type TML_SET_TEMPO.
 */
export function tml_get_tempo_value(msg: TmlMessage | null): number {
  if (!msg || msg.type !== TML_SET_TEMPO) return 0;
  const Tempo = msg.tempo;
  return (Tempo[0]! << 16) | (Tempo[1]! << 8) | Tempo[2]!;
}
