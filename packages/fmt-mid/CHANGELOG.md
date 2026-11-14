# @modplayjs/fmt-mid

## 0.2.3

### Patch Changes

- Initial release: Standard MIDI File (.mid) support as a pristine 1:1
  TypeScript port of TinySoundFont v0.9 (`tml.h` SMF parser + `tsf.h`
  SoundFont2 synthesizer), wired as a FormatPlugin stub + `mid` DspPlugin
  with the reference `example3.c` playback semantics. Audio is
  sample-exact against the C oracle (`tools/midref.c`), including a
  shared deterministic double-double math layer (`tools/refmath.h` /
  `src/refmath.ts`) that pins the transcendental rounding both sides use.
