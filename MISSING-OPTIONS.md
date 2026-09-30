# modplayjs vs XMPlay playback options — gap analysis

Status after the C-parity work (all four formats ≥ 0.998 vs libxmp).
Estimated only — nothing implemented yet except where noted.

## 1. Universal Y/Z effects in XM + S3M

| | |
|---|---|
| What's missing | XM/S3M loaders don't map `Yxx` (panbrello) / `Zxx` (filter cutoff+resonance); no MPT auto-detection quirk to auto-enable |
| Reusable already | Dispatch cases `FX_PANBRELLO`, `FX_PANBRELLO_WF` ✓ exist; panbrello LFO processing ✓ (`processPan`); filter DSP path ✓ (`filterSetup`, `EX_FILTER` arm, mixer `DSP_EFFECT_*` plumbing, `FILTER` quirk gate) |
| Changes | ~10–15 lines in `fmt-xm/xm.ts` + `fmt-s3m/s3m.ts` xlat tables (map fx byte → `FX_PANBRELLO` / `FX_FILTER`-pair) + 1 quirk flag (`universal_fx`) + a gate check in the 2 readers. MPT auto-detect: ~5 lines per loader (set quirk when cwt = ModPlug) |
| Side effects | Low. Zxx changes the filter state mid-note — the filter DSP path is only active when `Quirk.FILTER` is set; enabling it for XM/S3M universally could alter playback of existing XM/S3M files that use raw `Zxx` bytes as other effects. Needs gated-at-load approach like libxmp. Risk: **moderate** — verify HitFilm/Vegas/XMs don't regress |
| Effort | ~half a session with the C-parity harness |

## 2. "Sensitive" ramping mode

| | |
|---|---|
| What's missing | Fade-in of new notes only when the sample doesn't already start near zero; currently we always ramp new notes from 0 |
| Changes | ~5–10 lines in the `dsp-softmixer` mix loop: when a new-note ramp begins, check the first sample value and skip/shorten the ramp if so |
| Side effects | **Medium risk** — changes every new-note attack for all formats; the current always-ramp behavior is what the 0.9995–0.9999 C-parity numbers were measured with. Would need to default off. libxmp has no such mode — no C reference to verify against |
| Effort | Small code, ear-only tuning |

## Re-verified detail (code-checked)

### Pan separation knob — IMPLEMENTED

| | |
|---|---|
| Now | `core.setPanSeparation(v)` (clamped 0-200, default 100) + `getPanSeparation()`; demo slider wired. Verified: 0 = mono, 100 = as-panned, 200 = widened |

### Surround Sound

| | |
|---|---|
| Current | Mode-1 only: `PAN_SURROUND` -> L = vol, R = -vol in the mixer pan split. No mono-format handling (`XMP_FORMAT_MONO` absent), no "mode 2 ignores panning" |
| Gap | Mode 2 needs: a mono/surround-mode flag that forces the mixer pan split to a centered/downmixed split |
| Change | ~10 lines in the mixer pan split + a format/mode flag on `s` |
| Side effects | Low - off by default; mono downmix would change ALL current output (stereo->mono), so opt-in per playback |

### Interpolation — PLUMBING FIXED (2026-09-29)

| | |
|---|---|
| Now | `CoreConfig.interp` / `core.setInterpolation(v)` (clamped 0-2) feed `s.interp`; the softmixer syncs its mirror field from `core.ctx.s.interp` at the top of every `renderFrame`, so the setting takes effect immediately. `getInterpolation()` reads it back. Verified end-to-end: config + setter + spline render |
| Was | `CoreConfig.interp` set `core._s.interp` but the softmixer read its own never-synced `this.interp` field — the knob was dead |
### Virtual channels — PLUMBING FIXED (2026-09-29)

| | |
|---|---|
| Now | `CoreConfig.numVoices` / `core.setNumVoices(v)` (clamped 1-128) feed `s.numvoc`; `VirtualLayer.on()` receives it and sizes the pool + NNA overflow exactly like C `virt_on` (virtual.c:107-126: `num = mixer_numvoices(ctx, -1)`). Takes effect on the next `startPlayer`, like C. `getNumVoices()` reads it back. Verified end-to-end: config + setter + clamp + render |
| Was | `MAXVOICES = 128` hardcoded; `CoreConfig.numVoices` set `core._s.numvoc` but virtual.ts never read it — the config knob was dead |

### StarTrekker FLT4/FLT8 loader (missing format)

| | |
|---|---|
| Found by | tools/compare-mixer-data.mjs over reference/libxmp/test-dev/data (8 flt_am_*.mod fixtures FAIL: unsupported module type) |
| What | StarTrekker Audio Setup (.mod with FLT4/FLT8 magic) — separate C loader `flt_load.c`, not ported. Uses Amiga low-pass filter effects (the flt_am_* fixtures test exactly that) |
| Change | ~300-400 lines: port flt_load.c (pattern format is MOD-like, effects are MOD effects; the FLTx-specific part is the audio setup) |
| Side effects | None — additive new format support |

### Remaining (unchanged from first pass)

- Universal Y/Z (XM/S3M) - moderate; dispatch ready, loader mapping + quirk needed
- Sensitive ramping - no C reference; touches every note attack; recommend skip
- MOD mode / VBlank override - small; scanner must run after the override
