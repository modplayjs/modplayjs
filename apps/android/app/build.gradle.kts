import java.io.File
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

val repoRoot = rootProject.projectDir.parentFile.parentFile
val gitCommit: String =
    runCatching {
        providers
            .exec {
                workingDir = repoRoot
                commandLine("git", "rev-parse", "--short", "HEAD")
            }.standardOutput.asText
            .get()
            .trim()
    }.getOrDefault("unknown")
val defaultV8 = File(repoRoot, "build/v8-prebuilt/android-arm64-v8a")
val v8Dir: String? = (project.findProperty("v8Dir") as String?)
    ?: defaultV8.takeIf { File(it, "lib/libv8_monolith.a").isFile }?.absolutePath
val v8Path = v8Dir?.replace('\\', '/')

// A release bump can override both without touching this file:
//   ./gradlew bundleRelease -PversionCode=2 -PversionName=0.0.2
val appVersionCode: Int = (findProperty("versionCode") as String?)?.toIntOrNull() ?: 1
val appVersionName: String = (findProperty("versionName") as String?) ?: "0.0.1"

// Upload signing. `keystore.properties` is not committed; a CI machine can set
// the four environment variables instead. RELEASE.md has the keystore command.
val keystoreProperties =
    Properties().apply {
        val file = rootProject.file("keystore.properties")
        if (file.isFile) file.inputStream().use { load(it) }
    }

fun signingValue(property: String, environment: String): String? =
    keystoreProperties.getProperty(property) ?: System.getenv(environment)

val storeFilePath = signingValue("storeFile", "MODPLAY_KEYSTORE_PATH")
val storePasswordValue = signingValue("storePassword", "MODPLAY_KEYSTORE_PASSWORD")
val keyAliasValue = signingValue("keyAlias", "MODPLAY_KEY_ALIAS")
val keyPasswordValue = signingValue("keyPassword", "MODPLAY_KEY_PASSWORD")
val uploadSigningReady =
    listOf(storeFilePath, storePasswordValue, keyAliasValue, keyPasswordValue).all { it != null }

android {
    namespace = "com.bitti06.modplayjs"
    compileSdk = 37
    ndkVersion = "29.0.14206865"

    defaultConfig {
        applicationId = "com.bitti06.modplayjs"
        minSdk = 35
        targetSdk = 37
        versionCode = appVersionCode
        versionName = appVersionName
        buildConfigField("String", "GIT_COMMIT", "\"$gitCommit\"")
        ndk { abiFilters += listOf("arm64-v8a") }
        externalNativeBuild {
            cmake {
                arguments += listOf("-DMODPLAY_V8=${if (v8Path != null) "ON" else "OFF"}")
                if (v8Path != null) {
                    arguments +=
                        listOf(
                            "-DV8_LIB=$v8Path/lib/libv8_monolith.a",
                            "-DV8_INCLUDE=$v8Path/include",
                        )
                }
            }
        }
    }

    // Only declared when a keystore is configured, so a missing file is one
    // clear error from the release task instead of an unsigned artifact.
    signingConfigs {
        if (uploadSigningReady) {
            create("upload") {
                storeFile = rootProject.file(storeFilePath!!)
                storePassword = storePasswordValue
                keyAlias = keyAliasValue
                keyPassword = keyPasswordValue
            }
        }
    }

    buildTypes {
        debug { applicationIdSuffix = ".debug" }
        release {
            isMinifyEnabled = true
            // R8 shrinks resources too; AGP 9 runs it inside R8.
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfigs.findByName("upload")?.let { signingConfig = it }
            // Native crash reports on Play need the symbols of the JNI library.
            ndk { debugSymbolLevel = "SYMBOL_TABLE" }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    if (v8Dir != null) {
        externalNativeBuild {
            cmake {
                path = file("src/main/cpp/CMakeLists.txt")
                version = "4.1.2"
            }
        }
    }
    // Uncompressed, page-aligned libs straight from the APK: nothing is
    // extracted into writable storage (Android 17 native DCL) and the 16 KB
    // alignment survives. AGP writes android:extractNativeLibs="false" from
    // this flag, which is why the attribute must not be in the manifest.
    packaging { jniLibs { useLegacyPackaging = false } }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.room3.runtime)
    implementation(libs.androidx.sqlite.framework)
    ksp(libs.androidx.room3.compiler)
    implementation(libs.androidx.media3.session)
    implementation(libs.androidx.navigation3.runtime)
    implementation(libs.androidx.navigation3.ui)
    // Layout previews in Android Studio (the Compose equivalent of the layout
    // editor); only the debug build carries the tooling UI itself.
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
}

// A release build always needs the real engine: the stub JNI plays nothing, so
// that check applies to every release task.
val releaseTaskNames =
    setOf("packageRelease", "packageReleaseBundle", "assembleRelease", "bundleRelease")
tasks.matching { it.name in releaseTaskNames }.configureEach {
    doFirst {
        check(v8Path != null) {
            "Release builds need the V8 prebuilt. Run `node apps/android/scripts/fetch-v8.mjs " +
                "arm64-v8a` or pass -Pv8Dir=<dir>; without it the stub JNI is built."
        }
    }
}

// Only the Play bundle needs our upload key: Play rejects an unsigned bundle,
// while an APK distributor (F-Droid, a store, a self-hosted repo) signs the APK
// itself and must be able to build it without our keystore. `assembleRelease`
// therefore produces an unsigned APK; `bundleRelease` still stops here.
val uploadTaskNames = setOf("packageReleaseBundle", "bundleRelease")
tasks.matching { it.name in uploadTaskNames }.configureEach {
    doFirst {
        check(uploadSigningReady) {
            "Upload bundles need an upload keystore: copy keystore.properties.template to " +
                "apps/android/keystore.properties and fill it in, or set MODPLAY_KEYSTORE_PATH, " +
                "MODPLAY_KEYSTORE_PASSWORD, MODPLAY_KEY_ALIAS and MODPLAY_KEY_PASSWORD. " +
                "An APK via :app:assembleRelease builds unsigned. See apps/android/RELEASE.md."
        }
    }
}
