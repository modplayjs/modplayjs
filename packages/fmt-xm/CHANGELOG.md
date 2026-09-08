# @modplayjs/fmt-xm

## 0.0.2

### Patch Changes

- Loader parity fixes traced from mixer-state forensics:
  
  - core: `convertDelta` walks planar halves contiguously per channel (C runs conversions before interleaving); zero-length samples keep loop flags (C returns early for `len <= 0`)
  - fmt-it: title/name lengths (26 vs 25), MIDI-macro comment reads honor short files, patterns with `num_rows > 1024` load as empty 64-row patterns
  - fmt-xm: all instruments preallocated like `libxmp_init_instrument` (short header reads keep zeroed entries), key maps start at 0 not `0xff`, sub `gvl = 0x40` / `pan = -1` (`NO_DEFAULT_PAN`), sample names from the sample header, short sample reads zero-fill the tail
- Updated dependencies []:
  - @modplayjs/core@0.0.2
