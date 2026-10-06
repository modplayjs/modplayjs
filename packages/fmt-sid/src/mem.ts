// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/C64/MEM.c — emulation of C64 memories and
// memory bus (PLA & MUXes). (c) Hermit (Mihaly Horvath), license: WTF
// ("do what the frick you want", mention the author).
//
// C stores raw `unsigned char*` per (bank, page) in
// MemoryBankPointersRD/WR and compares them against the four base arrays.
// The TS port encodes each entry as bankCode<<16 with bankCode:
//   0 = RAMbank, 1 = IObankRD, 2 = ROMbanks, 3 = IObankWR
// and resolves to (array, offset) at access time — same dispatch semantics.

import type { CRC64instance } from './c64types.js';
import { BANK_RAM, BANK_IO_RD, BANK_ROM, BANK_IO_WR, bankCode } from './c64types.js';
import { CRMemAddresses } from './c64types.js';
import { cRSID } from './instance.js';

/** cRSID_generateMemoryBankPointers (MEM.c:10-25). */
export function cRSID_generateMemoryBankPointers(C64: CRC64instance): void {
  for (let i = 0; i < 4; ++i) {
    for (let j = 0; j < 256; ++j) {
      // RD table (MEM.c:14-17)
      let rd: number;
      if (j < 0xA0) rd = BANK_RAM;
      else if (0xD0 <= j && j < 0xE0 && i) rd = BANK_IO_RD;
      else if ((j < 0xC0 && i === 3) || (0xE0 <= j && i & 2)) rd = BANK_ROM;
      else rd = BANK_RAM;
      C64.MemoryBankPointersRD[(i << 8) | j] = rd << 16;

      // WR table (MEM.c:19-21)
      let wr: number;
      if (j < 0xD0 || 0xE0 <= j) wr = BANK_RAM;
      else if (i) wr = BANK_IO_WR;
      else wr = BANK_RAM;
      C64.MemoryBankPointersWR[(i << 8) | j] = wr << 16;
    }
  }
}

const enum BankSel {
  RAM = 0,
  IO_RD = 1,
  ROM = 2,
  IO_WR = 3,
}

/**
 * cRSID_getMemReadPtr (MEM.c:28-51) — TS-port form: instead of returning a
 * raw pointer, this reads the byte through the resolved (bank, address).
 *
 * The special case that made C return `&IObankWR[address]` (SID-read
 * bitfading of the last written register, e.g. Lift Off `ROR $D400,x`)
 * reads from IObankWR here — same value.
 */
export function cRSID_readMemPtr(C64: CRC64instance, address: number): number {
  const entry = C64.MemoryBankPointersRD[((C64.RAMbank[1]! & 3) << 8) | (address >>> 8)];
  const bank = bankCode(entry!);
  if (bank !== BankSel.IO_RD) {
    return bank === BankSel.ROM ? C64.ROMbanks[address]! : C64.RAMbank[address]!;
  }
  // MOSTLY (address < 0xD400 || 0xD419 <= address) → IObankRD
  if (address < 0xd400 || 0xd419 <= address) return C64.IObankRD[address]!;
  // else return &IObankWR[address] — emulate bitfading aka SID-read of last
  // written reg (e.g. Lift Off ROR $D400,x)
  return C64.IObankWR[address]!;
}

/**
 * cRSID_getMemWritePtr (MEM.c:76-106) — TS-port form: writes the byte through
 * the resolved (bank, address), including the SID-mirror redirect.
 */
export function cRSID_writeMemPtr(C64: CRC64instance, address: number, data: number): void {
  const entry = C64.MemoryBankPointersWR[((C64.RAMbank[1]! & 3) << 8) | (address >>> 8)];
  const bank = bankCode(entry!);
  if (bank !== BankSel.IO_WR) {
    // MOSTLY branch: RAM (the WR table only stores RAM or IO_WR)
    C64.RAMbank[address] = data;
    return;
  }
  // else if ( RARELY (0xD420 <= address && address < 0xD800) ) — CIA/VIC mirrors
  if (0xd420 <= address && address < 0xd800) {
    if (
      !(cRSID.PSIDdigiMode && 0xd418 <= address && address < 0xd500) &&
      !(C64.SID[2]!.BaseAddress <= address && address < C64.SID[2]!.BaseAddress + 0x20) &&
      !(C64.SID[3]!.BaseAddress <= address && address < C64.SID[3]!.BaseAddress + 0x20) &&
      !(C64.SID[4]!.BaseAddress <= address && address < C64.SID[4]!.BaseAddress + 0x20)
    ) {
      // write to $D400..D41F if not in SID2/SID3 address-space
      C64.IObankWR[0xd400 + (address & 0x1f)] = data;
      return;
    }
  }
  C64.IObankWR[address] = data;
}

/** cRSID_readMem (MEM.c:110-112). */
export function cRSID_readMem(C64: CRC64instance, address: number): number {
  return cRSID_readMemPtr(C64, address);
}

/** cRSID_writeMem (MEM.c:118-120). */
export function cRSID_writeMem(C64: CRC64instance, address: number, data: number): void {
  cRSID_writeMemPtr(C64, address, data);
}

// ---------------------------------------------------------------------------
// ROM stub content (MEM.c:124-166)
// ---------------------------------------------------------------------------

/** CIA1-acknowledge IRQ-return (MEM.c:127). */
const ROM_IRQreturnCode = [0xad, 0x0d, 0xdc, 0x68, 0xa8, 0x68, 0xaa, 0x68, 0x40];
/** SEI and jmp($0318) (MEM.c:128). */
const ROM_NMIstartCode = [0x78, 0x6c, 0x18, 0x03, 0x40];
/** Full IRQ-return (handling BRK with the same RAM vector as IRQ) (MEM.c:129-134). */

const ROM_IRQBRKstartCode = [
  0x48, 0x8a, 0x48, 0x98, 0x48, 0xba, 0xbd, 0x04, 0x01, 0x29, 0x10, 0xea, 0xea, 0xea, 0xea, 0xea, 0x6c, 0x14, 0x03,
];

/** cRSID_setROMcontent (MEM.c:124-166) — fill KERNAL/BASIC-ROM areas with
 *  content needed for SID-playback. */
export function cRSID_setROMcontent(C64: CRC64instance): void {
  for (let i = 0xa000; i < 0x10000; ++i) C64.ROMbanks[i] = 0x60; // RTS (at least return if some unsupported call is made to ROM)

  if (cRSID.BASICfileData != null) {
    for (let i = 0; i < 0x2000; ++i) C64.ROMbanks[0xa000 + i] = cRSID.BASICfileData[i]!;
  }

  if (cRSID.KERNALfileData != null) {
    for (let i = 0; i < 0x2000; ++i) C64.ROMbanks[0xe000 + i] = cRSID.KERNALfileData[i]!;
  } else {
    for (let i = 0xea31; i < 0xea7e; ++i) C64.ROMbanks[i] = 0xea; // NOP (full IRQ-return leading to simple IRQ-return without other tasks)
    for (let i = 0; i < 9; ++i) C64.ROMbanks[0xea7e + i] = ROM_IRQreturnCode[i]!;
    for (let i = 0; i < 4; ++i) C64.ROMbanks[0xfe43 + i] = ROM_NMIstartCode[i]!;
    for (let i = 0; i < 19; ++i) C64.ROMbanks[0xff48 + i] = ROM_IRQBRKstartCode[i]!;
    C64.ROMbanks[0xfffb] = 0xfe;
    C64.ROMbanks[0xfffa] = 0x43; // ROM NMI-vector
    C64.ROMbanks[0xffff] = 0xff;
    C64.ROMbanks[0xfffe] = 0x48; // ROM IRQ-vector
  }

  // copy KERNAL & BASIC ROM contents into the RAM under them? (So PSIDs that
  // don't select bank correctly will work better.)
  for (let i = 0xa000; i < 0x10000; ++i) C64.RAMbank[i]! = C64.ROMbanks[i]!;
}

/** cRSID_initMem (MEM.c:168-197) — set default values that normally KERNEL
 *  ensures after startup/reset (only SID-playback related). */
export function cRSID_initMem(C64: CRC64instance): void {
  // data required by both PSID and RSID (according to HVSC SID_file_format.txt):
  cRSID_writeMem(C64, 0x02a6, cRSID.VideoStandard); // $02A6 should be pre-set to: 0:NTSC / 1:PAL
  cRSID_writeMem(C64, 0x0001, 0x37); // initialize bank-reg. (ROM-banks and IO enabled)

  // if (C64.ROMbanks[0xE000]==0) — wasn't a KERNAL-ROM loaded? (e.g. PSID)
  cRSID_writeMem(C64, 0x00cb, 0x40); // Some tunes might check for keypress here (e.g. Master Blaster Intro)
  // if (cRSID.RealSIDmode) {
  cRSID_writeMem(C64, 0x0315, 0xea);
  cRSID_writeMem(C64, 0x0314, 0x31); // IRQ
  cRSID_writeMem(C64, 0x0319, 0xea /*0xFE*/);
  cRSID_writeMem(C64, 0x0318, 0x81 /*0x47*/); // NMI
  // }

  for (let i = 0xd000; i < 0xd7ff; ++i) C64.IObankRD[i] = C64.IObankWR[i] = 0; // initialize the whole IO area for a known base-state
  if (cRSID.RealSIDmode) {
    C64.IObankWR[0xd012] = 0x37;
    C64.IObankWR[0xd011] = 0x8b;
  } // else C64.IObankWR[0xD012] = 0;
  // C64.IObankWR[0xD019] = 0; // PSID: rasterrow: any value <= $FF, IRQ:enable later if there is VIC-timingsource

  C64.IObankRD[0xdc00] = 0x10;
  C64.IObankRD[0xdc01] = 0xff; // Imitate CIA1 keyboard/joy port, some tunes check if buttons are not pressed
  if (cRSID.VideoStandard) {
    C64.IObankWR[0xdc04] = 0x24;
    C64.IObankWR[0xdc05] = 0x40;
  } // initialize CIAs
  else {
    C64.IObankWR[0xdc04] = 0x95;
    C64.IObankWR[0xdc05] = 0x42;
  }
  if (cRSID.RealSIDmode) C64.IObankWR[0xdc0d] = 0x81; // Reset-default, but for PSID CIA1 TimerA IRQ should be enabled anyway if SID is CIA-timed
  C64.IObankWR[0xdc0e] = 0x01; // some tunes (and PSID doc) expect already running CIA (Reset-default)
  C64.IObankWR[0xdc0f] = 0x00; // All counters other than CIA1 TimerA should be disabled and set to 0xFF for PSID:
  C64.IObankWR[0xdd00] = C64.IObankRD[0xdd00] = 0x03; // VICbank-selector default
  C64.IObankWR[0xdd04] = C64.IObankWR[0xdd05] = 0xff;
  // C64.IObankWR[0xDD0E] = C64.IObank[0xDD0F] = 0x08;
}

// re-exported for the module-safety zone (C's CRSID_SID_SAFE_ADDRESS base)
export { CRMemAddresses };
