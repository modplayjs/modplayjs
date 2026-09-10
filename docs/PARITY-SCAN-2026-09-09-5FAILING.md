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
| `duplicate_check_transpose.it` | 67 mism, +61 lines | 0.5697 | 0.5545 | **0.9713** | libxmp (0.97) | **ours** — our ch0 voice dies where C sustains; ours is ~8× louder on L (energy 0.0063 vs 0.0008): DCT/transpose duplicate-check drops/mis-handles the voice |
| `it_multi_retrigger.it` | 7 mism, 0 delta | 0.9861 | 0.9851 | 0.9812 | libxmp (0.981) | **ours** — marginal: 7 vol-state lines around IT retrig (retrig volume re-arm timing); audio-level impact small |
| `portamento_nna_sample.it` | 84 mism, +1584 lines | 0.6274 | 0.6054 | **0.9405** | libxmp (0.94) | **ours** — we spawn/keep extra NNA-tail voices: L energy 0.688 vs libxmp 0.046 (≈15×), corr L 0.47 vs R 0.996 (the extra voice is left-panned) |
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
| `duplicate_check_transpose` | No — OpenMPT tracks libxmp (0.97); ours breaks away (0.55) | our virtual-channel/DCT logic (`check_dct` virtual.c:434-471 vs our port) |
| `it_multi_retrigger` | No — OpenMPT ≈ libxmp ≈ ours (0.98) | cosmetic; IT retrig volume re-arm (read_event_it retrig path) |
| `portamento_nna_sample` | No — OpenMPT tracks libxmp (0.94); ours breaks away (0.61), extra voices keep sounding (NNA cut not applied when the channel re-patches) | our NNA cut on re-patch + voice lifetime (same family as the fixed ABAKUS alias) |
| `portamento_sustain` | Irrelevant — libxmp and OpenMPT disagree with each other (−0.19); ours matches libxmp's shape (0.94) | the 4-line period ±5 rounding only; audio-level parity unattainable against either reference at this precision |
| `reverse_it` | No — OpenMPT tracks libxmp (0.98); ours breaks away (0.77) | our reverse-loop position handling (`VOICE_REVERSE` reposition vs C mixer.c:375-420) |

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
