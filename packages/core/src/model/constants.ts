// Quirk flags, flow modes, period types and read-event types.
// Mirrors reference/libxmp/src/common.h (QUIRK_*, FLOW_*, PERIOD_*, READ_EVENT_*).

/** Bitmask of player quirks, mirroring QUIRK_* in common.h:286-318. */
export const Quirk = {
  S3MLOOP: 1 << 0, // S3M loop mode
  ENVFADE: 1 << 1, // Fade at end of envelope
  PROTRACK: 1 << 2, // Use Protracker-specific quirks
  RTONCE: 1 << 3, // Retrigger one time only
  ST3BUGS: 1 << 4, // Scream Tracker 3 bug compatibility
  FINEFX: 1 << 5, // Enable 0xf/0xe for fine effects
  VSALL: 1 << 6, // Volume slides in all frames
  PBALL: 1 << 7, // Pitch bending in all frames
  PERPAT: 1 << 8, // Cancel persistent fx at pat start
  VOLPDN: 1 << 9, // Set priority to volume slide down
  UNISLD: 1 << 10, // Unified pitch slide/portamento
  ITPOR: 1 << 11, // Disable fine bends in IT vol fx
  INVLOOP: 1 << 13, // Enable invert loop
  INSVOL: 1 << 14, // Use instrument volume
  VIRTUAL: 1 << 15, // Enable virtual channels
  FILTER: 1 << 16, // Enable filter
  IGSTPOR: 1 << 17, // Ignore stray tone portamento
  KEYOFF: 1 << 18, // Keyoff doesn't reset fadeout
  VIBHALF: 1 << 19, // Vibrato is half as deep
  VIBALL: 1 << 20, // Vibrato in all frames
  VIBINV: 1 << 21, // Vibrato has inverse waveform
  PRENV: 1 << 22, // Portamento resets envelope & fade
  ITOLDFX: 1 << 23, // IT old effects mode
  S3MRTG: 1 << 24, // S3M-style retrig when count == 0
  FT2ENV: 1 << 25, // Use FT2-style envelope handling
  FT2BUGS: 1 << 26, // FT2 bug compatibility
  MARKER: 1 << 27, // Patterns 0xfe and 0xff reserved
  NOBPM: 1 << 28, // Adjust speed only, no BPM
  ARPMEM: 1 << 29, // Arpeggio has memory (S3M_ARPEGGIO)
  RSTCHN: 1 << 30, // Reset channel on sample end
} as const;

export type Quirks = number;

/** Format quirk bundles, mirroring QUIRKS_ST3 / QUIRKS_FT2 / QUIRKS_IT. */
export const QUIRKS_ST3: Quirks =
  Quirk.S3MLOOP | Quirk.VOLPDN | Quirk.FINEFX | Quirk.S3MRTG | Quirk.MARKER | Quirk.RSTCHN;

export const QUIRKS_FT2: Quirks = 0;

export const QUIRKS_IT: Quirks =
  Quirk.S3MLOOP | Quirk.FINEFX | Quirk.VIBALL | Quirk.ENVFADE | Quirk.ITPOR |
  Quirk.KEYOFF | Quirk.VIRTUAL | Quirk.FILTER | Quirk.RSTCHN | Quirk.IGSTPOR |
  Quirk.S3MRTG | Quirk.MARKER;

/** Flow quirk bits, mirroring FLOW_* in common.h:332-353. */
export const FlowFlag = {
  LOOP_GLOBAL_TARGET: 1 << 0, // Global target for all tracks
  LOOP_GLOBAL_COUNT: 1 << 1, // Global count for all tracks
  LOOP_END_ADVANCES: 1 << 2, // Loop end advances target (S3M)
  LOOP_END_CANCELS: 1 << 3, // Loop end cancels prev jumps on row (LIQ)
  LOOP_PATTERN_RESET: 1 << 4, // Target/count reset on pattern change
  LOOP_INIT_SAMEROW: 1 << 5, // SBx sets target if it isn't set (ST 3.01)
  LOOP_FIRST_EFFECT: 1 << 6, // Only execute the first E60/E6x in a row
  LOOP_ONE_AT_A_TIME: 1 << 7, // Init E6x if no other channel is looping (MPT)
  LOOP_IGNORE_TARGET: 1 << 8, // Ignore E60 if count is >=1 (LIQ)
  LOOP_DELAY_BREAK: 1 << 9, // E6x jump prevents later Dxx on same row (S3M, IT)
  LOOP_DELAY_JUMP: 1 << 10, // E6x jump prevents later Bxx on same row (S3M)
  LOOP_UNSET_BREAK: 1 << 11, // E6x jump cancels prior Dxx on same row (S3M, IMF)
  LOOP_UNSET_JUMP: 1 << 12, // E6x jump cancels prior Bxx on same row (S3M)
  LOOP_SHARED_BREAK: 1 << 13, // E6x overrides prior Dxx dest on same row (LIQ)
  JUMP_THEN_BREAK: 1 << 28, // Bxx Dxx jumps, then breaks (IMF, TT)
  JUMP_QUEUED: 1 << 29, // Jump queues next position (ST2)
  JUMP_NO_ROW_SET: 1 << 30, // Jump doesn't set break row to 0 (ST3/IT)
} as const;

export type FlowMode = number;

export const FLOW_MODE_GENERIC: FlowMode = 0;
const FLOW_LOOP_GLOBAL: FlowMode =
  FlowFlag.LOOP_GLOBAL_TARGET | FlowFlag.LOOP_GLOBAL_COUNT;
const FLOW_LOOP_NO_BREAK_JUMP: FlowMode =
  FlowFlag.LOOP_DELAY_BREAK | FlowFlag.LOOP_DELAY_JUMP |
  FlowFlag.LOOP_UNSET_BREAK | FlowFlag.LOOP_UNSET_JUMP;

/** Scream Tracker 3 flow modes (common.h:390-407). */
export const FLOW_MODE_ST2: FlowMode = FlowFlag.JUMP_QUEUED;
export const FLOW_MODE_ST3_301: FlowMode =
  FLOW_LOOP_GLOBAL | FlowFlag.LOOP_PATTERN_RESET | FlowFlag.LOOP_END_ADVANCES |
  FlowFlag.LOOP_INIT_SAMEROW | FlowFlag.JUMP_NO_ROW_SET;
export const FLOW_MODE_ST3_321: FlowMode =
  FLOW_LOOP_GLOBAL | FlowFlag.LOOP_PATTERN_RESET | FlowFlag.LOOP_END_ADVANCES |
  FLOW_LOOP_NO_BREAK_JUMP | FlowFlag.JUMP_NO_ROW_SET;

/** Impulse Tracker flow modes (common.h:414-421). */
export const FLOW_MODE_IT_100: FlowMode =
  FLOW_LOOP_GLOBAL | FlowFlag.LOOP_UNSET_BREAK | FlowFlag.LOOP_UNSET_JUMP | FlowFlag.JUMP_NO_ROW_SET;
export const FLOW_MODE_IT_104: FlowMode =
  FlowFlag.LOOP_UNSET_BREAK | FlowFlag.LOOP_UNSET_JUMP | FlowFlag.JUMP_NO_ROW_SET;
export const FLOW_MODE_IT_200: FlowMode = FLOW_MODE_IT_104 | FlowFlag.LOOP_DELAY_BREAK;
export const FLOW_MODE_IT_210: FlowMode = FLOW_MODE_IT_200 | FlowFlag.LOOP_END_ADVANCES;

/** Modplug Tracker / early OpenMPT (common.h:424). */
export const FLOW_MODE_MPT_116: FlowMode =
  FlowFlag.LOOP_ONE_AT_A_TIME | FLOW_LOOP_NO_BREAK_JUMP | FlowFlag.JUMP_NO_ROW_SET;

/**
 * Event-reading semantics for the format plugin's readEvent.
 * Mirrors READ_EVENT_* in common.h:534-539.
 */
export const ReadEventType = {
  MOD: 0,
  FT2: 1,
  ST3: 2,
  IT: 3,
  MED: 4,
} as const;
export type ReadEventType = (typeof ReadEventType)[keyof typeof ReadEventType];

/**
 * Period table / pitch semantics.
 * Mirrors PERIOD_* in common.h:540-544.
 */
export const PeriodType = {
  AMIGA: 0,
  MODRNG: 1,
  LINEAR: 2,
  CSPD: 3,
} as const;
export type PeriodType = (typeof PeriodType)[keyof typeof PeriodType];

/** Resampling interpolation, mirroring XMP_INTERP_* in xmp.h:86-89. */
export const Interp = {
  NEAREST: 0,
  LINEAR: 1,
  SPLINE: 2,
} as const;
export type Interp = (typeof Interp)[keyof typeof Interp];

/** Player state, mirroring XMP_STATE_* in xmp.h:95-98 plus STOPPED. */
export const CoreState = {
  UNLOADED: 0,
  LOADED: 1,
  PLAYING: 2,
  STOPPED: 3,
} as const;
export type CoreState = (typeof CoreState)[keyof typeof CoreState];

/** The four plugin kinds in the registry. */
export const PluginKind = {
  FORMAT: 'format',
  EFFECT: 'effect',
  DSP: 'dsp',
  OUTPUT: 'output',
} as const;
export type PluginKind = (typeof PluginKind)[keyof typeof PluginKind];