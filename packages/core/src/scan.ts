// Sequence scanner. Mirrors reference/libxmp/src/scan.c (scan_module +
// libxmp_scan_sequences): walks the order list interpreting only
// timing/flow events to compute per-order info (speed/bpm/gvol/time), the
// sequence map, end point, and replay time.
//
// Ported faithfully for the big-four scope: FX_SPEED, FX_S3M_SPEED,
// FX_S3M_BPM, FX_IT_BPM (incl. slide forms), FX_IT_ROWDELAY, FX_IT_BREAK,
// FX_JUMP, FX_BREAK, EX_PATTERN_LOOP, EX_PATT_DELAY, FX_GLOBALVOL,
// FX_GVOL_SLIDE with FINEFX/VSALL handling.

import { FlowFlag, Quirk } from './model/constants';
import {
  EMPTY_EVENT,
  RowDelay,
  type Event,
  type ModuleData,
  type Sequence,
} from './model/model';
import * as FX from './model/fx';
const XMP_MARK_END = 0xff;
const XMP_MIN_BPM = 0x20;

const MSN = (v: number) => (v >> 4) & 0x0f;
const LSN = (v: number) => v & 0x0f;

/** Scan data per order (mirrors m.xxo_info). */
export interface OrdInfo {
  time: number;
  speed: number;
  bpm: number;
  gvl: number;
  start_row: number;
}

export interface ScanResult {
  /** Per-order info, len entries (only first len meaningful). */
  xxo_info: OrdInfo[];
  /** sequence_control[ord] = sequence id or NO_SEQUENCE. */
  sequence_control: number[];
  /** Number of sequences found. */
  num_sequences: number;
  /** Sequences (entry_point per scan start; time relative to song start). */
  sequences: Sequence[];
  /** Total scan time of sequence 0 in ms (row-duration based). */
  time: number;
}

const NO_SEQUENCE = 255;

/** Per-channel pattern-loop state during scan/playback (struct pattern_loop). */
interface PatternLoop {
  start: number;
  count: number;
}

interface FlowCtl {
  num_rows: number;
  pbreak: number;
  jump: number;
  jumpline: number;
  delay2: number;
  rowdelay: number;
  rowdelay_set: number;
  loop_dest: number;
  loop_param: number;
  loop_start: number;
  loop_count: number;
  loop_active_num: number;
  loop: PatternLoop[];
  loop_last_row: number;
}

function makeFlow(chn: number): FlowCtl {
  const f: FlowCtl = {
    num_rows: 0, pbreak: 0, jump: -1, jumpline: 0, delay2: 0,
    rowdelay: 0, rowdelay_set: 0, loop_dest: -1, loop_param: -1,
    loop_start: -1, loop_count: 0, loop_active_num: 0, loop_last_row: 0,
    loop: [],
  };
  for (let i = 0; i < chn; i++) f.loop.push({ start: 0, count: 0 });
  return f;
}

/**
 * Clone the parts of flow state that scan mutates before delegating to the
 * shared pattern-loop handlers used by the player (libxmp passes the player's
 * f into scan_module).
 */
function copyFlowState(f: FlowCtl): void {
  f.pbreak = 0;
  f.jump = -1;
  f.jumpline = 0;
  f.loop_dest = -1;
  f.loop_param = -1;
}

export class Scanner {
  private mod!: ModuleData;
  /** scan_cnt[ord][row]: visit counts (m.scan_cnt). */
  private scanCnt: Uint8Array[] = [];
  private seqCtrl: Uint8Array = new Uint8Array(0);

  /** Full scan entry point (libxmp_scan_sequences, scan.c:733-800). */
  scan(mod: ModuleData): ScanResult {
    this.mod = mod;
    const len = Math.max(1, mod.len);
    const info: OrdInfo[] = [];
    for (let i = 0; i < len; i++) {
      info.push({ time: -1, speed: 0, bpm: 0, gvl: -1, start_row: 0 });
    }
    this.seqCtrl = new Uint8Array(len).fill(NO_SEQUENCE);
    this.scanCnt = [];
    for (let i = 0; i < len; i++) {
      const pat = mod.xxo[i] ?? 0;
      const rows = pat >= mod.pat ? 1 : (mod.patterns[pat]?.rows || 1);
      this.scanCnt.push(new Uint8Array(rows));
    }

    // Multi-sequence discovery: scan from each unvisited valid order (simple
    // big-four chain semantics: single main sequence, others are orphan loops).
    const sequences: Sequence[] = [];
    let seqId = 0;
    let ord = 0;
    while (ord < len) {
      if (this.seqCtrl[ord] !== NO_SEQUENCE) { ord++; continue; }
      const t = this.scanModule(ord, seqId, info);
      if (t.time < 0) break;
      seqId++;
      // advance to next unscanned
      let nxt = -1;
      for (let j = 0; j < len; j++) {
        if (this.seqCtrl[j] === NO_SEQUENCE) { nxt = j; break; }
      }
      if (nxt < 0) break;
      ord = nxt;
    }

    const out: ScanResult = {
      xxo_info: info,
      sequence_control: Array.from(this.seqCtrl),
      num_sequences: seqId,
      sequences,
      time: 0,
    };

    // Build sequences list from control marks (entry points).
    let curEntry = -1;
    for (let i = 0; i < len; i++) {
      const sc = this.seqCtrl[i]!;
      if (sc !== NO_SEQUENCE && (i === 0 || this.seqCtrl[i - 1] === NO_SEQUENCE)) {
        curEntry = sc;
      }
      if (curEntry >= 0) {
        out.sequences[curEntry] = {
          ord: i,
          entry_point: curEntry,
          duration: info[i]!.time + 1,
          time: info[i]!.time,
          speed: info[i]!.speed,
          bpm: info[i]!.bpm,
          gvl: info[i]!.gvl,
          start_row: info[i]!.start_row,
        };
      }
      if (sc === NO_SEQUENCE && curEntry >= 0) curEntry = -1;
    }
    return out;
  }

  /**
   * Scan one chain starting at ep. Returns final time; mirrors scan_module
   * (scan.c:166-613) including loop-crossing detection and row_limit.
   */
  private scanModule(ep: number, chain: number, info: OrdInfo[]): { time: number } {
    const mod = this.mod;
    const quirk = mod.quirks;
    const hasMarker = (quirk & Quirk.MARKER) !== 0;
    const flowModes = mod.flowMode;
    const hasFineFx = (quirk & Quirk.FINEFX) !== 0;
    const vsall = (quirk & Quirk.VSALL) !== 0;
    const nobpm = (quirk & Quirk.NOBPM) !== 0;
    const isSt3 = mod.readEventType === 2 /* ST3 */;

    if (mod.len === 0) return { time: 0 };

    const rowLimit = 1024;
    const tracks: (Event[] | null)[] = [];
    const f = makeFlow(mod.chn);
    copyFlowState(f);

    let gvl = mod.gvol;
    let bpm = mod.bpm;
    let speed = mod.speed;
    const baseTime = mod.rrate; // PAL_RATE
    const timeFactor = mod.time_factor; // DEFAULT_TIME_FACTOR

    let pdelay = 0;
    let gvolMemory = 0;
    let ord = ep - 1;
    let rowCount = 0, rowCountTotal = 0, frameCount = 0;
    let ordersSinceLastValid = 0, anyValid = 0;
    let time = 0, startTime = 0;
    let insideLoop = 0;

    while (true) {

      if (ordersSinceLastValid > 512) break;
      ordersSinceLastValid++;

      ord++;
      if (ord >= mod.len) {
        if (mod.restart > mod.len || (mod.xxo[mod.restart] ?? 0) >= mod.pat) {
          ord = ep;
        } else if (this.seqCtrl[mod.restart] === chain) {
          ord = mod.restart;
        } else {
          ord = ep;
        }
        const pat = mod.xxo[ord] ?? 0;
        if (hasMarker && pat === XMP_MARK_END) break;
      }

      let pat = mod.xxo[ord] ?? 0;
      const oi = info[ord]!;

      if (ep !== 0 && this.seqCtrl[ord] !== NO_SEQUENCE) {
        if (pat >= mod.pat) {
          if (hasMarker && pat === XMP_MARK_END) ord = mod.len;
          continue;
        }
        break;
      }
      this.seqCtrl[ord] = chain;

      if (pat >= mod.pat) {
        if (hasMarker && pat === XMP_MARK_END) ord = mod.len;
        continue;
      }
      const pattern = mod.patterns[pat];
      if (!pattern) continue;

      if (f.jumpline >= pattern.rows) f.jumpline = 0;

      if ((flowModes & FlowFlag.LOOP_PATTERN_RESET) !== 0) {
        f.loop_start = -1;
        f.loop_count = 0;
        for (let i = 0; i < mod.chn; i++) { f.loop[i]!.start = 0; f.loop[i]!.count = 0; }
      }

      if ((this.scanCnt[ord]?.[f.jumpline] ?? 0) !== 0 && !insideLoop) break;

      if (oi.time < 0) {
        oi.gvl = gvl;
        oi.bpm = bpm;
        oi.speed = speed;
        oi.time = time + timeFactor * frameCount * baseTime / bpm;
        oi.start_row = f.jumpline;
      }

      if (oi.start_row === 0 && ord !== 0 && ord === ep) {
        startTime = time + timeFactor * frameCount * baseTime / bpm;
      }

      for (let chn = 0; chn < mod.chn; chn++) {
        tracks[chn] = pattern.tracks[chn]?.event ?? null;
      }

      let lastRow = pattern.rows;
      let row = f.jumpline;
      f.jumpline = 0;

      for (; row < lastRow; row++, rowCount++, rowCountTotal++) {
        if (bpm < XMP_MIN_BPM) bpm = XMP_MIN_BPM;
        if (rowCountTotal > rowLimit) { anyValid = 1; ord = mod.len; break; }
        if (f.loop_active_num === 0 && (this.scanCnt[ord]?.[row] ?? 0) !== 0) {
          rowCount--;
          lastRow = -1; // goto end_module equivalent
          break;
        }
        const cntArr = this.scanCnt[ord]!;
        if (row >= cntArr.length) {
          // Rows beyond the preallocated count array can only come from
          // jumpline outliving a pattern change; treat as consumed (scan.c
          // sizes scan_cnt from the pattern's own rows, same reach).
          cntArr[row] = 0;
        }
        if ((cntArr[row] ?? 0) === 255) { lastRow = -1; break; }
        cntArr[row] = (cntArr[row] ?? 0) + 1;
        ordersSinceLastValid = 0;
        anyValid = 1;
        pdelay = 0;

        for (let chn = 0; chn < mod.chn; chn++) {
          const evs = tracks[chn];
          if (!evs || row >= evs.length) continue;
          const e = evs[row]!;
          const f1 = e.fxt, p1 = e.fxp, f2 = e.f2t, p2 = e.f2p;
          if (f1 === 0 && f2 === 0) continue;

          if (f1 === FX.FX_GLOBALVOL || f2 === FX.FX_GLOBALVOL) {
            gvl = (f1 === FX.FX_GLOBALVOL ? p1 : p2);
            gvl = gvl > mod.gvolbase ? mod.gvolbase : gvl < 0 ? 0 : gvl;
          }

          if (f1 === FX.FX_GVOL_SLIDE || f2 === FX.FX_GVOL_SLIDE) {
            let parm = f1 === FX.FX_GVOL_SLIDE ? p1 : p2;
            if (parm !== 0) {
              gvolMemory = parm;
              const h = MSN(parm), l = LSN(parm);
              if (hasFineFx) {
                if (l === 0xf && h !== 0) gvl += h;
                else if (h === 0xf && l !== 0) gvl -= l;
                else gvl += (h - l) * (vsall ? speed : speed - 1);
              } else {
                gvl += (h - l) * (vsall ? speed : speed - 1);
              }
            } else if (gvolMemory !== 0) {
              parm = gvolMemory;
              const h = MSN(parm), l = LSN(parm);
              if (l === 0xf && h !== 0) gvl += h;
              else if (h === 0xf && l !== 0) gvl -= l;
              else gvl += (h - l) * (vsall ? speed : speed - 1);
            }
          }

          // Two FX_SPEED slots, slot 2 FIRST (scan.c:347-363)
          for (let i = 1; i >= 0; i--) {
            const parm = i === 1 ? p2 : p1;
            const ff = i === 1 ? f2 : f1;
            if (ff !== FX.FX_SPEED || parm === 0) continue;
            frameCount += rowCount * speed;
            rowCount = 0;
            if (nobpm || parm < 0x20) {
              speed = parm;
            } else {
              time += timeFactor * frameCount * baseTime / bpm;
              frameCount = 0;
              bpm = parm;
            }
          }

          if (f1 === FX.FX_S3M_SPEED && p1) { frameCount += rowCount * speed; rowCount = 0; speed = p1; }
          if (f2 === FX.FX_S3M_SPEED && p2) { frameCount += rowCount * speed; rowCount = 0; speed = p2; }

          if ((f1 === FX.FX_S3M_BPM && p1 >= XMP_MIN_BPM)) {
            frameCount += rowCount * speed; rowCount = 0;
            time += timeFactor * frameCount * baseTime / bpm; frameCount = 0;
            bpm = p1;
          }
          if ((f2 === FX.FX_S3M_BPM && p2 >= XMP_MIN_BPM)) {
            frameCount += rowCount * speed; rowCount = 0;
            time += timeFactor * frameCount * baseTime / bpm; frameCount = 0;
            bpm = p2;
          }

          for (let i = 1; i >= 0; i--) {
            const parm = i === 1 ? p2 : p1;
            const ff = i === 1 ? f2 : f1;
            if (ff !== FX.FX_IT_BPM || parm === 0) continue;
            frameCount += rowCount * speed; rowCount = 0;
            time += timeFactor * frameCount * baseTime / bpm;
            frameCount = 0;
            if (MSN(parm) === 0) {
              time += timeFactor * baseTime / bpm;
              for (let k = 1; k < speed; k++) {
                bpm -= LSN(parm);
                if (bpm < 0x20) bpm = 0x20;
                time += timeFactor * baseTime / bpm;
              }
              time -= timeFactor * speed * baseTime / bpm;
            } else if (MSN(parm) === 1) {
              time += timeFactor * baseTime / bpm;
              for (let k = 1; k < speed; k++) {
                bpm += LSN(parm);
                if (bpm > 0xff) bpm = 0xff;
                time += timeFactor * baseTime / bpm;
              }
              time -= timeFactor * speed * baseTime / bpm;
            } else {
              bpm = parm;
            }
          }

          if (f1 === FX.FX_IT_ROWDELAY) {
            const x = Math.min((this.scanCnt[ord]![row] ?? 0) + (p1 & 0x0f), 255);
            if (this.scanCnt[ord]![row] !== undefined) this.scanCnt[ord]![row] = x;
            frameCount += (p1 & 0x0f) * speed;
          }

          if (f1 === FX.FX_IT_BREAK || f2 === FX.FX_IT_BREAK) {
            const parm = f1 === FX.FX_IT_BREAK ? p1 : p2;
            this.processPatternBreak(f, parm);
          }

          if (f1 === FX.FX_JUMP || f2 === FX.FX_JUMP) {
            this.processPatternJump(f, f1 === FX.FX_JUMP ? p1 : p2);
            if (f.pbreak) insideLoop = 0;
          }

          if (f1 === FX.FX_BREAK || f2 === FX.FX_BREAK) {
            const raw = f1 === FX.FX_BREAK ? p1 : p2;
            this.processPatternBreak(f, 10 * MSN(raw) + LSN(raw));
          }

          if (f1 === FX.FX_EXTENDED || f2 === FX.FX_EXTENDED) {
            const parm = f1 === FX.FX_EXTENDED ? p1 : p2;
            if (MSN(parm) === FX.EX_PATT_DELAY) {
              if (!(isSt3 && pdelay)) pdelay = LSN(parm);
            }
            if (MSN(parm) === FX.EX_PATTERN_LOOP) {
              this.processPatternLoop(f, chn, row, LSN(parm));
              if (LSN(parm) > 0 && f.loop_dest < 0) insideLoop = 0;
              else if (LSN(parm) === 0) insideLoop = 1;
            }
          }
        }

        if (pdelay > 0) frameCount += pdelay * speed;

        f.loop_param = -1;
        if (f.loop_dest >= 0) {
          row = f.loop_dest - 1;
          f.loop_dest = -1;
        }

        if (f.pbreak) {
          f.pbreak = 0;
          lastRow = 0;
          row = lastRow; // loop terminates via row++ → next pattern
          break;
        }
        if (lastRow === -1) break;
      }

      if (f.jumpline !== 0 && pdelay > 0) f.jumpline++;

      if (f.jump >= 0) {
        ord = f.jump - 1;
        f.jump = -1;
      }

      frameCount += rowCount * speed;
      rowCountTotal = 0;
      rowCount = 0;

      if (lastRow === -1) break;
      if (bpm === 0) break;
    }

    if (!anyValid) return { time: -1 };
    // Final time computation (scan.c:608-613)
    time -= startTime;
    frameCount += rowCount * speed;
    return { time: time + timeFactor * frameCount * baseTime / bpm };
  }

  // ---- flow handlers shared with player (flow.c ports live here too) ----

  /** libxmp_process_pattern_break (flow.c:163-181). */
  processPatternBreak(f: FlowCtl, parm: number): void {
    if (f.rowdelay_set & RowDelay.ON && !(this.mod.flowMode & FlowFlag.JUMP_NO_ROW_SET)) {
      // IT/S3M-style break inside row-delay still honors the target row below.
    }
    f.pbreak = 1;
    f.jumpline = parm;
    if (parm === 0 || this.mod.flowMode & FlowFlag.JUMP_NO_ROW_SET) {
      f.jumpline = 0;
    } else {
      // Bxx/Dxx on same row: later effect wins per flow mode flags — handled by caller order.
    }
  }

  /** libxmp_process_pattern_jump (flow.c:139-161). */
  processPatternJump(f: FlowCtl, parm: number): void {
    if (f.jump === -1) f.jump = parm;
    if (!(this.mod.flowMode & FlowFlag.JUMP_NO_ROW_SET)) f.jumpline = 0;
    f.pbreak = 1;
  }

  /** libxmp_process_pattern_loop (flow.c:36-137) — big-four flag-aware core. */
  processPatternLoop(f: FlowCtl, chn: number, row: number, parm: number): void {
    const fm = this.mod.flowMode;
    const loopChn = (fm & FlowFlag.LOOP_GLOBAL_TARGET) !== 0 ? 0 : chn;

    if (parm === 0) {
      // Loop start marker
      if (
        (fm & FlowFlag.LOOP_INIT_SAMEROW) === 0 ||
        f.loop_start === -1
      ) {
        if ((fm & FlowFlag.LOOP_IGNORE_TARGET) === 0 || f.loop_count === 0) {
          f.loop[loopChn]!.start = row;
        }
      }
      if ((fm & FlowFlag.LOOP_FIRST_EFFECT) === 0 || f.loop_active_num === 0) {
        f.loop_active_num++;
      }
      return;
    }

    if (
      (fm & FlowFlag.LOOP_ONE_AT_A_TIME) !== 0 &&
      f.loop_active_num > 0 &&
      f.loop[loopChn]!.count === 0
    ) {
      return;
    }

    if (f.loop[loopChn]!.count !== 0) {
      if ((fm & FlowFlag.LOOP_ONE_AT_A_TIME) !== 0 && f.loop_active_num > 1) {
        return;
      }
      // Re-entering: check first-effect-only modes
      if (
        (fm & FlowFlag.LOOP_FIRST_EFFECT) !== 0 &&
        f.loop_param !== -1
      ) {
        return;
      }
      f.loop_param = chn;
      f.loop_active_num++;
      f.loop_dest = f.loop[loopChn]!.start;
      f.loop[loopChn]!.count--;
      if (f.loop[loopChn]!.count === 0) {
        if ((fm & FlowFlag.LOOP_END_ADVANCES) !== 0) f.loop[loopChn]!.start = row + 1;
      }
      return;
    }

    // Set count when at loop end
    if (
      (fm & FlowFlag.LOOP_END_ADVANCES) === 0 &&
      f.loop[loopChn]!.start <= row
    ) {
      f.loop[loopChn]!.start = row; // refresh start to this row on some formats
      void fm;
    }
    if (f.loop[loopChn]!.start > row && (fm & FlowFlag.LOOP_PATTERN_RESET) !== 0) {
      return;
    }
    const count = parm & 0x0f;
    if (count === 0) return;
    f.loop_param = chn;
    f.loop_active_num++;
    f.loop[loopChn]!.count = count;
    f.loop_dest = f.loop[loopChn]!.start;
    f.loop[loopChn]!.count--;
  }

  /** Expose sequence-control lookup for the player (get_sequence parity). */
  getSequence(ord: number, ctrl: readonly number[]): number {
    if (ord < 0 || ord >= ctrl.length) return NO_SEQUENCE;
    return ctrl[ord]!;
  }

  /** Populate ModuleData.scan-derived fields after parse (called by Core.loadModule). */
  static applyToModule(mod: ModuleData): ScanResult {
    const sc = new Scanner();
    const res = sc.scan(mod);
    mod.num_sequences = res.num_sequences;
    mod.sequences = res.sequences.filter(Boolean);
    return res;
  }
}

// Event scratch use to avoid allocations in hot paths.
const _scratchEvent: Event = { ...EMPTY_EVENT };
void _scratchEvent;
