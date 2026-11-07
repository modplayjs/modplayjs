# modplayjs Android (V8)

Native Android 15+ player around the existing JS core.

## Requirements

- JDK 21
- Android SDK 37, build-tools 37.0.0, NDK 29.0.14206865, CMake 4.1.2
- Node 22
- Gradle 9.8.2 (wrapper included)


## Open in Android Studio

Open the **`apps/android`** folder directly: `File → Open → apps/android`.
Android Studio uses the Gradle wrapper (9.8.2) and the version catalog in
`gradle/libs.versions.toml`.

Included run configurations:

- **assembleDebug**
- **assembleRelease**

For a full V8 build, fetch the pinned prebuilt first. Without `v8Dir` the app
builds the stub JNI so the UI/library work can be developed.

## Previews

Compose has no layout files, so the equivalent of the layout editor is the
preview pane. Every screen file carries its own `@Preview`: open the file (for
example `ui/PlayerScreens.kt`), pick a preview at the top right of the code
editor, and the screen renders beside it with sample data from
`ui/PreviewData.kt`.

Previews never touch Room, V8 or an `AudioTrack` — those need a device and are
what leave a preview stuck on its start-up screen. Actions are no-ops
(`PreviewActions`), text is read from `AndroidSnapshot` fixtures, and the back
handler is skipped while `LocalInspectionMode` is set.

`ui-tooling-preview` is a normal dependency and `ui-tooling` is
`debugImplementation`, so the release build does not carry the preview UI.

If the pane stays on "Initializing":

1. `Build → Rebuild Project` once. The preview renders the debug variant; a
   failed or not-yet-run build keeps it on the start-up screen.
2. `File → Sync Project with Gradle Files` after pulling changes that touch
   the catalog — a stale model still has the old dependency list.
3. Watch the `Build` window while the pane initializes; a compile error there
   is the reason, not the preview.

## Build

```sh
npm ci
npm run build
npm run build:engine -w @modplayjs/android
cd apps/android
./gradlew :app:assembleDebug
```

V8 is a pinned prebuilt static library from NativeScript/v8-buildscripts
(V8 14.9.207.39, NDK r29). No depot_tools or Chromium checkout.

```sh
node apps/android/scripts/fetch-v8.mjs arm64-v8a
cd apps/android
./gradlew :app:assembleDebug \
  -Pv8Dir="$(node apps/android/scripts/fetch-v8.mjs arm64-v8a)"
```

Or simply:

```sh
./apps/android/scripts/build-local.sh
```

## Release

`RELEASE.md` is the runbook: upload keystore, version bump, `bundleRelease`,
artifact checks (16 KB alignment, signature, manifest) and the Play Console
checklist. `PRIVACY.md` is the privacy policy text for the store listing and
`store/listing.md` holds the listing copy in both languages, so neither has to
be written under pressure at upload time.

The version stays `0.0.1` (`versionCode 1`) until the Play pipeline is ready;
the first upload is what fixes the numbering.

## CI

`.github/workflows/android.yml` fetches the pinned prebuilt V8, builds the
debug APK, and verifies 16 KB ELF segment alignment.

## What the app does

- Scans folders through the Storage Access Framework (persisted tree grants),
  indexing tracker modules, SID tunes and streamed audio into Room, with
  favourites, ignore list, search and filters. The engine reports what it can
  play (`formats:mod,xm,…`); when that signature changes, the library rescans
  itself once so it stops listing formats the build no longer opens.
- Plays through the JS core in V8: float32 stereo into an `AudioTrack`, a
  queue with repeat/shuffle/auto-advance, channel mute/solo, per-format accent
  colours and an AudioEffect panel entry.
- Settings → Audio reports what the platform says about spatial audio on the
  current output: whether it is supported, whether the user switched it on,
  whether the effect can process the device that is plugged in, which channel
  beds it renders with individual positions, and whether a head tracker is
  present. The bed list is selectable: "Automatic" takes the widest the device
  reports, and a stored choice falls back to that widest one when the headset
  changes — a mask the device no longer places would only be folded. Head
  tracking appears twice, because "available" and "used" are different: the
  engine still emits stereo, and the platform only spatializes multichannel
  content, so a tracker is available but not applied to our audio until the bed
  renderer lands. The switches themselves are read-only — Android has no API to
  enable spatial audio or head tracking, they are per-headset system settings —
  so the section ends with a link to Bluetooth settings, where both live.
- Swiping on the player slides in a panel over it: left for the folder the
  playing file lives in, at that file's directory; right for the audio controls
  (volume, pan, interpolation, voices, tempo and the mixer). Neither is a
  navigation destination — the player keeps running underneath, and a panel
  closes by swiping it back out, tapping the scrim, or Back. Picking a track
  plays it and closes the folder panel; with no library row for the tune it
  opens the folder list instead.
- The transport row carries the repeat toggle (off / all / one); the queue,
  which is the list playback started from, is listed from Track details.
- Playback survives a process restart: the queue (as library ids), the current
  entry and the position are stored a few seconds apart, and on launch the track
  is loaded, seeked back and either resumed or left paused, whichever it was.
  Rows that no longer exist in the library are dropped.
- Playback continues with the screen off: a media foreground service, a partial
  wake lock held only while playing, and a drain loop that notices when the
  framework invalidated its `AudioTrack` and reopens it instead of writing into
  a dead object. What still ends playback, by design: swiping the app out of
  recents, an app update, and the system reclaiming the process under real
  memory pressure.
- Audio focus is requested before the first frame is written, with delayed gain
  accepted (a call locks focus instead of refusing it) and pause-on-duck off, so
  a notification sound ducks the music through the system's automatic ducking
  and no callback is involved. A lost focus pauses; a regained one resumes only
  if it was playing when it was interrupted. The engine may not start output on
  its own: `PlaybackSession.audioFocusHeld` is a gate the service installs, so
  the `AudioTrack` stays paused until focus is granted, which is also what
  Android 17 checks before it lets a process be audible.
- One `MediaSession` lives for the whole service lifetime. Rebuilding it per
  track (the old way to bring a swiped-away card back) makes Media3 remove the
  last session, which cancels the notification and stops the foreground
  service; the next track then re-enters the foreground from the background,
  which Android 12+ may refuse and which on Android 17 yields a foreground
  service without while-in-use capability. Background audio hardening then
  silences `AudioTrack.write` with no error, no underrun and no dead object.
  The card is restored by the provider instead, which does not touch the
  session.
- The header opens a realtime pattern view: rows x channels of tracker text
  ("C-4 01 40 A0F"), the playing row highlighted and followed, columns scrolling
  sideways. The engine answers it on demand; the snapshot speeds up to 16 Hz
  while it is open so the playhead keeps up, and landscape hides the system bars.
  Each field (note, instrument, volume, effect) can be coloured in Settings ->
  Appearance -> Pattern colours; a field left on the theme colour follows light
  and dark, and one row resets all four.
- Media3 `MediaSessionService` owns the notification, lock-screen and media
  buttons. It is shown a 64-item window around the current track rather than the
  whole queue, which can be thousands of items: every playlist change is mapped
  and sent across the session binder on the main thread. The current item
  publishes its length as metadata so the system media card can draw a scrubber;
  its timestamps are SystemUI's own element, not something the session feeds. The
  card carries one custom button, a heart that favourites the playing track, and
  is marked ongoing while playing (StickyMediaNotificationProvider) so it cannot
  be swiped away mid-track.
- Diagnostics screen reports the engine, the audio path (buffer frames and
  time, framework minimum, play state, device burst, effects panel), whether
  audio focus is held and whether the playback foreground service is running,
  and the capabilities the engine reports for the loaded track.
- UI in English and German, chosen in Settings → Language; the same list is
  declared in `res/xml/locales_config.xml` for Android's per-app language
  settings.

## Notes

- `minSdk 35` (Android 15), `compileSdk`/`targetSdk` 37 (Android 17), package
  `com.bitti06.modplayjs`, debug suffix `.debug`.
- Compose Material 3 Expressive (`MaterialExpressiveTheme`), Navigation 3 for
  the modal stack, Room 3 (`androidx.room3`) with destructive schema changes.
- No iOS/desktop support, no WASM, no prerender, no WebView. The UI is native
  Compose; the JS core runs headless in V8.
- `ViewSettings` still carries `patternView`, `artwork` and `visualizer` flags;
  the Android UI does not surface them yet. `follow` drives the pattern view's
  auto-scroll.
- Android 17 hardening: edge-to-edge with system bar icons following the in-app
  theme, `useLegacyPackaging = false` so `libmodplay_v8.so` is mapped read-only
  from the APK, and 16 KB page alignment for the native library.

## Source map

| path | contents |
|---|---|
| `MainActivity.kt`, `ModplayApp.kt`, `AppGraph.kt` | entry point, warm-up, process-wide singletons |
| `engine/` | `PlaybackSession` (queue, transport, snapshots), `V8Engine` JNI, `AudioTrackOutput`, `PcmRing`, settings store |
| `library/` | Room 3 entities/DAO, repository and SAF scanner |
| `media/` | Media3 session service and `SimpleBasePlayer` facade over the engine |
| `ui/` | Compose screens, navigation keys, theme, icons, `SupportedLocales` |
| `src/main/assets/engine/engine.js` | bundled JS core (built by `npm run build:engine`) |


## Windows

From the repository root:

```bat
apps\android\scripts\build-windows.cmd
```

Release bundle for Play (needs the upload keystore, see `RELEASE.md`):

```bat
apps\android\scripts\build-windows.cmd -Task :app:bundleRelease
```

Stub build without V8:

```bat
apps\android\scripts\build-windows.cmd -SkipV8
```

The script verifies the pinned V8 SHA-256, builds the JS packages and engine
bundle, then runs `gradlew.bat` with `-Pv8Dir`.
