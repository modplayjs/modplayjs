# Remaining modplayjs parity failures

Suite: `sh tools/run-mixer-data-tests.sh` — compares against the
working-tree goldens in `reference/libxmp/test-dev/data/*.data`
(16 fixtures carry 12-field regen versions; the suite compares
against whatever is in the working tree).

**Current state: 100 passed / 5 failed** (65 fixtures without .data).

The interactive control surface (channel mute/volume, instrument/sample
audition via reserved smix channels) shipped alongside these fixes; it
shares the same mixer path, so the parity numbers include it.

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

## Fixed this session (session 3)
- `it_fade_env_reset`, `it_fade_env_reset_carry`, `it_note_delay_nna`
  — setPatch NNA rehome (fix 1 below).
- `it_sample_porta` — NOT a port bug: the golden carried frozen
  pos0 lines (row3 f3-f5, row8 f1-f2) that pristine C does not emit
  (NOTE_SAMPLE_END is set as soon as the mixer exhausts the sample,
  so the dump skips those frames). Regenerated
  `it_sample_porta.data` with a pristine-C genmix build; our player
  matches it exactly.
- `it_smooth_macro` — float32 macro accumulation (fix 2 below).
- `ft2_tremor_delay.xm` — FT2 tremor row reset (fix 3 below).
- `pattern_loop_it210`, `pattern_loop_it104`, `pattern_loop_it100`,
  `it_sus_after_loop_bidi`, `reverse_xm.xm` — stale VOICE_REVERSE
  across mix chunks (fix 4 below).

Session-3 fix list:
1. **setPatch NNA rehome** (`3493228`) — C's `alloc_voice`
   (virtual.c:509-517) reuses the channel's voice in place when its
   act is inactive, and only allocs + re-homes the old voice to a free
   overflow channel when it is still active. Ported: `oldActive` gate,
   `vidx = oldVoice` reuse path, `to = hunt - 1` re-home.
2. **IT smooth macro float32** (`3c7ded2`) — C stores macro
   val/target/slide as float; round the slide and each accumulation
   with Math.fround.
3. **FT2 tremor row reset** (`54467da`) — read_row clears the tremor
   flag in xc->flags (player.c:836-838), not per_flags.
4. **Stale VOICE_REVERSE across mix chunks** (`22cc966`) — C re-reads
   `vi->flags & VOICE_REVERSE` per mix-loop iteration; loop_
   reposition's bidi XOR (mixer.c:375) flips direction mid-tick,
   and our cached const kept mixing in the old direction after the
   first flip.

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


## Session: uTorrent IT + stereo samples (2026-09-08)

### Stereo-sample mixing (FIXED)
`dsp-softmixer` treated every sample as mono-source: `kernel(data, pos)`
read one value and fed it to both L and R gains. C selects a
`stereoout_stereo_*` mixer when `XMP_SAMPLE_STEREO` is set (mixer.c:894,
mix_all.c LIST_MIX_FUNCTIONS): `VAR_STEREO` sets `chn = 2`, L reads
`sptr[pos]`, R reads `sptr[pos + 1]`, interpolation strides by `chn`
(`LINEAR_8BIT`: `sptr[pos + chn]`; `SPLINE_8BIT`: taps at `pos ± chn`),
and `UPDATE_POS` advances `pos` by `(frac >> 16) * chn` in C's
sample-unit space. Port: kernels now take `(frameIdx, frac, chn, off)`;
`posInt` stays in frames; R gets its own filter history
(`VAR_FILTER_STEREO` / `SAVE_FILTER_STEREO`).
Verified: stereo.xm L/R now correlate with the C render (previously R was
a copy of L); golden mixer-data suite unchanged (100 pass / 5 fail).
`reference` renders for stereo.xm: ours L=0.097 R=0.005 (was L only).

### Pavel Kocourek - uTorrent Plus 3.4 crk.it (characterized, open)
Parity state via /tmp/genmixer (gen_mixer_data.c): 96045 state lines,
629 mismatches (0.65%). All mismatches are channel 0 around IT keyoff
(row 13) + note retrig with IT volume-column slide (row 14, vol byte 49,
raw vol col A... actually `fxa/c` = F_VSLIDE arm): our first active frame
after the retrig holds vol 928 where C reports 797, then our slide
catches up with bigger steps (736, 144...). First pass through the same
pattern matches exactly, so it is state carry across the keyoff →
retrig boundary: our `resetEnv`/`fadeout`/`v_idx` handling after
XMP_KEY_OFF differs from C read_event.c:1282-1291 (`reset_env` resets
NOTE_ENV_RELEASE|SUSEXIT|FADEOUT + fadeout=0x10000). The volslide-on-
retrig frame-0 application also differs (C slides already at the first
active frame). Suspect list: xc.v_idx not reset by reset_envelopes path
for same-ins retrig after keyoff, and VOL_SLIDE_2 memory (vol.memory2)
carrying the pre-keyoff slide.

AIF question: neither modplayjs nor libxmp decodes AIFF/8SVX sample
files; IT/S3M/XM store PCM internally (delta/IT214/IT215 compression,
all ported). `grep -ri 'aif'` hits in apps/demo are base64 WAV blobs in
stb-vorbis dist files — false positives. No AIFF support exists or is
needed for this file; its samples are ordinary IT PCM.

### storlek_11.it (scan num=0 end handling, open)
`scan[0].num` wraps to 0 (by design, scan.c:288-293) for the Schism
"infinite loop exploit". C then plays the loop indefinitely (≥1000s,
verified via xmpref uncapped); our player stops instantly
(`playBuffer` → -1, scan time 0). Our scanModule returns the right
row/ord but `time` computes 0, and playback treats `num=0` as "already
ended". Needs: C's end-of-playback check (`player.c` / `scan.c`
`get_scan` num semantics) — num=0 with an overflowing scan_cnt is not
the same as "empty song". No golden fixture exists for this file.
