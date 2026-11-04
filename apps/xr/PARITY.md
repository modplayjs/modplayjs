# Feature parity — apps/android → apps/xr

Status of every feature the phone app exposes. „XR" means the implementation
lives in `com.bitti06.modplayjs.xr` and is reachable from a panel.

| Phone feature | Source | XR status |
|---|---|---|
| Tabs Home / Library / Favorites / Playing | `ui/App.kt` | panels: Now Playing, Library (with Favoriten/Recent), Pattern, Details, Settings, Debug; arc layout with optional free placement |
| Library scan (SAF folders) | `library/SafScanner.kt` | **yes** — `ACTION_OPEN_DOCUMENT_TREE`, `DocumentFile` walk, persisted grants |
| Library single documents | — | **yes** — `ACTION_OPEN_DOCUMENT`, multi-select |
| Ignored files | `LibraryRepository` | **yes** — per-URI ignore (⌀), count, reset |
| Favorites | Room `Favourite` | **yes** — SharedPreferences set, star per row, Favoriten tab |
| Recents | Room query | **yes** — 24-entry ring, Recent tab |
| Search / filters / sort | `LibraryScreen` | **yes** — text search (BasicTextField), tabs, sort by Name/Format/Größe/Ordner |
| Queue, repeat, shuffle, auto-advance | `PlaybackSession` | **yes** — `Playlist` (off/all/one, shuffle, auto-advance, jam) |
| Queue view (`QueueScreen`) | `ui/LibraryScreen.kt` | **yes** — queue panel, tap a row to jump |
| Ignored files per file restore (`IgnoredScreen`) | `ui/LibraryScreen.kt` | **yes** — ignored panel, restore per file |
| Pattern colour picker (`PatternColorsScreen`) | `ui/SettingsScreens.kt` | **yes** — swatch cycles the phone app's palette |
| Next / previous | transport | **yes** — transport row |
| Seek | transport | **yes** — ±10 s and tap-to-seek on the bar |
| Volume | settings | **yes** — slider, engine master, persisted |
| Channel mute / solo | `ChannelStrip`, `soloChannel` | **yes** — tap = mute, long-press = solo, both read back from the snapshot |
| Pattern view | `ui/PatternScreen.kt` | **yes** — `getPattern` polled, playhead highlighted |
| Track details (orders/instruments/samples/message) | `ui/PlayerScreens.kt` | **yes** — order list, instrument list, sample list (with length/loop flags), message |
| Visualizer (spectrum/waveform/both) | `ui/PlayerScreens.kt` | **yes** — `view.visualizer` drives the bars from channel levels; no FFT yet |
| Playback: repeat/shuffle/jam settings | `SettingsScreens.kt` | **yes** |
| Audio: pan, interpolation, voices, tempo | `SettingsScreens.kt` | **yes** |
| Mixer: mode, layout, A500 filter | `SettingsScreens.kt` | **yes** |
| SID: chip, video, quality, channels | `SettingsScreens.kt` | **yes** |
| Appearance: reduced motion, strip, dots, pattern view, follow, sample lengths/loop, pattern colours | `SettingsScreens.kt` | **yes** — all settings the engine already carried are now read by the panels; theme is fixed dark on purpose |
| Library settings: folders, ignored | `SettingsScreens.kt` | **yes** — add folder, per-folder remove, ignored count + reset |
| Diagnostics: engine, rate, session | `SettingsScreens.kt` | **yes** |
| About / licenses / language | `AboutScreens.kt` | **yes** — license section, per-app locale via `LocaleManager`, strings in `values`/`values-de` |
| Background playback service + notification | `media/PlaybackService.kt` | **no** — out of scope for now (audio stops on focus loss) |
| Media session / sticky notification | `media/StickyMediaNotificationProvider.kt` | **no** — Horizon OS has no notification shade |
| System audio effects (equalizer) | `PlayerScreens.kt` | **no** — replaced by spatial settings |
| Spatial audio (objects, layout, pan, HRTF) | — | **yes**, XR only |

## Panel placement: free vs stationary

## Details panel

Registered wider than the rest (2.2 x 0.95 m) so the three module text blocks —
message, instruments, samples — sit side by side, each its own tinted card with
an independent scroll and a drawn scrollbar. Tapping a card expands it over the
whole panel, and the expanded state paints no background, so the room behind the
panel is the backdrop. See "Hole punching" below for what the panel config has to
set for that to be actual see-through rather than blended dark. The text then
uses 11 sp monospace with a blurred black shadow (`TextStyle.shadow`) instead of
a plate, which keeps it legible without hiding the environment.

The facts (orders, key/value rows) move below the three cards and keep their own
`LazyColumn`. The card tint is `lerp(surfaceContainer, accent, 0.18f)`, the same
blend the phone app uses in `InfoBox`.

## Hole punching and thumbstick scroll

Meta's layer page gives transparency as a five-part recipe, and `enableTransparent`
is only one of the five:

```kotlin
layerConfig = LayerConfig(filters = LayerFilters.HIGHEST_QUALITY, zIndex = -1)
layerBlendType = PanelShapeLayerBlendType.ALPHA_BLEND
enableLayerFeatheredEdge = true
alphaMode = AlphaMode.HOLE_PUNCH
panelShader = SceneMaterial.HOLE_PUNCH_PANEL_SHADER
```

All five live in `TransparentPanelSettings`, which wraps the ordinary details-panel
`UIPanelSettings`, so width, height, `dpPerMeter` and the render mode stay the same
as every other panel. `filters` is also available through
`PanelRenderMode.Layer(filters = …)`, but that overload builds its `LayerConfig`
with `zIndex = 0`, and the documented recipe asks for -1; naming the `LayerConfig`
outright covers both in one place.

`Scene.enableHolePunching(true)` is deliberately **not** called. It is a
scene-wide switch, and the documented recipe above is per panel: the same page
reaches hole punching entirely through `PanelConfigOptions`. Nothing in the
recipe asks for the scene flag.

`Scene.setPanelControllerScrollFactor(1.6f)` multiplies the thumbstick scroll
speed on panels once in `onSceneReady`. A 32-channel pattern is wider than the
panel, and at the default factor crossing it takes an unreasonable number of
thumbstick pushes.

## Panel animation

Switching modes slides the panels into place (320 ms, smoothstep, position +
`Quaternion.slerp`) via `PanelAnimator`, a `SystemBase` registered with the
`SystemManager`, which calls `execute()` once per frame. Grabbing a panel
cancels its own slide. First placement and an explicit reset are instant: a
panel should appear where it belongs instead of flying in from the origin.

| | free | stationary |
|---|---|---|
| pose | user's, saved per panel id | fixed arc, `defaultPose(id)` |
| `Grabbable` | set | **removed** (ISDK turns it into a grabbable interactable otherwise) |
| track change | keeps the user's pose | re-applies the arc |
| switching | restores the saved arrangement | saves the arrangement first, then applies the arc |
| reset | wipes saved poses and returns to the arc | same |

Free poses are written to `xr.layout` on input-focus loss, on pause and in
`onSpatialShutdown`, so a grab survives both a restart and an OS kill.
Free mode is the default (`free = true` in the panel prefs).

The settings panel is excluded from the switch: it hosts the toggle, so moving
it out from under the user's hand mid-tap would be the one jump they cannot
follow. Only its grab state changes.

## Panel visibility per player state

The activity owns one rule table (`updatePanelVisibilityAndLayout`):

| Panel | Shown when |
|---|---|
| Library | always (it is home) |
| Now Playing | a module is loaded |
| Pattern | a module is loaded and the engine reports `patternView` (no SID/stream) |
| Details | a module is loaded and the track reports details |
| Debug | the source-marker toggle is on |
| Settings / Queue / Ignored | only while the user opened them |

Every panel header carries the same Home chip (⌂), which closes the three
on-demand panels; the library is always in the arc, so returning home needs no
camera or layout change. The gear next to it still opens Settings.

## Debug markers

The source-marker switch puts one small sphere per spatial channel on the ring,
in the same colour the channel has in the pattern view and the debug panel, sized
by the channel's peak level. Three things matter there:

- `mesh://sphere` is parameterised, not a fixed primitive. Meta's 3D objects page
  defines it as a "sphere mesh with a radius defined by the attached
  `Sphere(radius: Float)` component". Without that component the toolkit's mesh
  creator throws (`ToolkitFeature.createSphereMesh` requires the component), and
  the entity takes the app down with it — that was the crash behind the switch.
  Radius 0.5 m with a base `Scale` of 0.02 gives a 2 cm marker, growing to 12 cm.
- `Scale` (documented for meshes) carries the live size, so a level change is a
  component write instead of a mesh rebuild. Levels are refreshed at 10 Hz on
  their own timer; the panel snapshot's 2 Hz would step visibly.
- Entities are created, moved and destroyed on the main thread only. The audio
  thread captures the azimuths and the object list and posts the work, because a
  track change can rebuild the output while an update is still queued.

## Behaviour fixes from this audit

Settings that existed in the panel but did nothing are now wired:

- `view.showChannelStrip` hides/shows the channel row in Now Playing.
- `view.follow` gates the pattern auto-scroll instead of always following.
- `view.visualizer` drives the bars (off/spectrum/waveform/both) instead of a
  static decoration.
- `view.patternColors` feeds the pattern palette; `view.stripDots` strips dots
  in cell text.
- `view.sampleLengths` / `view.sampleLoopFlags` shape the sample list.
- Engine capabilities gate the UI: no pan row when the module ignores panning,
  a note instead of mixer options when the mixer is unavailable, no ±10 s when
  the module is not seekable, a note when channel mute is unavailable.

## Deliberately different

- Theme is dark-only (stated in the panel); the panel is not a phone window and a light surface in a
  dark room costs contrast.
- Visualizer renders channel levels, not an FFT. The setting exists so a real
  spectrum view can be added without a schema change.
- Panel strings live in `res/values/strings.xml` and `values-de`; the language
  switch now changes the whole UI, not just the app label.

## Still missing

1. Background playback (foreground service): audio stops when the app loses
   focus, which Horizon OS treats as the pause request. Left out on purpose.
2. Real spectrum analyser (FFT): the visualizer draws channel levels, so
   "spectrum" and "waveform" show the same data. Real bins need new engine
   output, not new UI.
