# Remaining modplayjs parity failures

Suite: `sh tools/run-mixer-data-tests.sh` — compares against the
committed goldens in `reference/libxmp/test-dev/data/*.data`.

**Current state: 92 passed / 13 failed** (65 fixtures without .data).

## Current failures (13), grouped by symptom

### Loop re-entry pos0 (5 fixtures — likely one root cause)
Sample position resets/drifts when a pattern or bidi loop wraps; C
continues it. `portamento_sustain.it` belongs here too: its reported
period ±5 drift (`3123816 vs 3123821`) is the porta slide seeing a
drifted pos0 at loop re-entry — the golden's period is identical on
every loop pass, ours is not.
- `pattern_loop_it100.it` — 74 mismatches, `row 1 frame 1: pos0 10 vs 0`
- `pattern_loop_it104.it` — 44, `row 5 frame 1: pos0 9 vs 0`
- `pattern_loop_it210.it` — 31, `row 5 frame 1: pos0 9 vs 0`
- `it_sus_after_loop_bidi.it` — 4, `row 2 frame 0: pos0 1772 vs 0`

### Reverse samples (2)
- `reverse_it.it` — 110 mismatches + 17 lines missing (voice freezes;
  the order-1 retrig never fires in ours)
- `reverse_xm.xm` — 51, `row 13: pos0 173 vs 4003` (reverse playback
  position wrong)

### NNA / retrigger / voice pool (4)
- `portamento_nna_sample.it` — 84 mismatches, line delta 1584 (912
  golden vs 2496 ours — we allocate a flood of extra overflow voices)
- `it_multi_retrigger.it` — 7, Qxx volume ramp (`row 5: vol 0 vs 16`)
- `it_sample_porta.it` — 8, tail of row 3 missing in ours (voice cut
  at t=500, golden plays to t=480); passes in direct runs — flaky
  under the suite's parallel load

### Envelope / rounding (fixed this session)
- `it_smooth_macro.it` — fixed (float32 macro accumulation, matching
  C's float fields in player.h:251-253).

### Tremor (1)
- `ft2_tremor_delay.xm` — 13, `row 25 frame 2: vol 0 vs 1024` (tremor
  onset/delay timing)

## Session 3 results (92/13, from 90/15)

Root causes found and fixed:
1. **setPatch NNA rehome** (`3493228`) — C's `alloc_voice`
   (virtual.c:509-517) reuses the channel's voice in place when its
   act is inactive, and only allocs + re-homes the old voice to a free
   overflow channel when it is still active. Ported: `oldActive` gate,
   `vidx = oldVoice` reuse path, `to = hunt - 1` re-home. Fixed
   `it_fade_env_reset`, `it_fade_env_reset_carry`, `it_note_delay_nna`,
   `it_sample_porta` (direct runs).

## Session 2 results (90/15, from 73/32)

Root causes found and fixed:
1. insKey() nondeterminism — keys assigned in first-touch order; fixed
   by pinning keys to index+1 at load.
2. Signed envelope y — C's it_envelope_node.y is int8; sign-extend it.
3. LOOP_PATTERN_RESET flag constant — nextOrder tested 0x40 instead of
   1 << 4.
4. NNA act encoding — v.act = nna (C encoding); mixer skips on
   v.smp < 0 instead of act.
5. Dump virtual channels — iterate virt.virt_channels, not mod.chn.
6. Dump period rounding — Math.trunc (C printf %d truncates).
7. Dump act check — removed the v.act === 0 skip.
8. Scan row = jumpline — scan.c:633 'row = f.jumpline' before
   end_module.
9. Regenerated goldens — the stored goldens predated current libxmp
   behavior (LINEAR periods for IT).

## Debug assets
- `/tmp/genmix.c` — C golden generator (note_flags & 32 skip bit)
- `/tmp/dbgflow2.c` — C flow trace per row
- `/tmp/dbgpan9.c` — C pan envelope probe
- `/tmp/regen-all/` — regenerated goldens (STALE — predates the
  checkout C's set_sample_end behavior; the committed goldens in
  test-dev/data are authoritative)
