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

## The blocker, and the options

V8 is the JavaScript engine the whole player runs on. Options, none of them
free:

1. **F-Droid main repo — build V8 from source.** V8 needs a Chromium checkout,
   depot_tools and hours of compute on their build server; they will not do it,
   and the result would not be Debian-packaged. Not realistic.
2. **Replace V8 with a Debian-packaged engine.** Debian ships duktape and
   quickjs. The engine renders audio in JavaScript; an interpreter will not keep
   up with a tracker mixer, so this is a rewrite plus a performance loss.
3. **Ship a self-hosted F-Droid repo.** `fdroidserver` builds your APK from your
   spec and users add the repo URL. Inclusion policy does not apply; the app
   still installs and updates through the F-Droid client.
4. **Publish the APK directly** (GitHub Releases + Obtainium, or the releases
   page). No gate at all.

Option 3 or 4 is the honest path while V8 stays prebuilt; option 2 is the only
route into the main repository.

## Before submitting anywhere

- `fastlane` needs at least one screenshot per locale to show anything: copy
  from `store/upload/` (`01-home.png`, `03-player.png`, `04-pattern.png`) into
  `fastlane/metadata/android/<locale>/images/phoneScreenshots/`.
- F-Droid wants the build to run from a clean checkout: `npm ci`,
  `npm run build`, `npm run build:engine -w @modplayjs/android`, then
  `./gradlew :app:assembleRelease`. Every step already exists; the V8 fetch is
  the one network dependency and the one policy problem.
- A changelog file is needed per version code (`changelogs/<versionCode>.txt`).
