// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// MIDI parser + reference-math regression tests (packages/fmt-mid).
//
// The sysex framing case is a real bug that bit the corpus once: the C
// `p->buf += tml_readvariablelength(p);` reloads p->buf AFTER the call
// (which already advanced past the length bytes), while a single JS
// `p.buf += tml_readvariablelength(...)` snapshots p.buf BEFORE the call
// and skips the sysex payload one byte short. Every following variable
// length delta then swallowed the leftover 0xF7 as a continuation byte.
//
// Vectors are hand-framed MIDI byte streams checked against the C tml.h
// algorithm (tools/midref.c oracle).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { tml_load_memory, tml_get_info, tml_get_tempo_value, TML_NOTE_ON, TML_SET_TEMPO } from '../packages/fmt-mid/src/tml.ts';
import { rm_exp, rm_log, rm_pow, rm_log10, rm_tan } from '../packages/fmt-mid/src/refmath.ts';

function smf(trackBytes: number[]): Uint8Array {
  const track = Uint8Array.from(trackBytes);
  const out = new Uint8Array(14 + 8 + track.length);
  out.set([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0xc0]); // MThd, 1 track, div 192
  out.set([0x4d, 0x54, 0x72, 0x6b], 14); // MTrk
  out[18] = (track.length >>> 24) & 0xff;
  out[19] = (track.length >>> 16) & 0xff;
  out[20] = (track.length >>> 8) & 0xff;
  out[21] = track.length & 0xff;
  out.set(track, 22);
  return out;
}

const hex = (s: string): number[] =>
  s
    .split(/\s+/)
    .filter((x) => x.length)
    .map((x) => parseInt(x, 16));

test('sysex payload is skipped exactly (0xF7 inside payload framing)', () => {
  // tempo @0, sysex @delta 1 (payload ends in F7), note-on @delta 23, EOT.
  // The C oracle parses deltas 0/1/23 → times 0/2/46 ms at div 192 after
  // the 375000 us/quarter tempo (ticks2time = 1.953125 ms/tick).
  const mid = smf(
    hex('00 ff 51 03 05 b8 d8') // SET_TEMPO 375000
        .concat(hex('01 f0 05 7e 7f 09 01 f7')) // sysex, len 5 (payload ends with F7)
        .concat(hex('17 90 3c 40')) // NOTE_ON delta 23
        .concat(hex('00 ff 2f 00')), // EOT
  );
  const msgs = tml_load_memory(mid);
  assert.ok(msgs);
  const list: { time: number; type: number }[] = [];
  for (let m = msgs; m; m = m.next) list.push({ time: m.time, type: m.type });
  assert.deepEqual(list, [
    { time: 0, type: TML_SET_TEMPO },
    { time: 46, type: TML_NOTE_ON },
  ]);
  assert.equal(tml_get_tempo_value(msgs), 375000);
});

test('message with zero delta and no type is not stored', () => {
  // text meta @0 (dropped), tempo @0 (stored), note @delta 2
  const mid = smf(
    hex('00 ff 01 08 43 4c 55 42 42 49 5a 41')
      .concat(hex('00 ff 51 03 05 b8 d8'))
      .concat(hex('02 90 3c 40'))
      .concat(hex('00 ff 2f 00')),
  );
  const msgs = tml_load_memory(mid);
  assert.ok(msgs);
  assert.equal(msgs.type, TML_SET_TEMPO);
  assert.equal(msgs.next?.type, TML_NOTE_ON);
  assert.equal(msgs.next?.time, 3); // (int)(2 ticks * 1.953125 ms) = 3
});

test('tml_get_info fills all outputs', () => {
  const mid = smf(
    hex('00 ff 51 03 05 b8 d8')
      .concat(hex('00 90 3c 40'))
      .concat(hex('00 c0 05'))
      .concat(hex('00 80 3c 00'))
      .concat(hex('00 ff 2f 00')),
  );
  const msgs = tml_load_memory(mid);
  assert.ok(msgs);
  const info: Record<string, number> = {};
  const notes = tml_get_info(msgs, info as never);
  assert.equal(notes, 1);
  assert.equal(info.used_channels, 1);
  assert.equal(info.used_programs, 1);
  assert.equal(info.time_length, 0);
});

test('reference math matches closed-form values', () => {
  assert.equal(rm_pow(2, 3), 8);
  assert.equal(rm_pow(10, 1), 10);
  assert.equal(rm_pow(5, 0), 1);
  assert.equal(rm_exp(0), 1);
  // log(1) is a dd-cancellation residue — pinned to the C oracle's exact
  // result (tools/refmath.h returns the same bits; parity is between the
  // two implementations, and it is exact).
  assert.equal(rm_log(1), 3.0814879110195774e-33);
  assert.ok(Math.abs(rm_exp(rm_log(2)) - 2) < 1e-15);
  assert.equal(rm_exp(rm_log(2)), 2);
  assert.equal(rm_pow(10, rm_log10(7)), 7);
  assert.ok(Math.abs(rm_tan(Math.PI / 4) - 1) < 1e-15);
});
