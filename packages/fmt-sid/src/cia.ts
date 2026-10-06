// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/C64/CIA.c — CIA emulation.
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").
//
// C accesses chip registers through CIA->BasePtrWR/BasePtrRD (raw pointers
// into IObankWR/IObankRD); the TS port keeps numeric offsets and indexes the
// C64 IO banks directly.

import type { CRC64instance, CRCIAinstance } from './c64types.js';
import { createCIAinstance } from './c64types.js';

/** cRSID_createCIAchip (CIA.c:6-14). */
export function cRSID_createCIAchip(C64: CRC64instance, CIA: CRCIAinstance, baseaddress: number): void {
  CIA.ChipModel = 0;
  CIA.BaseAddress = baseaddress;
  CIA.BasePtrWR = baseaddress;
  CIA.BasePtrRD = baseaddress;
  cRSID_initCIAchip(C64, CIA);
}

/** cRSID_initCIAchip (CIA.c:16-20). */
export function cRSID_initCIAchip(C64: CRC64instance, CIA: CRCIAinstance): void {
  for (let i = 0; i < 0x10; ++i) {
    C64.IObankWR[CIA.BasePtrWR + i] = 0x00;
    C64.IObankRD[CIA.BasePtrRD + i] = 0x00;
  }
}

// enum CIAregisters (CIA.c:25-29)
const PORTA = 0, PORTB = 1, DDRA = 2, DDRB = 3;
const TIMERAL = 4, TIMERAH = 5, TIMERBL = 6, TIMERBH = 7; // Write:Set Timer-latch, Read: read Timer
const TOD_TENTHSECONDS = 8, TOD_SECONDS = 9, TOD_MINUTES = 0xa, TOD_HOURS = 0xb;
const SERIAL_DATA = 0xc, INTERRUPTS = 0xd, CONTROLA = 0xe, CONTROLB = 0xf;
void PORTA; void PORTB; void DDRA; void DDRB; void TOD_TENTHSECONDS; void TOD_SECONDS; void TOD_MINUTES; void TOD_HOURS; void SERIAL_DATA;

// enum InterruptBitVal (CIA.c:31-33)
const INTERRUPT_HAPPENED = 0x80, SET_OR_CLEAR_FLAGS = 0x80; // (Read or Write operation determines which one:)
const FLAGn = 0x10, SERIALPORT = 0x08, ALARM = 0x04, TIMERB = 0x02, TIMERA = 0x01; // flags/masks of interrupt-sources
void SET_OR_CLEAR_FLAGS; void FLAGn; void SERIALPORT; void ALARM;

// enum ControlAbitVal (CIA.c:35-39)
const ENABLE_TIMERA = 0x01, PORTB6_TIMERA = 0x02, TOGGLED_PORTB6 = 0x04, ONESHOT_TIMERA = 0x08;
const FORCELOADA_STROBE = 0x10, TIMERA_FROM_CNT = 0x20, SERIALPORT_IS_OUTPUT = 0x40, TIMEOFDAY_50Hz = 0x80;
void PORTB6_TIMERA; void TOGGLED_PORTB6; void TIMERA_FROM_CNT; void SERIALPORT_IS_OUTPUT; void TIMEOFDAY_50Hz;

// enum ControlBbitVal (CIA.c:41-46)
const ENABLE_TIMERB = 0x01, PORTB7_TIMERB = 0x02, TOGGLED_PORTB7 = 0x04, ONESHOT_TIMERB = 0x08;
const FORCELOADB_STROBE = 0x10 /*, TIMERB_FROM_CPUCLK = 0x00*/, TIMERB_FROM_CNT = 0x20, TIMERB_FROM_TIMERA = 0x40;
const TIMERB_FROM_TIMERA_AND_CNT = 0x60, TIMEOFDAY_WRITE_SETS_ALARM = 0x80;
void PORTB7_TIMERB; void TOGGLED_PORTB7; void TIMERB_FROM_CNT; void TIMERB_FROM_TIMERA_AND_CNT; void TIMEOFDAY_WRITE_SETS_ALARM;

/** cRSID_emulateCIA (CIA.c:48-119) — returns INTERRUPT_HAPPENED (char in C). */
export function cRSID_emulateCIA(C64: CRC64instance, CIA: CRCIAinstance, cycles: number): number {
  const wr = CIA.BasePtrWR;
  const rd = CIA.BasePtrRD;
  const W = C64.IObankWR;
  const R = C64.IObankRD;

  let Tmp: number;

  // TimerA
  if (W[wr + CONTROLA]! & FORCELOADA_STROBE) {
    // force latch into counter (strobe-input)
    R[rd + TIMERAH]! = W[wr + TIMERAH]!;
    R[rd + TIMERAL]! = W[wr + TIMERAL]!;
  } else if ((W[wr + CONTROLA]! & (ENABLE_TIMERA | TIMERA_FROM_CNT)) === ENABLE_TIMERA) {
    // Enabled, counts Phi2
    Tmp = ((R[rd + TIMERAH]! << 8) + R[rd + TIMERAL]!) - cycles; // count timer
    if (Tmp < 0) {
      // Timer counted down
      Tmp += (W[wr + TIMERAH]! << 8) + W[wr + TIMERAL]! + 1; // reload timer (no '+1' causes 50Hz noise in Vortex.sid and similar)
      if (W[wr + CONTROLA]! & ONESHOT_TIMERA) W[wr + CONTROLA]! &= ~ENABLE_TIMERA; // disable if one-shot
      R[rd + INTERRUPTS]! |= TIMERA;
      if (W[wr + INTERRUPTS]! & TIMERA) {
        // generate interrupt if mask allows
        R[rd + INTERRUPTS]! |= INTERRUPT_HAPPENED;
      }
    }
    R[rd + TIMERAH] = Tmp >>> 8;
    R[rd + TIMERAL] = Tmp & 0xff;
  }
  W[wr + CONTROLA]! &= ~FORCELOADA_STROBE; // strobe is edge-sensitive
  R[rd + CONTROLA]! = W[wr + CONTROLA]!; // control-registers are readable

  // TimerB
  if (W[wr + CONTROLB]! & FORCELOADB_STROBE) {
    // force latch into counter (strobe-input)
    R[rd + TIMERBH]! = W[wr + TIMERBH]!;
    R[rd + TIMERBL]! = W[wr + TIMERBL]!;
  } // what about clocking TimerB by TimerA? (maybe not used in any music)
  else if ((W[wr + CONTROLB]! & (ENABLE_TIMERB | TIMERB_FROM_TIMERA)) === ENABLE_TIMERB) {
    // Enabled, counts Phi2
    Tmp = ((R[rd + TIMERBH]! << 8) + R[rd + TIMERBL]!) - cycles; // count timer
    if (Tmp < 0) {
      // Timer counted down
      Tmp += (W[wr + TIMERBH]! << 8) + W[wr + TIMERBL]! + 1; // reload timer (no '+1' causes 50Hz noise in Vortex.sid and similar)
      if (W[wr + CONTROLB]! & ONESHOT_TIMERB) W[wr + CONTROLB]! &= ~ENABLE_TIMERB; // disable if one-shot
      R[rd + INTERRUPTS]! |= TIMERB;
      if (W[wr + INTERRUPTS]! & TIMERB) {
        // generate interrupt if mask allows
        R[rd + INTERRUPTS]! |= INTERRUPT_HAPPENED;
      }
    }
    R[rd + TIMERBH] = Tmp >>> 8;
    R[rd + TIMERBL] = Tmp & 0xff;
  }
  W[wr + CONTROLB]! &= ~FORCELOADB_STROBE; // strobe is edge-sensitive
  R[rd + CONTROLB]! = W[wr + CONTROLB]!; // control-registers are readable

  return R[rd + INTERRUPTS]! & INTERRUPT_HAPPENED;
}

/** cRSID_writeCIAlatchAhi (CIA.c:121-127). */
export function cRSID_writeCIAlatchAhi(C64: CRC64instance, CIA: CRCIAinstance, value: number): void {
  void value;
  const wr = CIA.BasePtrWR;
  const rd = CIA.BasePtrRD;
  const W = C64.IObankWR;
  const R = C64.IObankRD;
  if (!(W[wr + CONTROLA]! & ENABLE_TIMERA)) {
    R[rd + TIMERAH]! = W[wr + TIMERAH]!;
    R[rd + TIMERAL]! = W[wr + TIMERAL]!;
  }
}

/** cRSID_writeCIAlatchBhi (CIA.c:129-135). */
export function cRSID_writeCIAlatchBhi(C64: CRC64instance, CIA: CRCIAinstance, value: number): void {
  void value;
  const wr = CIA.BasePtrWR;
  const rd = CIA.BasePtrRD;
  const W = C64.IObankWR;
  const R = C64.IObankRD;
  if (!(W[wr + CONTROLB]! & ENABLE_TIMERB)) {
    R[rd + TIMERBH]! = W[wr + TIMERBH]!;
    R[rd + TIMERBL]! = W[wr + TIMERBL]!;
  }
}

/** cRSID_writeCIAIRQmask (CIA.c:137-141). */
export function cRSID_writeCIAIRQmask(C64: CRC64instance, CIA: CRCIAinstance, value: number): void {
  const wr = CIA.BasePtrWR;
  if (value & 0x80) C64.IObankWR[wr + INTERRUPTS]! |= value & 0x1f;
  else C64.IObankWR[wr + INTERRUPTS]! &= ~(value & 0x1f);
}

/** cRSID_acknowledgeCIAIRQ (CIA.c:143-147) — reading a CIA interrupt-register
 *  clears its read-part and IRQ-flag. */
export function cRSID_acknowledgeCIAIRQ(C64: CRC64instance, CIA: CRCIAinstance): void {
  C64.IObankRD[CIA.BasePtrRD + INTERRUPTS] = 0x00;
}

export { createCIAinstance };
