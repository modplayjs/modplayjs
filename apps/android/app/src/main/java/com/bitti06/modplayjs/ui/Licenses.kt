package com.bitti06.modplayjs.ui

data class LicenseEntry(
    val id: String,
    val name: String,
    val license: String,
    val copyright: String? = null,
    val asset: String? = null,
    val url: String? = null,
    val note: String? = null,
)

val LICENSE_ENTRIES: List<LicenseEntry> =
    listOf(
        LicenseEntry(
            id = "modplayjs",
            name = "modplayjs",
            license = "BSD-3-Clause",
            copyright = "Copyright (c) 2026, Bitti09",
            asset = "licenses/BSD-3-Clause.txt",
            url = "https://github.com/modplayjs/modplayjs",
        ),
        LicenseEntry(
            id = "v8",
            name = "V8 JavaScript engine",
            license = "BSD-3-Clause",
            copyright = "Copyright 2014 the V8 project authors",
            asset = "licenses/BSD-3-Clause.txt",
            url = "https://v8.dev",
        ),
        LicenseEntry(
            id = "openmpt",
            name = "OpenMPT",
            license = "BSD-3-Clause",
            copyright = "Copyright (C) 2004-2026, OpenMPT Project Developers and Contributors; 1997-2003 Olivier Lapicque",
            asset = "licenses/BSD-3-Clause.txt",
            url = "https://github.com/OpenMPT/openmpt",
            note = "Ported from soundlib: MODTools and per-format quirks.",
        ),
        LicenseEntry(
            id = "libxmp",
            name = "libxmp",
            license = "MIT",
            copyright = "Copyright (C) 1996-2026 Claudio Matsuoka and Hipolito Carraro Jr",
            asset = "licenses/MIT.txt",
            url = "https://github.com/libxmp/libxmp",
            note = "Ported from src/mixer.c, mix_all.c, effects.c, player.c, read_event.c, flow.c, lfo.c, filter.c, virtual.c and the MOD/S3M/XM/IT loaders.",
        ),
        LicenseEntry(
            id = "paula",
            name = "Paula-Tracker",
            license = "MIT",
            copyright = "Copyright (c) 2025 Michael Binder",
            asset = "licenses/MIT.txt",
            url = "https://github.com/RednibCoding/Paula-Tracker",
            note = "Ported from paulalib/audio-engine.js and the module loader.",
        ),
        LicenseEntry(
            id = "crsid",
            name = "cRSID 1.58 (libcRSID)",
            license = "WTF (attribution requested)",
            copyright = "Copyright (C) 2025-2026 Mihály Horváth (Hermit)",
            asset = "licenses/WTF.txt",
            url = "https://csdb.dk/release/?id=261057",
            note = "C64 SID emulation core, tables and PSID/RSID loader.",
        ),
        LicenseEntry(
            id = "stb",
            name = "stb_vorbis",
            license = "Public domain",
            copyright = "Sean Barrett (nothings)",
            url = "https://github.com/nothings/stb",
            note = "Ogg Vorbis decoder, bit-exact against the C build.",
        ),
        LicenseEntry(
            id = "minimp3",
            name = "minimp3",
            license = "CC0 / public domain",
            copyright = "lieff",
            url = "https://github.com/lieff/minimp3",
            note = "Layer-III decoder used for MP3-compressed samples.",
        ),
        LicenseEntry(
            id = "androidx",
            name = "AndroidX, Jetpack Compose, Media3, Room",
            license = "Apache-2.0",
            copyright = "Copyright The Android Open Source Project",
            asset = "licenses/Apache-2.0.txt",
            url = "https://developer.android.com/jetpack",
        ),
        LicenseEntry(
            id = "kotlin",
            name = "Kotlin and kotlinx libraries",
            license = "Apache-2.0",
            copyright = "Copyright JetBrains s.r.o.",
            asset = "licenses/Apache-2.0.txt",
            url = "https://kotlinlang.org",
        ),
    )

fun licenseEntry(id: String): LicenseEntry? = LICENSE_ENTRIES.firstOrNull { it.id == id }
