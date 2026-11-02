# F-Droid inclusion audit

Checked against the F-Droid [Inclusion Policy](https://f-droid.org/en/docs/Inclusion_Policy/)
as published on 2026-11-02. Applies to `com.bitti06.modplayjs`.

## Verdict

**The main F-Droid repository is blocked by one item: the prebuilt V8 library.**
Everything else is either compliant or a metadata task. Third-party F-Droid
repositories (including your own) are not bound by this policy and can ship the
same APK today.

## Policy by section

| policy | app | status |
| --- | --- | --- |
| FLOSS licence | BSD-3-Clause (root `LICENSE`), every `packages/*/package.json`, ported code under MIT / BSD-3 / WTF / public domain in `NOTICE` | pass |
| No proprietary tracking, ads, analytics | no `INTERNET` permission at all, no Play Services, no Firebase, no Crashlytics, no ad SDK | pass |
| Binary dependencies from source or trusted repos | AndroidX, Kotlin/Compose, Media3, Room 3, Navigation 3 from Google Maven (allowed); engine built from TypeScript with esbuild | pass |
| Prebuilt binaries only from trusted sources | **`libv8_monolith.a` is fetched at build time from a GitHub release** (NativeScript/v8-buildscripts), which is not Debian, Maven, the Android/Flutter SDK, Hermes, PyPI, npm, Rust, Go or Node | **blocker** |
| No runtime download of executables | app cannot reach the network; nothing is fetched at runtime | pass |
| Unique application ID from a domain | `com.bitti06.modplayjs`; the `bitti06` domain is not owned by the project (advised, not required) | note |
| Trademark / third-party rights | no bundled modules or artwork from third parties; ports attributed in `NOTICE` | pass |
| Actively maintained, functional, unique | 501 commits, engine verified against C references, no feature claimed that is not implemented | pass |
| Anti-features | none. Not marked "No Network" by accident — the app genuinely has no network access | pass |
| Reproducible build | release APK now builds unsigned (see below), resources and code shrunk with R8 | partial |

## What was changed for this audit

- **Release signing split.** `assembleRelease` no longer demands our upload
  key, because F-Droid signs the APK with its own key. `bundleRelease` (the Play
  path) still refuses to run without it. Before this, an F-Droid build would
  have failed at the signing check.
- **`fastlane/metadata/android/{en-US,de-DE}`** added: title, short and full
  description, first changelog. F-Droid reads the listing from that layout, not
  from `store/listing.md`.
- `apps/android/package.json` now states its licence.

## The blocker

`libv8_monolith.a` is downloaded at build time from
`github.com/NativeScript/v8-buildscripts/releases`, which is not one of the
sources the policy names. V8 needs a Chromium checkout and depot_tools, so the
F-Droid build server will not build it either.

## Trusted sources that do exist

Checked 2026-11-02. The policy accepts prebuilt FLOSS binaries from Maven
Central, Google Maven, OSS Sonatype, OSS JFrog, JitPack and Clojars, plus the
Android/Flutter SDK, Hermes, PyPI, Nix, Rust, Go and Node toolchains. Real
candidates on those repos:

| route | artifact | licence | what it costs |
| --- | --- | --- | --- |
| **A. Publish our own V8 build** | anything under `com.modplayjs` on Maven Central / JitPack: the same `libv8_monolith.a` we use now | V8 is BSD-3, so redistribution is fine | a Sonatype account, a GPG key, one release per V8 bump. **No app code changes** |
| **B. J2V8 from Maven Central** | `com.eclipsesource.j2v8:j2v8_android_arm64-v8a:6.3.0` — AAR with `jni/arm64-v8a/libj2v8.so`, 50.8 MB uncompressed, published 2025-11-13 | EPL-1.0 | rewrite `v8_jni.cpp` and the Kotlin bridge onto J2V8's Java API. The bundled V8 version is not documented; verify the engine bundle for ES2022 syntax before committing |
| **C. Hermes** | `com.facebook.react:hermes-android:0.80.0` (Maven Central), explicitly permitted by the policy | MIT | Hermes runs bytecode on an interpreter. The mixer loops run per sample in JS; measure before assuming it keeps up |
| **D. QuickJS / Duktape** | `app.cash.quickjs:quickjs-android`, `com.squareup.duktape:duktape-android` (Maven Central) | MIT / Apache-2.0 | same interpreter problem, plus a different embedding API |

Route A is the one that keeps the engine exactly as verified: the same static
library, the same JNI, the same audio path. It turns "downloaded from a GitHub
release" into "resolved from Maven Central", which is the only thing the policy
objects to. Route B removes the publishing step and replaces it with a bridge
rewrite.

If neither is worth it yet: a self-hosted F-Droid repository or plain APK
releases have no inclusion policy at all, and `assembleRelease` now builds
unsigned for exactly that.

## Before submitting anywhere

- `fastlane` needs at least one screenshot per locale to show anything: copy
  from `store/upload/` (`01-home.png`, `03-player.png`, `04-pattern.png`) into
  `fastlane/metadata/android/<locale>/images/phoneScreenshots/`.
- F-Droid wants the build to run from a clean checkout: `npm ci`,
  `npm run build`, `npm run build:engine -w @modplayjs/android`, then
  `./gradlew :app:assembleRelease`. Every step exists; the V8 fetch is the one
  network dependency, and route A above turns it into a plain Maven dependency.
- A changelog file is needed per version code (`changelogs/<versionCode>.txt`).
