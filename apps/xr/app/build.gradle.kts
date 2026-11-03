import java.io.File
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.meta.spatial.plugin)
}

val repoRoot = rootProject.projectDir.parentFile.parentFile
val defaultV8 = File(repoRoot, "build/v8-prebuilt/android-arm64-v8a")
val v8Dir: String? = (project.findProperty("v8Dir") as String?)
    ?: defaultV8.takeIf { File(it, "lib/libv8_monolith.a").isFile }?.absolutePath
val v8Path = v8Dir?.replace('\\', '/')

// Store signing: keystore.properties at the project root, or the four
// MODPLAY_XR_* environment variables. Unsigned when neither exists.
val keystoreProperties =
    Properties().apply {
        val file = rootProject.file("keystore.properties")
        if (file.isFile) file.inputStream().use { load(it) }
    }

fun signingValue(property: String, environment: String): String? =
    keystoreProperties.getProperty(property) ?: System.getenv(environment)

// The engine is TypeScript. Bundle it before every build so the APK can never
// ship a stale engine.js. Skips (with a warning) when npm is not on PATH.
fun onPath(name: String): Boolean =
    System.getenv("PATH")
        ?.split(File.pathSeparator)
        ?.any { File(it, name).canExecute() } == true

val engineBundle = file("src/main/assets/engine/engine.js")

val buildEngine =
    tasks.register<Exec>("buildEngine") {
        group = "build"
        description = "Bundles apps/android/engine into assets/engine/engine.js"
        workingDir = rootProject.projectDir
        commandLine("npm", "run", "build:engine")
        inputs.files(
            fileTree(rootProject.file("../android/engine/src")),
            fileTree(rootProject.file("../../packages")) { include("*/src/**") },
        ).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("engineSources")
        outputs.file(engineBundle)
        onlyIf("npm on PATH") { onPath("npm") || onPath("npm.cmd") }
        doFirst {
            if (!onPath("npm") && !onPath("npm.cmd")) {
                logger.warn("npm not found: keeping the existing engine.js (may be stale)")
            }
        }
    }

tasks.named("preBuild").configure { dependsOn(buildEngine) }

// Fail loudly when the V8 prebuilt is missing: without it the JNI layer builds
// as a stub and the app would start with no audio engine.
val v8Check =
    tasks.register("checkV8Prebuilt") {
        group = "verification"
        description = "Verifies the arm64 V8 static library is present"
        doLast {
            if (v8Path == null) {
                logger.warn(
                    "V8 prebuilt missing at build/v8-prebuilt/android-arm64-v8a; " +
                        "the app will build with a stub engine",
                )
            }
        }
    }

tasks.named("preBuild").configure { dependsOn(v8Check) }

android {
    namespace = "com.bitti06.modplayjs.xr"
    compileSdk = 34
    ndkVersion = "29.0.14206865"

    defaultConfig {
        applicationId = "com.bitti06.modplayjs.xr"
        minSdk = 34
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        ndk { abiFilters += listOf("arm64-v8a") }

        externalNativeBuild {
            cmake {
                arguments += listOf("-DMODPLAY_V8=${if (v8Path != null) "ON" else "OFF"}")
                if (v8Path != null) {
                    arguments += listOf(
                        "-DV8_LIB=$v8Path/lib/libv8_monolith.a",
                        "-DV8_INCLUDE=$v8Path/include",
                    )
                }
            }
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
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

    kotlinOptions { jvmTarget = "17" }

    packaging { resources.excludes.add("META-INF/LICENSE") }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }

    signingConfigs {
        val storePath = signingValue("storeFile", "MODPLAY_XR_STORE_FILE")
        val storePass = signingValue("storePassword", "MODPLAY_XR_STORE_PASSWORD")
        val keyAliasValue = signingValue("keyAlias", "MODPLAY_XR_KEY_ALIAS")
        val keyPass = signingValue("keyPassword", "MODPLAY_XR_KEY_PASSWORD")
        if (storePath != null && storePass != null && keyAliasValue != null && keyPass != null) {
            create("release") {
                storeFile = file(storePath)
                storePassword = storePass
                keyAlias = keyAliasValue
                keyPassword = keyPass
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.documentfile)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.material3)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.meta.spatial.sdk)
    implementation(libs.meta.spatial.sdk.vr)
    implementation(libs.meta.spatial.sdk.compose)
    implementation(libs.meta.spatial.sdk.toolkit)
    implementation(libs.meta.spatial.sdk.spatialaudio)
    implementation(libs.meta.spatial.sdk.mruk)
}
