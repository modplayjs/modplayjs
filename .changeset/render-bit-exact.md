---
'@modplayjs/core': patch
'@modplayjs/dsp-softmixer': patch
---

Six player fixes that make the 48 kHz render bit-identical to libxmp for the
whole `testfiles/` + `testfiles2/KEYGENMUSiC MusicPack/BetaMaster` corpus:

- **Anticlick arming** (`core/src/virtual.ts`). `mixer_setvol` arms the
  anticlick on every `vol == 0` write (mixer.c:946-950) — there is no
  previous-volume guard — and `libxmp_virt_resetvoice` calls it before wiping
  the voice (virtual.c:88-90), so a note cut still discharges its last mixed
  level. Ours skipped both paths.
- **`voicePos` anticlick** (`core/src/virtual.ts`). `libxmp_mixer_voicepos`
  ends with `if (ac) anticlick(vi)` (mixer.c:834-836); `libxmp_virt_voicepos`
  always passes `ac = 1` (virtual.c:599). The port only zeroed the ramp
  accumulator.
- **Linear pitch-bend truncation** (`core/src/effects/helpers.ts`).
  `libxmp_period_to_bend` returns `int` (period.c:223) and its LINEAR branch
  has no `libxmp_round` — the conversion truncates toward zero.
- **Default MIDI macro** (`core/src/effects/tick.ts`). `update_midi_macro` is
  called for every channel regardless of `module->midi`; without a MIDI config
  it still applies the default macro (fixed → resonance, parameterized 0 →
  cutoff, player.c:532-541).
- **Mono-sample filter** (`dsp-softmixer`). `FILTER_MONO` filters only the
  left value and `MIX_STEREO` then duplicates it; the port duplicated the
  *pre-filter* sample into the right channel.
- **`playBuffer` frame carry** (`core/src/core.ts`). `xmp_play_buffer` keeps
  a partially copied frame in `p->buffer_data` and resumes it on the next
  call (player.c:2244-2257); the port dropped the remainder, so every buffer
  boundary shifted the stream.

The parity harness builds the C oracle with `-ffp-contract=off`
(`tools/build-ref-libxmp.sh`) so the reference is not fused into FMAs on
targets that have them.
