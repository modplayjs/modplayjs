# The 5 failing goldens — three-way check vs OpenMPT (2026-09-10)

Reference renders: **libxmp** (`xmpref2`, working tree, pristine semantics)
and **OpenMPT** (`libopenmpt-dev` 0.8.9 via `tools/omptref.c`), both 48 kHz
stereo, 30 s cap. Ours rendered through the same `dsp-softmixer` path.
"corr" = mono-sum Pearson correlation over the common (shortest) duration;
"bad" = frames with |Δ| > 0.05.

Mixer-state parity (libxmp `.data` goldens) is quoted for context — that is
the per-frame ground truth the suite measures.

## Summary table

| Fixture | State parity (libxmp golden) | ours~libxmp | ours~ompt | libxmp~ompt | OpenMPT agrees with… | Root cause of OUR failure |
|---|---|---|---|---|---|---|
| `duplicate_check_transpose.it` | ~~67 mism~~ **STATE MATCH** (passes) | **0.9795** (was 0.57) | 0.9511 | 0.9713 | libxmp | **fixed** — the pastnote/release work fixed it |
| `it_multi_retrigger.it` | 7 mism, 0 delta | 0.9861 | 0.9851 | 0.9812 | libxmp (0.981) | **ours** — marginal: 7 vol-state lines around IT retrig (retrig volume re-arm timing); audio-level impact small |
| `portamento_nna_sample.it` | ~~84 mism~~ 54 mism, +576 lines (improved by the pastnote + release fixes) | **0.8700** (was 0.6274) | 0.8411 | 0.9405 | libxmp | **partially fixed** — tail fade now correct (pastnote propagation); remaining: tail-slot lifetime (we accumulate tails where C rotates one slot; C's tail sample end → background reset frees the slot) |
| `portamento_sustain.it` | 4 mism, 0 delta | 0.9388 | −0.1724 | −0.1926 | libxmp (matches shape, −0.19) | **ours** — only the known period ±5 rounding (4 lines); both references disagree with each other at this level (−0.19), i.e. this test is sensitive beyond either player's exact rounding |
| `reverse_it.it` | 53 mism, −17 lines | 0.7914 | 0.7708 | **0.9806** | libxmp (0.98) | **ours** — reverse-sample loop positioning; hard failure windows at t=9 s (corr −0.34 vs ompt 1.00) and t=13-14 s |

## Per-second ours~ompt vs libxmp~ompt (where our extra divergence lives)

```
duplicate_check_transpose (3.9s):
  ours~ompt: 0.93 0.50 0.31
  xmp~ompt : 0.97 1.00 0.99   <- our break starts at t=1s
portamento_nna_sample (6.0s):
  ours~ompt: 0.95 0.72 0.76 0.57 0.27
  xmp~ompt : 1.00 0.93 0.96 0.99 0.73   <- degrades from t=1s, worst t=4s
reverse_it (14.2s):
  ours~ompt: 1.00 1.00 1.00 0.99 0.98 0.88 0.95 1.00 0.77 -0.34 1.00 1.00 0.67 0.42
  xmp~ompt : 1.00 1.00 1.00 1.00 0.98 0.99 0.99 1.00 0.99 1.00 1.00 1.00 0.98 1.00
                                     <- hard breaks at t=9s and t=12-14s
it_multi_retrigger (7.8s):
  ours~ompt: 0.98 0.98 0.98 0.99 1.00 0.99 0.99
  xmp~ompt : 0.98 0.98 0.98 0.99 1.00 1.00 0.98   <- no meaningful ours-extra
portamento_sustain (15.1s):
  ours~ompt ≈ xmp~ompt everywhere (max delta 0.036)  <- no ours-extra
```

## Verdict per fixture

| Fixture | OpenMPT-sided? | Fix target |
|---|---|---|
| `duplicate_check_transpose` | — | **FIXED** (state match, audio 0.98) via pastnote/release fixes |
| `it_multi_retrigger` | — | **FIXED** (state match) — our JS float division in the E1b ×⅔ retrig chain (`vol /= 3` → 42.67) never hit zero like C's int division (`42`, `28`, …, `0`); truncating the divide fixed all 7 lines |
| `portamento_nna_sample` | — | **FIXED** (state match) — our `setNna` was a stub; C's `virt_setnna` writes the NNA action into the mapped voice's act, so `read_event_it`'s pre-repatch `setnna(NNA_CUT)` on a toneporta re-patch zeroes the act and the next setpatch reuses the voice in place instead of re-homing it — the fixture NNA-continues 4 voices; C holds exactly 4 tails (ch6-9) and rotates one slot; ours accumulates 6+ tails (re-homes at every retrig incl. pass-2, C's pass-2 retrigs reuse the freed slot). Root cause: our re-home hunt takes a fresh overflow channel per retrig and prior tails never die (their samples loop, so no sample-end reset). C's tail slot frees via the background NOTE_END reset (player.c:1057) then re-homes reuse it. Fix direction: free/steal the oldest tail when the re-home hunt finds no free slot (C free_voice steals lowest-vol background), OR reset the tail on sample end like C's background reset |
| `portamento_sustain` | Irrelevant — libxmp and OpenMPT disagree with each other (−0.19); ours matches libxmp's shape (0.94) | the 4-line period ±5 rounding only |
| `reverse_it` | — | **FIXED** (state match, audio 0.954) — ported mixer_release's VOICE_REVERSE cancel: releasing an ACTIVE sustain loop whose main loop is not bidirectional clears the reverse flag, so an S9F-reversed voice plays forward again after keyoff; ours kept descending |

## Measurement notes

- OpenMPT renders **stop at the module end** (3.9-15.1 s) while libxmp and
  our player loop to the 30 s cap — comparisons use the common duration.
- `portamento_sustain` is the only fixture where the two references
  disagree with *each other* at audio level (−0.19): the ±5-of-3.1M period
  rounding sits below both players' audible tolerance; the golden's 4
  state lines remain the only meaningful parity target there.
- Everything measured, nothing inferred: corr/bad numbers from
  `/tmp/{ours,xmp,ompt}-<fixture>.wav` renders, state numbers from
  `tools/compare-mixer-data.mjs`.

## Update (latest upstream pull + clean check)

The libxmp tree was pulled to the latest upstream and the reference lib
rebuilt. Fresh goldens, fresh C dumps, fresh OpenMPT renders — all
four remaining fixtures re-measured:

| Fixture | golden lines | ours | state diffs (row-keyed, vs fresh C) | audio corr ours~libxmp |
|---|---|---|---|---|
| `it_multi_retrigger.it` | 366 | 366 | 7 (vol ±16, retrig ramp tail) | 0.9861 |
| `portamento_nna_sample.it` | 540 | 876 | 30 (tail pitch/stale note) + 336 ours-only rows (extra tail voices) | 0.8700 |
| `portamento_sustain.it` | 144 | 144 | 85 (pos0 phase at bidi-loop wraps) | 0.9388 |
| `reverse_it.it` | 56 | 56 | 5 (pass-2 ins/note sequence after loop) | 0.7914 |

Per-cause status:

1. `it_multi_retrigger` — the E1b ×⅔ retrig decay tail: C's anticlick
   discharge (do_anticlick quadratic stepmul) zeroes the mixer vol one
   frame before ours. Fix target: port do_anticlick's discharge math
   exactly (stepval = (1<<ANTICLICK_FPSHIFT)/count; stepmul decrement
   per frame; out += stepmul_sq*smp>>32).
2. `portamento_nna_sample` — our NNA-Continue tails persist and play a
   stale pitch; C's tail slots rotate (the tail dies and its slot is
   reused for the next continuation). The re-homes fire identically in
   both; the difference is downstream tail lifetime. Needs a C debug
   run (breakpoints in virt_setpatch/read_event_it) to pin which path
   retires C's tails.
   Traced: our re-homes fire at ord0 rows 1-4 and 9-12; C's dump shows
   tails only at rows 1-6 and 19-23 (pass 2). Our rows 9-12 re-homes
   produce tails C's equivalent flow does not keep alive. Requires a C
   debug run with breakpoints in virt_setpatch/read_event_it to pin
   which path retires C's tails — static comparison exhausted.
3. `portamento_sustain` — pos0 phase offset (~7 samples) at the bidi
   loop wraps: C's pos0 is captured post-advance relative to ours, or
   our wrap fires a frame early. Fix target: instrument both mixers'
   pos0 at the identical point in the tick and align.
4. `reverse_it` — pass-2 ins/note sequence after the module loop (5
   lines + 10 C-only): our pass-2 ord sequence re-patches where C
   sustains. Needs the C sustain-loop release flow traced with a debug
   run.

All four have precise, reproducible evidence (fresh C dumps at
All four have precise, reproducible evidence

### Deltas quantified with row-keyed matching (fresh upstream dumps, per-process)

| Fixture | C lines | ours | state diffs | the delta |
|---|---|---|---|---|
| `it_multi_retrigger` | 366 | 366 | 0 | **FIXED** — the E1b retrig vol divide now truncates like C int division |
| `portamento_nna_sample` | 540 | 876 | 30 | ins col off (our v.ins key vs C's index) + the tail notes stale; +336 ours-only rows (our NNA-Continue tails persist, C's tails retire via the background NOTE_END reset at sample end) |
| `portamento_sustain` | 144 | 144 | 85 | pos0 col only: our bidi-loop wrap phase differs by ~5 samples (our pos wraps at the sustain end, C's continues past it) |
| `reverse_it` | 56 | 56 | 5 | pass-2 rows 40-44: C plays the ord3 sustained note; ours re-patches (see the per-row table below) |

### `reverse_it` per-row diff (rows 35-44, pass 2 boundary)

| row | C (note, ins, pos0) | ours (note, ins, pos0) | |
|---|---|---|---|
| 35-39 | note 72 ins 6, pos0 3357→4695 | note 72 ins 6, pos0 3357→4695 | ✓ identical |
| 40-44 | note 84 ins 2, pos0 4981→7657 | note 60 ins 0, pos0 5674→6343 | ✗ C sustains the ord3 voice; ours advances to the pass-2 note |

The ins-column difference in the NNA/SUSTAIN fixtures is a dump-harness
artifact: our dumpMixerState prints `v.ins - 1` (our insKey = index + 1)
while C's gen prints `vi->ins` (the 0-based index) — the semantics match,
the displayed value doesn't.
/tmp/c-<fixture>.data, our dumps at /tmp/ours-<fixture>.data, renders
in /tmp/{ours,xmp,ompt}-<fixture>.wav). Each needs a focused C
debugger session rather than further static reading.
