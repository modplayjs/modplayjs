# @modplayjs/xr

## 0.1.1

### Patch Changes

- [`6e816f4`](https://github.com/modplayjs/modplayjs/commit/6e816f4bb612f655c2952cec8d0f967118f53006) - Fix the crash when the spatial source-marker switch is turned on.
  
  `mesh://sphere` is a parameterised mesh, not a fixed primitive: Meta's 3D objects
  page defines it as a "sphere mesh with a radius defined by the attached
  `Sphere(radius: Float)` component". The markers had `Mesh`, `Material`, `Scale`
  and `Visible` but no `Sphere`, and the toolkit's mesh creator throws when that
  component is missing (`ToolkitFeature.createSphereMesh` reads it through
  `requireComponentForMesh`), so every marker creation took the app down.
  
  Markers now carry `Sphere(0.5f)`; `Scale` keeps the level-driven size, so a level
  change still costs one component write instead of a mesh rebuild.
  
  The marker entities are also created, moved and destroyed on the main thread,
  with the azimuths and object list captured on the audio thread. Previously the
  audio thread mutated the same lists while `applyPositions` iterated them, and
  `applyMarkerLevels` wrote `markerSizes[i]` without the bounds check its read had.

- [`5d256f9`](https://github.com/modplayjs/modplayjs/commit/5d256f979ff2e4952d9e95965e7058f894ab0b47) - Drop a deprecated system and adopt the Meta VR OS SDK.
  
  `GrabbableSystem` is deprecated in 0.15.0 in favour of IsdkSystem, and with
  `VRFeature` running the Interaction SDK it was not even active, so its
  `grabButtons` configuration is gone. Grabbing goes through the `Grabbable`
  component, which ISDK consumes.
  
  Hand tracking is now requested at runtime instead of being assumed: if the user
  denies it the app keeps running on controllers (VRC.Quest.Security.2 requires
  that graceful failure), and the grant result is read by permission name instead
  of by index.
  
  The app depends on `com.meta.metavr:metavr-os-jsdk:207` as `compileOnly` and
  logs `metavr.os.Build.Version.getApiVersion()` with the permission result, so
  the device log states which Horizon OS API level is really running.

- [`453254e`](https://github.com/modplayjs/modplayjs/commit/453254ea89c4faaa729badc3d6a69087f6b02354) - Three-column details panel with expandable, floating text blocks.
  
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

- [`c045321`](https://github.com/modplayjs/modplayjs/commit/c0453214f8e10de75bf8946b734abd9c6f535efb) - Make free placement actually free, and stationary mode actually stationary.
  
  Three bugs: `attachGrabbable` always set the component, so stationary panels
  still moved in the hand; `apply()` rewrote every panel's Transform on every
  track change, yanking a grabbed panel back into the arc; and free mode lost the
  arrangement because the pose was only saved on pause and input-focus loss.
  
  Now stationary removes the `Grabbable` component (the Interaction SDK turns it
  into a grabbable interactable, so leaving it on is not enough), free mode leaves
  an already-placed panel untouched on a track change, and switching to stationary
  saves the arrangement first so switching back restores it. Poses are also saved
  in `onSpatialShutdown`, which is guaranteed to run before the activity dies.
  
  The settings row explains both modes instead of showing a bare toggle.

- [`b837f28`](https://github.com/modplayjs/modplayjs/commit/b837f282e3972cb4e9f5c813a4423cf1947333d3) - Move the XR build to the Gradle 9 wrapper that Meta's 0.15.0 samples ship.
  
  Wrapper 8.14.6 -> 9.4.1, Kotlin 2.3.21 -> 2.4.21 (KGP 2.4.x supports Gradle
  7.6.3-9.7.0 and AGP 8.5.2-9.3.1), foojay resolver-convention 0.9.0 -> 1.0.0.
  AGP stays 8.13.2: it requires Gradle >= 8.13, so the pairing is supported, and
  AGP 9.x would drag `compileSdk` 37 in with it.
  
  `PathSensitivity` is now imported explicitly instead of relying on the implicit
  `org.gradle.api.*` import, which the Gradle 9 Kotlin DSL no longer provides.

- [`1090ee5`](https://github.com/modplayjs/modplayjs/commit/1090ee594f4c86bb69cc87131331038597d54872) - Hands and a readable pattern view.
  
  Input now runs on the Interaction SDK (the VRFeature default) instead of the
  controller-only system, so hands and controllers both produce pointer events:
  poke, ray and pinch on panels, with the panel touch-limiting that comes with it.
  AvatarSystem hides the hands and controllers when the app loses input focus and
  shows them again on regain; IsdkSystem pauses with them. Grab stays on the
  squeeze buttons (VRC.Quest.Input.2).
  
  The pattern panel is rebuilt on the phone app's model: per-field colours
  (note, instrument, volume, effect), grid lines at channel boundaries, the
  playhead highlighted and kept a few rows below the window edge, and a memoised
  AnnotatedString per cell so scrolling 64 rows x 32 channels does not rebuild
  two thousand styled strings per frame. Follow-scrolling only jumps when the
  playhead leaves the visible window.

- [`7f856b5`](https://github.com/modplayjs/modplayjs/commit/7f856b55a2b8ffb9bb7fe553930036b3378b77a9) - Bring the XR app to the newest dependency line that AGP 8.13.2 can build.
  
  Kotlin 2.3.21, Compose BOM 2026.06.01 (Compose UI 1.11.4 / Material3 1.4.0),
  core-ktx 1.18.0, activity-compose 1.13.0, lifecycle 2.10.0, coroutines 1.11.0,
  serialization 1.12.0, documentfile 1.1.0, and `compileSdk` 36.
  
  `compileSdk` has to move because core-ktx 1.18 and activity-compose 1.13
  declare `minCompileSdk=36`. `targetSdk` stays 34: the Horizon Store requires
  immersive apps to target 32-34, and `minSdk` stays 34.
  
  Not everything can go to its absolute newest yet: core-ktx 1.19, lifecycle
  2.11, Compose 1.12 and therefore Compose BOM 2026.08.00+ all need
  `compileSdk` 37 and AGP 9.1, and AGP 9.x is a breaking major. Spatial SDK stays
  at 0.15.0, which is already the newest release.

- [`5fae2e7`](https://github.com/modplayjs/modplayjs/commit/5fae2e72851548fbc5e7f7d63f2630fa12dc9bcc) - Sweep the XR build up to the newest toolchain and SDK line that actually work
  together.
  
  Checked against the source of truth rather than guessed: Maven Central latests,
  each AAR's `aar-metadata.properties` for `minCompileSdk`/`minAndroidGradlePluginVersion`,
  the AGP release notes' compatibility tables, and Kotlin's KGP compatibility
  table.
  
  - `compileSdk` 36 -> 37, because core-ktx 1.19, lifecycle 2.11 and Compose UI
    1.12 all declare `minCompileSdk=37`. `minSdk`/`targetSdk` stay 34.
  - core-ktx 1.19.1, lifecycle 2.11.0, Compose BOM 2026.09.00 (UI 1.12.1,
    Material3 1.4.0).
  - AGP 9.5.0 -> **9.3.1**, deliberately *down*: KGP 2.4.21 supports AGP only up
    to 9.3.1, so 9.5 was outside the supported range. AGP 9.3 still supports API
    37.
  - Gradle wrapper 9.6.0 -> 9.5.0, the minimum AGP 9.3 requires.
  - Spatial SDK stays 0.15.0 (the newest, 29 Oct 2026); Meta VR OS SDK stays 207.
  - The transparent details panel now uses Meta's full hole-punch recipe from the
    layer page: `LayerConfig(filters = HIGHEST_QUALITY, zIndex = -1)`,
    `ALPHA_BLEND`, feathered edge, `AlphaMode.HOLE_PUNCH` and
    `SceneMaterial.HOLE_PUNCH_PANEL_SHADER`. `enableTransparent` alone only blends;
    it does not punch the transparent pixels out of the layer.
  - `Scene.setPanelControllerScrollFactor(1.6f)` so a 32-channel pattern can be
    crossed with the thumbstick in reasonable time.
  - The pulled `gradle.properties` compatibility switches are documented in
    place, each with the reason it exists.

- [`e02480a`](https://github.com/modplayjs/modplayjs/commit/e02480a973426fbd7ae345dee5f1345b8866db82) - Wire the panel settings that existed but did nothing, and close the details gap.
  
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

- [`4a8feb0`](https://github.com/modplayjs/modplayjs/commit/4a8feb09ea1f5892550a0231530b58ed3d475e8b) - Show only the panels the current player state can use, and add one Home control.
  
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

- [`b31e6a6`](https://github.com/modplayjs/modplayjs/commit/b31e6a6ba294cd8c04f250701b62d0dd0851019f) - Close the remaining panel parity gaps and tighten the spatial settings.
  
  New panels: a queue panel (the playlist's order, tap a row to jump) and an
  ignored-files panel with per-file restore. Both open from Settings, are
  registered like the other panels and are hidden until asked for.
  
  The pattern colour picker is in the Appearance section now: four swatches that
  cycle the phone app's palette and wrap back to "theme colour", which avoids a
  colour dialog that is awkward with a controller ray.
  
  Spatial settings: the on/off choice persists across launches and is pushed to
  the engine before the first module can load, so a module no longer opens in
  stereo just because the toggle was set in a previous session. The section now
  says when a module cannot be split into objects (SID/streamed) and otherwise
  shows the object count, layout and where the positions come from.
  
  Also removed the per-tick marker colour writes (colour is set at build time)
  and the level-driven scale write from the ring update, so a ring change is two
  transform writes per marker instead of five component writes.

- [`b3980a2`](https://github.com/modplayjs/modplayjs/commit/b3980a2efe6ecd63b5372a2e757aea3d0407cb18) - Make the pattern view follow the music instead of stuttering.
  
  The playhead used to arrive with the full snapshot at 2 Hz. At 125 BPM speed 6 a
  tracker row lasts ~120 ms, so the grid jumped four rows at a time, half a second
  apart — that is the stutter.
  
  The engine gains a `playhead` command: `playing`, `paused`, `ended`,
  `positionMs`, `ord`, `row`, `pattern`. A few numbers, no track object, no
  instrument or sample lists. `XrPlayer` polls it every 120 ms while playing and
  publishes only the row/pattern fields, so the grid advances one row per step.
  The full snapshot stays at 2 Hz because every panel recomposes on it.
  
  On the panel side: the dot-stripping regex is built once instead of per cell,
  `LazyColumn` has no item animation (the playhead moves 8x/s), and the panel gets
  `resolutionScale = 1.4` — 1764 px, still under the 2064 px eye buffer, which
  makes 7 sp monospace cells readable.

- [`c1556b9`](https://github.com/modplayjs/modplayjs/commit/c1556b9a59aed7610dd83078e08a505aab80949c) - XR performance pass.
  
  The audio thread no longer wakes 250 times a second when idle, runs at audio
  priority instead of outranking the compositor, and caps the state publish rate
  at 2 Hz while playing and 1 Hz while paused. Pattern cells are cached per
  pattern instead of re-parsed every tick, spatial azimuths are no longer polled
  every tick, and marker scaling only touches entities whose level actually
  moved. Panel-side: the visibility/layout pass is skipped unless something the
  panels show changed, the volume slider commits once per drag, library filtering
  and sorting are memoised, favourites are read once per recompose, and the JNI
  render path copies audio straight from the V8 backing store instead of through
  a temporary vector.

- [`e50eb28`](https://github.com/modplayjs/modplayjs/commit/e50eb281915a06184be0e25f425346b3064c2af0) - Spatial SDK 0.15.0 audit.
  
  The XR app already tracked 0.15.0 (the newest release, 29 Oct 2026) in both the
  version catalog and the Gradle plugin pin, so no dependency bump was needed.
  Instead the 0.15.0 breaking changes were checked against the code:
  
  - Hierarchy scale is now the default: the app has no scaled parents, and the
    marker/collider scales are local, so nothing renders differently.
  - Physics moved from Bullet to Jolt: the app registers no PhysicsFeature.
  - Removed APIs (`toolkit.Color3/Color4`, `IsdkFeature`, `Query.with`,
    `PanelSceneObject.getTexture()` and friends, `MRUKPlane.size()`,
    `IsdkSystem.enableDebugTools()`, scene XML inflation): none are used.
  - `onRecenter` now collapses repeated callbacks, which 0.15 can deliver more
    than once with a stale head pose.
  
  The manifest moved from `uses-horizonos-sdk` to the current `uses-metavr-sdk`
  element (same levels: min 69, target 81).

- [`69d86d5`](https://github.com/modplayjs/modplayjs/commit/69d86d55acdc59e5cb0eb600ff234bb8d690583f) - Make spatial audio actually start on by default.
  
  The preference already defaulted to on (`DEFAULT_SPATIAL = true`), but two things
  could still show and play stereo:
  
  - the panel state started at `spatialEnabled = false` until the first module
    published a snapshot, so Settings said "Off" on a fresh start;
  - the engine's own `spatialEnabled` starts `false`, so if the single `setSpatial`
    command from `start()` raced the isolate startup, the engine stayed in stereo
    and `readSpatialInfo()` reported `enabled=false` back to the UI.
  
  The state now initialises from the stored preference before anything loads, and
  `rebuildOutputs()` re-asserts the choice on every output rebuild, so the engine
  and the UI cannot drift apart. A stored off still wins, and modules the engine
  cannot split (SID, streamed audio) still fall back to stereo.

- [`1966ad8`](https://github.com/modplayjs/modplayjs/commit/1966ad814eb03427626953f3727bcb3b482f8a01) - Formal Meta Horizon Store compliance pass, with four defects fixed.
  
  - `uses-metavr-sdk` went from min 69 / target 81 to **207 / 207**, the Meta VR OS
    SDK the app is compiled against and the pair Spatial SDK 0.15's own manifest
    template declares. 69 was the hybrid-app floor and claimed OS levels this
    build does not target. No `horizonos:uses-horizonos-sdk` alongside it.
  - Hand tracking declarations removed (`horizonos.permission.HAND_TRACKING`,
    `oculus.software.handtracking`, `com.oculus.handtracking.version`) together
    with the runtime prompt. Input runs `VRFeature(..., SIMPLE_CONTROLLER)` and
    panels are grabbed with the controller grip, so hands cannot drive the app;
    VRC.Quest.Tracking.2 and Meta's app-compatibility page both forbid advertising
    an input modality that does not reach every interaction.
  - VRC.Quest.Functional.2: `onPause` now pauses playback and `onResume` resumes
    it. Only `onHMDUnmounted` paused before, so entering passthrough from Quick
    Settings left the music running.
  - VRC.Quest.Input.4: the legacy `InputSystem` is switched off on focus loss.
    `IsdkSystem.active` was cleared, but with SIMPLE_CONTROLLER that system is not
    registered, so controller input was never actually ignored.
  
  Also added: `network_security_config.xml` (closed, no cleartext, no user CAs),
  `com.oculus.ossplash.background="passthrough-contextual"` for the MR launch path,
  the landscape/black-theme activity attributes from Meta's manifest template,
  `setPreferredDisplayRate(72f)`, a `proguard-rules.pro` naming the V8 JNI and
  Spatial SDK reflection, and an in-panel statement of the scene-permission
  outcome so a denial reads as a limited feature.
  
  `STORE-COMPLIANCE.md` is rewritten as a requirement-by-requirement audit with
  the page and `last_updated` each line is checked against, plus the ranked list of
  remaining gaps (entitlement check, text size, demo content, menu-button shortcut,
  snap-turn) and what can only be verified on a device.

- [`aa10d0c`](https://github.com/modplayjs/modplayjs/commit/aa10d0cf13035cddf19d695d92e10aad48107dbb) - XR store-readiness fixes for the Horizon Store VRCs.
  
  - Passthrough launch follows the system recommendation when the app is started
    from MR Home (`scene.isSystemPassthroughEnabled()`), and the user's own toggle
    wins from the second launch on (VRC.Quest.Functional.14).
  - `onRecenter` re-authors the fixed panel arc in front of the new forward
    direction, so a manual recenter is respected (VRC.Quest.Functional.9).
  - Playback pauses when the headset is taken off and resumes when it is worn
    again (VRC.Quest.Functional.2).
  - Manifest: `android:version="1"` on the headtracking feature,
    `installLocation="auto"`, `excludeFromRecents="true"` (was `false`), drop the
    unused INTERNET permission (VRC.Quest.Packaging.1 / VRC.Quest.Security.2).
