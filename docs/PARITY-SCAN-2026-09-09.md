# Parity scan — 2026-09-09

Reference sources of truth: **libxmp** (working tree `reference/libxmp`,
pristine checkout semantics) and **OpenMPT** (`reference/openmpt`, used as
the documented authority where libxmp is known to differ). No guessed
expectations: every row below cites a measured artifact.

## 1. Mixer-state golden suite (libxmp test-dev `.data` fixtures)

`sh tools/run-mixer-data-tests.sh` — 105 fixtures with goldens:

| Result | Count | Notes |
|---|---|---|
| PASS | 100 | byte-equal per-frame mixer state vs libxmp |
| FAIL | 5 | see table below |

### Failing goldens (libxmp = truth)

| Fixture | Divergence measured | Evidence | Suspected root cause (from C source comparison) |
|---|---|---|---|
| `portamento_sustain.it` | 4 state lines, period ±5 of ~3.1M (relative error 1.6e-6) on one late toneporta | `compare-mixer-data.mjs` rows 3–4 | IT linear-period slide fixed-point accumulation across a bidi loop; needs exact C `update_frequency` step/rounding chain |
| `it_multi_retrigger.it` | 7 lines, mixer `vol` off (e.g. 0 vs 16, 144 vs 160) around IT retrig E9x | rows 5–7 ch 0 | retrig volume ramp re-arm timing (IT `it_retrigger` semantics) |
| `duplicate_check_transpose.it` | ours emits 279 lines vs C 218 (+61); from row 4 our ch0 voice is missing where C sustains | line-delta dump | DCT/transpose duplicate-check path drops a voice C keeps (virtual.c `check_dct` vs our port) |
| `portamento_nna_sample.it` | ours 2496 lines vs C 912 (+1584); 84 mismatches; from row 6 our per-voice vol 320 vs C 273 | line-delta dump | NNA tail voice budget/lifetime: we keep/spawn extra voices (portamento + NNA interplay) |
| `reverse_it.it` | 53 mismatches + 17-line delta; `pos0` jumps (e.g. 2305 vs 968) and missing rows | line-dump | reverse-sample loop positioning (`VOICE_REVERSE` handling) |

## 2. Audio render sweep — repo testfiles vs fresh libxmp renders

`node tools/correlate.mjs <file> --skip-build --seconds 30` (ours vs C
WAV, mono-sum correlation; `bad` = frames with |Δ| > 0.05; cap 15 s after
first loop where applicable):

| File | corr | bad | maxdiff | Verdict |
|---|---|---|---|---|
| 909DEAD - Adobe CS6 activator.it | 0.9998 | 162 | 0.070 | pass |
| NBR - Light Image Resizer 4 crk.it | 0.9999 | 268 | 0.087 | pass |
| KHG - HitFilm Ultimate x64 crk.mod | 0.9999 | 64 | 0.110 | pass |
| 0BiT - MSN Emoticons Plus 3.0 crk.xm | 0.9998 | 96 | 0.158 | pass |
| KHG - Vegas Pro 12 crk.mod | 0.9997 | 889 | 0.131 | pass |
| 4DNinja - 3DAttack LSD crk.xm | 0.9997 | 377 | 0.107 | pass |
| 0x001gff - The Bat 8.x crk.xm | 0.9997 | 670 | 0.234 | pass |
| 0BiT - Fax Spider 2.1 kg.xm | 0.9989 | 193 | 0.090 | pass |
| Knetus - UltraEdit-32 kg.xm | 0.9991 | 1230 | 0.169 | pass |
| 0KRam - Winlive Pro crk.xm | 0.9992 | 1955 | 0.463 | pass |
| 4DiAMONDS - Luxology Modo crk.xm | 0.9992 | 2954 | 0.324 | pass |
| _) - WinRAR and RAR unblacklister.xm | 0.9995 | 1365 | 0.154 | pass |
| MANtiCORE - IRLink 3.xxx crk.s3m | 0.9966 | 1538 | 0.113 | pass |
| Pavel Kocourek - uTorrent Plus 3.4 crk.it | 0.9949 | 4616 | 0.142 | **fail (marginal)** |
| ABAKUS - Indian Mission DE intro.xm | 0.9998 | 406 | 0.154 | pass (was 0.7939 — fixed by the voice-pool alias fix, see §3 #1) |
| Medway Boys - Thundercats intro.sc68 | — | — | — | n/a (libxmp does not play sc68; no reference) |

## 3. Root-caused divergences (evidence-backed)

| # | Finding | Proof artifact | Status |
|---|---|---|---|
| 1 | **Voice-pool channel alias** — in `ABAKUS`, from ord0 row 33 our `map[2]` and `map[3]` resolved to the same voice slot; chn3's retrig (n58 i11) landed on chn2's live voice and clobbered it (C: chn2 sustains note 52 through row 33, changes only at row 34). Root cause: `allocVoice` never bound the slot to the channel (`v.chn` stayed FREE), so `setPatchSmp`'s `smp<0` wipe skipped the map-clear and left `map[chn]` stale; the stale entry aliased the next allocation. | `/tmp/aliascheck.mjs` output: `chn2 → voice 2, chn3 → voice 2 (smp -1)`; state diff `/tmp/abakus-c48.data` vs `/tmp/ab-ours48b.data` | **Fixed**: `allocVoice(chn)` now binds `voice.chn/root` + `map[chn].voice` at allocation (C `alloc_voice` virtual.c:266-272); `setPatchSmp`'s `smp<0` reset then clears the map via `resetVoice`. ABAKUS corr 0.7939 → **0.9998**, ours~ompt extra −0.1237 → **+0.0002** |
| 2 | **Mixer `pos0` ±1 drift** — our per-frame sample position advances ±1 sample differently than C in float-vs-fixed-point transitions (`frac` init used `Math.round`, C `VAR_NORM` truncates via `(int)vi->pos`) | state dumps above, `pos0` columns | **Fixed** (`frac` now truncates); sub-audible, visible only in state dumps |
| 3 | **uTorrent IT keyoff→retrig carry** — 629/96,045 mixer-state lines differ; chn0 at keyoff (r13) → same-instrument retrig (r14) with IT volume-column slide: our first post-retrig frame holds vol 928 vs C 797, catches up late | `/tmp/ut.data` (C `gen_mixer_data`) vs our dump; `docs/REMAINING-PARITY.md` | open — audit `reset_env`/fadeout/`v_idx` (read_event.c:1282-1291) and `VOL_SLIDE_2` `vol.memory2` carry |
| 4 | **storlek_11 exploit end-handling** — scan `num` wraps to 0 by design (scan.c:288-293); C keeps playing the loop indefinitely (≥120 s measured), our player stops immediately (`playBuffer` → -1) | `/tmp/cdur` run: `loop_count=1` after 0.33 s; our render 0 frames | open — playback must treat `num=0` as "loop forever", not "already ended" |
| 5 | **XM header flags 0x2/0x4 ignored** — ABAKUS sets `flags=0x6` (OldEffects + CompatGxx in OpenMPT semantics); libxmp also ignores them (xm_load.c:843 reads only bit 0). Our behavior matches libxmp here; **OpenMPT differs** — if OpenMPT-truth is wanted for these files, `OldEffects` (E6x/Dxx interaction) and `CompatGxx` (Gxx slide-beyond-target) need implementing behind a tracker flag | xm_load.c:843 vs OpenMPT `XM.cpp` `oldEffects`/`compatGxx` | open (decision: match OpenMPT or libxmp for these files) |

## 3a. OpenMPT cross-check (`libopenmpt-dev` 0.8.9)

Renderer: `tools/omptref.c` (cc -O2 -o /tmp/omptref tools/omptref.c
-lopenmpt) — `openmpt_module_read_interleaved_stereo` at 48 kHz into WAV,
same 30 s cap as the libxmp renders. Three-way mono-sum correlation:

| File | ours~xmp | ours~ompt | xmp~ompt | extra (ours−xmp vs ompt) |
|---|---|---|---|---|
| ABAKUS - Indian Mission DE intro | 0.7939 | 0.5147 | 0.6384 | **−0.1237** |
| Knetus - UltraEdit-32 11.00a+ kg | 0.9992 | 0.8206 | 0.8218 | −0.0012 |
| 0KRam - Winlive Pro 4.6.0 build 181 crk | 0.9989 | 0.8370 | 0.8363 | +0.0007 |
| 4DiAMONDS - Luxology Modo 1.03 crk | 0.9992 | 0.9173 | 0.9178 | −0.0005 |
| KHG - HitFilm Ultimate x64 crk | 0.9997 | 0.7267 | 0.7272 | −0.0005 |
| all other 10 files | 0.9951-0.9999 | 0.4375-0.9963 | 0.4373-0.9964 | ≤ ±0.0003 |

Verdict: for 14/15 files our output sits exactly as far from OpenMPT as
libxmp's does (extra ≤ 0.001) — the ours~ompt gap is entirely the known
libxmp↔OpenMPT semantic distance (mixer gain, ramping, interpolation,
XM flags 0x2/0x4). The single player-specific divergence beyond libxmp
parity is **ABAKUS**, and the per-second three-way profile pins it:

```
 t    ours~ompt  xmp~ompt  diff
 0s     0.6514    0.6515  -0.0002   <- identical to libxmp here
 1s     0.6544    0.6543  +0.0001
 2s    -0.1218   -0.1218  +0.0000   <- (libxmp-vs-ompt semantic, not ours)
 3s     0.8000    0.8887  -0.0887   <- our divergence starts
 4s     0.3629    0.5572  -0.1943
 5s     0.3737    0.5290  -0.1553
 13s    0.2389    0.8912  -0.6523   <- cascade through later patterns
 14s    0.4032    0.9116  -0.5084
```

The t=3 s onset matches the chn3 n58-i11 retrig at ord0 row 33 aliasing
chn2's live voice (finding #1). The t=2 s negative correlation appears
identically in libxmp's render — that second is a libxmp-vs-OpenMPT
difference, not ours.

## 4. Fixed this round (verified)

| Fix | Verification |
|---|---|
| `resetVoice` frees the slot (`chn/root = VIRT_INVALID`) matching C `virt_resetvoice` | `npx tsc --noEmit` clean; golden suite 100/5 unchanged |
| Mixer `frac` init truncates like C `VAR_NORM` (`(int)vi->pos`), not `Math.round` | typecheck clean; golden suite unchanged |
| `correlate.mjs` ours-side render used `playBuffer(..., loop=1)` — stopped at the first loop while the C reference (`xmp_play_buffer` loop=0) plays through; produced false "ours went silent" divergence (ABAKUS t=3.1-3.7 s) | loop=0 now matches C; fresh both-side renders |

## 5. Known harness caveats (not player bugs)

- `correlate.mjs` compares the mono-sum (L+R)/2 — hard-panned content can
  cancel; per-channel checks used where relevant.
- `gen_mixer_data`-style dumps run the C player at 44.1 kHz fixed; ours is
  dumped at the same rate for comparison.
- The libxmp working tree must be pristine when regenerating goldens
  (`git -C reference/libxmp status`); session-2 left behavioral C edits once.
