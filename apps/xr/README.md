# modplay XR

Quest 3 app: Meta Spatial SDK panels in front of the listener, one audio object
per tracker channel. Same feature set as `apps/android`, different shell.

This directory only holds the XR-specific code. The player engine, the V8 native
layer and the settings model are shared with the phone app:

- `engine.js` — bundled from `apps/android/engine/src/engine-entry.ts`
- `v8_jni.cpp` + `build/v8-prebuilt/android-arm64-v8a` — the V8 embedding
- `com.bitti06.modplayjs.engine.{V8Engine,EngineTypes,SettingsStore}` Kotlin —
  the JNI symbol names (`Java_com_bitti06_modplayjs_engine_V8Engine_*`) have to
  match, so the class and package cannot move. `V8Engine` carries the
  XR-only `renderSpatial()`; `PcmRing` is deliberately not copied, the XR
  player writes `AudioTrack` directly.

## Engine modules

The app no longer ships one monolithic `engine.js` as its only engine. The
build partitions the monorepo into one ES module per package under
`assets/modules`, and a small native loader resolves `@modplayjs/*` onto those
files at runtime:

```
assets/modules/
  engine-core/index.js            the shared engine entry
  modplayjs-core/index.js         one per package
  modplayjs-fmt-xm/index.js
  install/xm.js                   registers the format
  manifest.json                   what exists, which extension maps where
```

`./gradlew :app:buildModules` (part of `preBuild`) regenerates that tree from
`packages/*/src` with `scripts/build-modules.mjs`. The task fails when a format
names a missing package or a cross-package import has no asset, which is the
error that would otherwise appear on the headset as a silent `undefined`.

A session only loads what it plays: a MOD file touches core, the softmixer,
Paula and `fmt-mod` (~407 KB), not the whole 1.3 MB. Formats are installed on
demand in `XrPlayer.load()` from the extension -> format table in the
manifest.

### Publishing an engine catalog

`build-modules.mjs` also writes a publishable tree to
`build/engine-catalog/` (gitignored):

```
build/engine-catalog/
  catalog.json                    the document below
  modules/...                     the files it lists
```

Upload that directory to any static host. `catalog.json` is the whole update
contract - one JSON file per release, no per-device build:

```json
{
  "schema": 1,
  "apiLevel": 1,
  "generated": "2026-11-06T12:00:00.000Z",
  "baseUrl": "https://example.org/modplay/engine/",
  "engine":   { "asset": "engine-core/index.js", "bytes": 23166,
                "sha256": "…", "version": "0.2.1" },
  "packages": { "modplayjs-fmt-mo3": { "asset": "modplayjs-fmt-mo3/index.js",
                "bytes": 103916, "sha256": "…", "version": "0.2.1" } },
  "formats":  { "mo3": { "package": "modplayjs-fmt-mo3",
                "install": "install/mo3.js", "extensions": ["mo3"] } }
}
```

`baseUrl` may be relative to the catalog location, so a GitHub release page or
a CDN needs no separate build. `MODPLAY_ENGINE_BASE_URL` overrides it at
generation time. The script hashes every file it lists and fails if the
catalog and the files disagree.

The catalog is signed. `catalog.json` carries a `signature` field: an Ed25519
signature over a canonical text form of the document (defined in
`scripts/engine-catalog-sign.mjs` and mirrored byte-for-byte in
`SignatureVerifier.kt`), not over the raw JSON, because key order and whitespace
are not stable across JSON writers.

Generate the key once, on the machine that publishes:

```bash
node scripts/engine-catalog-sign.mjs keygen
# prints: -PengineCatalogPubKey=MCowBQYDK2VwAyEA...
```

The private key lands in `build/engine-keys/private.pem` and never leaves the
build machine. The repository ignores `*.pem`, `*.key`, `*.p12`, `*.pfx`,
`*.jks` and any `engine-keys/` directory by explicit pattern - not only via
`apps/xr/build/` - because `MODPLAY_ENGINE_SIGNING_KEY` can point anywhere. The
signer also refuses to run with a key that is tracked by git.

`build-modules.mjs` signs automatically when that file exists. Pass the public
key to the app build (`-PengineCatalogPubKey=…` or
`MODPLAY_ENGINE_CATALOG_PUBKEY`); a release build that sets a catalog URL but no
public key fails at assembly time, and a release build without a key refuses
every catalog at runtime. Debug builds without a key log a warning instead, so a
local test server works unsigned.

This is what blocks a compromised CDN or release account: the transport decides
*availability*, the signature decides *what code may run*.

On device, Settings -> Engine modules -> *Check for updates* fetches the
catalog, compares SHA-256 per file, downloads only what differs into a staging
directory, verifies each file and swaps the whole set in at once. A failed
download or a broken engine rolls back one generation, then to the APK assets;
an installed update never half-applies.

Point the app at a catalog with `-PengineCatalogUrl=…` at build time,
`MODPLAY_ENGINE_CATALOG_URL` in the environment, or for testing without a
rebuild:

```bash
adb push catalog-url.txt /sdcard/Android/data/com.bitti06.modplayjs.xr/files/
```

`INTERNET` is the only network permission and it exists for this catalog.
Songs are never downloaded.

To try it locally, serve the publish tree and point the app at it - no signing
or CDN needed, plain HTTP is enough for a debug build on the same network:

```bash
npm run build:modules            # writes build/engine-catalog/
npx serve apps/xr/build/engine-catalog -l 8080
echo 'http://<your-ip>:8080/catalog.json' > catalog-url.txt
adb push catalog-url.txt /sdcard/Android/data/com.bitti06.modplayjs.xr/files/
```

The catalog is refused when it is older than the app's own manifest, when its
`schema` or `apiLevel` is newer than the app understands, or when any file
fails its hash - the last of which is why the build script re-hashes the tree
it just wrote.

## Build

```bash
./gradlew :app:assembleDebug   # APK: app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:lintDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`preBuild` runs `:app:buildEngine` (npm + esbuild) automatically, so the APK
never carries a stale `engine.js`. Manual run: `./gradlew :app:buildEngine`.
If npm is not on `PATH` the task is skipped with a warning and the existing
bundle is kept.

`:app:fetchV8` downloads the pinned arm64 V8 prebuilt
(`apps/android/scripts/fetch-v8.mjs`) when `libv8_monolith.a` is missing;
`preBuild` depends on `:app:checkV8Prebuilt`, which triggers that fetch and then
fails for release tasks (warns for debug) if the library still is not there.
A build that fetched V8 in the same run still links the stub — run it once more.

`local.properties` must point at the Android SDK. `compileSdk` is 37 (platform
37 must be installed), `minSdk` and `targetSdk` stay 34: the Horizon Store
requires immersive apps to target 32-34. The Horizon OS level is declared with
`uses-metavr-sdk` at 207/207, the Meta VR OS SDK the app is compiled against.

Versions are the newest ones the toolchain actually supports, checked against
each artifact's `aar-metadata.properties`:

| Artifact | Version | Note |
|---|---|---|
| AGP | 9.3.1 | inside KGP 2.4.x's supported range (max 9.3.1) and supports API 37 |
| Gradle wrapper | 9.5.0 | AGP 9.3 requires >= 9.5.0 |
| Kotlin | 2.4.21 | newest; KGP 2.4.x supports Gradle up to 9.7.0, AGP up to 9.3.1 |
| Compose BOM | 2026.09.00 | Compose UI 1.12.1, Material3 1.4.0 |
| core-ktx | 1.19.1 | needs `compileSdk` 37 + AGP 9.1 |
| activity-compose | 1.13.0 | newest stable |
| lifecycle | 2.11.0 | needs `compileSdk` 37 |
| coroutines | 1.11.0 | newest stable |
| serialization | 1.12.0 | newest stable |
| Spatial SDK | 0.15.0 | newest (29 Oct 2026), all modules incl. isdk |
| Meta VR OS SDK | 207 | `compileOnly`, runtime supplied by Horizon OS |

Spatial SDK 0.15.0 is a breaking release: hierarchy scale is now the default and
physics moved from Bullet to Jolt. This app has no scaled parents and no
physics feature, so neither applies; read the 0.15.0 release notes before
adding `Scale` to a parent entity.

The wrapper is on **Gradle 9.5.0**, the minimum AGP 9.3 requires; AGP 9.x on an
older Gradle is the pairing that fails during native/CMake model sync.

The Meta spatial plugin is applied from an explicit `buildscript` classpath
instead of the `plugins {}` DSL, so its `kotlin-compiler-embeddable` can be
excluded — otherwise KGP 2.4 warns about a second compiler on the build
classpath. The plugin version is pinned there (`spatial-gradle-plugin-impl`),
keep it in sync with `libs.versions.toml`.

### Host architecture

JDK, Gradle, Node and esbuild run as native arm64. Two Google components exist
only as x86_64 Linux binaries and therefore run under `qemu-x86_64` on an arm64
host:

- `aapt2` (AGP dependency)
- the NDK host toolchain (`toolchains/llvm/prebuilt/linux-x86_64`)

That needs the amd64 runtime libs (`libc6:amd64`, `libstdc++6:amd64`,
`zlib1g:amd64`), already installed here. CMake and Ninja from the SDK are also
x86_64; the system `cmake`/`ninja` are arm64 if you want to point AGP at them.

## Deprecations checked (Spatial SDK 0.15.0)

Nothing on the removal list in `apps/xr/app/src/main/java`:

| Removed in 0.15.0 | Status here |
|---|---|
| `com.meta.spatial.runtime.ScenePhysicsObject` | not used (no `PhysicsFeature`) |
| `com.meta.spatial.toolkit.Color3` / `Color4` | `Color4` comes from `core` |
| `Audio(String, …)` | not used |
| `IsdkFeature` | not used; `VRFeature` sets up ISDK |
| `Query.with` / `Query.registerEventListener` | not used |
| `PanelSceneObject.getTexture()/getLayer()/…` | not used |
| `MRUKPlane.size()` | we call `roomBounds.size()`, a different type |
| `IsdkSystem.enableDebugTools()` | not used |

Deprecated but still present:

- `GrabbableSystem` — the 0.15.0 reference marks it `@Deprecated`, "replaced by
  IsdkSystem ... change the `inputSystemType` argument on `VrFeature`". This app
  deliberately keeps it: it runs `VRFeature(..., inputSystemType =
  SIMPLE_CONTROLLER)`, and with SIMPLE_CONTROLLER nothing else handles a
  `Grabbable` panel. The ISDK path is not registered, so there is no second grab
  implementation fighting the arc.
- `TickTransformSystem.applyScale` / `ScaleSystem` (pose-only scale) — not used;
  the app has no scaled parents, so 0.15's hierarchy-scale default is fine.

## Horizon OS version

`uses-metavr-sdk` declares min 207 / target 207, matching the Meta VR OS SDK the
app is compiled against (`com.meta.metavr:metavr-os-jsdk:207`) and Meta's own
"add Spatial SDK to an app" tutorial, which declares `minSdkVersion="207"` /
`targetSdkVersion="207"`.

The earlier 69/81 pair came from the hybrid-app floor and claimed support for OS
releases the Spatial SDK 0.15 build does not target. Since there is no fallback
code for older OS levels in the app, declaring 207 is the honest floor: the
Store then hides the app from devices that would run it against APIs it assumes.

There is no `horizonos:uses-horizonos-sdk` element next to it. Horizon OS still
parses that older spelling, but carrying both is exactly the backwards
compatibility this project does not want; `uses-metavr-sdk` is the current
element and the only one written.

The app depends on the JSDK as `compileOnly` (the AAR is API stubs; Horizon OS
supplies the implementation), and logs the runtime API level on the permission
result line:

```kotlin
metavr.os.Build.Version.getApiVersion()   // 207 on the current OS line
```

## Audio path

- stereo mode: one interleaved `AudioTrack`
- spatial mode: one mono `AudioTrack` per tracker channel, each with its own
  session registered via `SpatialAudioFeature.registerAudioSessionId`, and an
  entity at the channel's azimuth. The platform HRTF does panning and head
  tracking; the engine only supplies the stems and the angle.

Azimuth source, in `engine-entry.ts`:

| file layout | ch0 | ch1 | ch2 | ch3 |
|---|---|---|---|---|
| `lrlr` | -45° | +45° | -15° | +15° |
| `lrrl` | -45° | +45° | +15° | -15° |
| `panned` | pan × 60° × panSeparation/100 | … | … | … |

Channels ≥ 5 use their module pan. Layout is switchable at runtime in the
Settings panel; unknown layouts fall back to `panned`.

Spatial is **on by default** (`DEFAULT_SPATIAL = true` in `XrPlayer`). The
preference, the initial panel state and the engine choice all come from the same
key, and `rebuildOutputs()` re-asserts the choice on every output rebuild: the
engine's own `spatialEnabled` starts `false`, so a `setSpatial` that raced the
isolate startup would otherwise leave the app playing stereo. Stereo remains the
fallback for modules the engine cannot split (SID, streamed audio) and for a
stored off.

## Loading modules

Two pickers, both persisted (`takePersistableUriPermission`):

- **Ordner** — `ACTION_OPEN_DOCUMENT_TREE`, walks the tree recursively with
  `DocumentFile` (depth 12), shows the folder and its file count, `×` removes
  and releases the grant.
- **Dateien** — `ACTION_OPEN_DOCUMENT`, multiple documents.

Long-press a row ignores that URI; *Ignorierte löschen* resets the list. Folder
names in the list show where a module came from (`adb`, `picked`, or the tree).

Or push a folder:

```bash
adb push testfiles/ "/sdcard/Android/data/com.bitti06.modplayjs.xr/files/modules/"
```

The Library panel scans that folder (plus `files/modules`) on start and on
*Rescan*. Supported extensions are in `library/Library.kt`.

## What is not in this base

- indexed folders (the phone app scans whole trees; XR takes single documents)
- foreground media service, notification, media session
- favorites, recents, Room-backed index
- MRUK room geometry, occlusion, reflections (next step: P4)

## Signing

The upload key is not part of the repository. Create
`apps/xr/app/keystore.properties` (also accepted: `apps/xr/keystore.properties`)
from `apps/xr/keystore.properties.template`, or set the four `MODPLAY_XR_*`
environment variables. Without it `assembleRelease` produces an unsigned APK.

`apps/xr/release.keystore` and both `keystore.properties` locations are ignored
by git. A keystore that was ever pushed must be treated as compromised: anyone
holding it can sign an update for `com.bitti06.modplayjs.xr`. Generate a new one
and rotate it in the store console instead of reusing the old file.

## Localisation

All panel text comes from `res/values/strings.xml` (English) and
`res/values-de/strings.xml`. Settings › Sprache sets the per-app locale with
`LocaleManager`; the activity recreates and the panels re-register.

## Panel layout

Six panels hang on a fixed arc (Now Playing, Library, Settings, Pattern,
Details, Debug). Settings › **Frei anordnen** switches to free placement: every
panel gets a `Grabbable(PIVOT_Y, 0.6–2.4 m)` and can be grabbed with the
controller's grip button. On `onPause` the poses are written to
`SharedPreferences("xr.layout")`; the next start restores them. *Layout
zurücksetzen* returns to the arc and drops the saved poses.

## Debug view

Settings › **Quellen** toggles the source debug view:

- one unlit sphere per audio object, placed at the channel's azimuth, coloured
  with the channel palette, scaled by its live peak level;
- the Debug panel (bottom right) lists `CH nn`, the azimuth the engine computed
  and the same colour chip, so a sphere in the room maps 1:1 to a channel.

Colours come from `XrPlayer.colorArgb()`, so panel and markers cannot drift.

## Logging

`adb logcat -s modplay-xr` — output mode, object count, layout and engine
errors land there.
