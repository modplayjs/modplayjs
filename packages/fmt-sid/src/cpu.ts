// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/C64/CPU.c — 6510 CPU emulation for
// SID/PRG playback, including the illegal opcodes used by scene tunes.
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").
//
// C's rd()/wr()/wr2() wrap getMemReadPtr/getMemWritePtr and side-effect
// IRQ-acknowledge handling; those map to mem.ts read/write + cia/vic hooks.

import type { CRC64instance } from './c64types.js';
import { cRSID } from './instance.js';
import { cRSID_readMemPtr, cRSID_writeMemPtr } from './mem.js';
import { cRSID_acknowledgeCIAIRQ, cRSID_writeCIAIRQmask, cRSID_writeCIAlatchAhi, cRSID_writeCIAlatchBhi } from './cia.js';
import { cRSID_acknowledgeVICrasterIRQ } from './vic.js';

// enum cRSID_StatusFlagBitValues (CPU.c:4)
const N = 0x80, V = 0x40, B = 0x10, D = 0x08, I = 0x04, Z = 0x02, C = 0x01;

/** cRSID_initCPU (CPU.c:16-19). */
export function cRSID_initCPU(C64: CRC64instance, mempos: number): void {
  C64.CPU.PC = mempos;
  C64.CPU.A = 0;
  C64.CPU.X = 0;
  C64.CPU.Y = 0;
  C64.CPU.ST = 0x04;
  C64.CPU.SP = 0xff;
  C64.CPU.PrevNMI = 0;
}

/** rd (CPU.c:30-40). */
function rd(C64: CRC64instance, address: number): number {
  const value = cRSID_readMemPtr(C64, address);
  if (C64.RealSIDmode) {
    if (C64.RAMbank[1]! & 3) {
      if (address === 0xdc0d) cRSID_acknowledgeCIAIRQ(C64, C64.CIA[1]!);
      else if (address === 0xdd0d) cRSID_acknowledgeCIAIRQ(C64, C64.CIA[2]!);
    }
  }
  return value;
}

/** wr (CPU.c:42-52). */
function wr(C64: CRC64instance, address: number, data: number): void {
  cRSID_writeMemPtr(C64, address, data);
  if (C64.RealSIDmode && C64.RAMbank[1]! & 3) {
    // if(data&1) { //only writing 1 to $d019 bit0 would acknowledge, not any value (but RMW instructions write $d019 back before mod.)
    if (address === 0xd019) cRSID_acknowledgeVICrasterIRQ(C64);
    // }
  }
}

/** wr2 (CPU.c:54-115) — PSID-hack specific memory-write. */
function wr2(C64: CRC64instance, address: number, data: number): void {
  cRSID_writeMemPtr(C64, address, data);
  if (C64.RAMbank[1]! & 3) {
    if (C64.RealSIDmode) {
      if ((address & 0xfe00) === 0xdc00) {
        switch (address) {
          case 0xdc0d:
            cRSID_writeCIAIRQmask(C64, C64.CIA[1]!, data);
            break;
          case 0xdd0d:
            cRSID_writeCIAIRQmask(C64, C64.CIA[2]!, data);
            break;
          case 0xdc0c:
            C64.IObankRD[address] = data;
            break; // mirror WR to RD (e.g. if byte at DC0C is used as RTI)
          case 0xdd0c:
            C64.IObankRD[address] = data;
            break; // mirror WR to RD (e.g. Wonderland_XIII_tune_1.sid)
          case 0xdc05:
            cRSID_writeCIAlatchAhi(C64, C64.CIA[1]!, data);
            break;
          case 0xdc07:
            cRSID_writeCIAlatchBhi(C64, C64.CIA[1]!, data);
            break;
          case 0xdd05:
            cRSID_writeCIAlatchAhi(C64, C64.CIA[2]!, data);
            break;
          case 0xdd07:
            cRSID_writeCIAlatchBhi(C64, C64.CIA[2]!, data);
            break;
        }
      } else if (address === 0xd019 && data & 1) {
        // only writing 1 to $d019 bit0 would acknowledge
        cRSID_acknowledgeVICrasterIRQ(C64);
      }
    } else {
      // PSID-mode
      switch (address) {
        case 0xdc05:
        case 0xdc04:
          if (cRSID.TimerSource) {
            // dynamic CIA-setting (Galway/Rubicon workaround)
            cRSID.FrameCycles = C64.IObankWR[0xdc04]! + (C64.IObankWR[0xdc05]! << 8);
          }
          break;
        case 0xdc08:
          C64.IObankRD[0xdc08] = data;
          break; // refresh TOD-clock
        case 0xdc09:
          C64.IObankRD[0xdc09] = data;
          break; // refresh TOD-clock
        case 0xd012:
          // dynamic VIC IRQ-rasterline setting (Microprose Soccer V1 workaround)
          if (C64.PrevRasterLine >= 0) {
            // was $d012 set before? (or set only once?)
            if (C64.IObankWR[0xd012] !== C64.PrevRasterLine) {
              let Tmp = C64.IObankWR[0xd012]! - C64.PrevRasterLine;
              if (Tmp < 0) Tmp += C64.VIC.RasterLines;
              C64.FrameCycleCnt = cRSID.FrameCycles - Tmp * C64.VIC.RasterRowCycles;
            }
          }
          C64.PrevRasterLine = C64.IObankWR[0xd012]!;
          break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Addressing modes (CPU.c:117-166)
// ---------------------------------------------------------------------------

function addrModeImmediate(C64: CRC64instance): void {
  ++C64.CPU.PC;
  C64.CPU.Addr = C64.CPU.PC;
  C64.CPU.Cycles = 2;
} // imm.

function addrModeZeropage(C64: CRC64instance): void {
  ++C64.CPU.PC;
  C64.CPU.Addr = rd(C64, C64.CPU.PC);
  C64.CPU.Cycles = 3;
} // zp

function addrModeAbsolute(C64: CRC64instance): void {
  ++C64.CPU.PC;
  C64.CPU.Addr = rd(C64, C64.CPU.PC);
  ++C64.CPU.PC;
  C64.CPU.Addr += rd(C64, C64.CPU.PC) << 8;
  C64.CPU.Cycles = 4;
} // abs

function addrModeZeropageXindexed(C64: CRC64instance): void {
  ++C64.CPU.PC;
  C64.CPU.Addr = (rd(C64, C64.CPU.PC) + C64.CPU.X) & 0xff;
  C64.CPU.Cycles = 4;
} // zp,x (with zeropage-wraparound of 6502)

function addrModeZeropageYindexed(C64: CRC64instance): void {
  ++C64.CPU.PC;
  C64.CPU.Addr = (rd(C64, C64.CPU.PC) + C64.CPU.Y) & 0xff;
  C64.CPU.Cycles = 4;
} // zp,y (with zeropage-wraparound of 6502)

function addrModeXindexed(C64: CRC64instance): void {
  // abs,x (only STA is 5 cycles, others are 4 if page not crossed, RMW:7)
  ++C64.CPU.PC;
  C64.CPU.Addr = rd(C64, C64.CPU.PC) + C64.CPU.X;
  ++C64.CPU.PC;
  C64.CPU.SamePage = C64.CPU.Addr <= 0xff ? 1 : 0;
  C64.CPU.Addr += rd(C64, C64.CPU.PC) << 8;
  C64.CPU.Cycles = 5;
}

function addrModeYindexed(C64: CRC64instance): void {
  // abs,y (only STA is 5 cycles, others are 4 if page not crossed, RMW:7)
  ++C64.CPU.PC;
  C64.CPU.Addr = rd(C64, C64.CPU.PC) + C64.CPU.Y;
  ++C64.CPU.PC;
  C64.CPU.SamePage = C64.CPU.Addr <= 0xff ? 1 : 0;
  C64.CPU.Addr += rd(C64, C64.CPU.PC) << 8;
  C64.CPU.Cycles = 5;
}

function addrModeIndirectYindexed(C64: CRC64instance): void {
  // (zp),y (only STA is 6 cycles, others are 5 if page not crossed, RMW:8)
  ++C64.CPU.PC;
  C64.CPU.Addr = rd(C64, rd(C64, C64.CPU.PC)) + C64.CPU.Y;
  C64.CPU.SamePage = C64.CPU.Addr <= 0xff ? 1 : 0;
  C64.CPU.Addr += rd(C64, (rd(C64, C64.CPU.PC) + 1) & 0xff) << 8;
  C64.CPU.Cycles = 6;
}

function addrModeXindexedIndirect(C64: CRC64instance): void {
  // (zp,x)
  ++C64.CPU.PC;
  C64.CPU.Addr =
    (rd(C64, rd(C64, C64.CPU.PC) + C64.CPU.X) & 0xff) + ((rd(C64, rd(C64, C64.CPU.PC) + C64.CPU.X + 1) & 0xff) << 8);
  C64.CPU.Cycles = 6;
}

// ---------------------------------------------------------------------------
// Flag helpers (CPU.c:168-219)
// ---------------------------------------------------------------------------

function clrC(C64: CRC64instance): void {
  C64.CPU.ST &= ~C;
} // clear Carry-flag

function setC(C64: CRC64instance, expr: number): void {
  C64.CPU.ST &= ~C;
  C64.CPU.ST |= expr !== 0 ? 1 : 0;
} // set Carry-flag if expression is not zero, else clear it

function clrNZC(C64: CRC64instance): void {
  C64.CPU.ST &= ~(N | Z | C);
} // clear flags

export function clrNVZC(C64: CRC64instance): void {
  C64.CPU.ST &= ~(N | V | Z | C);
} // clear flags

function setNZbyA(C64: CRC64instance): void {
  C64.CPU.ST &= ~(N | Z);
  C64.CPU.ST |= ((C64.CPU.A ? 0 : 1) << 1) | (C64.CPU.A & N);
} // set Negative-flag and Zero-flag based on result in Accumulator

function setNZbyT(C64: CRC64instance, t: number): void {
  t &= 0xff;
  C64.CPU.ST &= ~(N | Z);
  C64.CPU.ST |= ((t ? 0 : 1) << 1) | (t & N);
}

function setNZbyX(C64: CRC64instance): void {
  C64.CPU.ST &= ~(N | Z);
  C64.CPU.ST |= ((C64.CPU.X ? 0 : 1) << 1) | (C64.CPU.X & N);
} // set Negative-flag and Zero-flag based on result in X-register

function setNZbyY(C64: CRC64instance): void {
  C64.CPU.ST &= ~(N | Z);
  C64.CPU.ST |= ((C64.CPU.Y ? 0 : 1) << 1) | (C64.CPU.Y & N);
} // set Negative-flag and Zero-flag based on result in Y-register

function setNZbyM(C64: CRC64instance): void {
  const m = rd(C64, C64.CPU.Addr);
  C64.CPU.ST &= ~(N | Z);
  C64.CPU.ST |= ((m ? 0 : 1) << 1) | (m & N);
} // set Negative-flag and Zero-flag based on result at Memory-Address

function setNZCbyAdd(C64: CRC64instance): void {
  C64.CPU.ST &= ~(N | Z | C);
  C64.CPU.ST |= (C64.CPU.A & N) | (C64.CPU.A > 255 ? 1 : 0);
  C64.CPU.A &= 0xff;
  C64.CPU.ST |= (C64.CPU.A ? 0 : 1) << 1;
} // after increase/addition

function setVbyAdd(C64: CRC64instance, m: number, t: number): void {
  C64.CPU.ST &= ~V;
  C64.CPU.ST |= ((~(t ^ m)) & (t ^ C64.CPU.A) & N) >>> 1 & V;
} // calculate V-flag from A and T (previous A) and input2 (Memory)

function setNZCbySub(C64: CRC64instance, t: number): void {
  C64.CPU.ST &= ~(N | Z | C);
  C64.CPU.ST |= (t & N) | (t >= 0 ? 1 : 0);
  C64.CPU.ST |= ((t & 0xff) === 0 ? 1 : 0) << 1;
}

function push(C64: CRC64instance, value: number): void {
  C64.RAMbank[0x100 + C64.CPU.SP] = value;
  --C64.CPU.SP;
  C64.CPU.SP &= 0xff;
} // push a value to stack

function pop(C64: CRC64instance): number {
  ++C64.CPU.SP;
  C64.CPU.SP &= 0xff;
  return C64.RAMbank[0x100 + C64.CPU.SP]!;
} // pop a value from stack

// ---------------------------------------------------------------------------
// cRSID_emulateCPU (CPU.c:223-459)
// ---------------------------------------------------------------------------

/** FlagSwitches / BranchFlags (CPU.c:228-229). */
const FlagSwitches: Uint8Array = new Uint8Array([0x01, 0x21, 0x04, 0x24, 0x00, 0x40, 0x08, 0x28]);
const BranchFlags: Uint8Array = new Uint8Array([0x80, 0x40, 0x01, 0x02]);

/** cRSID_emulateCPU (CPU.c:223-459) — the CPU emulation for SID/PRG playback
 *  (C ToDo comment: CIA/VIC-IRQ/NMI/RESET vectors, BCD-mode). Returns the
 *  instruction's cycle count, or 0xFF (init returns / idle) / 0xFE
 *  (RTI with empty stack / KERNAL IRQ-return substitute in PSID). */
export function cRSID_emulateCPU(C64: CRC64instance): number {
  const PrevPC = C64.CPU.PC;
  const IR = rd(C64, C64.CPU.PC);
  C64.CPU.Cycles = 2;
  C64.CPU.SamePage = 0; // 'Cycles': ensure smallest 6510 instruction runtime (for implied/register addressing-modes)

  let T: number;

  if (IR & 1) {
    // nybble2: 1/5/9/D:accu.instructions, 3/7/B/F:illegal opcodes
    switch ((IR & 0x1f) >> 1) {
      // value-forming to cause jump-table //PC wraparound not handled inside to save codespace
      case 0:
      case 1:
        addrModeXindexedIndirect(C64);
        break; // (zp,x)
      case 2:
      case 3:
        addrModeZeropage(C64);
        break;
      case 4:
      case 5:
        addrModeImmediate(C64);
        break;
      case 6:
      case 7:
        addrModeAbsolute(C64);
        break;
      case 8:
      case 9:
        addrModeIndirectYindexed(C64);
        break; // (zp),y (5..6 cycles, 8 for R-M-W)
      case 0xa:
        addrModeZeropageXindexed(C64);
        break; // zp,x
      case 0xb:
        if ((IR & 0xc0) !== 0x80) addrModeZeropageXindexed(C64); // zp,x for illegal opcodes
        else addrModeZeropageYindexed(C64); // zp,y for LAX/SAX illegal opcodes
        break;
      case 0xc:
      case 0xd:
        addrModeYindexed(C64);
        break;
      case 0xe:
        addrModeXindexed(C64);
        break;
      case 0xf:
        if ((IR & 0xc0) !== 0x80) addrModeXindexed(C64); // abs,x for illegal opcodes
        else addrModeYindexed(C64); // abs,y for LAX/SAX illegal opcodes
        break;
    }
    C64.CPU.Addr &= 0xffff;

    switch ((IR & 0xe0) >> 5) {
      // value-forming to cause gapless case-values and faster jump-table creation from switch-case
      case 0:
        if ((IR & 0x1f) !== 0xb) {
          // ORA / SLO(ASO)=ASL+ORA
          if ((IR & 3) === 3) {
            clrNZC(C64);
            setC(C64, rd(C64, C64.CPU.Addr) >= N ? 1 : 0);
            wr(C64, C64.CPU.Addr, rd(C64, C64.CPU.Addr) << 1);
            C64.CPU.Cycles += 2;
          } // for SLO
          else C64.CPU.Cycles -= C64.CPU.SamePage;
          C64.CPU.A |= rd(C64, C64.CPU.Addr);
          setNZbyA(C64); // ORA
        } else {
          C64.CPU.A &= rd(C64, C64.CPU.Addr);
          setNZbyA(C64);
          setC(C64, C64.CPU.A >= N ? 1 : 0);
        } // ANC (AND+Carry=bit7)
        break;

      case 1:
        if ((IR & 0x1f) !== 0xb) {
          // AND / RLA (ROL+AND)
          if ((IR & 3) === 3) {
            // for RLA
            T = (rd(C64, C64.CPU.Addr) << 1) + (C64.CPU.ST & C);
            clrNZC(C64);
            setC(C64, T > 255 ? 1 : 0);
            T &= 0xff;
            wr(C64, C64.CPU.Addr, T);
            C64.CPU.Cycles += 2;
          } else C64.CPU.Cycles -= C64.CPU.SamePage;
          C64.CPU.A &= rd(C64, C64.CPU.Addr);
          setNZbyA(C64); // AND
        } else {
          C64.CPU.A &= rd(C64, C64.CPU.Addr);
          setNZbyA(C64);
          setC(C64, C64.CPU.A >= N ? 1 : 0);
        } // ANC (AND+Carry=bit7)
        break;

      case 2:
        if ((IR & 0x1f) !== 0xb) {
          // EOR / SRE(LSE)=LSR+EOR
          if ((IR & 3) === 3) {
            clrNZC(C64);
            setC(C64, rd(C64, C64.CPU.Addr) & 1);
            wr(C64, C64.CPU.Addr, rd(C64, C64.CPU.Addr) >> 1);
            C64.CPU.Cycles += 2;
          } // for SRE
          else C64.CPU.Cycles -= C64.CPU.SamePage;
          C64.CPU.A ^= rd(C64, C64.CPU.Addr);
          setNZbyA(C64); // EOR
        } else {
          C64.CPU.A &= rd(C64, C64.CPU.Addr);
          setC(C64, C64.CPU.A & 1);
          C64.CPU.A >>= 1;
          C64.CPU.A &= 0xff;
          setNZbyA(C64);
        } // ALR(ASR)=(AND+LSR)
        break;

      case 3:
        if ((IR & 0x1f) !== 0xb) {
          // RRA (ROR+ADC) / ADC
          if ((IR & 3) === 3) {
            // for RRA
            T = (rd(C64, C64.CPU.Addr) >>> 1) + ((C64.CPU.ST & C) << 7);
            clrNZC(C64);
            setC(C64, T & 1);
            wr(C64, C64.CPU.Addr, T);
            C64.CPU.Cycles += 2;
          } else C64.CPU.Cycles -= C64.CPU.SamePage;
          T = C64.CPU.A;
          C64.CPU.A += rd(C64, C64.CPU.Addr) + (C64.CPU.ST & C);
          if ((C64.CPU.ST & D) !== 0 && (C64.CPU.A & 0xf) > 9) {
            C64.CPU.A += 0x10;
            C64.CPU.A &= 0xf0;
          } // BCD?
          setNZCbyAdd(C64);
          setVbyAdd(C64, rd(C64, C64.CPU.Addr), T); // ADC
        } else {
          // ARR (AND+ROR, bit0 not going to C, but C and bit7 get exchanged.)
          C64.CPU.A &= rd(C64, C64.CPU.Addr);
          T = C64.CPU.A;
          C64.CPU.A = (C64.CPU.A >> 1) + ((C64.CPU.ST & C) << 7);
          setC(C64, T >= N ? 1 : 0);
          setNZbyA(C64);
          C64.CPU.ST &= ~V;
          C64.CPU.ST |= ((T & V) ^ (C64.CPU.A & V)) & V; // corrected: V is set accoring to whether rotate changes Accu bit 6: Tbit6^Abit6)
        }
        break;

      case 4:
        if ((IR & 0x1f) === 0xb) {
          C64.CPU.A = (C64.CPU.X & rd(C64, C64.CPU.Addr)) & 0xff;
          setNZbyA(C64); // XAA (TXA+AND), highly unstable on real 6502!
        } else if ((IR & 0x1f) === 0x1b) {
          C64.CPU.SP = C64.CPU.A & C64.CPU.X;
          wr(C64, C64.CPU.Addr, C64.CPU.SP & ((C64.CPU.Addr >> 8) + 1));
        } // TAS(SHS) (SP=A&X, mem=S&H} - unstable on real 6502
        else {
          wr2(C64, C64.CPU.Addr, C64.CPU.A & ((IR & 3) === 3 ? C64.CPU.X : 0xff));
        } // STA / SAX (at times same as AHX/SHX/SHY) (illegal)
        break;

      case 5:
        if ((IR & 0x1f) !== 0x1b) {
          C64.CPU.A = rd(C64, C64.CPU.Addr);
          if ((IR & 3) === 3) C64.CPU.X = C64.CPU.A & 0xff;
        } // LDA / LAX (illegal, used by my 1 rasterline player) (LAX #imm is unstable on C64)
        else {
          C64.CPU.A = C64.CPU.X = C64.CPU.SP = rd(C64, C64.CPU.Addr) & C64.CPU.SP;
          C64.CPU.X &= 0xff;
        } // LAS(LAR)
        setNZbyA(C64);
        C64.CPU.Cycles -= C64.CPU.SamePage;
        break;

      case 6:
        if ((IR & 0x1f) !== 0xb) {
          // CMP / DCP(DEC+CMP)
          if ((IR & 3) === 3) {
            wr(C64, C64.CPU.Addr, rd(C64, C64.CPU.Addr) - 1);
            C64.CPU.Cycles += 2;
          } // DCP
          else C64.CPU.Cycles -= C64.CPU.SamePage;
          T = C64.CPU.A - rd(C64, C64.CPU.Addr);
        } else {
          C64.CPU.X = T = (C64.CPU.A & C64.CPU.X) - rd(C64, C64.CPU.Addr);
          C64.CPU.X &= 0xff;
        } // SBX(AXS) (CMP+DEX at the same time)
        setNZCbySub(C64, T);
        break;

      case 7:
        if ((IR & 3) === 3 && (IR & 0x1f) !== 0xb) {
          wr(C64, C64.CPU.Addr, rd(C64, C64.CPU.Addr) + 1);
          C64.CPU.Cycles += 2;
        } // ISC(ISB)=INC+SBC / SBC
        else C64.CPU.Cycles -= C64.CPU.SamePage;
        T = C64.CPU.A;
        C64.CPU.A -= rd(C64, C64.CPU.Addr) + ((C64.CPU.ST & C) === 0 ? 1 : 0);
        setNZCbySub(C64, C64.CPU.A);
        C64.CPU.A &= 0xff;
        setVbyAdd(C64, ~rd(C64, C64.CPU.Addr) & 0xff, T);
        break;
    }
  } else if (IR & 2) {
    // nybble2: 2:illegal/LDX, 6:A/X/INC/DEC, A:Accu-shift/reg.transfer/NOP, E:shift/X/INC/DEC
    switch (IR & 0x1f) {
      // Addressing modes
      case 2:
        addrModeImmediate(C64);
        break;
      case 6:
        addrModeZeropage(C64);
        break;
      case 0xe:
        addrModeAbsolute(C64);
        break;
      case 0x16:
        if ((IR & 0xc0) !== 0x80) addrModeZeropageXindexed(C64); // zp,x
        else addrModeZeropageYindexed(C64); // zp,y
        break;
      case 0x1e:
        if ((IR & 0xc0) !== 0x80) addrModeXindexed(C64); // abs,x
        else addrModeYindexed(C64); // abs,y
        break;
    }
    C64.CPU.Addr &= 0xffff;

    switch ((IR & 0xe0) >> 5) {
      case 0: {
        clrC(C64); // clear C for ASL //the rest of case 0 and 1 are identical but newer GCC gave notifications about 'fallthrough', so duplicated it
        if ((IR & 0xf) === 0xa) {
          C64.CPU.A = (C64.CPU.A << 1) + (C64.CPU.ST & C);
          setNZCbyAdd(C64);
        } // ASL/ROL (Accu)
        else {
          T = (rd(C64, C64.CPU.Addr) << 1) + (C64.CPU.ST & C);
          setC(C64, T > 255 ? 1 : 0);
          setNZbyT(C64, T);
          wr(C64, C64.CPU.Addr, T);
          C64.CPU.Cycles += 2;
        } // RMW (Read-Write-Modify)
        break;
      }
      case 1:
        if ((IR & 0xf) === 0xa) {
          C64.CPU.A = (C64.CPU.A << 1) + (C64.CPU.ST & C);
          setNZCbyAdd(C64);
        } // ASL/ROL (Accu)
        else {
          T = (rd(C64, C64.CPU.Addr) << 1) + (C64.CPU.ST & C);
          setC(C64, T > 255 ? 1 : 0);
          setNZbyT(C64, T);
          wr(C64, C64.CPU.Addr, T);
          C64.CPU.Cycles += 2;
        } // RMW (Read-Write-Modify)
        break;

      case 2: {
        clrC(C64); // clear C for LSR //the rest of case 2 and 3 are identical but newer GCC gave notifications about 'fallthrough', so duplicated it
        if ((IR & 0xf) === 0xa) {
          T = C64.CPU.A;
          C64.CPU.A = (C64.CPU.A >> 1) + ((C64.CPU.ST & C) << 7);
          setC(C64, T & 1);
          C64.CPU.A &= 0xff;
          setNZbyA(C64);
        } // LSR/ROR (Accu)
        else {
          T = (rd(C64, C64.CPU.Addr) >>> 1) + ((C64.CPU.ST & C) << 7);
          setC(C64, rd(C64, C64.CPU.Addr) & 1);
          setNZbyT(C64, T);
          wr(C64, C64.CPU.Addr, T);
          C64.CPU.Cycles += 2;
        } // memory (RMW)
        break;
      }
      case 3:
        if ((IR & 0xf) === 0xa) {
          T = C64.CPU.A;
          C64.CPU.A = (C64.CPU.A >> 1) + ((C64.CPU.ST & C) << 7);
          setC(C64, T & 1);
          C64.CPU.A &= 0xff;
          setNZbyA(C64);
        } // LSR/ROR (Accu)
        else {
          T = (rd(C64, C64.CPU.Addr) >>> 1) + ((C64.CPU.ST & C) << 7);
          setC(C64, rd(C64, C64.CPU.Addr) & 1);
          setNZbyT(C64, T);
          wr(C64, C64.CPU.Addr, T);
          C64.CPU.Cycles += 2;
        } // memory (RMW)
        break;

      case 4:
        if (IR & 4) {
          wr2(C64, C64.CPU.Addr, C64.CPU.X);
        } // STX
        else if (IR & 0x10) C64.CPU.SP = C64.CPU.X; // TXS
        else {
          C64.CPU.A = C64.CPU.X;
          setNZbyA(C64);
        } // TXA
        break;

      case 5:
        if ((IR & 0xf) !== 0xa) {
          C64.CPU.X = rd(C64, C64.CPU.Addr) & 0xff;
          C64.CPU.Cycles -= C64.CPU.SamePage;
        } // LDX
        else if (IR & 0x10) C64.CPU.X = C64.CPU.SP; // TSX
        else C64.CPU.X = C64.CPU.A; // TAX
        setNZbyX(C64);
        break;

      case 6:
        if (IR & 4) {
          wr(C64, C64.CPU.Addr, rd(C64, C64.CPU.Addr) - 1);
          setNZbyM(C64);
          C64.CPU.Cycles += 2;
        } // DEC
        else {
          C64.CPU.X = (C64.CPU.X - 1) & 0xff;
          setNZbyX(C64);
        } // DEX
        break;

      case 7:
        if (IR & 4) {
          wr(C64, C64.CPU.Addr, rd(C64, C64.CPU.Addr) + 1);
          setNZbyM(C64);
          C64.CPU.Cycles += 2;
        } // INC/NOP
        break;
    }
  } else if ((IR & 0xc) === 8) {
    // nybble2: 8:register/statusflag
    if (IR & 0x10) {
      if (IR === 0x98) {
        C64.CPU.A = C64.CPU.Y;
        setNZbyA(C64);
      } // TYA
      else {
        // CLC/SEC/CLI/SEI/CLV/CLD/SED
        if (FlagSwitches[IR >> 5]! & 0x20) C64.CPU.ST |= FlagSwitches[IR >> 5]! & 0xdf;
        else C64.CPU.ST &= ~(FlagSwitches[IR >> 5]! & 0xdf);
      }
    } else {
      switch ((IR & 0xf0) >> 5) {
        case 0:
          push(C64, C64.CPU.ST);
          C64.CPU.Cycles = 3;
          break; // PHP
        case 1:
          C64.CPU.ST = pop(C64);
          C64.CPU.Cycles = 4;
          break; // PLP
        case 2:
          push(C64, C64.CPU.A);
          C64.CPU.Cycles = 3;
          break; // PHA
        case 3:
          C64.CPU.A = pop(C64);
          setNZbyA(C64);
          C64.CPU.Cycles = 4;
          break; // PLA
        case 4:
          C64.CPU.Y = (C64.CPU.Y - 1) & 0xff;
          setNZbyY(C64);
          break; // DEY
        case 5:
          C64.CPU.Y = C64.CPU.A;
          setNZbyY(C64);
          break; // TAY
        case 6:
          C64.CPU.Y = (C64.CPU.Y + 1) & 0xff;
          setNZbyY(C64);
          break; // INY
        case 7:
          C64.CPU.X = (C64.CPU.X + 1) & 0xff;
          setNZbyX(C64);
          break; // INX
      }
    }
  } else {
    // nybble2: 0: control/branch/Y/compare  4: Y/compare  C:Y/compare/JMP
    if ((IR & 0x1f) === 0x10) {
      // BPL/BMI/BVC/BVS/BCC/BCS/BNE/BEQ  relative branch
      ++C64.CPU.PC;
      T = rd(C64, C64.CPU.PC);
      if (T & 0x80) T -= 0x100;
      if (IR & 0x20) {
        if (C64.CPU.ST & BranchFlags[IR >> 6]!) {
          C64.CPU.PC += T;
          C64.CPU.Cycles = 3;
        }
      } else {
        if (!(C64.CPU.ST & BranchFlags[IR >> 6]!)) {
          C64.CPU.PC += T;
          C64.CPU.Cycles = 3;
        } // plus 1 cycle if page is crossed?
      }
    } else {
      // nybble2: 0:Y/control/Y/compare  4:Y/compare  C:Y/compare/JMP
      switch (IR & 0x1f) {
        // Addressing modes
        case 0:
          addrModeImmediate(C64);
          break; // imm. (or abs.low for JSR/BRK)
        case 4:
          addrModeZeropage(C64);
          break;
        case 0xc:
          addrModeAbsolute(C64);
          break;
        case 0x14:
          addrModeZeropageXindexed(C64);
          break; // zp,x
        case 0x1c:
          addrModeXindexed(C64);
          break; // abs,x
      }
      C64.CPU.Addr &= 0xffff;

      switch ((IR & 0xe0) >> 5) {
        case 0:
          if (!(IR & 4)) {
            // BRK / NOP-absolute/abs,x/zp/zp,x
            push(C64, (C64.CPU.PC + 2 - 1) >> 8);
            push(C64, (C64.CPU.PC + 2 - 1) & 0xff);
            push(C64, C64.CPU.ST | B);
            C64.CPU.ST |= I; // BRK
            C64.CPU.PC = rd(C64, 0xfffe) + (rd(C64, 0xffff) << 8) - 1;
            C64.CPU.Cycles = 7;
          } else if (IR === 0x1c) C64.CPU.Cycles -= C64.CPU.SamePage; // NOP abs,x
          break;

        case 1:
          if (IR & 0xf) {
            // BIT / NOP-abs,x/zp,x
            if (!(IR & 0x10)) {
              C64.CPU.ST &= 0x3d;
              C64.CPU.ST |= (rd(C64, C64.CPU.Addr) & 0xc0) | ((C64.CPU.A & rd(C64, C64.CPU.Addr) ? 0 : 1) << 1);
            } // BIT
            else if (IR === 0x3c) C64.CPU.Cycles -= C64.CPU.SamePage; // NOP abs,x
          } else {
            // JSR
            push(C64, (C64.CPU.PC + 2 - 1) >> 8);
            push(C64, (C64.CPU.PC + 2 - 1) & 0xff);
            C64.CPU.PC = rd(C64, C64.CPU.Addr) + rd(C64, C64.CPU.Addr + 1) * 256 - 1;
            C64.CPU.Cycles = 6;
          }
          break;

        case 2:
          if (IR & 0xf) {
            // JMP / NOP-abs,x/zp/zp,x
            if (IR === 0x4c) {
              // JMP
              C64.CPU.PC =
                C64.RealSIDmode && C64.NMI && (PrevPC === 0xdc02 || PrevPC === 0xdc04)
                  ? (0x800 + (C64.CPU.Addr & 0xff)) - 1 // Workaround: Hi_Fi_Sky.sid/WonderLand-XII/Hunters_Moon/File_Deleted/Storebror.sid and the like needs cycle/subcycle-exact emulation to work well. This value is OK (though jittery) for most tunes (as WebSID proved).
                  : C64.CPU.Addr - 1;
              C64.CPU.Cycles = 3;
              rd(C64, C64.CPU.Addr + 1); // a read from jump-address highbyte to acknowledge CIA-IRQ is used in some tunes with 'jmp DC0C' or 'jmp DD0C' (e.g. Wonderland_XIII_tune_1.sid or Hi_Fi_Sky.sid)
              // if (C64.CPU.Addr==PrevPC) {storeReg(); C64.Returned=1; return 0xFF;} //turn self-jump mainloop (after init) into idle time
            } else if (IR === 0x5c) C64.CPU.Cycles -= C64.CPU.SamePage; // NOP abs,x
          } else {
            // RTI
            C64.CPU.ST = pop(C64);
            T = pop(C64);
            C64.CPU.PC = ((pop(C64) << 8) + T - 1) >>> 0;
            C64.CPU.Cycles = 6;
            if (C64.Returned && C64.CPU.SP >= 0xff) {
              ++C64.CPU.PC;
              return 0xfe;
            }
          }
          break;

        case 3:
          if (IR & 0xf) {
            // JMP() (indirect) / NOP-abs,x/zp/zp,x
            if (IR === 0x6c) {
              // JMP() (indirect)
              C64.CPU.PC = rd(C64, (C64.CPU.Addr & 0xff00) + ((C64.CPU.Addr + 1) & 0xff)); // (with highbyte-wraparound bug)
              C64.CPU.PC = ((C64.CPU.PC << 8) + rd(C64, C64.CPU.Addr) - 1) >>> 0;
              C64.CPU.Cycles = 5;
            } else if (IR === 0x7c) C64.CPU.Cycles -= C64.CPU.SamePage; // NOP abs,x
          } else {
            // RTS
            if (C64.CPU.SP >= 0xff) {
              /*storeReg();*/
              C64.Returned = 1;
              return 0xff; // Init returns, provide idle-time between IRQs
            }
            T = pop(C64);
            C64.CPU.PC = (pop(C64) << 8) + T;
            C64.CPU.Cycles = 6;
          }
          break;

        case 4:
          if (IR & 4) {
            wr2(C64, C64.CPU.Addr, C64.CPU.Y);
          } // STY / NOP #imm
          break;

        case 5:
          C64.CPU.Y = rd(C64, C64.CPU.Addr) & 0xff;
          setNZbyY(C64);
          C64.CPU.Cycles -= C64.CPU.SamePage; // LDY
          break;

        case 6:
          if (!(IR & 0x10)) {
            // CPY / NOP abs,x/zp,x
            T = C64.CPU.Y - rd(C64, C64.CPU.Addr);
            setNZCbySub(C64, T); // CPY
          } else if (IR === 0xdc) C64.CPU.Cycles -= C64.CPU.SamePage; // NOP abs,x
          break;

        case 7:
          if (!(IR & 0x10)) {
            // CPX / NOP abs,x/zp,x
            T = C64.CPU.X - rd(C64, C64.CPU.Addr);
            setNZCbySub(C64, T); // CPX
          } else if (IR === 0xfc) C64.CPU.Cycles -= C64.CPU.SamePage; // NOP abs,x
          break;
      }
    }
  }

  ++C64.CPU.PC; // PC&=0xFFFF;

  // storeReg();

  if (!C64.RealSIDmode) {
    // substitute KERNAL IRQ-return in PSID (e.g. Microprose Soccer)
    if ((C64.RAMbank[1]! & 3) > 1 && PrevPC < 0xe000 && (C64.CPU.PC === 0xea31 || C64.CPU.PC === 0xea81 || C64.CPU.PC === 0xea7e)) {
      return 0xfe;
    }
  }

  return C64.CPU.Cycles;
}

// ---------------------------------------------------------------------------
// cRSID_handleCPUinterrupts (CPU.c:466-495)
// ---------------------------------------------------------------------------

/** handle entering into IRQ and NMI interrupt (CPU.c:466-495). */
export function cRSID_handleCPUinterrupts(C64: CRC64instance): number {
  if (C64.NMI > C64.CPU.PrevNMI) {
    // if IRQ and NMI at the same time, NMI is serviced first (or is it?!)
    // C64.CPU.ST &= ~B;
    push(C64, C64.CPU.PC >> 8);
    push(C64, C64.CPU.PC & 0xff);
    push(C64, C64.CPU.ST);
    C64.CPU.ST |= I;
    C64.CPU.PC = cRSID_readMemPtr(C64, 0xfffa) + (cRSID_readMemPtr(C64, 0xfffb) << 8); // NMI-vector
    C64.CPU.PrevNMI = C64.NMI;
    return 1;
  } else if (C64.IRQ && !(C64.CPU.ST & I)) {
    // C64.CPU.ST &= ~B;
    push(C64, C64.CPU.PC >> 8);
    push(C64, C64.CPU.PC & 0xff);
    push(C64, C64.CPU.ST);
    C64.CPU.ST |= I;
    C64.CPU.PC = cRSID_readMemPtr(C64, 0xfffe) + (cRSID_readMemPtr(C64, 0xffff) << 8); // maskable IRQ-vector
    C64.CPU.PrevNMI = C64.NMI;
    return 1;
  }
  C64.CPU.PrevNMI = C64.NMI; // prepare for NMI edge-detection

  return 0;
}
