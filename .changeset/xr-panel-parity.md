---
'@modplayjs/xr': patch
---

Wire the panel settings that existed but did nothing, and close the details gap.

The engine already carried view settings that no panel read. Now:
`showChannelStrip` hides the channel row, `follow` gates the pattern
auto-scroll, `visualizer` drives the bars (off/spectrum/waveform/both),
`patternColors` feeds the pattern palette, `stripDots` strips dots in cell
text, and `sampleLengths`/`sampleLoopFlags` shape the sample list.

Engine capabilities now gate the UI instead of the panel offering dead
controls: the pan row only appears when the module supports panning, the mixer
section says so when the mixer is unavailable, the seek buttons only appear for
seekable modules, and the debug panel notes when channel mute is unavailable.

Track details gained the order list ("position:pattern"), the instrument list
and the sample list, which the phone app shows and the XR panel did not.
Library settings gained "add folder" and a per-folder remove.

Remaining gaps, now listed in PARITY.md: queue panel, ignored-file restore,
pattern colour picker, FFT visualizer, background playback.
