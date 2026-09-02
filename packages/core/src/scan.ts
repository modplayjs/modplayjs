// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/scan.c.
// Sequence scanner. Verbatim port of reference/libxmp/src/scan.c:
// scan_module (:46-665), compare_vblank_scan (:672-706), and
// libxmp_scan_sequences (:733-820). The flow handlers delegate to the
// shared flow.c ports in ./flow.ts (the C scanner passes the same
// flow_control struct the player uses).
//
// Timing effects covered for the big-four scope plus the non-CORE_PLAYER
// extras the plan requires: FX_SPEED (both slots), FX_SPEED_CP, FX_ICE_SPEED
// (ST2.6 st26_speed), FX_FAR_TEMPO/FX_FAR_F_TEMPO (far_extras translate),
// FX_ULT_TEMPO, FX_S3M_SPEED, FX_S3M_BPM, FX_IT_BPM (slide forms),
// FX_IT_ROWDELAY (scan_cnt MIN clamp), FX_IT_BREAK, FX_JUMP, FX_BREAK,
// FX_LINE_JUMP, EX_PATTERN_LOOP, EX_PATT_DELAY (ST3 pdelay gate),
// FX_PATT_DELAY (OctaMED accumulate), FX_GLOBALVOL, FX_GVOL_SLIDE
// (FINEFX/VSALL/gvol_memory).

import { FlowFlag, Quirk } from './model/constants';
import type { ModuleData, FlowState, Event } from './model/model';
import * as FX from './model/fx';
import {
  processPatternLoop,
  processPatternJump,
  processPatternBreak,
  processLineJump,
} from './flow';

const XMP_MARK_END = 0xff;
const XMP_MIN_BPM = 0x20;
const NO_SEQUENCE = 255;
const MAX_SEQUENCES = 255;
/** VBLANK_TIME_THRESHOLD (scan.c:40): 8 minutes. */
const VBLANK_TIME_THRESHOLD = 480000.0;

const MSN = (v: number) => (v >> 4) & 0x0f;
const LSN = (v: number) => v & 0x0f;

/** Per-order scan info (struct ord_data fields the scan fills). */
export interface OrdInfo {
  time: number;
  speed: number;
  bpm: number;
  gvl: number;
  start_row: number;
}

/** struct scan_data (common.h:486-490). */
export interface ScanData {
  time: number;
  ord: number;
  row: number;
  num: number;
}

export interface ScanResult {
  /** Per-order info (m.xxo_info). */
  xxo_info: OrdInfo[];
  /** sequence_control[ord] = sequence id or NO_SEQUENCE. */
  sequence_control: number[];
  /** Number of sequences found (m.num_sequences). */
  num_sequences: number;
  /** Per-sequence scan results (p.scan[chain]). */
  scan: ScanData[];
  /** Entry points per sequence (m.seq_data[i].entry_point). */
  entry_points: number[];
}

/**
 * scan_module flow state: the C code reuses struct flow_control. We build
 * a minimal FlowState-compatible object for the shared flow.ts handlers.
 */
function makeScanFlow(chn: number): FlowState {
  return {
    pbreak: 0,
    jump: -1,
    delay: 0,
    jumpline: 0,
    loop_dest: -1,
    loop_param: -1,
    loop_start: -1,
    loop_count: 0,
    loop_active_num: 0,
    loop: Array.from({ length: chn }, () => ({ start: 0, count: 0 })),
    num_rows: 0,
    end_point: 0,
    rowdelay: 0,
    rowdelay_set: 0,
    force_reposition: 0,
  };
}

/**
 * libxmp_far_translate_tempo (far_extras.c:81-146). Returns false when the
 * translation is invalid (caller skips the tempo update, like C's == 0 test).
 */
const FAR_OLD_TEMPO_MULT = 1 << 2; // far_extras.c:31
const farTempos = [256, 128, 64, 42, 32, 25, 21, 18, 16, 14, 12, 11, 10, 9, 9, 8];

function farTranslateTempo(
  mode: number,
  fineChange: number,
  coarse: number,
  fine: { v: number },
): { speed: number; bpm: number } | null {
  if (coarse < 0 || coarse > 15 || mode < 0 || mode > 1) return null;

  // Compatibility for FAR's broken fine tempo "clamping".
  if (fineChange < 0 && farTempos[coarse]! + fine.v <= 0) {
    fine.v = 0;
  } else if (fineChange > 0 && farTempos[coarse]! + fine.v >= 100) {
    fine.v = 100;
  }

  let speed: number;
  let bpm: number;
  if (mode === 1) {
    // "New" FAR tempo.
    const tempo = farTempos[coarse]! + fine.v;
    if (tempo === 0) return null;

    let divisor = Math.trunc(1197255 / tempo);
    speed = 0;
    while (divisor > 0xffff) {
      divisor >>= 1;
      speed++;
    }
    if (speed >= 2) speed++;
    speed += 3;
    // Extra tick: FAR checks the tick count before decrementing.
    speed++;
    bpm = Math.trunc(1197255 / divisor);
  } else {
    // "Old" FAR tempo.
    speed = 4 * FAR_OLD_TEMPO_MULT;
    bpm = (farTempos[coarse]! + fine.v * 2) * FAR_OLD_TEMPO_MULT;
  }

  if (bpm < XMP_MIN_BPM) bpm = XMP_MIN_BPM;
  return { speed, bpm };
}

export class Scanner {
  private mod!: ModuleData;
  /** scan_cnt[ord][row] (m.scan_cnt). */
  private scanCnt: Uint8Array[] = [];
  /** p.sequence_control. */
  private seqCtrl: Uint8Array = new Uint8Array(0);

  /**
   * libxmp_scan_sequences (scan.c:733-820). Scans chain 0 from order 0,
   * then discovers further sequences from unvisited orders.
   */
  scan(mod: ModuleData): ScanResult {
    this.mod = mod;
    const len = mod.len;
    const info: OrdInfo[] = [];
    for (let i = 0; i < len; i++) {
      info.push({ time: -1, speed: 0, bpm: 0, gvl: -1, start_row: 0 });
    }
    this.seqCtrl = new Uint8Array(len).fill(NO_SEQUENCE);
    this.scanCnt = [];
    for (let i = 0; i < len; i++) {
      const pat = mod.xxo[i] ?? 0;
      const rows =
        pat >= mod.pat ? 1 : (mod.patterns[pat]?.rows || 1);
      this.scanCnt.push(new Uint8Array(rows));
    }

    const scan: ScanData[] = [];
    const entryPoints: number[] = [];

    // p->scan[0].time = scan_module(ctx, ep=0, chain=0) (scan.c:753-754).
    let ep = 0;
    entryPoints[0] = 0;
    scan[0] = { time: this.scanModule(0, 0, info), ord: 0, row: 0, num: 0 };
    let seq = 1;

    // Non-CORE_PLAYER compare_vblank_scan backup (scan.c:757-762): compute
    // the other timing mode for long MODs and keep the shorter time.
    if (
      mod.compare_vblank === true &&
      !(mod.quirks & Quirk.NOBPM) &&
      scan[0]!.time >= VBLANK_TIME_THRESHOLD
    ) {
      const scanBackup = { ...scan[0]! };
      const infoBackup = info.map((o) => ({ ...o }));
      const ctrlBackup = new Uint8Array(this.seqCtrl);
      const quirkBackup = mod.quirks;

      // reset_scan_data + flip NOBPM.
      for (const o of info) o.time = -1;
      this.seqCtrl.fill(NO_SEQUENCE);
      mod.quirks ^= Quirk.NOBPM;
      scan[0] = { time: this.scanModule(0, 0, info), ord: 0, row: 0, num: 0 };

      if (scan[0]!.time >= scanBackup.time) {
        // Keep the first result.
        mod.quirks = quirkBackup;
        scan[0] = scanBackup;
        for (let i = 0; i < info.length; i++) info[i] = infoBackup[i]!;
        this.seqCtrl.set(ctrlBackup);
      }
    }

    if (scan[0]!.time < 0) {
      throw new Error('scan was not able to find any valid orders');
    }

    // Discover remaining sequences (scan.c:766-786).
    while (true) {
      let firstUnvisited = -1;
      for (let i = 0; i < len; i++) {
        if (this.seqCtrl[i] === NO_SEQUENCE) {
          firstUnvisited = i;
          break;
        }
      }
      if (firstUnvisited >= 0 && seq < MAX_SEQUENCES) {
        ep = firstUnvisited;
        entryPoints[seq] = ep;
        const t = this.scanModule(ep, seq, info);
        if (t > 0) {
          scan[seq] = { time: t, ord: 0, row: 0, num: 0 };
          seq++;
        }
      } else {
        break;
      }
    }

    // Correct zero-length temporary sequences (scan.c:807-813).
    for (let i = 0; i < len; i++) {
      if ((this.seqCtrl[i] ?? 0) >= seq) {
        this.seqCtrl[i] = i > 0 ? this.seqCtrl[i - 1]! : 0;
      }
    }

    // scan_module fills p.scan[chain] via end_module; we re-collect those
    // results by re-running scan per chain? No — scanModule stores results
    // in this.pendingScan indexed by chain; copy them out.
    for (let i = 0; i < seq; i++) {
      const pend = this.pendingScan[i];
      if (pend) scan[i] = pend;
    }
    this.pendingScan.length = 0;

    return {
      xxo_info: info,
      sequence_control: Array.from(this.seqCtrl),
      num_sequences: seq,
      scan,
      entry_points: entryPoints,
    };
  }

  /** end_module results per chain (p.scan[chain] written by scan_module). */
  private pendingScan: ScanData[] = [];

  /**
   * scan_module (scan.c:46-665). Returns the sequence duration in ms and
   * records the end point (ord/row/num) into pendingScan[chain].
   */
  private scanModule(ep: number, chain: number, info: OrdInfo[]): number {
    const mod = this.mod;
    const quirk = mod.quirks;
    const hasMarker = (quirk & Quirk.MARKER) !== 0;
    const flowModes = mod.flowMode;
    const hasFineFx = (quirk & Quirk.FINEFX) !== 0;
    const vsall = (quirk & Quirk.VSALL) !== 0;
    const nobpm = (quirk & Quirk.NOBPM) !== 0;
    const isSt3 = mod.readEventType === 2 /* READ_EVENT_ST3 */;
    if (mod.len === 0) return 0;

    // Re-zero scan counts on every scan_module call (scan.c:84-88) —
    // compare_vblank_scan and later chains must not see stale counts.
    for (let i = 0; i < mod.len; i++) {
      const pat = mod.xxo[i] ?? 0;
      const rows =
        pat >= mod.pat ? 1 : mod.patterns[pat]?.rows || 1;
      this.scanCnt[i] = new Uint8Array(rows);
    }

    // row_limit (scan.c:74): 1024 (MED 3200 unused for big-four).
    const rowLimit = 1024;

    const f = makeScanFlow(mod.chn);
    f.loop_dest = -1;
    f.loop_param = -1;
    f.loop_start = -1;
    f.loop_count = 0;
    f.loop_active_num = 0;
    f.jump = -1;
    f.jumpline = 0;

    let gvl = mod.gvol;
    let bpm = mod.bpm;
    let speed = mod.speed;
    const baseTime = mod.rrate;
    const timeFactor = mod.time_factor;
    let st26Speed = 0;
    let farTempoCoarse = 4;
    let farTempoFine = 0;
    let farTempoMode = 1;

    const hasMarkerQ = hasMarker;

    let ord = ep - 1;
    let gvolMemory = 0;
    let rowCount = 0, rowCountTotal = 0, frameCount = 0;
    let ordersSinceLastValid = 0, anyValid = 0;
    let time = 0, startTime = 0;
    let insideLoop = 0;
    let pdelay = 0;
    const tracks: (Event[] | undefined)[] = [];

    // Tracks the row/last_row state after the row loop for end_module.
    let row = 0;

    endModule: while (true) {
      // Sanity check (scan.c:152-157).
      if (ordersSinceLastValid > 512) break;

      ordersSinceLastValid++;

      if (++ord >= mod.len) {
        if (mod.restart > mod.len || (mod.xxo[mod.restart] ?? 0) >= mod.pat) {
          ord = ep;
        } else {
          if ((this.seqCtrl[mod.restart] ?? NO_SEQUENCE) === chain) {
            ord = mod.restart;
          } else {
            ord = ep;
          }
        }

        const pat = mod.xxo[ord] ?? 0;
        if (hasMarkerQ && pat === XMP_MARK_END) break;
      }

      let pat = mod.xxo[ord] ?? 0;
      const oi = info[ord]!;

      // Allow more complex order reuse only in main sequence (scan.c:180-198).
      if (ep !== 0 && this.seqCtrl[ord] !== NO_SEQUENCE) {
        if (pat >= mod.pat) {
          if (hasMarkerQ && pat === XMP_MARK_END) {
            ord = mod.len;
          }
          continue;
        }
        break;
      }
      this.seqCtrl[ord] = chain;

      // All invalid patterns skipped, only S3M_END aborts replay.
      if (pat >= mod.pat) {
        if (hasMarkerQ && pat === XMP_MARK_END) {
          ord = mod.len;
        }
        continue;
      }

      const pattern = mod.patterns[pat]!;
      if (!pattern) continue;

      if (f.jumpline >= pattern.rows) {
        f.jumpline = 0;
      }

      // Changing patterns may reset loop vars.
      if ((flowModes & FlowFlag.LOOP_PATTERN_RESET) !== 0) {
        f.loop_start = -1;
        f.loop_count = 0;
        for (let i = 0; i < mod.chn; i++) {
          f.loop[i]!.start = 0;
          f.loop[i]!.count = 0;
        }
      }

      // Loops can cross pattern boundaries (scan.c:220-223).
      if ((this.scanCnt[ord]?.[f.jumpline] ?? 0) !== 0 && !insideLoop) {
        break;
      }

      // Only update pattern information if we weren't here before.
      if (oi.time < 0) {
        oi.gvl = gvl;
        oi.bpm = bpm;
        oi.speed = speed;
        oi.time = time + timeFactor * frameCount * baseTime / bpm;
        oi.start_row = f.jumpline;
      }

      if (oi.start_row === 0 && ord !== 0) {
        if (ord === ep) {
          startTime = time + timeFactor * frameCount * baseTime / bpm;
        }
      }

      // Get tracks in advance (scan.c:236-239).
      for (let chn = 0; chn < mod.chn; chn++) {
        tracks[chn] = pattern.tracks[chn]?.event;
      }

      const lastRow = pattern.rows;
      for (
        row = f.jumpline, f.jumpline = 0;
        row < lastRow;
        row++, rowCount++, rowCountTotal++
      ) {
        // Prevent crashes from large softmixer frames (scan.c:245-247).
        if (bpm < XMP_MIN_BPM) {
          bpm = XMP_MIN_BPM;
        }

        if (rowCountTotal > rowLimit) {
          break endModule;
        }

        if (f.loop_active_num === 0 && (this.scanCnt[ord]?.[row] ?? 0) !== 0) {
          rowCount--;
          break endModule;
        }
        this.scanCnt[ord]![row] = (this.scanCnt[ord]![row] ?? 0) + 1;
        ordersSinceLastValid = 0;
        anyValid = 1;

        // If the scan count overflows (uint8), break (scan.c:256-259).
        if ((this.scanCnt[ord]![row] ?? 0) === 0) {
          break endModule;
        }

        pdelay = 0;

        for (let chn = 0; chn < mod.chn; chn++) {
          const evs = tracks[chn];
          if (!evs || row >= evs.length) continue;
          const event = evs[row]!;
          const f1 = event.fxt, p1 = event.fxp;
          const f2 = event.f2t, p2 = event.f2p;

          if (f1 === 0 && f2 === 0) continue;

          if (f1 === FX.FX_GLOBALVOL || f2 === FX.FX_GLOBALVOL) {
            gvl = f1 === FX.FX_GLOBALVOL ? p1 : p2;
            gvl = gvl > mod.gvolbase ? mod.gvolbase : gvl < 0 ? 0 : gvl;
          }

          // Fine global volume slide (scan.c:302-334).
          if (f1 === FX.FX_GVOL_SLIDE || f2 === FX.FX_GVOL_SLIDE) {
            let parm = f1 === FX.FX_GVOL_SLIDE ? p1 : p2;
            for (;;) {
              if (parm) {
                gvolMemory = parm;
                const h = MSN(parm);
                const l = LSN(parm);
                if (hasFineFx) {
                  if (l === 0xf && h !== 0) {
                    gvl += h;
                  } else if (h === 0xf && l !== 0) {
                    gvl -= l;
                  } else {
                    gvl += (h - l) * (vsall ? speed : speed - 1);
                  }
                } else {
                  gvl += (h - l) * (vsall ? speed : speed - 1);
                }
                break;
              } else {
                if ((parm = gvolMemory) !== 0) continue;
                break;
              }
            }
          }

          // Two FX_SPEED effects, slot 2 first (scan.c:338-353).
          for (let i = 0; i < 2; i++) {
            const parm = i === 0 ? p2 : p1;
            if ((i === 0 ? f2 : f1) !== FX.FX_SPEED || parm === 0) continue;
            frameCount += rowCount * speed;
            rowCount = 0;
            if (nobpm || parm < 0x20) {
              speed = parm;
              st26Speed = 0;
            } else {
              time += timeFactor * frameCount * baseTime / bpm;
              frameCount = 0;
              bpm = parm;
            }
          }

          // FX_SPEED_CP → FX_S3M_SPEED (scan.c:356-361).
          let cf1 = f1, cp1 = p1;
          let cf2 = f2, cp2 = p2;
          if (cf1 === FX.FX_SPEED_CP) cf1 = FX.FX_S3M_SPEED;
          if (cf2 === FX.FX_SPEED_CP) cf2 = FX.FX_S3M_SPEED;

          // ST2.6 speed (scan.c:364-372).
          if (cf1 === FX.FX_ICE_SPEED && cp1) {
            if (LSN(cp1)) {
              st26Speed = (MSN(cp1) << 8) | LSN(cp1);
            } else {
              st26Speed = MSN(cp1);
            }
          }

          // FAR tempo (scan.c:375-412).
          if (cf1 === FX.FX_FAR_TEMPO || cf1 === FX.FX_FAR_F_TEMPO) {
            let fineChange = 0;
            if (cf1 === FX.FX_FAR_TEMPO) {
              if (MSN(cp1)) {
                farTempoMode = MSN(cp1) - 1;
              } else {
                farTempoCoarse = LSN(cp1);
              }
            }
            if (cf1 === FX.FX_FAR_F_TEMPO) {
              if (MSN(cp1)) {
                farTempoFine += MSN(cp1);
                fineChange = MSN(cp1);
              } else if (LSN(cp1)) {
                farTempoFine -= LSN(cp1);
                fineChange = -LSN(cp1);
              } else {
                farTempoFine = 0;
              }
            }
            const r = farTranslateTempo(
              farTempoMode,
              fineChange,
              farTempoCoarse,
              { get v() { return farTempoFine; }, set v(x) { farTempoFine = x; } } as { v: number },
            );
            if (r) {
              frameCount += rowCount * speed;
              rowCount = 0;
              time += timeFactor * frameCount * baseTime / bpm;
              frameCount = 0;
              speed = r.speed;
              bpm = r.bpm;
            }
          }

          // ULT tempo (scan.c:415-448).
          if (cf1 === FX.FX_ULT_TEMPO || cf2 === FX.FX_ULT_TEMPO) {
            let parm2 = 0;
            let parm = 0;
            if (cf2 === FX.FX_ULT_TEMPO) {
              if (cp2 === 0) {
                parm = 6;
                parm2 = 125;
              } else if (cp2 < 0x30) {
                parm = cp2;
              } else {
                parm2 = cp2;
              }
            }
            if (cf1 === FX.FX_ULT_TEMPO) {
              if (cp1 === 0) {
                parm = 6;
                parm2 = 125;
              } else if (cp1 < 0x30) {
                parm = cp1;
              } else {
                parm2 = cp1;
              }
            }
            frameCount += rowCount * speed;
            rowCount = 0;
            if (parm > 0) {
              speed = parm;
              st26Speed = 0;
            }
            if (parm2 > 0) {
              time += timeFactor * frameCount * baseTime / bpm;
              frameCount = 0;
              bpm = parm2;
            }
          }

          // S3M speed (scan.c:451-462).
          if ((cf1 === FX.FX_S3M_SPEED && cp1) || (cf2 === FX.FX_S3M_SPEED && cp2)) {
            const parm = cf1 === FX.FX_S3M_SPEED ? cp1 : cp2;
            if (parm > 0) {
              frameCount += rowCount * speed;
              rowCount = 0;
              speed = parm;
              st26Speed = 0;
            }
          }

          // S3M BPM (scan.c:464-474).
          if ((cf1 === FX.FX_S3M_BPM && cp1) || (cf2 === FX.FX_S3M_BPM && cp2)) {
            const parm = cf1 === FX.FX_S3M_BPM ? cp1 : cp2;
            if (parm >= XMP_MIN_BPM) {
              frameCount += rowCount * speed;
              rowCount = 0;
              time += timeFactor * frameCount * baseTime / bpm;
              frameCount = 0;
              bpm = parm;
            }
          }

          // IT BPM (scan.c:476-513).
          if ((cf1 === FX.FX_IT_BPM && cp1) || (cf2 === FX.FX_IT_BPM && cp2)) {
            const parm = cf1 === FX.FX_IT_BPM ? cp1 : cp2;
            frameCount += rowCount * speed;
            rowCount = 0;
            time += timeFactor * frameCount * baseTime / bpm;
            frameCount = 0;

            if (MSN(parm) === 0) {
              time += timeFactor * baseTime / bpm;
              for (let i = 1; i < speed; i++) {
                bpm -= LSN(parm);
                if (bpm < 0x20) bpm = 0x20;
                time += timeFactor * baseTime / bpm;
              }
              // Remove one row at final bpm.
              time -= timeFactor * speed * baseTime / bpm;
            } else if (MSN(parm) === 1) {
              time += timeFactor * baseTime / bpm;
              for (let i = 1; i < speed; i++) {
                bpm += LSN(parm);
                if (bpm > 0xff) bpm = 0xff;
                time += timeFactor * baseTime / bpm;
              }
              time -= timeFactor * speed * baseTime / bpm;
            } else {
              bpm = parm;
            }
          }

          // IT row delay (scan.c:515-519).
          if (cf1 === FX.FX_IT_ROWDELAY) {
            const x = (this.scanCnt[ord]![row] ?? 0) + (cp1 & 0x0f);
            this.scanCnt[ord]![row] = Math.min(x, 255);
            frameCount += (cp1 & 0x0f) * speed;
          }

          // IT pattern break (scan.c:521-525).
          if (cf1 === FX.FX_IT_BREAK || cf2 === FX.FX_IT_BREAK) {
            const parm = cf1 === FX.FX_IT_BREAK ? cp1 : cp2;
            processPatternBreak(mod, f, parm);
          }

          // Pattern jump (scan.c:527-537).
          if (cf1 === FX.FX_JUMP || cf2 === FX.FX_JUMP) {
            processPatternJump(mod, f, cf1 === FX.FX_JUMP ? cp1 : cp2);
            if (f.pbreak) {
              // prevent infinite loop, see OpenMPT PatLoop-Various.xm
              insideLoop = 0;
            }
          }

          // Pattern break (scan.c:539-544).
          if (cf1 === FX.FX_BREAK || cf2 === FX.FX_BREAK) {
            const parm = cf1 === FX.FX_BREAK ? cp1 : cp2;
            processPatternBreak(mod, f, 10 * MSN(parm) + LSN(parm));
          }

          // Archimedes line jump (scan.c:546-550).
          if (cf1 === FX.FX_LINE_JUMP || cf2 === FX.FX_LINE_JUMP) {
            processLineJump(mod, f, ord, cf1 === FX.FX_LINE_JUMP ? cp1 : cp2);
          }

          // Extended effects (scan.c:552-570).
          if (cf1 === FX.FX_EXTENDED || cf2 === FX.FX_EXTENDED) {
            const parm = cf1 === FX.FX_EXTENDED ? cp1 : cp2;

            if ((parm >> 4) === FX.EX_PATT_DELAY) {
              if (!(isSt3 && pdelay)) {
                pdelay = parm & 0x0f;
              }
            }

            if ((parm >> 4) === FX.EX_PATTERN_LOOP) {
              processPatternLoop(mod, f, chn, row, LSN(parm));
              // Attempt to detect the inside of a loop.
              if (LSN(parm) > 0 && f.loop_dest < 0) {
                insideLoop = 0;
              } else if (LSN(parm) === 0) {
                insideLoop = 1;
              }
            }
          }

          // OctaMED pattern delay (scan.c:572-577).
          if (cf1 === FX.FX_PATT_DELAY) pdelay += cp1;
          if (cf2 === FX.FX_PATT_DELAY) pdelay += cp2;
        }

        if (pdelay > 0) {
          frameCount += pdelay * speed;
        }

        f.loop_param = -1;
        if (f.loop_dest >= 0) {
          // -1: incremented immediately by the loop.
          row = f.loop_dest - 1;
          f.loop_dest = -1;
        }

        if (f.pbreak) {
          f.pbreak = 0;
          row = lastRow; // exits the row loop via row++
          continue;
        }

        if (st26Speed) {
          frameCount += rowCount * speed;
          rowCount = 0;
          if (st26Speed & 0x10000) {
            speed = (st26Speed & 0xff00) >> 8;
          } else {
            speed = st26Speed & 0xff;
          }
          st26Speed ^= 0x10000;
        }
      }

      if (f.jumpline && pdelay) {
        f.jumpline++;
      }

      if (f.jump >= 0) {
        ord = f.jump - 1;
        f.jump = -1;
      }

      frameCount += rowCount * speed;
      rowCountTotal = 0;
      rowCount = 0;
    }

    // scan.c:633 — after the order loop, the row resumes from jumpline
    // (a break-to-row targeting the final pattern).
    row = f.jumpline;

    // end_module (scan.c:609-625).
    if (!anyValid) {
      return -1;
    }
    let endPat = mod.xxo[ord] ?? 0;
    let endRow = row;
    if (endPat >= mod.pat || endRow >= (mod.patterns[endPat]?.rows ?? 0)) {
      endRow = 0;
    }

    const num = this.scanCnt[ord]?.[endRow] ?? 0;
    this.pendingScan[chain] = { time: 0, ord, row: endRow, num };

    time -= startTime;
    frameCount += rowCount * speed;

    return time + timeFactor * frameCount * baseTime / bpm;
  }

  /** libxmp_get_sequence (scan.c:708-713) via the stored control array. */
  getSequence(ord: number): number {
    if (ord < 0 || ord >= this.seqCtrl.length) return NO_SEQUENCE;
    return this.seqCtrl[ord]!;
  }
}

/** Populate ModuleData scan fields after parse (used by Core.loadModule). */
export function applyScanToModule(mod: ModuleData): ScanResult {
  const sc = new Scanner();
  const res = sc.scan(mod);
  mod.num_sequences = res.num_sequences;
  mod.sequences = [];
  for (let i = 0; i < res.num_sequences; i++) {
    mod.sequences.push({
      ord: i,
      entry_point: res.entry_points[i] ?? 0,
      duration: Math.max(0, Math.min(res.scan[i]?.time ?? 0, 2147483647)),
      time: res.scan[i]?.time ?? 0,
      speed: res.xxo_info[res.entry_points[i] ?? 0]?.speed ?? 0,
      bpm: res.xxo_info[res.entry_points[i] ?? 0]?.bpm ?? 0,
      gvl: res.xxo_info[res.entry_points[i] ?? 0]?.gvl ?? -1,
      start_row: res.xxo_info[res.entry_points[i] ?? 0]?.start_row ?? 0,
    });
  }
  return res;
}
