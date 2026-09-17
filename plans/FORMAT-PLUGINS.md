# modplayjs — missing format plugins roadmap

Source of truth: `reference/libxmp` (PRIMARY, per plans/modplayjs-tracker-lib.md),
`reference/openmpt` (fill-in only). Usage numbers: full recursive walk of Modland
(516,115 files, 2026-09-17), cached in `plans/modland-format-usage.json`.

Key reference facts (verified, no guessing):

- ProWizard (`reference/libxmp/src/loaders/prowizard/`) is a **depacker pipeline**:
  `pw_check()` (prowiz.c:143) probes ~44 entries in a strict order table
  (prowiz.c:32-84), the winner's `depack(in,out)` writes a standard 31-sample
  `M.K.` MOD, and `pw_load.c` feeds it through the normal MOD loader
  (`libxmp_decode_protracker_event`, `PERIOD_MODRNG`). Packed files have **no
  file extension** (`docs/formats.txt` lists `-`); detection is content-only.
- libxmp ships acceptance criteria for every packer: 41 loader tests +
  36 fuzzer tests (`test-dev/all_tests.txt:243-944`), fixtures under
  `test-dev/data/format_*`.
- OpenMPT has NO ProWizard equivalent (only Load_nru/Load_unic borrow Asle's
  code) — libxmp is the sole reference for the packers.
- Ported today: fmt-mod, fmt-s3m, fmt-xm, fmt-it.

---

## Wave 0 — fmt-mod reusable core (DONE first)

Split `fmt-mod` so the "depacked M.K. bytes → ModuleData" path is importable.
`pw_load.c` is the design: depackers produce synthetic MOD bytes, one shared
loader parses them. Acceptance: existing fixtures parse identically; synthetic
`M.K.` bytes parse via the new entry point.

## Wave 1 — cheap MOD-family plugins (reuse fmt-mod internals)

Order within wave = usage ÷ effort:

| # | Plugin | C ref (LOC) | Modland files | Notes |
|---|--------|-------------|---------------|-------|
| 1 | MTM | mtm_load.c (349) | 790 | MOD-pattern + finetune; 3 fixtures |
| 2 | STM + STX | stm_load.c (498), stx_load.c (384) | 234 | STX shares the reader |
| 3 | 669 | 669_load.c (262) | 172 | 8ch, tiny own cmd table |
| 4 | SFX | sfx_load.c (269) | 358 | IFF FORM..SONG |
| 5 | DIGI | digi_load.c (250) | 168 | `DIGI Booster module` @0 |
| 6 | Asylum | asylum_load.c (185) | 42 | AMF v1 variant |
| 7 | Ice/MTN + Soundtracker UST | ice_load.c (206), st_load.c (517) | 1,955 | completes .mod magic table |

Result: every `.mod`-family magic in docs/formats.txt parses.

## Wave 2 — ProWizard core + depackers

New shared package `@modplayjs/prowizard-core`:

- port prowiz.c + ptk.c + ptktable.c + tuning.c (443 LOC) — probe-order table,
  pw_move_data, note table
- each depacker = pure `test(bytes, start): boolean` + `depack(bytes): Uint8Array`
  (synthetic M.K. bytes) → hand off to fmt-mod core from Wave 0
- acceptance: libxmp's `test_loader_*` fixtures (41) must pass; fuzzer fixtures
  (36) must not crash

Depacker order (by fixture count first, then shared code):

| # | Depacker group | LOC | Fixtures |
|---|----------------|-----|----------|
| 8 | ProPacker 1.0/2.1/3.0 (pp10+pp21+pp30) | 938 | 8 |
| 9 | The Player 4.x/5.x/6.x (p40+theplayer) | 1,122 | 5 |
| 10 | Tracker Packer 1/2/3 (tp1+ptk+tp3) | 562 | 3 |
| 11 | UNIC 1/2 id/noid/id0 (unic+unic2) | 657 | 4 |
| 12 | NoisePacker 1/2/3 | 862 | 3 |
| 13 | Heatseeker, KSM, Hornet, XANN, Wanton, Zen, AC1D, DI, Eureka, FC-M, Fuchs, Fuzzac, GMC, Noiserun, Novotrade, Pha, Prorunner 1/2, SKYT, Starpack, Titanics, Module Protector | ~4,000 | 1 each |
| 14 | Promizer 1.0c/1.8a, then 2.0/4.0 | 596+862 | 2 |
| 15 | P61A | 1,017 | 1 — delta-packed samples; do after Promizer |

Skipped upstream (don't port): pw_pm01 (commented out of pw_formats,
prowiz.c:81), pw_kris.

## Wave 3 — own-format PC trackers

| # | Plugin | C ref (LOC) | Modland files | Notes |
|---|--------|-------------|---------------|-------|
| 16 | PTM | ptm_load.c (389) | 101 | MTM-derived |
| 17 | DBM | dbm_load.c (610) | 1,011 | needs echo/delay effect in softmixer |
| 18 | ULT | ult_load.c (371) | 91 | bit-packed samples V800/900/1000 |
| 19 | GDM | gdm_load.c (455) | 64 | S3M effect remap |
| 20 | MDL | mdl_load.c (1,252) | 61 | custom bitstream sample codec |
| 21 | tail: FAR (484), IMF (563), RTM (711), LIQ (753), DTM (933), IMS (302), Digital Symphony (632) | | <40 each | grab-bag |

## Wave 4 — MED/OctaMED family (biggest single chunk)

| # | Plugin | C ref (LOC) | Modland files |
|---|--------|-------------|---------------|
| 22 | mmd_common.c (1,162) + MMD0/MMD1 | ~1,400 | 4,169 |
| 23 | MMD2/MMD3 | 598 | 965 |
| 24 | MED2/MED3/MED4 + IFF-SMUS | 1,626 | 10,394 |

After Wave 2 because MED files are frequently PowerPacker-compressed (`PP20`).

## Wave 5 — hardware-dependent (blockers first)

| # | Plugin | Blocker |
|---|--------|---------|
| 25 | FLT4/FLT8 | Amiga low-pass filter in dsp-paula first |
| 26 | HMN | OPL/FM core |
| 27 | Galaxy J2B | FM core for half its tracks |
| 28 | UMX | free after Wave 1 (dispatch wrapper only) |

## Anti-order notes

- Don't start with MED despite usage: 3,790 LOC + synth instruments + IFF
  subtrees; Wave 1+2 deliver ~85% of corpus reach for ~15% of the code.
- Don't skip Wave 0: without the reusable fmt-mod core every Wave-1 plugin
  duplicates the pattern decoder.
- OpenMPT-only formats (SymMOD, MT2, PSM, MO3, GT2, GTK, PT36, FC, FTM, ITP,
  MID/WAV-as-module, UNIC/NRU standalone, CBA, ETX, C67, KRIS, STK, XMF
  standalone, PUMA, GMC standalone): skip — no clean libxmp reference; the
  plan doc makes libxmp the single authority.

## Cadence

One plugin per PR. Each PR: port the C loader line-by-line, wire
`test()/load()/readEvent()`, run the libxmp `test_loader_*` fixtures for that
format as acceptance, `npm run typecheck`, fixture smoke script. Extend
`Modland` usage table when choosing what's next.
