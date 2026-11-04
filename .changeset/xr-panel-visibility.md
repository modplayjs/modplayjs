---
'@modplayjs/xr': patch
---

Show only the panels the current player state can use, and add one Home control.

Visibility is now a single rule table: the library is always visible (it is
home), Now Playing appears with a module, Pattern only when the engine reports
`patternView` (SID and streamed modules have no grid), Details only when the
track reports details, Debug only with the marker toggle, and Settings, Queue
and Ignored only while opened. Previously Pattern and Details were driven by
`hasTrack` alone, so a SID module opened an empty pattern grid.

Every panel header now carries the same Home chip, backed by one `XrApp.goHome()`
that closes the three on-demand panels. The library sits in the arc
permanently, so returning home needs no layout or camera change. The chip
replaces the per-panel close buttons, which all did different things.
