---
'@modplayjs/xr': patch
---

Three-column details panel with expandable, floating text blocks.

The details panel is registered 2.2 x 0.95 m (the others stay at 1.2-1.8 m) and
sits further out, so message, instruments and samples fit side by side as three
tinted cards. Each card scrolls on its own and draws a scrollbar.

Expanding a card covers the panel: the panel is registered with
`PanelConfigOptions.enableTransparent = true`, and that state paints no
background, so the room behind the panel is the backdrop. The text grows to
11 sp monospace with a blurred shadow instead of a plate, which keeps it legible
over an arbitrary environment without hiding it.

The scrollbar reads Compose's `ScrollIndicatorState` (implemented by
`ScrollState`/`LazyListState`) rather than the raw value/maxValue pair, so the
same bar can drive a lazy list later. Compose has no Scrollbar composable on
Android; only the desktop artifact ships `VerticalScrollbar`.
