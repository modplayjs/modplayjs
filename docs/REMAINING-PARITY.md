Remaining modplayjs parity failures (17 fixtures, all real bugs vs
checkout-C regen goldens in /tmp/regen-all/):

GROUP A — voice/retrig after sample-end or NNA (missing retrig):
  reverse_it, reverse_xm (reversed voice: ord1 retrig never fires;
    our player keeps the frozen pos=end/pos=0 voice)
  it_sample_porta (row4 retrig missed after the pos=end freeze)
  duplicate_check_transpose, portamento_nna_sample (DCT/NNA voice
    pool: allocVoice returns -1 after DCT kills; used counter goes
    negative)
  it_multi_retrigger (Qxx ramp: vol 0 vs 16 mid-ramp)
  portamento_sustain

GROUP B — envelope engine (pan env sweep divergence):
  it_smooth_macro (cutoff 236 vs 238), it_sus_after_loop_bidi,
  storlek_01/03/04/18 (note mismatches from env-driven retrigs)

GROUP C — loop/break ordering:
  pattern_loop_it100/104/210 (pos0 mismatch at loop re-entry)

Debug assets:
  /tmp/genmix.c     — C golden generator (note_flags & 32 skip bit)
  /tmp/dbgflow2.c   — C flow trace per row
  /tmp/dbgpan9.c    — C pan envelope probe
  /tmp/regen-all/   — regenerated goldens from the checkout C


SESSION 2 RESULTS: 17 fixtures fixed (90 passed / 15 failed, from 73/32).

Root causes found and fixed:
1. insKey() nondeterminism — keys assigned in first-touch order, so the
   dump's ins field reported wrong instruments. Fixed: keyInstruments()
   pins keys to index+1 at load.
2. Signed envelope y — C's it_envelope_node.y is int8; we read it
   unsigned, breaking pan-envelope sweeps. Fixed with sign extension.
3. LOOP_PATTERN_RESET flag constant — nextOrder tested 0x40 instead of
   1 << 4; the ST3 position-change loop reset never ran.
4. NNA act encoding — the DCT setPatch mapped nna=0 (CUT) to Act.NOTE
   instead of Act.NONE; the next setPatch saw the voice as active and
   allocated a new voice + rehome, orphaning the new note. Fixed: v.act
   = nna (C encoding), mixer skips on v.smp < 0 instead of act.
5. Dump virtual channels — the dump iterated mod.chn instead of
   virt.virt_channels, dropping NNA overflow lines.
6. Dump period rounding — Math.round instead of Math.trunc (C printf %d
   truncates).
7. Dump act check — removed the v.act === 0 skip (wrong under C's
   encoding).
8. Scan row = jumpline — added scan.c:633 'row = f.jumpline' before
   end_module.
9. Regenerated goldens — the stored goldens predated current libxmp
   behavior (LINEAR periods for IT); regenerated with the checkout C.

Remaining 15 failures (all real bugs, verified vs checkout-C regens):
- portamento_nna_sample (222): NNA voice allocation — our allocVoice
  pushes new slots where C's maxvoc-limited pool reuses the same slot
- reverse_it (216) / reverse_xm (51): reverse sample playback
- it_multi_retrigger (145): Qxx vol ramp
- duplicate_check_transpose (135): DCT transpose
- pattern_loop_it100/104/210 (74/44/31): loop re-entry pos0
- storlek_10 (304): playback flow — our player skips the first rows
- storlek_17 (?), portamento_sustain (54), it_sample_porta (25,
  partial: retrig works, pan env mismatch), ft2_tremor_delay (13),
  it_smooth_macro (4), it_sus_after_loop_bidi (4)

Debug assets: /tmp/genmix.c (golden gen), /tmp/dbgflow2.c (C flow
trace), /tmp/dbgpan9.c (C pan probe), /tmp/regen-all/ (regenerated
goldens). C virtual.c instrumented with virt_setpatch/rehome traces
(reference/libxmp/src/virtual.c — REMOVE before committing C changes).
