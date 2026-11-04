# Meta Horizon Store — formal compliance audit

Audit date: 2026-11-04. App version 0.1.0, `versionCode` 1.

Source of truth: Meta Horizon OS Developers. Every requirement below is quoted
from, or checked against, one of these pages (the `llmstxt` mirrors carry the
same `last_updated` dates as the rendered pages):

| Page | `last_updated` |
|---|---|
| `resources/publish-quest-req` (VRC list) | 2026-08-19 |
| `resources/vrc-quest-packaging-1…6` | 2024-07-31 |
| `resources/vrc-quest-performance-1` | 2025-10-22 |
| `resources/vrc-quest-performance-3` | 2024-07-31 |
| `resources/vrc-quest-functional-2` | 2025-01-17 |
| `resources/vrc-quest-functional-3`, `.4`, `.5`, `.9`, `.12`, `.14` | 2024-07-31 |
| `resources/vrc-quest-security-2` | 2026-03-30 |
| `resources/vrc-quest-input-4` | 2025-09-26 |
| `resources/vrc-quest-input-7`, `.8` | 2024-07-31 |
| `resources/vrc-quest-tracking-1`, `.2` | 2025-05-15 / 2025-12-16 |
| `resources/vrc-quest-audio-1` | 2024-07-31 |
| `resources/publish-mobile-manifest` | 2026-10-15 |
| `resources/permissions-prohibited` / `permissions-review-required` | 2025-04-30 / 2025-11-26 |
| `documentation/native/min-os-versions`, `metavr-os-sdk-versioning` | 2026-10-14 / 2026-10-13 |
| `documentation/native/android/mobile-native-manifest` | 2026-10-07 |
| `documentation/native/android/mobile-passthrough-loading-screens` | — |
| `essentials/app-compatibility` | — |
| `documentation/spatial-sdk/spatial-sdk-mruk` | — |

Legend: **pass** = verified in this repository; **device** = needs a run on a
Quest 3; **manual** = outside the repository (dashboard, legal, art); **n/a** =
does not apply to this app class.

## Findings this audit produced

Four defects, all fixed in the same commit as this file.

1. **`uses-metavr-sdk` declared min 69 / target 81** while the app compiles
   against `com.meta.metavr:metavr-os-jsdk:207` and Spatial SDK 0.15's own
   manifest template declares 207/207. 69 is the old hybrid-app floor, so the
   Store would have offered the build to OS levels the SDK does not target.
   Now 207/207, with no `horizonos:uses-horizonos-sdk` alongside it.
2. **Hand tracking was declared without a hand input path.** The manifest had
   `horizonos.permission.HAND_TRACKING`, `oculus.software.handtracking`
   (`required=false`) and `com.oculus.handtracking.version=V2.0`, but input runs
   `VRFeature(..., SIMPLE_CONTROLLER)` and panels are grabbed with the
   controller squeeze button. VRC.Quest.Tracking.2 requires every declared input
   modality to reach all interactions from launch, and Meta's app-compatibility
   page states plainly that "declaring hands on an app that cannot be driven by
   hands produces a broken experience". All three declarations are gone, and the
   runtime request for the permission went with them.
3. **VRC.Quest.Functional.2 was not met.** `onPause` saved the layout but let
   playback continue; only `onHMDUnmounted` paused. Playback now pauses in
   `onPause` and resumes in `onResume`.
4. **VRC.Quest.Input.4 was only half met.** On focus loss the avatar visuals were
   hidden and `IsdkSystem.active` was cleared — but IsdkSystem is not registered
   under SIMPLE_CONTROLLER, so nothing actually stopped controller input. The
   legacy `InputSystem` is now switched off with `enableInput(hasFocus)`.

Smaller additions from the same pass: `android:networkSecurityConfig` (a closed
config, VRC.Quest.Packaging.4 asks for a valid one), `com.oculus.ossplash.background
= passthrough-contextual` (VRC.Quest.Functional.14), the landscape/black-theme
activity attributes Meta's own manifest template sets, an explicit
`setPreferredDisplayRate(72f)` (VRC.Quest.Performance.1), `proguard-rules.pro`
(V8 JNI + Spatial SDK reflection), and an in-panel statement of the scene
permission outcome (VRC.Quest.Security.2 graceful failure).

## Packaging

| VRC | Status | Evidence |
|---|---|---|
| Packaging.1 manifest conforms | pass | `targetSdk 34` (required since 2026-03-01), `minSdk 34`, `compileSdk 37 ≥ target`, `installLocation="auto"` on `<manifest>`, `android.hardware.vr.headtracking required=true version=1`, `MAIN` action, `com.oculus.intent.category.VR`, `excludeFromRecents="true"`, `label` unique |
| Packaging.2 APK signature scheme v2 | **manual** | `signingConfigs.release` reads `keystore.properties` or `MODPLAY_XR_*`; AGP signs v2 by default for `targetSdk ≥ 24`. Verify with `apksigner verify` on the upload artifact. Same certificate for every later upload |
| Packaging.3 no unsupported required features | pass | features: headtracking, `glEsVersion 0x30001`, PASSTHROUGH/VIRTUAL_KEYBOARD/overlay_keyboard all `required=false`. No Bluetooth, no camera, no GMS |
| Packaging.4 supported SDK + network security config | pass | Spatial SDK 0.15.0, Meta VR OS SDK 207 (`uses-metavr-sdk` 207/207), OpenXR loader bundled by the Spatial SDK; `android:networkSecurityConfig="@xml/network_security_config"` |
| Packaging.5 APK < 1 GB | device | engine.js 1.3 MB + arm64 V8 static lib; no OBB. Upload reports the exact size |
| Packaging.6 64-bit only | pass | `ndk { abiFilters += "arm64-v8a" }`, and the 16 KB page check passes on all five Spatial SDK `.so` files |

## Performance

| VRC | Status | Evidence |
|---|---|---|
| Performance.1 allowed refresh rate, ≥ 60 fps | device | `scene.setPreferredDisplayRate(72f)` in `onSceneReady`, result logged. 72 Hz is the lowest rate every Quest supports. Frame time with 8 audio objects and three panels needs OVR Metrics Tool |
| Performance.3 head-tracked graphics within 4 s, or a VR loading indicator | device | `onSceneReady` places the panels and the dome; the V8 bundle (1.3 MB) loads on the audio thread in parallel, not before first frame. Measure with a stopwatch on a cold start |
| Performance.4 ≥ 85 % render scaling (recommended) | device | no dynamic resolution scaling is applied by the app; the SDK default stands |

## Functional

| VRC | Status | Evidence |
|---|---|---|
| Functional.1 installs and runs without crashes | device | the marker crash from `6e816f4` was `mesh://sphere` without its `Sphere` component; fixed and untested on device. No other known crash path |
| Functional.2 pauses when the OS asks | pass | `onPause` pauses and `onResume` resumes; `onHMDUnmounted`/`onHMDMounted` do the same for the proximity sensor |
| Functional.3 user is never stuck | pass | library is always in the arc; every panel header has the ⌂ chip (`XrApp.goHome`); Settings has "Reset layout"; no login, no gated content |
| Functional.4 no data loss | pass | library roots, favorites, recents, ignored URIs, engine settings and free-layout poses are all in `SharedPreferences` and rewritten on focus loss, `onPause` and `onSpatialShutdown`. Only the *currently loaded module* is not restored on restart — that is session state, not user data |
| Functional.5 positional as well as orientation tracking | pass | `ReferenceSpace.LOCAL_FLOOR`, panels live in world space, `onRecenter` re-authors the arc |
| Functional.6 only Meta Quest hardware in title/assets | manual | no store assets yet; the default panel art contains only text |
| Functional.7 internet notice if required | n/a | no `INTERNET` permission in the manifest, no remote assets |
| Functional.9 reset forward orientation | pass | `onRecenter` overrides `VrActivity.onRecenter`, debounced to 250 ms, and re-applies the arc for stationary layouts |
| Functional.10 no headlocked menus (recommended) | pass | all panels are world-locked entities |
| Functional.12 multiple entitled users | pass | everything is app-scoped storage, no account, no device-locked identifier |
| Functional.13 default to user language | pass | `LocaleManager` switch, `values` (English) + `values-de`, system default on first run |
| Functional.14 passthrough loading screen | pass | `Skybox` follows `scene.isSystemPassthroughEnabled()` on first launch, and `com.oculus.ossplash.background="passthrough-contextual"` keeps the room visible during load |

## Security and permissions

| VRC | Status | Evidence |
|---|---|---|
| Security.1 entitlement check within 10 s (recommended) | **not implemented** | needs the Platform SDK and an app ID; without it the app still runs for any user. Deliberate gap, tracked below |
| Security.2 minimum permissions, unsupported ones absent, graceful denial | pass | declared: `com.oculus.permission.USE_SCENE` (runtime, MRUK room bounds) and `com.oculus.permission.USE_ANCHOR_API` (MRUK). Both are documented MRUK requirements. No prohibited permission. On denial: ring stays at 1 m, Settings shows `xr_scene_denied`, nothing else changes |

Review-requiring permissions: none declared. `MODIFY_AUDIO_SETTINGS`,
`POST_NOTIFICATIONS`, `READ_EXTERNAL_STORAGE` and `MANAGE_EXTERNAL_STORAGE` are
absent — file access goes through SAF (`ACTION_OPEN_DOCUMENT`,
`ACTION_OPEN_DOCUMENT_TREE` + persisted grants), which needs none of them.

## Input

| VRC | Status | Evidence |
|---|---|---|
| Input.1 menu button for in-app menus (recommended) | **not implemented** | panels are opened with the controller ray; no menu-button handler |
| Input.2 grip button for picking up objects (recommended) | pass | `GrabbableSystem.grabButtons = ButtonSqueezeR or ButtonSqueezeL`, i.e. the grip/squeeze button, not the trigger |
| Input.3 hands/controllers line up with reality (recommended) | pass | `AvatarSystem` renders the runtime's own poses; the app never re-parents or offsets them |
| Input.4 focus aware | pass | keeps rendering, hides hands and controllers via `AvatarSystem.setShow*`, and now also ignores input via `InputSystem.enableInput(false)` |
| Input.5 hands animate correctly (recommended) | n/a | no hand input declared |
| Input.7 respects switching hands ↔ controllers | n/a | hands are not declared, so no hand devices are enumerated |
| Input.8 system gesture reserved | n/a | same |

Consequence of dropping the hand declaration, and intended: a person who has
only hands active gets Horizon OS's "Switch to Controllers" dialog at launch.
That is the documented behaviour for controller-only immersive apps, and correct
here because panel grabbing is on the grip button, which hands do not have.

## Tracking

| VRC | Status | Evidence |
|---|---|---|
| Tracking.1 play modes | **manual + device** | the app is usable seated (panels in an arc at 1.45 m, ring adjustable) and standing. The dashboard must declare **Sitting** and **Standing**, not Roomscale: nothing requires walking or turning 360° |
| Tracking.2 declared input modalities | **manual + device** | declare **Controllers only**. Hands must not be advertised, matching the manifest |

## Audio

| VRC | Status | Evidence |
|---|---|---|
| Audio.1 3D audio spatialization (recommended) | pass | per-channel `AudioTrack` with its own session registered through `SpatialAudioFeature.registerAudioSessionId`, one `AudioSessionId` object per channel on a ring; spatial is on by default (`DEFAULT_SPATIAL`) |

## Accessibility (all recommended)

| VRC | Status | Note |
|---|---|---|
| .1 playable without audio | **n/a by nature** | it is a music player; the pattern view and the channel meters still convey state |
| .2 legible text and controls | **gap** | panel body text is 7–10 sp at `dpPerMeter = 500`, i.e. the smallest text in the app; only the details panel offers an enlargement (card expand). Raising the base size is a layout-wide change |
| .3 clarity through visual/audio feedback | pass | play state, pattern playhead and per-channel meters are all visual |
| .4 one hand/controller (recommended) | pass | every control is a ray click; nothing needs two hands |
| .5 display settings | **gap** | no in-app brightness/contrast control; Horizon OS offers some at system level |
| .6 colour blindness options (recommended) | partial | channels are distinguished by colour *and* by position on the ring plus the CH number in the debug panel |
| .7 rotate view without turning the head (recommended) | **gap** | `onRecenter` resets forward but there is no snap-turn |
| .8 multiple locomotion styles (recommended) | n/a | no locomotion |
| .9 fixed-position interaction (recommended) | pass | free placement lets every panel be brought within reach |

## Privacy

| VRC | Status |
|---|---|
| Privacy.1–.4 policy URL, what is collected, how it is used, how deletion works | **manual** — a policy page must be written and hosted |
| Privacy.5 team and app clear data-protection checks | **manual** — Developer Dashboard Data Use Checkup |

Facts a privacy policy has to state, all verifiable in this repository: no
account, no analytics, no network permission at all, room data read once per
launch to place the emitter ring and never stored or transmitted, module files
read only through SAF grants the user granted, settings and layout stored in
app-private `SharedPreferences`, `allowBackup="false"` so nothing leaves the
device through Android backup.

## Content, ads, publishing, assets

No ads (App Ads: n/a). No user-generated content, no chat, no multiplayer
(`Content.3`/`.4` n/a). `Content.2` metadata must match the app: a chiptune and
tracker module player, nothing streamed, nothing downloaded.

Manual items before submission:

1. 512×512 store icon as PNG — the in-app icon is an adaptive vector, which the
   Store does not accept as cover art.
2. 2–5 landscape screenshots from a Quest capture; no logos, no other platforms'
   hardware, no text overlays (Asset.2/5/6), ≤ 2 min trailer if any (Asset.7).
3. Privacy policy URL, support contact, category Music/Media, price.
4. IARC rating. Age group must not target under-13.
5. Website URL that resolves (Publishing.1).
6. Build uploaded to the Developer Dashboard so the *Minimum OS version* line
   reflects `uses-metavr-sdk 207` and the automatic manifest checks run.
7. A full VRC pass on the signed release build, which is the only way to verify
   Performance.1/.3, Functional.1, and the audio path with a real HRTF.

## Known gaps, ranked

1. **Entitlement check (Security.1, recommended).** Would need the Platform SDK,
   an app ID and a `verify_entitlement` call within 10 s. Not added: it is
   recommended, not required, and the SDK dependency is not in the build.
2. **Text size (Accessibility.2, recommended).** 7–10 sp body text is below the
   comfortable range for most people at 1.75 m. Raising the panel `dpPerMeter`
   or the base font size is the fix, and it will change every panel layout.
3. **No demo content on a fresh install.** The library is empty until the user
   picks modules. Functional.3 is still met (the hint text explains the pickers),
   but reviewers start from an empty app.
4. **No menu-button shortcut (Input.1, recommended).**
5. **No snap-turn (Accessibility.7, recommended).**
6. **Background playback is deliberately absent**, so the glossary must not
   promise it. Audio stops on pause, which is what Functional.2 asks for.

## What cannot be verified from here

Everything marked **device** or **manual**: frame rate under load, cold-start
time to head-tracked frames, the real VRC test plan, signature verification, the
Store assets, the dashboard declaration of play modes and input modalities, and
the privacy policy. Every code-level claim above points at a file in this
repository.
