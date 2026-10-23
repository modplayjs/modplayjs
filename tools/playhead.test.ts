// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// @modplayjs/playhead regression tests (packages/playhead/src/playhead.ts).
//
// The pattern-view sync bug these pin down: a UI that reads the player's
// live `playState` shows a row that is still sitting in the output ring
// (~0.7 s at the SAB high-water mark), i.e. several rows early on a fast
// song. The playhead answers from the frame the SINK has consumed.
//
//   node --test tools/playhead.test.ts

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Playhead, type PlaybackPosition } from '../packages/playhead/src/playhead.ts';

const RATE = 48000;
/** ticksize at BPM 125 (core: (int)(rate × 2.5 / bpm)), row = speed ticks. */
const TICK = Math.trunc((RATE * 2.5) / 125); // 960
const SPEED = 6;
const ROW = TICK * SPEED; // 5760 frames = 120 ms
/** Milestone positions every `rowsPerPull` rows: the state at the END of
 *  a pull, i.e. the last tick of the last row it rendered. */
function pos(ord: number, row: number, timeMs: number): PlaybackPosition {
  return { ord, row, frame: SPEED - 1, speed: SPEED, bpm: 125, timeMs };
}

/** Row sounding once `f` frames have played: the newest played frame is
 *  `f − 1`, i.e. the first row whose end frame is `>= f`. */
function truthRow(f: number): number {
  if (f <= 0) return 0;
  return Math.ceil(f / ROW) - 1;
}

/** Marks for a song whose rows advance every ROW frames, `rowsPerPull`
 *  rows per pull (out-webaudio pulls one playBuffer chunk per 25 ms tick).
 *  A mark records the state at the END of its pull: after `k` pulls the
 *  last completed row is `k·rowsPerPull − 1`. */
function song(rows: number, rowsPerPull = 2): Playhead {
  const ph = new Playhead({ rate: RATE });
  for (let k = 1; k * rowsPerPull <= rows; k++) {
    const row = k * rowsPerPull - 1;
    const frames = (row + 1) * ROW;
    ph.mark(frames, pos(0, row, (frames * 1000) / RATE), (frames * 1000) / RATE);
  }
  return ph;
}

test('follows the sink, not the render head', () => {
  const ph = song(10);
  // 10 rows rendered; the sink is 2.5 rows behind → row 7 is sounding.
  const rendered = ROW * 10;
  const consumed = rendered - ROW * 2.5;
  ph.setConsumedProvider(() => consumed);
  const ap = ph.positionAt(0);
  assert.ok(ap, 'position expected');
  assert.equal(ap.row, truthRow(consumed));
  assert.equal(ap.row, 7);
  assert.equal(ap.queuedFrames, ROW * 2.5);
});

test('the naive reading (render position) would be 2 rows early', () => {
  const ph = song(10);
  const rendered = ROW * 10;
  const consumed = rendered - ROW * 2.5;
  ph.setConsumedProvider(() => consumed);
  const ap = ph.positionAt(0);
  assert.ok(ap);
  // What `core.playState` would have said at that instant.
  assert.equal(ph.markCount, 5);
  assert.equal(ap.row, 7);
  assert.ok(10 - ap.row === 3 || 10 - ap.row === 2, 'render head is ahead');
});

test('resolves rows inside one pull (no whole-pull granularity)', () => {
  const ph = song(10);
  // Halfway through row 3 — inside the pull that ends at 4·ROW.
  ph.setConsumedProvider(() => ROW * 3.5);
  const a = ph.positionAt(0);
  assert.ok(a);
  assert.equal(a.row, 3);
  assert.ok(a.rowProgress > 0.45 && a.rowProgress < 0.55, `progress ${a.rowProgress}`);

  // One frame before the row-4 boundary: still row 3, row finished.
  ph.setConsumedProvider(() => ROW * 4 - 1);
  const b = ph.positionAt(0);
  assert.ok(b);
  assert.equal(b.row, 3);
  assert.ok(b.rowProgress > 0.999, `progress ${b.rowProgress}`);
});

test('an explicit latency offset shifts the view later', () => {
  const ph = song(10);
  ph.setConsumedProvider(() => ROW * 10);
  const exact = ph.positionAt(0);
  assert.ok(exact);
  assert.equal(exact.row, 9); // the last rendered row, fully played

  // 2 rows of extra sink buffering the provider cannot see.
  ph.setLatencyMs((ROW * 2 * 1000) / RATE);
  const shifted = ph.positionAt(0);
  assert.ok(shifted);
  assert.equal(shifted.row, 7);
});

test('clamps before the first pull and after the last one', () => {
  const ph = song(10); // first mark 2·ROW, last 10·ROW
  ph.setConsumedProvider(() => -1000);
  const start = ph.positionAt(0);
  assert.ok(start);
  assert.equal(start.row, 1); // first mark's position

  ph.setConsumedProvider(() => 1e9);
  const end = ph.positionAt(0);
  assert.ok(end);
  assert.equal(end.row, 9);
});

test('pause keeps the view frozen (provider stops advancing)', () => {
  const ph = song(10);
  const consumed = ROW * 4;
  ph.setConsumedProvider(() => consumed);
  const before = ph.positionAt(1000);
  assert.ok(before);
  // The sink drains nothing while suspended; the clock advances.
  const after = ph.positionAt(5000);
  assert.ok(after);
  assert.equal(after.row, before.row);
  assert.equal(after.timeMs, before.timeMs);
});

test('a restarting counter starts a new epoch', () => {
  const ph = song(4); // marks at 2·ROW, 4·ROW
  ph.mark(ROW * 2, pos(0, 9, 9999)); // counter went backwards (new start())
  assert.equal(ph.markCount, 1);
  ph.setConsumedProvider(() => ROW * 2);
  const ap = ph.positionAt(0);
  assert.ok(ap);
  assert.equal(ap.row, 9);
});

test('fallback mode without a provider decays from the newest mark', () => {
  const ph = song(10);
  const lastAt = (ROW * 10 * 1000) / RATE; // 1200 ms
  const ap0 = ph.positionAt(lastAt);
  assert.ok(ap0);
  assert.equal(ap0.row, 9);
  // 1.5 row times later the estimate is 1.5 rows further back.
  const ap1 = ph.positionAt(lastAt + (ROW * 1.5 * 1000) / RATE);
  assert.ok(ap1);
  assert.equal(ap1.row, 8);
});

test('history is trimmed but keeps a usable window', () => {
  const ph = new Playhead({ rate: RATE, historyMs: 500 });
  for (let i = 1; i <= 200; i++) ph.mark(i * ROW, pos(0, i, i), i * 10);
  assert.ok(ph.markCount > 2, 'kept a tail');
  assert.ok(ph.markCount < 60, `trimmed (${ph.markCount})`);
});
