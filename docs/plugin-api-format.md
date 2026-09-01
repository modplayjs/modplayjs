# Format plugin API

A **format plugin** parses a tracker file into the core's data model and
applies pattern events to channel state during playback. The core ships
four — MOD, S3M, XM, IT. Any number can be registered; the first one whose
`test()` accepts the file wins.

## The interface

```ts
interface FormatPlugin {
  /** Name used for core.format(name). */
  readonly name: string;
  /** Returns true if bytes are this format (signature check). */
  test(bytes: Uint8Array): boolean;
  /** Parse the module. Throws a typed error on malformed input. */
  load(bytes: Uint8Array, ctx: LoadCtx): ModuleData;
  /**
   * Read one event cell (chn, row) and apply it to channel state.
   * This is libxmp's read_event_* (read_event.c:267/475/736/933).
   */
  readEvent(core: Core, chn: number, row: number): void;
}
```

Registration:

```ts
import { plugin as itPlugin } from '@modplayjs/fmt-it';
core.registries.registerFormat(itPlugin);
```

`test()` must be cheap and definitive (magic string check). `load()` runs
once per file; `readEvent()` runs per channel per row during playback.

## What `load()` must produce

`load()` returns a `ModuleData` and pushes raw samples into the store via
`ctx.addSample(raw)`:

- `ModuleData` — title, format tag, channel definitions (pan/vol/flg per
  channel), order table (`xxo`), patterns (per-channel `Track`s of
  `Event`s), instruments (with per-key maps into sub-instruments,
  envelopes, NNA/DCA/DCT, MIDI macro config), and the quirk set:
  `quirks`, `flowMode`, `readEventType`, `periodType`, `c4rate`,
  `mvol/mvolbase`, `defpan`, `time_factor`, `rrate`.
- `RawSample` — name, data (bytes or post-decode PCM bytes), length,
  loop/sustain points, finetune, volume, flags (LOOP/BIDIR/16BIT/STEREO)
  and decode flags (UNSIGNED / DIFF / ADPCM / 7BIT / BIGEND / INTERLEAVED).
  The core's sample store normalizes to float and applies the decode
  pipeline (delta decode, ADPCM, endian/unsigned conversion,
  planar→interleave, EOF truncation, guard samples).

Two hard rules:

1. **Sample IDs are positional.** `ctx.addSample` assigns IDs in call
   order (0, 1, 2 …); voices and instruments reference samples by these
   IDs. Call `addSample` for every declared slot, even empty ones, so ID
   arithmetic matches the format's own numbering.
2. **`load()` releases nothing** — the core clears the sample store before
   calling `load()`, so each file starts from ID 0.

## Quirks and personality

The `quirk` set is what makes the four formats differ in behavior:
ProTracker one-shot samples + sample-end channel reset, S3M volume-slide
direction + fine effects + pattern-loop rules, FT2 pan/volslide behavior,
IT envelope fade + NNA + note delay. Your loader must set the same quirk
flags libxmp's loaders set (`s3m_load.c: QUIRKS_ST3`, `it_load.c:
QUIRKS_IT`, …) — the shared effect/player code branches on them.

`readEventType` selects which event reader semantics `readEvent()`
implements (`READ_EVENT_MOD/ST3/FT2/IT`), `periodType` selects the period
formula (Amiga range vs linear vs CSPD), and `flowMode` selects
pattern-loop/jump edge cases.

## What `readEvent()` must do

Per channel: apply one pattern event cell to the channel state — note
(incl. keyoff/cut/fade), instrument, volume (+ volume-column effects),
effect arms (route to the shared processors in `effects-shared`:
`fxVolSlide`, `vibratoShared`, `toneportaShared`, flow hooks for
jump/break/loop/delay…), instrument-specific NNA/DCT checks, and the
IT/MPT note-delay and retrigger handling.

The shared processors live in `@modplayjs/effects-shared` and are the
frame-accurate C ports — a format reader's job is to translate its file's
effect encoding into those calls with the right parameters, exactly as
libxmp's `read_event_*.c` readers translate into `effects.c` handlers.

## Example: minimal format plugin

```ts
import type { FormatPlugin, ModuleData } from '@modplayjs/core';

const plugin: FormatPlugin = {
  name: 'toy',
  test(bytes) {
    return bytes.length > 8 && bytes[0] === 0x54 && bytes[1] === 0x4f; // 'TO'
  },
  load(bytes, ctx) {
    // parse header → ModuleData; per sample: ctx.addSample({...})
    // parse patterns → ModuleData.patterns[...] tracks of Event cells
    // set quirks/readEventType/periodType for this format
    const mod: ModuleData = { /* … */ };
    return mod;
  },
  readEvent(core, chn, row) {
    const ev = /* the event cell (chn, row) of the current pattern */;
    // translate to shared processors / channel state, as libxmp's
    // read_event_*.c readers do
  },
};
```
