---
'@modplayjs/core': patch
'@modplayjs/dsp-softmixer': patch
'@modplayjs/fmt-it': patch
'@modplayjs/fmt-med': patch
'@modplayjs/fmt-mod': patch
'@modplayjs/fmt-xm': patch
'@modplayjs/out-pcm': patch
'@modplayjs/stb-vorbis': patch
---

Sync player and loader behaviour with libxmp 4.7.4 and make the render
pipeline bit-exact against the C reference.

Loader/player:
- `bad_sequence` sequencing (skip_invalid_orders, next_order/next_row return
  status, per-sequence scan endpoints, no `mod.len` zeroing, warn-only empty
  first sequence) — libxmp 4.7.3.
- MOD order table keeps all 128 order bytes like `mod->xxo`.
- IT accepts instruments without samples (`mod->smp = 0`).
- Invert-loop guards for bad loop parameters.
- Protracker sample-change bounds check in `queuePatch`.
- Startrekker AM sample stream offset uses the header length.
- MED: signed offset reads, expdata sanity, MAX_SAMPLES rejection, no
  placeholder sample for missing external instruments.

Mixer/output:
- Sample guard bytes replicate `libxmp_load_sample` (last frame repeated at
  the end, first frame at the start) instead of zeros.
- Anticlick discharge starts at the advanced buffer position.
- `resonance_table` copied from filter.c; `filter_setup` follows C's
  float/double evaluation; filter accumulator and anticlick product use
  exact 64-bit decomposition.
- WAV encoder writes `round(sample * 32768)`.

Verified: `SnD - Ashampoo Antispyware 1.61 crk.mod` renders byte-identically
to libxmp for the full 250 s, also per channel; the mixer-state golden suite
(110) and IT/XM loader parity (146) stay green.
