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
| Next / previous | transport | **yes** — transport row |
| Seek | transport | **yes** — ±10 s and tap-to-seek on the bar |
| Volume | settings | **yes** — slider, engine master, persisted |
| Channel mute / solo | `ChannelStrip`, `soloChannel` | **yes** — tap = mute, long-press = solo, both read back from the snapshot |
| Pattern view | `ui/PatternScreen.kt` | **yes** — `getPattern` polled, playhead highlighted |
| Track details (orders/instruments/samples/message) | `ui/PlayerScreens.kt` | **yes** — snapshot fields, message |
| Visualizer (spectrum/waveform/both) | `ui/PlayerScreens.kt` | channel level bars; no FFT yet |
| Playback: repeat/shuffle/jam settings | `SettingsScreens.kt` | **yes** |
| Audio: pan, interpolation, voices, tempo | `SettingsScreens.kt` | **yes** |
| Mixer: mode, layout, A500 filter | `SettingsScreens.kt` | **yes** |
| SID: chip, video, quality, channels | `SettingsScreens.kt` | **yes** |
| Appearance: reduced motion, strip, dots, pattern view, follow | `SettingsScreens.kt` | **yes** (theme fixed dark) |
| Library settings: folders, ignored | `SettingsScreens.kt` | folder counts + remove, ignored reset |
| Diagnostics: engine, rate, session | `SettingsScreens.kt` | **yes** |
| About / licenses / language | `AboutScreens.kt` | **yes** — license section, per-app locale via `LocaleManager`, strings in `values`/`values-de` |
| Background playback service + notification | `media/PlaybackService.kt` | **no** — out of scope for now (audio stops on focus loss) |
| Media session / sticky notification | `media/StickyMediaNotificationProvider.kt` | **no** — Horizon OS has no notification shade |
| System audio effects (equalizer) | `PlayerScreens.kt` | **no** — replaced by spatial settings |
| Spatial audio (objects, layout, pan, HRTF) | — | **yes**, XR only |

## Deliberately different

- Theme is dark-only; the panel is not a phone window and a light surface in a
  dark room costs contrast.
- Visualizer renders channel levels, not an FFT. The setting exists so a real
  spectrum view can be added without a schema change.
- Panel strings live in `res/values/strings.xml` and `values-de`; the language
  switch now changes the whole UI, not just the app label.

## Still missing

1. Foreground service so audio survives focus loss (deliberately postponed).
2. Real spectrum analyser (FFT); the visualizer renders channel levels.
