// Pattern flow processing. Verbatim port of reference/libxmp/src/flow.c:
// libxmp_process_pattern_loop (:35-136), process_pattern_jump (:138-153),
// process_pattern_break (:155-171), process_line_jump (:173-192), and
// libxmp_reset_flow (player.c:1903-1930). These operate on the FlowState in
// model/model.ts, which mirrors struct flow_control.

import { FlowFlag, Quirk } from './model/constants';
import type { ModuleData, FlowState } from './model/model';

/** Reset flow vars; player.c:1903-1930. */
export function resetFlow(f: FlowState): void {
  f.jumpline = 0;
  f.jump = -1;
  f.pbreak = 0;
  f.loop_dest = -1;
  f.loop_param = -1;
  f.loop_start = -1;
  f.loop_count = 0;
  f.loop_active_num = 0;
  f.delay = 0;
  f.rowdelay = 0;
  f.rowdelay_set = 0;
  f.force_reposition = 0;

  for (let i = 0; i < f.loop.length; i++) {
    f.loop[i]!.start = 0;
    f.loop[i]!.count = 0;
  }
}

/**
 * Process a pattern loop effect with the parameter fxp (flow.c:35-136).
 * A parameter of 0 sets the loop target; 1-15 (most formats) performs a loop.
 * LOOP_GLOBAL_TARGET/LOOP_GLOBAL_COUNT redirect the target/count to
 * f.loop_start/f.loop_count (C uses pointers; closures here).
 */
export function processPatternLoop(mod: ModuleData, f: FlowState, chn: number, row: number, fxp: number): void {
  const fm = mod.flowMode;
  let start = refOf(() => f.loop[chn]!.start, (v) => { f.loop[chn]!.start = v; });
  let count = refOf(() => f.loop[chn]!.count, (v) => { f.loop[chn]!.count = v; });

  // Digital Tracker: only the first E60 or E6x is handled per row.
  if ((fm & FlowFlag.LOOP_FIRST_EFFECT) !== 0 && f.loop_param >= 0) return;
  f.loop_param = fxp;

  // Scream Tracker 3, Digital Tracker, Octalyser use global loop targets
  // and/or counts.
  if ((fm & FlowFlag.LOOP_GLOBAL_TARGET) !== 0) start = refOf(() => f.loop_start, (v) => { f.loop_start = v; });
  if ((fm & FlowFlag.LOOP_GLOBAL_COUNT) !== 0) count = refOf(() => f.loop_count, (v) => { f.loop_count = v; });

  if (fxp === 0) {
    // mark start of loop
    if ((fm & FlowFlag.LOOP_IGNORE_TARGET) !== 0 && count.get() >= 1) return;
    start.set(row);
    if ((mod.quirks & Quirk.FT2BUGS) !== 0) f.jumpline = row;
  } else {
    // end of loop
    if (start.get() < 0) {
      // Scream Tracker 3.01b: if SB0 wasn't used, the first SBx used will
      // set the loop target to its row.
      if ((fm & FlowFlag.LOOP_INIT_SAMEROW) !== 0) {
        start.set(row);
      } else {
        start.set(0);
      }
    }

    if (count.get() !== 0) {
      const next = count.get() - 1;
      count.set(next);
      if (next !== 0) {
        f.loop_dest = start.get();
      } else {
        // S3M and IT: loop termination advances the loop target past SBx.
        if ((fm & FlowFlag.LOOP_END_ADVANCES) !== 0) start.set(row + 1);
        // Liquid Tracker cancels any other loop jumps this row started on
        // loop termination.
        if ((fm & FlowFlag.LOOP_END_CANCELS) !== 0) f.loop_dest = -1;
        f.loop_active_num--;
      }
    } else {
      // Modplug Tracker: only begin a loop if no other channel is looping.
      if ((fm & FlowFlag.LOOP_ONE_AT_A_TIME) !== 0) {
        for (let i = 0; i < mod.chn; i++) {
          if (i !== chn && f.loop[i]!.count !== 0) return;
        }
      }
      count.set(fxp);
      f.loop_dest = start.get();
      f.loop_active_num++;
    }
  }

  // Hacks for loop jumps altering prior position jumps/breaks.
  const looped = f.loop_dest >= 0;
  if (looped && f.pbreak !== 0) {
    // Many implementations use the same variable for both the jump/break
    // destination row and the loop destination row.
    if ((fm & FlowFlag.LOOP_SHARED_BREAK) !== 0) {
      f.jumpline = f.loop_dest;
    }
    // Various players e.g. ST3, IT will block prior breaks.
    if ((fm & FlowFlag.LOOP_UNSET_BREAK) !== 0 && f.jump < 0) {
      f.pbreak = 0;
    }
    // Various players e.g. ST3, IT will block prior jumps.
    if ((fm & FlowFlag.LOOP_UNSET_JUMP) !== 0 && f.jump >= 0) {
      f.pbreak = 0;
      f.jump = -1;
    }
  }
}

/** Process a pattern jump effect Bxx (flow.c:138-153). */
export function processPatternJump(mod: ModuleData, f: FlowState, fxp: number): void {
  const fm = mod.flowMode;
  // S3M, Modplug Tracker 1.16: prevent jumps when a loop jump occurs.
  if ((fm & FlowFlag.LOOP_DELAY_JUMP) !== 0 && f.loop_dest >= 0) return;

  f.pbreak = 1;
  f.jump = fxp;
  if ((fm & FlowFlag.JUMP_NO_ROW_SET) === 0) {
    // Effect B resets effect D in lower channels (not ST3/IT/ModPlug).
    f.jumpline = 0;
  }
}

/** Process a pattern break effect Dxx (flow.c:155-171). */
export function processPatternBreak(mod: ModuleData, f: FlowState, fxp: number): void {
  const fm = mod.flowMode;
  // S3M, IT 2.00+, Modplug Tracker 1.16: prevent breaks when a loop occurs.
  if ((fm & FlowFlag.LOOP_DELAY_BREAK) !== 0 && f.loop_dest >= 0) return;

  f.pbreak = 1;
  f.jumpline = fxp;
}

/**
 * Process a line jump within current position `ord` to row `fxp`
 * (flow.c:173-192). Digital Symphony only — kept for completeness.
 */
export function processLineJump(_mod: ModuleData, f: FlowState, ord: number, fxp: number): void {
  if (f.pbreak === 0) {
    f.pbreak = 1;
    f.jump = ord;
  }
  f.jumpline = fxp;
}

interface Ref<T> {
  get(): T;
  set(v: T): void;
}

function refOf<T>(get: () => T, set: (v: T) => void): Ref<T> {
  return { get, set };
}
