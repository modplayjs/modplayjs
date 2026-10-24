# Remaining modplayjs parity failures

Suite: `sh tools/run-mixer-data-tests.sh` — compares against the
working-tree goldens in `reference/libxmp/test-dev/data/*.data`
(16 fixtures carry 12-field regen versions; the suite compares
against whatever is in the working tree).

**Current state: 110 passed / 0 failed** (60 fixtures without .data).
The 2026-09-30 session added the HMN (His Master's Noise) and
Startrekker FLT4/8 loaders with their AM/HMN synth extras, the PP20
depacker, the MD5 module-quirk table, and the Starpack ProWizard
converter — Gaffeltruck.mod and all five flt_am_* fixtures now reach
byte-equal ModuleData / mixer-state parity.
All five failures from the 2026-09-09 session are resolved:

- `portamento_sustain.it` — STATE MATCH after regenerating the golden
  with a pristine-C genmix build (stale committed golden; see the
  caveat below).
- `it_multi_retrigger.it` — STATE MATCH, same stale-golden cause.
- `reverse_it.it` — STATE MATCH (VOICE_REVERSE per-mix-loop re-read fix).
- `portamento_nna_sample.it` — STATE MATCH (setPatch NNA rehome).
- `duplicate_check_transpose.it` — STATE MATCH.

`Pavel Kocourek - uTorrent Plus 3.4 crk.it` (no golden fixture) went
from 629/96,045 state mismatches + corr 0.9949 to **STATE MATCH +
corr 0.9994** — root cause: the IT volume-column slide arms
(`FX_VSLIDE_UP_2`/`DN_2`, vol letters C/D) never wrote
`vol.memory2` (effects.c:560-569 EFFECT_MEMORY), so a pre-keyoff
slide carried 0 instead of 9 and the post-keyoff retrig restarted
with full volume. `storlek_11.it` (infinite-loop exploit) now also
mirrors C: `scan_cnt` is a real uint8 (255→0 wrap) and a wrapped
`num=0` plays indefinitely instead of stopping instantly.

The interactive control surface (channel mute/volume, instrument/sample
audition via reserved smix channels) shipped alongside these fixes; it
shares the same mixer path, so the parity numbers include it.

## Historical failures (resolved, kept for the analysis trail)

### Porta slide precision (1) — RESOLVED (stale golden)
- `portamento_sustain.it` — 4 mismatches (period ±5 out of ~3.1M,
  e.g. `3123816 vs 3123821` at a late pass, note 51 toneporta).
  IT linear-slide fixed-point accumulation across the bidi loop;
  needs the exact C step/rounding chain traced.

### Reverse (1) — RESOLVED (VOICE_REVERSE fix)
- `reverse_it.it` — 103 mismatches vs the pristine-C dump. The
  committed golden is ALSO stale (pristine C emits 443 lines, the
  golden 450); two layers to untangle: regen the golden, then fix
  the remaining real divergence.

### NNA / retrigger / voice pool (2) — RESOLVED (NNA rehome fix)
- `portamento_nna_sample.it` — 84 mismatches, line delta 1584 (912
  pristine-C lines vs 2496 ours — we allocate a flood of extra
  overflow voices). Verified the committed golden ≡ pristine C, so
  this is a real port bug in the NNA voice pool.
- `duplicate_check_transpose.it` — flow divergence (pristine C
  emits 286 lines, we emit 279 — we are 4+ rows ahead by row 8).
  Real port bug in DCT/flow interaction.

### Retrig × envelope (1) — RESOLVED (stale golden)
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

### Pavel Kocourek - uTorrent Plus 3.4 crk.it (FIXED 2026-09-29)
Parity state via /tmp/genmixer (gen_mixer_data.c): 96045 state lines,
629 mismatches (0.65%). All mismatches are channel 0 around IT keyoff
(row 13) + note retrig with IT volume-column slide (row 14, vol byte 49,
raw vol col A... actually `fxa/c` = F_VSLIDE arm): our first active frame
after the retrig holds vol 928 where C reports 797, then our slide
catches up with bigger steps (736, 144...). First pass through the same
pattern matches exactly, so it is state carry across the keyoff →
retrig boundary.

**Root cause (C-side verified with a per-frame xc trace):** the IT
volume-column slide arms C (`FX_VSLIDE_UP_2`, 0xc0) and D
(`FX_VSLIDE_DN_2`, 0xc1) write `EFFECT_MEMORY(fxp, xc->vol.memory2)`
(effects.c:560-569); our dispatch routed C/D to a no-memory arm and the
fxp==0 continuation therefore read vol.memory2 = 0 forever. The
pre-keyoff slide (memory 9) then carried 0 across the keyoff → retrig
boundary and the restarted note skipped its slide. Fix: dispatch all
four `_2` arms (VSLIDE_UP_2/DN_2, F_VSLIDE_UP_2/DN_2) with the
`vol.memory2` write, keeping the no-memory `FX_VOLSLIDE_2` (XM 6xy/7xy)
separate. Result: **STATE MATCH** vs a fresh pristine-C genmix dump,
render correlation 0.9949 → 0.9994.

AIF question: neither modplayjs nor libxmp decodes AIFF/8SVX sample
files; IT/S3M/XM store PCM internally (delta/IT214/IT215 compression,
all ported). `grep -ri 'aif'` hits in apps/demo are base64 WAV blobs in
stb-vorbis dist files — false positives. No AIFF support exists or is
needed for this file; its samples are ordinary IT PCM.

### storlek_11.it (scan num=0 end handling, FIXED 2026-09-29)
`scan[0].num` wraps to 0 (by design, scan.c:288-293) for the Schism
"infinite loop exploit". C then plays the loop indefinitely (≥1000s,
verified via xmpref uncapped). Root cause of our instant stop: our
`scanCnt` increment used plain JS numbers in a Uint8Array slot without
the uint8 wrap, so the overflow break never fired and the end-of-scan
`num` read 255+ instead of wrapping to 0 — the player then treated
`num=0` as "already ended" (`playBuffer` → -1). Fix: make the
increment wrap `& 0xff` like C's uint8 (scan.c:284-286), preserving the
overflow break. The wrapped `num=0` now behaves like C: uncapped
playback (`playBuffer loop=0`) loops indefinitely; `loop=1` stops after
the first cycle exactly like `xmp_play_buffer(loop=1)`. Sequence
duration computes 61.3s per cycle (was 0).

## Session: reference refresh to libxmp 4.7.4 + full-corpus audit (2026-10-23)

Reference checkouts updated first:
- `reference/libxmp` fast-forwarded 4.7.2+11 → **libxmp 4.7.4**
  (release 4.7.3 scan/player fixes, 4.7.4 IMF/RTM sample-count fixes,
  `load_epilogue` MAX_SAMPLES clamp removal); the local golden-regen
  commit for `it_multi_retrigger.data`/`portamento_sustain.data` was
  rebased on top and kept.
- `reference/openmpt` fast-forwarded to master (`dc49d5638`,
  2026-10-09). The only soundlib change in the window is
  `Snd_fx.cpp` `kITDoublePortamentoSlides` volume-column portamento
  memory (OpenMPT behaviour; libxmp has no such play flag, so no port
  change) and a DLS/SF2 fix for code we don't ship.
- `reference/Paula-Tracker` already at `origin/master`.
- `reference/cRSID-1.58` is a vendored release tarball copy with no git
  remote; the README states 1.58 (2025) is the current release, so no
  update was possible or needed.

Fixes in this session (each verified against the C oracle):

1. **Sequencing** (`packages/core/src/core.ts`, `scan.ts`) — ported
   libxmp 4.7.3's `skip_invalid_orders` / `bad_sequence` design:
   `next_order`/`next_row` return success, an empty first sequence no
   longer throws at load (warn only), playback ends cleanly when a
   sequence has no reachable valid order, `mod.len` is no longer zeroed
   at `startPlayer`, and `check_end_of_module` uses the per-sequence
   `p->scan[p->sequence]`. `setPosition` now walks only
   `XMP_MARK_SKIP` in the walk direction and rejects `XMP_MARK_END`
   targets like `set_position` (control.c:63-132).
   Verified: `play_s3m_marker_sequence.s3m` loads byte-identically and
   `play_mod_bad_marker_sequence.mod` no longer crashes.
2. **MOD order table** (`fmt-mod/mod.ts`) — C copies all 128 order
   bytes into `mod->xxo` and only stops counting patterns at the first
   byte > 0x7f; the old port truncated `xxo` at that point, so marker
   modules had short/undefined order arrays.
3. **IT zero-sample instruments** (`fmt-it/it.ts`) — removed an invented
   "instruments without samples" rejection; libxmp accepts the file and
   leaves `mod->smp = 0` (play_it_zero_samples.it now byte-identical).
4. **Invert loop bad parameters** (`core/effects/tick.ts`) — ported
   1700535e: `lps=-1/lpe=-1/len`, `lps <= lpe` gate and the
   `data == NULL || lps >= len || lpe > len` guard.
5. **Protracker sample change bounds check**
   (`fmt-mod/readevent.ts`) — ported a60c8581: `queuePatch` receives
   `IS_VALID_SAMPLE(sub->sid) ? sub->sid : -1`.
6. **Startrekker AM stream advance** (`fmt-mod/flt.ts`) — the per-sample
   stream skip uses the header length (`xxs->len` *before*
   `read_am_instrument` rewrites it), fixing sample offsets after AM
   instruments (flt_am_override.mod now byte-identical).
7. **XM Ogg sample conversion** (`fmt-xm/xm.ts`) — replace
   `Math.round(x*32768)` with stb_vorbis'
   `FAST_SCALED_FLOAT_TO_INT(x,15)` magic-add conversion (exact for
   `copy_samples`); this removed 1-LSB differences.
8. **Vorbis window** (`stb-vorbis/imdct.ts`) — `compute_window` now
   rounds exactly where C's float32 locals round; the Ogg-decoded PCM is
   now bit-identical for beep.oxm/beep2.oxm/stereo.oxm/jerry-boleti.oxm.
9. **MED loader validation** (`fmt-med/mmd1.ts`, `mmd3.ts`, `med4.ts`) —
   signed offset reads (EOF → 0xffffffff, negative seek fails), signed
   expdata sanity checks, sample-count `> MAX_SAMPLES` rejection and no
   placeholder sample for song-file instruments without an external
   file. `load_mmd0_truncated`, `load_mmd0_sample_count`,
   `load_mmd1_invalid_expdata{,2}`, `load_mmd1_invalid_inst*`,
   `load_mmd1_5octave_overflow`, `load_med4_invalid_iff{,2}` now match C
   (load/reject and dump bytes).

Measured after the changes:
- mixer-state golden suite: **110 passed / 0 failed** (60 fixtures
  without `.data`).
- IT/XM loader parity: **146 passed / 0 failed**.
- libxmp `test-dev/data` (all formats we ship): 212 byte-identical, 0
  diffs; 63 rejects are formats with no modplayjs package (FAR, LIQ,
  DTM, IMF, ULT, PTM, FNK, AMF, DSYM, GDM, DBM, RTM, MDL, XMF, archive
  containers).
- Known non-determinism: `flt_am_envelope.mod` sample 2 is the AM noise
  waveform generated from `time(NULL)` in C (`rng.c`), so its FNV
  changes on every C run; it is not a parity signal.

## Session: bit-exact render pipeline (2026-10-23, second part)

Three defects in the sample materialization / output path were found and
fixed against the C sources; the reference render of
`SnD - Ashampoo Antispyware 1.61 crk.mod` is now **byte-identical** to
libxmp for the full 250 s render (12,000,000 frames, past the 184.32 s
loop point), and the previously 0.999x test modules reach 1.0000.

1. **WAV encoder rounding** (`out-pcm/src/pcm.ts`). The mixer hands out
   int16 values scaled by 1/32768 (`downmix_int_16bit`, mixer.c:106-131 →
   `smp / 32768` in the softmixer). The encoder wrote
   `floor(sample * 32767)`, which shifts every non-zero sample by one
   LSB and accumulates a small DC/scale error across the file. It now
   uses `round(sample * 32768)` clamped to int16, which recovers the
   exact integer PCM that libxmp writes.

2. **Sample guard bytes** (`dsp-softmixer/src/index.ts`, `nativeOf`).
   `libxmp_load_sample` does not zero the interpolation guard slots
   (sample.c:408-417):

   ```c
   for (i = 0; i < extralen; i++)
       xxs->data[bytelen + i] = xxs->data[bytelen - framelen + i];
   for (i = -1; i >= -4; i--)
       xxs->data[i] = xxs->data[framelen + i];
   ```

   `extralen` is 4/8/16 bytes depending on 16-bit/stereo, i.e. 4 frames
   of `chn` slots; the last frame is repeated at the end and the first
   frame at the start. `nativeOf` now materializes exactly those slots
   after the payload. The linear and spline mixers read
   `sptr[pos + chn]` and `sptr[pos ± chn]`, so a zero guard produced a
   one-frame interpolation error at each sample end and at each loop
   wrap. The stale comment in `core/samples.ts` claiming the tail guard
   never reaches the output was wrong; it stays only because the
   Float32 store has its own padding, and the mixer builds its own
   native view.

3. **Anticlick cursor** (`dsp-softmixer/src/index.ts`). `mixer.c`
   advances `buf_pos` by `mix_size` immediately after `mix_fn`
   (mixer.c:704) and the one-shot / queued-swap paths then call
   `do_anticlick(ctx, voc, buf_pos, size)` with the ADVANCED pointer
   (mixer.c:720-726, :733-736). The port passed the pre-mix pointer, so
   the discharge was written over the frames that had just been mixed
   instead of into the remaining silence. Both call sites now use
   `bufPosAfter`.

4. **Biquad coefficient table and arithmetic** (`core/effects/tick.ts`).
   `resonance_table` in `reference/libxmp/src/filter.c:39-66` is a list of
   float literals, not a `pow()` call at runtime; the port generated it with
   `Math.pow`, which differs in the last bit for many entries. The table is
   now copied verbatim. `filter_setup` reproduces C's mixed float/double
   evaluation (`Math.fround` where C stores to a `float`) — the `fb0`
   numerator `(d + e + e)` is float arithmetic because both operands of the
   inner `d + e` are float. Verified against 8,192 coefficient triples
   generated by the C `libxmp_filter_setup` at 44.1 and 48 kHz
   (cutoff 0..255, resonance 0..255 step 17): zero mismatches.

   The mixer's `FILTER_LEFT`/`FILTER_RIGHT` accumulator is int64 in C
   (`mix_all.c:112,119`, `int64 sl64`) and is now evaluated exactly by
   `filterSum64` (split into high/low halves) instead of a double sum.

5. **Anticlick product precision** (`dsp-softmixer/src/index.ts`).
   `do_anticlick` computes `(stepmul_sq * (int64)smp) >> 32`
   (mixer.c:189-190) where `stepmul_sq` is uint32 and `smp` int32: the
   product reaches 2^63, above the 53-bit exact range of a double. Replaced
   `Math.floor((sm2 * sl) / 2**32)` with `mulShift32`, which splits the
   unsigned factor into 2^16 halves. Verified against 200,000 random
   `(uint32, int32)` pairs evaluated by the C expression: zero mismatches.

Verification (all fresh renders, C reference rebuilt from
`reference/libxmp` at libxmp 4.7.4 with `tools/xmpref.c` and the new
`tools/xmpchmask.c`; our side via `tools/render-ours.mjs`, `cmp` on the
WAV files):

| Check | Result |
|---|---|
| `SnD - Ashampoo Antispyware 1.61 crk.mod`, 190 s, full mix | identical |
| same file, 250 s (spans the loop) | identical |
| same file, per-channel masks 1000/0100/0010/0001/1100 | identical |
| KHG — HitFilm Ultimate x64, KHG — Vegas Pro 12, 4DNinja — 3DAttack, 15 s | identical |
| 909DEAD — Adobe CS6, 15 s | 4,184 of 1,440,000 samples differ by ≤ 3 (0.29 %) |
| NBR — Light Image Resizer 4, 15 s | residual differences, same order |
| mixer-state golden suite | 110 passed / 0 failed |
| IT/XM loader parity | 146 passed / 0 failed |

## Session 4 (2026-10-24): render byte-parity

The 48 kHz full-mix comparison (`tools/xmpref.c` vs `tools/render-ours.mjs`,
`cmp`-level diff) is now bit-identical across the whole
`testfiles/` corpus (14 modules) and
`testfiles2/KEYGENMUSiC MusicPack/BetaMaster` (21 of 22; the one exception is
`Nero 9.0 kg_1.it`, whose playback is seeded from the wall clock — see below),
up from 9 passing files before this session.

### Fixed

1. **Anticlick arming without a previous-volume guard**
   (`core/src/virtual.ts`, `mixer_setvol` / `libxmp_virt_resetvoice`).
   C arms the anticlick on *every* `vol == 0` write, and
   `libxmp_virt_resetvoice` calls `libxmp_mixer_setvol(ctx, voc, 0)` before
   wiping the voice, so a cut still discharges its last mixed level. The port
   required `v.vol !== 0` and never armed from the reset path.
   `909DEAD - Adobe CS6` and `NBR - Light Image Resizer 4` (both IT) are now
   bit-identical for 60 s; they were the open residual from session 3.

2. **`voicePos` must arm the anticlick** (`core/src/virtual.ts`).
   `libxmp_mixer_voicepos` ends with `if (ac) anticlick(vi)` and
   `libxmp_virt_voicepos` always passes `ac = 1`; the port only zeroed
   `old_vl`/`old_vr`. Broke every retrigger/offset note (QuickTime 7.0 XM,
   UltraISO 6.52 XM).

3. **Linear pitch bend truncates** (`core/src/effects/helpers.ts`).
   `libxmp_period_to_bend` returns `int` and its `PERIOD_LINEAR` branch is the
   one case without `libxmp_round`, so the conversion truncates toward zero.
   Amiga/CSPD modes round; linear does not. (Alcohol 120% 1.9.5, XM.)

4. **Default MIDI macro path** (`core/src/effects/tick.ts`).
   `update_midi_macro` runs on every channel regardless of `module->midi`
   (player.c:1628); with no MIDI config it still applies the default macro:
   fixed (0x80..0x8f) → resonance, parameterized 0 → cutoff
   (player.c:532-541). Gating the call on `module.midi` left the IT filter
   untouched. (Pavel Kocourek — uTorrent Plus.)

5. **Mono samples filter only the left value** (`dsp-softmixer`).
   `FILTER_MONO` filters `smpl` only and `MIX_STEREO(smpl, smpl)` then
   duplicates the filtered result. The port copied the pre-filter sample into
   the right channel, so mono samples with an IT filter had an unfiltered
   right side. (Pavel Kocourek — uTorrent Plus, ch9-11.)

6. **`playBuffer` partial-frame carry** (`core/src/core.ts`).
   `xmp_play_buffer` stores the un-copied remainder of a frame in
   `p->buffer_data` and resumes it on the next call (player.c:2244-2257).
   The port rendered only whole frames that fit and dropped the rest, so
   every buffer boundary shifted the stream by up to one tick. Only showed up
   when the tick size was not a divisor of the caller's buffer
   (UltraISO 6.52, 7500-sample ticks into a 48000-sample buffer).

7. **Reference oracle build flag** (`tools/build-ref-libxmp.sh`).
   GCC defaults to `-ffp-contract=fast`, which fuses
   `vi->pos += step_dir * samples` (mixer.c:703) into one FMA on aarch64 and
   rounds once instead of twice. That 1-ulp difference showed up as 73
   one-LSB right-channel frames at t≈278 s in CuteFTP 8kg. libxmp is not
   bit-reproducible across architectures for this reason; the oracle is
   pinned to the unfused evaluation (`-ffp-contract=off`), which is what
   x86-64 SSE2 builds produce.

### Verification

Fresh renders, 48 kHz stereo s16, C oracle rebuilt from `reference/libxmp`
(libxmp 4.7.4) with the new flag, ours via `tools/render-ours.mjs`:

| Check | Result |
|---|---|
| `testfiles/` (14 modules), 12 s | 14/14 identical |
| `testfiles2/…/BetaMaster` (22 modules), 12 s | 21/22 identical |
| `CuteFTP 8kg crk.mod` full 298.74 s cycle | identical (14,400,000 frames) |
| `909DEAD — Adobe CS6`, `NBR — Light Image Resizer 4`, 60 s | identical |
| `Pavel Kocourek — uTorrent Plus 3.4`, 12 s + full state dump | identical / STATE MATCH |
| mixer-state golden suite | 110 passed / 0 failed |
| loader parity (XM) | 146 passed / 0 failed |

`Nero 9.0 kg_1.it` uses IT random pan swing (`rvv` ≠ 0 on its
instruments), and libxmp seeds that RNG from `time(NULL)`
(`libxmp_init_random`, rng.c:49-54): two consecutive C renders of the same
file differ from each other, so no render comparison is meaningful for it.

New harness for this: `tools/sweep-render.sh` (parallel corpus sweep, reads a
file list on stdin).
