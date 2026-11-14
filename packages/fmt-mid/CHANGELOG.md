# @modplayjs/fmt-mid

## 0.3.0

### Minor Changes

- [`c0bb636`](https://github.com/modplayjs/modplayjs/commit/c0bb636f9c03a7bc56fb6ffab8d7ae05df88d3fa) - - Standard MIDI File plugin — pristine 1:1 TinySoundFont port (direct push)

### Patch Changes

- Updated dependencies [[`f59898f`](https://github.com/modplayjs/modplayjs/commit/f59898fa3aa1249e14d9ad33ce83548ffcf3db12), [`c0bb636`](https://github.com/modplayjs/modplayjs/commit/c0bb636f9c03a7bc56fb6ffab8d7ae05df88d3fa)]:
  - @modplayjs/core@0.3.0

## 0.2.3

### Patch Changes

- Initial release: Standard MIDI File (.mid) support as a pristine 1:1
  TypeScript port of TinySoundFont v0.9 (`tml.h` SMF parser + `tsf.h`
  SoundFont2 synthesizer), wired as a FormatPlugin stub + `mid` DspPlugin
  with the reference `example3.c` playback semantics. Audio is
  sample-exact against the C oracle (`tools/midref.c`), including a
  shared deterministic double-double math layer (`tools/refmath.h` /
  `src/refmath.ts`) that pins the transcendental rounding both sides use.
