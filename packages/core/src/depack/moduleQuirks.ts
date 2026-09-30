// SPDX-License-Identifier: BSD-3-Clause
// Special-case module quirks keyed by file MD5 — port of the module_quirk
// table in libxmp src/load_helpers.c:35-232. Applied after load
// (set_md5sum load.c:308 + module_quirks load_helpers.c:232-241 +
// libxmp_set_player_mode :486-560), overriding the loader's format-level
// play mode / flags for modules whose behavior can't be auto-detected.

/** XMP_MODE_* (xmp.h:108-118). */
export const XmpMode = {
  AUTO: 0,
  MOD: 1,
  NOISETRACKER: 2,
  PROTRACKER: 3,
  S3M: 4,
  ST3: 5,
  ST3GUS: 6,
  XM: 7,
  FT2: 8,
  IT: 9,
  ITSMP: 10,
} as const;

/** XMP_FLAGS_* consumed by the player (xmp.h:102-105). */
export const XmpFlag = {
  /** Use vblank timing (FX_SPEED arms + compare-vblank scan). */
  VBLANK: 1 << 0,
  /** Emulate FX9 bug. */
  FX9BUG: 1 << 1,
  /** Emulate sample loop bug. */
  FIXLOOP: 1 << 2,
  /** Use Paula mixer in Amiga modules. */
  A500: 1 << 3,
} as const;

interface QuirkEntry {
  md5: string;
  /** OR'd XMP_FLAGS_* bits (0 = none). */
  flags: number;
  /** XMP_MODE_* override (0 AUTO = leave the loader's mode). */
  mode: number;
}

/**
 * The active entries of C's mq[] table (load_helpers.c:36-232). The #if 0
 * blocks (siedler ii, the duplicate Klisje version) are omitted.
 */
export const MODULE_QUIRKS: QuirkEntry[] = [
  /* "No Mercy" by Alf/VTL (added by Martin Willers) */
  { md5: "366ec0fa962aebee034aa2dbaa49aaea", flags: 0, mode: XmpMode.PROTRACKER },
  /* mod.souvenir of china */
  { md5: "93f146aeb758c39d8b5fbc98bf237a43", flags: XmpFlag.FIXLOOP, mode: XmpMode.AUTO },
  /* "Klisje paa klisje" (added by Kjetil Torgrim Homme) */
  { md5: "e998012c700eb43af0321711305829b2", flags: 0, mode: XmpMode.NOISETRACKER },
  /* "((((( nebulos )))))" sent by Tero Auvinen (AMP version) */
  { md5: "516e8dcc357d50dea985bebf902e42dc", flags: 0, mode: XmpMode.NOISETRACKER },
  /* Purple Motion's Sundance.mod, Music Channel BBS edit */
  { md5: "5d3e1e08285212c71764957598e695c1", flags: 0, mode: XmpMode.ST3 },
  /* Asle's Ode to Protracker */
  { md5: "97a37d30d7ae6d50c962e9d8871b7e8a", flags: 0, mode: XmpMode.PROTRACKER },
  /* grooving3.mod */
  { md5: "db612244398574e9fa11b8fb87e8dec5", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* mod.Rundgren */
  { md5: "9adbb209071c4482c5df8352cc739f20", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* dance feeling by Audiomonster */
  { md5: "312c3daa5f1a54449df7c4418ac50102", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* knights melody by Audiomonster */
  { md5: "31c30e32fc9995d29720b3775005fea5", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* hcomme by Bouffon */
  { md5: "6ef978c180ae5106057c6ed0267efe3d", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* ((((aquapool)))) by Dolphin */
  { md5: "ff0be026c631b59b948394997e247cdd", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* 100yarddash by Dr. Awesome */
  { md5: "5bff2fb8ef3cbe55a8e2a7cf5cbdddb2", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* jazz-reggae-funk by Droid */
  { md5: "e56e312f6280c19d2f2454f3893f946c", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* hard and heavy by Fish */
  { md5: "6bce399475420674d283bc5e7b421fa0", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* crazy valley by Julius and Droid */
  { md5: "2377181d219b418fc1b4f4f822ddd8b6", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* THE ILLOGICAL ONE by Rhino */
  { md5: "d8c2bbe611d05c028e3bcb7c4a7d43a0", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* sounds of holiday by Spacebrain */
  { md5: "361819a49da2a26f5860c4d90da29f49", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* 7e6944b6380d2714705d44cecedd3731 */
  { md5: "7e6944b6380d2714705d44cecedd3731", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* eat the fulcrum bop by The Assassin */
  { md5: "11e96f62e1c3c5cc3bafea694bce5fec", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* obvious disaster by Tip */
  { md5: "068e6901498fbd0ffcb78f2a91e18be8", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* alien nation by Turtle */
  { md5: "71df11ac5dec07f8106f288d4759549b", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
  /* illusions!2 by Zuhl */
  { md5: "ca378c0e874f1ecda3e98bdd11468d69", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO },
];