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


UPDATE (session 2): leading hypothesis for GROUP A — notes WITHOUT an
ins# (using old_ins memory) after the previous voice hit NOTE_SAMPLE_END
are skipped by our readEventIt (setPatch never runs, v.note stays
stale). Verified: it_sample_porta row4 (note=67 no ins#) — our v.note
stays 60; the map/sub data is correct, so the gate is in readEventIt's
note-path conditions (suspect: newInvalidIns/old_ins handling or the
check_invalid_sample path zeroing the event).
