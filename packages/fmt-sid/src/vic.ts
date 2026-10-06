// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/C64/VIC.c — VIC-II emulation.
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").

import type { CRC64instance } from './c64types.js';

/** cRSID_createVICchip (VIC.c:4-12). */
export function cRSID_createVICchip(C64: CRC64instance, baseaddress: number): void {
  C64.VIC.ChipModel = 0;
  C64.VIC.BaseAddress = baseaddress;
  C64.VIC.BasePtrWR = baseaddress;
  C64.VIC.BasePtrRD = baseaddress;
  cRSID_initVICchip(C64);
}

/** cRSID_initVICchip (VIC.c:14-21). */
export function cRSID_initVICchip(C64: CRC64instance): void {
  for (let i = 0; i < 0x3f; ++i) {
    C64.IObankWR[C64.VIC.BasePtrWR + i] = 0x00;
    C64.IObankRD[C64.VIC.BasePtrRD + i] = 0x00;
  }
  C64.VIC.RowCycleCnt = 0;
}

// enum VICregisters (VIC.c:29-31)
const CONTROL = 0x11, RASTERROWL = 0x12 /*, SPRITE_ENABLE = 0x15*/;
const INTERRUPT = 0x19, INTERRUPT_ENABLE = 0x1a;

// enum ControlBitVal (VIC.c:33)
const RASTERROWMSB = 0x80 /*, DISPLAY_ENABLE = 0x10, ROWS = 0x08, YSCROLL_MASK = 0x07*/;

// enum InterruptBitVal (VIC.c:35)
const VIC_IRQ = 0x80, RASTERROW_MATCH_IRQ = 0x01;

/** cRSID_emulateVIC (VIC.c:37-64) — returns VIC_IRQ (char in C). */
export function cRSID_emulateVIC(C64: CRC64instance, cycles: number): number {
  const W = C64.IObankWR;
  const R = C64.IObankRD;
  const vicWR = C64.VIC.BasePtrWR;
  const vicRD = C64.VIC.BasePtrRD;

  let RasterRow: number;

  C64.VIC.RowCycleCnt += cycles;
  if (C64.VIC.RowCycleCnt >= C64.VIC.RasterRowCycles) {
    C64.VIC.RowCycleCnt -= C64.VIC.RasterRowCycles;

    RasterRow = ((R[vicRD + CONTROL]! & RASTERROWMSB) << 1) + R[vicRD + RASTERROWL]!;
    ++RasterRow;
    if (RasterRow >= C64.VIC.RasterLines) RasterRow = 0;
    R[vicRD + CONTROL]! = (R[vicRD + CONTROL]! & ~RASTERROWMSB) | ((RasterRow & 0x100) >> 1);
    R[vicRD + RASTERROWL] = RasterRow & 0xff;

    if (W[vicWR + INTERRUPT_ENABLE]! & RASTERROW_MATCH_IRQ) {
      if (RasterRow === ((W[vicWR + CONTROL]! & RASTERROWMSB) << 1) + W[vicWR + RASTERROWL]!) {
        R[vicRD + INTERRUPT]! |= VIC_IRQ | RASTERROW_MATCH_IRQ;
      }
    }
  }

  return R[vicRD + INTERRUPT]! & VIC_IRQ;
}

/** cRSID_acknowledgeVICrasterIRQ (VIC.c:66-76).
 *  An 1 is to be written into the IRQ-flag (bit0) of $d019 to clear it and
 *  deassert IRQ signal. But oftentimes INC/LSR/etc. RMW commands are used to
 *  acknowledge VIC IRQ, they work on real CPU because it writes the
 *  unmodified original value itself to memory before writing the modified. */
export function cRSID_acknowledgeVICrasterIRQ(C64: CRC64instance): void {
  const vicWR = C64.VIC.BasePtrWR;
  const vicRD = C64.VIC.BasePtrRD;
  C64.IObankWR[vicWR + INTERRUPT]! &= ~RASTERROW_MATCH_IRQ; // prepare for next acknowledge-detection
  C64.IObankRD[vicRD + INTERRUPT]! &= ~(VIC_IRQ | RASTERROW_MATCH_IRQ); // remove IRQ flag and state
}
