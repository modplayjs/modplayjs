# Remaining modplayjs parity failures

Suite: `sh tools/run-mixer-data-tests.sh` — compares against the
working-tree goldens in `reference/libxmp/test-dev/data/*.data`
(16 fixtures carry 12-field regen versions; the suite compares
against whatever is in the working tree).

**Current state: 100 passed / 5 failed** (65 fixtures without .data).

## Current failures (5), grouped by symptom

### Porta slide precision (1)
- `portamento_sustain.it` — 4 mismatches (period ±5 out of ~3.1M,
  e.g. `3123816 vs 3123821` at a late pass, note 51 toneporta).
  IT linear-slide fixed-point accumulation across the bidi loop;
  needs the exact C step/rounding chain traced.

### Reverse (1)
- `reverse_it.it` — 103 mismatches vs the pristine-C dump. The
  committed golden is ALSO stale (pristine C emits 443 lines, the
  golden 450); two layers to untangle: regen the golden, then fix
  the remaining real divergence.

### NNA / retrigger / voice pool (2)
- `portamento_nna_sample.it` — 84 mismatches, line delta 1584 (912
  pristine-C lines vs 2496 ours — we allocate a flood of extra
  overflow voices). Verified the committed golden ≡ pristine C, so
  this is a real port bug in the NNA voice pool.
- `duplicate_check_transpose.it` — flow divergence (pristine C
  emits 286 lines, we emit 279 — we are 4+ rows ahead by row 8).
  Real port bug in DCT/flow interaction.

### Retrig × envelope (1)
- `it_multi_retrigger.it` — 7 mismatches. rval table and the
  FX_MULTI_RETRIG handler are byte-identical to C; golden shows
  non-×m/d steps mid-ramp (retrig × volume-envelope interplay).
  Needs a C-side per-tick trace of xc->volume + vol env idx.

## Fixed this session
- `it_fade_env_reset`, `it_fade_env_reset_carry`, `it_note_delay_nna`
  — setPatch NNA rehome (below).
- `it_smooth_macro` — float32 macro accumulation (below).
- `ft2_tremor_delay.xm` — FT2 tremor row reset (below).
- `it_sample_porta` — NOT a port bug: the golden carried frozen
  pos0 lines (row3 f3-f5, row8 f1-f2) that pristine C does not emit
  (NOTE_SAMPLE_END is set as soon as the mixer exhausts the sample,
  so the dump skips those frames). Regenerated
  `it_sample_porta.data` with a pristine-C genmix build; our player
  matches it exactly.

## Session 3 results (100/5, from 90/15)

Root causes found and fixed:
1. **setPatch NNA rehome** (`3493228`) — C's `alloc_voice`
   (virtual.c:509-517) reuses the channel's voice in place when its
   act is inactive, and only allocs + re-homes the old voice to a free
   overflow channel when it is still active. Ported: `oldActive` gate,
   `vidx = oldVoice` reuse path, `to = hunt - 1` re-home. Fixed
   `it_fade_env_reset`, `it_fade_env_reset_carry`, `it_note_delay_nna`.
2. **IT smooth macro float32** — C stores macro val/target/slide as
   float; round the slide and each accumulation with Math.fround.
   Fixed `it_smooth_macro`.
3. **FT2 tremor row reset** — read_row clears the tremor flag in
   xc->flags (player.c:836-838), not per_flags. Fixed
   `ft2_tremor_delay.xm`.
4. **Stale VOICE_REVERSE across mix chunks** — C re-reads
   `vi->flags & VOICE_REVERSE` per mix-loop iteration; loop_
   reposition's bidi XOR (mixer.c:375) flips direction mid-tick,
   and our cached const kept mixing in the old direction after the
   first flip. Fixed `pattern_loop_it210/104/100`,
   `it_sus_after_loop_bidi`, and `reverse_xm` (its ins3 bidi+reverse
   case was the same root cause).

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
- `/tmp/genmix.c` — C golden generator (note_flags & 32 skip bit);
  build against the PRISTINE C tree (the working-tree
  `/tmp/genmix` binary was built against session-2's modified C).
- `/tmp/dbgflow2.c` — C flow trace per row
- `/tmp/dbgpan9.c` — C pan envelope probe
- `/tmp/regen-all/` — STALE (predates the checkout C's
  set_sample_end behavior).

Caveat when regenerating goldens: verify the reference/libxmp
working tree is pristine first (`git -C reference/libxmp status`);
session-2 left behavioral C edits whose output differs from the
pristine checkout.

