# Release build

Everything here is local: the Gradle build produces the upload artifact, and
Play Console takes it by hand from `app/build/outputs/bundle/release/`. Nothing
in this repository pushes to Google.

## 1. Upload key (once)

Play signs the app with its own app-signing key; the key below is only the
*upload* key that proves the bundle came from you. Keep it outside the
repository.

```sh
keytool -genkeypair -v \
  -keystore upload.jks -alias upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

Store it at `apps/android/upload.jks` (git-ignored) and create
`apps/android/keystore.properties` (also git-ignored):

```properties
storeFile=upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

`storeFile` is resolved from `apps/android/`, so `upload.jks` lives next to
`settings.gradle.kts`. A CI machine can set the environment variables instead:
`MODPLAY_KEYSTORE_PATH`, `MODPLAY_KEYSTORE_PASSWORD`, `MODPLAY_KEY_ALIAS`,
`MODPLAY_KEY_PASSWORD`.

Keep a backup of the keystore and its passwords. Losing the upload key means
filing a key-reset request with Play support; losing an app-signing key that was
not escrowed with Play means the listing cannot be updated.

## 2. Version

`versionCode` must increase with every upload; `versionName` is what the About
screen shows. Both can be overridden per build, so no file has to change:

```sh
./gradlew :app:bundleRelease -PversionCode=2 -PversionName=0.0.2
```

Without the flags the values in `app/build.gradle.kts` (`1`, `0.0.1`) are used.

## 3. Build the bundle

The release build refuses to run without the V8 prebuilt (the stub JNI makes no
sound) and without a keystore, so neither mistake reaches Play:

```sh
node apps/android/scripts/fetch-v8.mjs arm64-v8a
cd apps/android
./gradlew :app:bundleRelease
```

Outputs:

| Path | Purpose |
| --- | --- |
| `app/build/outputs/bundle/release/app-release.aab` | upload this |
| `app/build/outputs/mapping/release/mapping.txt` | deobfuscation map, upload with the bundle |
| `app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip` | native symbols, upload with the bundle |

R8 is on (`isMinifyEnabled`, `isShrinkResources`), the AAB is signed with the
upload key and native libraries stay uncompressed and 16 KB aligned
(`useLegacyPackaging = false`, `-Wl,-z,max-page-size=16384`).

## 4. Check the artifact

```sh
bundletool validate --bundle app/build/outputs/bundle/release/app-release.aab
bundletool dump manifest --bundle app/build/outputs/bundle/release/app-release.aab \
  | grep -E "versionCode|versionName|minSdkVersion|targetSdkVersion"
```

Sixteen-kilobyte page alignment, for every shared object in the bundle:

```sh
unzip -o app/build/outputs/bundle/release/app-release.aab 'base/lib/arm64-v8a/*' -d /tmp/aab
for f in /tmp/aab/base/lib/arm64-v8a/*.so; do
  readelf -l "$f" | grep -q 'LOAD.*0x4000' && echo "ok   $f" || echo "FAIL $f"
done
```

Install the exact artifact a phone would download:

```sh
bundletool build-apks --bundle app/build/outputs/bundle/release/app-release.aab \
  --output /tmp/modplay.apks --ks upload.jks --ks-key-alias upload
bundletool install-apks --apks /tmp/modplay.apks
```

## 5. Play Console

The listing is filled in once and reused per release. First upload, then
`Internal testing` → `Closed testing` → `Production`, staged rollout.

Required under **App content**:

- **Privacy policy**: `PRIVACY.md` is the text to publish; a URL is needed.
- **Data safety**: *no* data collected and *no* data shared. The app has no
  `INTERNET` permission, no analytics, no crash SDK, and reads folders only
  through Storage Access Framework grants the user gives.
- **Ads**: no. **In-app purchases**: no.
- **Content rating** questionnaire: utility/music player, no user-generated
  content, no user interaction.
- **Target audience**: 13+/general, not primarily for children.
- **Foreground service**: `mediaPlayback` is a permitted use — say so if asked.
- **Notifications**: `POST_NOTIFICATIONS` is requested at first start for the
  playback notification.

Store listing assets (not in this repository, they are store data):

- app icon 512 × 512 PNG, 32-bit, no transparency;
- feature graphic 1024 × 500 PNG;
- at least two phone screenshots (portrait), German ones optional;
- short description ≤ 80 characters, full description ≤ 4000.

The launcher icon in the app is an adaptive vector
(`res/mipmap-anydpi/ic_launcher.xml`), so the 512 PNG must be rendered from it
rather than scaled up from a device screenshot.

## 6. Notes

- **arm64-v8a only.** There is no 32-bit ABI; Play accepts that for new apps,
  and `abiFilters` keeps the bundle small.
- **`minSdk 35` (Android 15).** Devices below that cannot install the app.
- Keep `mapping.txt` and `native-debug-symbols.zip` per version; retracing a
  crash report needs the map of exactly that build. Play accepts both from the
  release page ("Deobfuscation file", "Native symbols").
- The debug build is `com.bitti06.modplayjs.debug` and installs side by side
  with a Play build, so both can be on the same phone.
