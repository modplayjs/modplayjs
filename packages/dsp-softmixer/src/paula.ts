// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/paula.h (struct paula_state) and
// src/mix_paula.c (libxmp_paula_init / output_sample / input_sample /
// do_clock / PAULA_SIMULATION loop) — Antti S. Lankila's Paula simulator,
// modified for libxmp by Claudio Matsuoka.
//
// Band-limited step (BLEP) synthesizer for the Amiga PAULA output: the
// source sample is stepped at Paula-clock granularity (nearest, no
// interpolation) and every output value switches instantly between two
// 8-bit levels; the BLEP integral table removes the resulting aliasing by
// rendering each step's ringing.

import {
  WINSINC_A500_OFF,
  WINSINC_A500_ON,
} from './blep-tables.js';

/** paula.h:7 — PAL colorburst rate used as the Paula audio clock. */
export const PAULA_HZ = 3546895;
/** paula.h:8 — fastest event interval a real Paula process can generate. */
export const MINIMUM_INTERVAL = 16;
/** paula.h:9 — BLEP integral fixed-point scale. */
export const BLEP_SCALE = 17;
/** paula.h:10 — BLEP table length. */
export const BLEP_SIZE = 2048;
/** paula.h:11 — MAX_BLEPS = BLEP_SIZE / MINIMUM_INTERVAL. */
export const MAX_BLEPS = BLEP_SIZE / MINIMUM_INTERVAL;

/** struct blep_state (paula.h:14-17). */
interface BlepState {
  age: number;
  level: number;
}

/** Which BLEP integral table voices mix with (mix_paula.c tabnum). */
export const BLEP_TABLE = {
  A500: 0,
  A500_LED: 1,
} as const;
export type BlepTable = (typeof BLEP_TABLE)[keyof typeof BLEP_TABLE];

/** struct paula_state (paula.h:19-34). */
export class PaulaState {
  /** the instantaneous value of Paula output */
  globalOutputLevel = 0;
  /** count of simultaneous bleps to keep track of */
  activeBleps = 0;
  blepstate: BlepState[] = [];
  remainder = 0;
  fdiv = 0;

  /** libxmp_paula_init (mix_paula.c:30-35). */
  init(freq: number): void {
    this.globalOutputLevel = 0;
    this.activeBleps = 0;
    this.fdiv = PAULA_HZ / freq;
    this.remainder = this.fdiv;
    this.blepstate = Array.from({ length: MAX_BLEPS }, () => ({ age: 0, level: 0 }));
    this.activeBleps = 0;
  }

  /** output_sample (mix_paula.c:38-56) — return output simulated as
   *  series of bleps. tabnum: 0 = A500, 1 = A500 LED filter. */
  outputSample(tabnum: number): number {
    const table = tabnum === 1 ? WINSINC_A500_ON : WINSINC_A500_OFF;
    let output = (this.globalOutputLevel << BLEP_SCALE) | 0;
    for (let i = 0; i < this.activeBleps; i++) {
      const st = this.blepstate[i]!;
      output -= table[st.age]! * st.level;
    }
    output >>= BLEP_SCALE;
    if (output < -32768) output = -32768;
    else if (output > 32767) output = 32767;
    return output;
  }

  /** input_sample (mix_paula.c:58-75). */
  inputSample(sample: number): void {
    if (sample !== this.globalOutputLevel) {
      // Start a new blep: level is the difference, age (or phase) is 0 clocks.
      if (this.activeBleps > MAX_BLEPS - 1) {
        // active blep list truncated (C warns; same behavior)
        this.activeBleps = MAX_BLEPS - 1;
      }
      // Make room for new blep (memmove the [0..active) window right by one)
      for (let i = this.activeBleps; i > 0; i--) {
        const dst = this.blepstate[i]!;
        const src = this.blepstate[i - 1]!;
        dst.age = src.age;
        dst.level = src.level;
      }
      // Update state to account for the new blep
      this.activeBleps++;
      const head = this.blepstate[0]!;
      head.age = 0;
      head.level = sample - this.globalOutputLevel;
      this.globalOutputLevel = sample;
    }
  }

  /** do_clock (mix_paula.c:77-92). */
  doClock(cycles: number): void {
    if (cycles <= 0) return;
    for (let i = 0; i < this.activeBleps; i++) {
      const st = this.blepstate[i]!;
      st.age += cycles;
      if (st.age >= BLEP_SIZE) {
        this.activeBleps = i;
        break;
      }
    }
  }
}
