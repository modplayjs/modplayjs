import java.io.File
import org.gradle.api.tasks.PathSensitivity
import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

buildscript {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    dependencies {
        // Applied via classpath instead of the plugins DSL so the Kotlin
        // compiler that Meta ships (2.2.0) can be excluded: KGP 2.4.x warns
        // when a second kotlin-compiler-embeddable sits on the build
        // classpath.
        classpath("com.meta.spatial:spatial-gradle-plugin-impl:0.15.0") {
            exclude(group = "org.jetbrains.kotlin", module = "kotlin-compiler-embeddable")
        }
    }
}

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val repoRoot = rootProject.projectDir.parentFile.parentFile
val defaultV8 = File(repoRoot, "build/v8-prebuilt/android-arm64-v8a")
val v8Dir: String? = (project.findProperty("v8Dir") as String?)
    ?: defaultV8.takeIf { File(it, "lib/libv8_monolith.a").isFile }?.absolutePath
val v8Path = v8Dir?.replace('\\', '/')

// Store signing: keystore.properties in app/ module, apps/xr root, or project root,
// or the four MODPLAY_XR_* environment variables.
val keystoreProperties =
    Properties().apply {
        listOf(
            file("keystore.properties"),
            projectDir.parentFile.resolve("keystore.properties"),
            rootProject.file("keystore.properties"),
        ).firstOrNull { it.isFile }?.inputStream()?.use { load(it) }
    }

fun signingValue(property: String, altProperty: String, environment: String): String? =
    keystoreProperties.getProperty(property)
        ?: keystoreProperties.getProperty(altProperty)
        ?: System.getenv(environment)

// The engine is TypeScript. Bundle it before every build so the APK can never
// ship a stale engine.js. Skips (with a warning) when npm is not on PATH.
val isWindows: Boolean = System.getProperty("os.name").lowercase().contains("win")
val npmCommand: String = if (isWindows) "npm.cmd" else "npm"
val nodeCommand: String = if (isWindows) "node.exe" else "node"

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
        commandLine(npmCommand, "run", "build:engine")
        inputs.files(
            fileTree(rootProject.file("../android/engine/src")),
            fileTree(rootProject.file("../../packages")) { include("*/src/**") },
        ).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("engineSources")
        outputs.file(engineBundle)
        onlyIf("npm on PATH") { onPath(npmCommand) }
        doFirst {
            if (!onPath(npmCommand)) {
                logger.warn("npm not found: keeping the existing engine.js (may be stale)")
            }
        }
    }

tasks.named("preBuild").configure { dependsOn(buildEngine) }

// V8 prebuilt: fetch it when missing, then verify. Fetching happens before
// CMake configures, so a build that downloads V8 reports that it must run
// again before the native layer actually links it.
val v8Lib = File(defaultV8, "lib/libv8_monolith.a")

val fetchV8 =
    tasks.register<Exec>("fetchV8") {
        group = "build"
        description = "Downloads the arm64 V8 prebuilt when it is missing"
        workingDir = rootProject.projectDir
        commandLine(
            nodeCommand,
            rootProject.file("../android/scripts/fetch-v8.mjs").absolutePath,
            "arm64-v8a",
        )
        onlyIf("V8 library missing and node on PATH") {
            !v8Lib.isFile && onPath(nodeCommand)
        }
    }

val checkV8Prebuilt =
    tasks.register("checkV8Prebuilt") {
        group = "verification"
        description = "Ensures the arm64 V8 static library exists (fetches it if needed)"
        dependsOn(fetchV8)
        doLast {
            if (v8Lib.isFile) {
                // Fetching inside this build happens after the CMake arguments
                // were evaluated, so the current run still links the stub.
                if (v8Path == null) {
                    logger.warn(
                        "V8 was just fetched; run the build again so CMake picks up " +
                            "build/v8-prebuilt/android-arm64-v8a",
                    )
                }
                return@doLast
            }
            val releaseBuild =
                gradle.startParameter.taskNames.any {
                    it.contains("Release", ignoreCase = true) || it.contains("bundle", ignoreCase = true)
                }
            val message =
                "V8 prebuilt missing at build/v8-prebuilt/android-arm64-v8a. " +
                    "Run `node apps/android/scripts/fetch-v8.mjs arm64-v8a` (needs node on PATH)."
            if (releaseBuild) throw GradleException(message) else logger.warn(message)
        }
    }

tasks.named("preBuild").configure { dependsOn(checkV8Prebuilt) }

apply(plugin = "com.meta.spatial.plugin")

android {
    namespace = "com.bitti06.modplayjs.xr"
    // core-ktx 1.19, lifecycle 2.11 and Compose UI 1.12 (BOM 2026.09.00) all
    // declare minCompileSdk=37, and AGP 9.5 supports up to API 37.
    // targetSdk stays 34: immersive apps on the Horizon Store target 32-34.
    compileSdk = 37
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


    packaging { resources.excludes.add("META-INF/LICENSE") }

    lint {
        // Lint stays advisory in this repo: the deliverable is reviewed by a
        // device build, and aborting on an unrelated warning would block it.
        abortOnError = false
        checkReleaseBuilds = false
    }

    signingConfigs {
        val storePath = signingValue("RELEASE_STORE_FILE", "storeFile", "MODPLAY_XR_STORE_FILE")
        val storePass = signingValue("RELEASE_STORE_PASSWORD", "storePassword", "MODPLAY_XR_STORE_PASSWORD")
        val keyAliasValue = signingValue("RELEASE_KEY_ALIAS", "keyAlias", "MODPLAY_XR_KEY_ALIAS")
        val keyPass = signingValue("RELEASE_KEY_PASSWORD", "keyPassword", "MODPLAY_XR_KEY_PASSWORD")
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

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
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
    // Interaction SDK: hands + controllers through one pointer model.
    implementation(libs.meta.spatial.sdk.isdk)

    // Meta VR OS SDK (207). compileOnly: the AAR is API stubs plus docs,
    // Horizon OS ships the implementation at runtime.
    compileOnly(libs.metavr.os.jsdk)
}
