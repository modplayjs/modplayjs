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
