var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../packages/core/src/model/constants.ts
var Quirk = {
  S3MLOOP: 1 << 0,
  // S3M loop mode
  ENVFADE: 1 << 1,
  // Fade at end of envelope
  PROTRACK: 1 << 2,
  // Use Protracker-specific quirks
  RTONCE: 1 << 3,
  // Retrigger one time only
  ST3BUGS: 1 << 4,
  // Scream Tracker 3 bug compatibility
  FINEFX: 1 << 5,
  // Enable 0xf/0xe for fine effects
  VSALL: 1 << 6,
  // Volume slides in all frames
  PBALL: 1 << 7,
  // Pitch bending in all frames
  PERPAT: 1 << 8,
  // Cancel persistent fx at pat start
  VOLPDN: 1 << 9,
  // Set priority to volume slide down
  UNISLD: 1 << 10,
  // Unified pitch slide/portamento
  ITPOR: 1 << 11,
  // Disable fine bends in IT vol fx
  INVLOOP: 1 << 13,
  // Enable invert loop
  INSVOL: 1 << 14,
  // Use instrument volume
  VIRTUAL: 1 << 15,
  // Enable virtual channels
  FILTER: 1 << 16,
  // Enable filter
  IGSTPOR: 1 << 17,
  // Ignore stray tone portamento
  KEYOFF: 1 << 18,
  // Keyoff doesn't reset fadeout
  VIBHALF: 1 << 19,
  // Vibrato is half as deep
  VIBALL: 1 << 20,
  // Vibrato in all frames
  VIBINV: 1 << 21,
  // Vibrato has inverse waveform
  PRENV: 1 << 22,
  // Portamento resets envelope & fade
  ITOLDFX: 1 << 23,
  // IT old effects mode
  S3MRTG: 1 << 24,
  // S3M-style retrig when count == 0
  FT2ENV: 1 << 25,
  // Use FT2-style envelope handling
  FT2BUGS: 1 << 26,
  // FT2 bug compatibility
  MARKER: 1 << 27,
  // Patterns 0xfe and 0xff reserved
  NOBPM: 1 << 28,
  // Adjust speed only, no BPM
  ARPMEM: 1 << 29,
  // Arpeggio has memory (S3M_ARPEGGIO)
  RSTCHN: 1 << 30
  // Reset channel on sample end
};
var NoteFlag = {
  FADEOUT: 1 << 0,
  ENV_RELEASE: 1 << 1,
  END: 1 << 2,
  CUT: 1 << 3,
  ENV_END: 1 << 4,
  SAMPLE_END: 1 << 5,
  SET: 1 << 6,
  SUSEXIT: 1 << 7,
  KEY_CUT: 1 << 8,
  GLISSANDO: 1 << 9,
  SAMPLE_RELEASE: 1 << 10,
  RELEASE: 1 << 1 | 1 << 10
};
var QUIRKS_ST3 = Quirk.S3MLOOP | Quirk.VOLPDN | Quirk.FINEFX | Quirk.S3MRTG | Quirk.MARKER | Quirk.RSTCHN;
var QUIRKS_FT2 = 0;
var QUIRKS_IT = Quirk.S3MLOOP | Quirk.FINEFX | Quirk.VIBALL | Quirk.ENVFADE | Quirk.ITPOR | Quirk.KEYOFF | Quirk.VIRTUAL | Quirk.FILTER | Quirk.RSTCHN | Quirk.IGSTPOR | Quirk.S3MRTG | Quirk.MARKER;
var FlowFlag = {
  LOOP_GLOBAL_TARGET: 1 << 0,
  // Global target for all tracks
  LOOP_GLOBAL_COUNT: 1 << 1,
  // Global count for all tracks
  LOOP_END_ADVANCES: 1 << 2,
  // Loop end advances target (S3M)
  LOOP_END_CANCELS: 1 << 3,
  // Loop end cancels prev jumps on row (LIQ)
  LOOP_PATTERN_RESET: 1 << 4,
  // Target/count reset on pattern change
  LOOP_INIT_SAMEROW: 1 << 5,
  // SBx sets target if it isn't set (ST 3.01)
  LOOP_FIRST_EFFECT: 1 << 6,
  // Only execute the first E60/E6x in a row
  LOOP_ONE_AT_A_TIME: 1 << 7,
  // Init E6x if no other channel is looping (MPT)
  LOOP_IGNORE_TARGET: 1 << 8,
  // Ignore E60 if count is >=1 (LIQ)
  LOOP_DELAY_BREAK: 1 << 9,
  // E6x jump prevents later Dxx on same row (S3M, IT)
  LOOP_DELAY_JUMP: 1 << 10,
  // E6x jump prevents later Bxx on same row (S3M)
  LOOP_UNSET_BREAK: 1 << 11,
  // E6x jump cancels prior Dxx on same row (S3M, IMF)
  LOOP_UNSET_JUMP: 1 << 12,
  // E6x jump cancels prior Bxx on same row (S3M)
  LOOP_SHARED_BREAK: 1 << 13,
  // E6x overrides prior Dxx dest on same row (LIQ)
  JUMP_THEN_BREAK: 1 << 28,
  // Bxx Dxx jumps, then breaks (IMF, TT)
  JUMP_QUEUED: 1 << 29,
  // Jump queues next position (ST2)
  JUMP_NO_ROW_SET: 1 << 30
  // Jump doesn't set break row to 0 (ST3/IT)
};
var FLOW_MODE_GENERIC = 0;
var FLOW_LOOP_GLOBAL = FlowFlag.LOOP_GLOBAL_TARGET | FlowFlag.LOOP_GLOBAL_COUNT;
var FLOW_LOOP_NO_BREAK_JUMP = FlowFlag.LOOP_DELAY_BREAK | FlowFlag.LOOP_DELAY_JUMP | FlowFlag.LOOP_UNSET_BREAK | FlowFlag.LOOP_UNSET_JUMP;
var FLOW_MODE_ST2 = FlowFlag.JUMP_QUEUED;
var FLOW_MODE_ST3_301 = FLOW_LOOP_GLOBAL | FlowFlag.LOOP_PATTERN_RESET | FlowFlag.LOOP_END_ADVANCES | FlowFlag.LOOP_INIT_SAMEROW | FlowFlag.JUMP_NO_ROW_SET;
var FLOW_MODE_ST3_321 = FLOW_LOOP_GLOBAL | FlowFlag.LOOP_PATTERN_RESET | FlowFlag.LOOP_END_ADVANCES | FLOW_LOOP_NO_BREAK_JUMP | FlowFlag.JUMP_NO_ROW_SET;
var FLOW_MODE_IT_100 = FLOW_LOOP_GLOBAL | FlowFlag.LOOP_UNSET_BREAK | FlowFlag.LOOP_UNSET_JUMP | FlowFlag.JUMP_NO_ROW_SET;
var FLOW_MODE_IT_104 = FlowFlag.LOOP_UNSET_BREAK | FlowFlag.LOOP_UNSET_JUMP | FlowFlag.JUMP_NO_ROW_SET;
var FLOW_MODE_IT_200 = FLOW_MODE_IT_104 | FlowFlag.LOOP_DELAY_BREAK;
var FLOW_MODE_IT_210 = FLOW_MODE_IT_200 | FlowFlag.LOOP_END_ADVANCES;
var FLOW_MODE_MPT_116 = FlowFlag.LOOP_ONE_AT_A_TIME | FLOW_LOOP_NO_BREAK_JUMP | FlowFlag.JUMP_NO_ROW_SET;
var FLOW_MODE_ORPHEUS = FlowFlag.LOOP_PATTERN_RESET | FlowFlag.LOOP_SHARED_BREAK | FlowFlag.LOOP_UNSET_BREAK | FlowFlag.JUMP_THEN_BREAK;
var FLOW_MODE_LIQUID = FlowFlag.LOOP_END_CANCELS | FlowFlag.LOOP_IGNORE_TARGET | FlowFlag.LOOP_SHARED_BREAK;
var FLOW_MODE_LIQUID_COMPAT = FLOW_MODE_LIQUID | FlowFlag.LOOP_PATTERN_RESET;
var FLOW_MODE_OCTALYSER = FLOW_LOOP_GLOBAL | FlowFlag.LOOP_IGNORE_TARGET | FlowFlag.LOOP_END_CANCELS | FLOW_LOOP_NO_BREAK_JUMP;
var FLOW_MODE_DTM_2015 = FLOW_LOOP_GLOBAL | FlowFlag.LOOP_FIRST_EFFECT | FLOW_LOOP_NO_BREAK_JUMP;
var ReadEventType = {
  MOD: 0,
  FT2: 1,
  ST3: 2,
  IT: 3,
  MED: 4
};
var PeriodType = {
  AMIGA: 0,
  MODRNG: 1,
  LINEAR: 2,
  CSPD: 3
};
var Interp = {
  NEAREST: 0,
  LINEAR: 1,
  SPLINE: 2
};
var CoreState = {
  UNLOADED: 0,
  LOADED: 1,
  PLAYING: 2,
  STOPPED: 3
};
var PluginKind = {
  FORMAT: "format",
  EFFECT: "effect",
  DSP: "dsp",
  OUTPUT: "output"
};
var C4_PAL_RATE = 8287;
var C4_NTSC_RATE = 8363;

// ../../packages/core/src/model/fx.ts
var fx_exports = {};
__export(fx_exports, {
  EX_CUT: () => EX_CUT,
  EX_DELAY: () => EX_DELAY,
  EX_FILTER: () => EX_FILTER,
  EX_FINETUNE: () => EX_FINETUNE,
  EX_F_PORTA_DN: () => EX_F_PORTA_DN,
  EX_F_PORTA_UP: () => EX_F_PORTA_UP,
  EX_F_VSLIDE_DN: () => EX_F_VSLIDE_DN,
  EX_F_VSLIDE_UP: () => EX_F_VSLIDE_UP,
  EX_GLISS: () => EX_GLISS,
  EX_INVLOOP: () => EX_INVLOOP,
  EX_PATTERN_LOOP: () => EX_PATTERN_LOOP,
  EX_PATT_DELAY: () => EX_PATT_DELAY,
  EX_RETRIG: () => EX_RETRIG,
  EX_SETPAN: () => EX_SETPAN,
  EX_TREMOLO_WF: () => EX_TREMOLO_WF,
  EX_VIBRATO_WF: () => EX_VIBRATO_WF,
  FX_669_FINETUNE: () => FX_669_FINETUNE,
  FX_669_PORTA_DN: () => FX_669_PORTA_DN,
  FX_669_PORTA_UP: () => FX_669_PORTA_UP,
  FX_669_TPORTA: () => FX_669_TPORTA,
  FX_669_VIBRATO: () => FX_669_VIBRATO,
  FX_ARPEGGIO: () => FX_ARPEGGIO,
  FX_BREAK: () => FX_BREAK,
  FX_ENVPOS: () => FX_ENVPOS,
  FX_EXTENDED: () => FX_EXTENDED,
  FX_FAR_F_TEMPO: () => FX_FAR_F_TEMPO,
  FX_FAR_TEMPO: () => FX_FAR_TEMPO,
  FX_FAR_TPORTA: () => FX_FAR_TPORTA,
  FX_FC_AUTO_PORTA: () => FX_FC_AUTO_PORTA,
  FX_FC_MED_SYNTH_JUMP: () => FX_FC_MED_SYNTH_JUMP,
  FX_FC_TONEPORTA_DURATION: () => FX_FC_TONEPORTA_DURATION,
  FX_FINETUNE: () => FX_FINETUNE,
  FX_FINE_VIBRATO: () => FX_FINE_VIBRATO,
  FX_FLT_CUTOFF: () => FX_FLT_CUTOFF,
  FX_FLT_RESN: () => FX_FLT_RESN,
  FX_F_NSLIDE_DN: () => FX_F_NSLIDE_DN,
  FX_F_NSLIDE_UP: () => FX_F_NSLIDE_UP,
  FX_F_PORTA_DN: () => FX_F_PORTA_DN,
  FX_F_PORTA_UP: () => FX_F_PORTA_UP,
  FX_F_VSLIDE_DN: () => FX_F_VSLIDE_DN,
  FX_F_VSLIDE_DN_2: () => FX_F_VSLIDE_DN_2,
  FX_F_VSLIDE_UP: () => FX_F_VSLIDE_UP,
  FX_F_VSLIDE_UP_2: () => FX_F_VSLIDE_UP_2,
  FX_GLOBALVOL: () => FX_GLOBALVOL,
  FX_GVOL_SLIDE: () => FX_GVOL_SLIDE,
  FX_HIOFFSET: () => FX_HIOFFSET,
  FX_ICE_SPEED: () => FX_ICE_SPEED,
  FX_IT_BPM: () => FX_IT_BPM,
  FX_IT_BREAK: () => FX_IT_BREAK,
  FX_IT_INSTFUNC: () => FX_IT_INSTFUNC,
  FX_IT_PANSLIDE: () => FX_IT_PANSLIDE,
  FX_IT_ROWDELAY: () => FX_IT_ROWDELAY,
  FX_JUMP: () => FX_JUMP,
  FX_KEYOFF: () => FX_KEYOFF,
  FX_LINE_JUMP: () => FX_LINE_JUMP,
  FX_MACRO: () => FX_MACRO,
  FX_MACROSMOOTH: () => FX_MACROSMOOTH,
  FX_MACRO_SET: () => FX_MACRO_SET,
  FX_MED_HOLD: () => FX_MED_HOLD,
  FX_MED_RETRIG: () => FX_MED_RETRIG,
  FX_MEGAARP: () => FX_MEGAARP,
  FX_MULTI_RETRIG: () => FX_MULTI_RETRIG,
  FX_NSLIDE_DN: () => FX_NSLIDE_DN,
  FX_NSLIDE_UP: () => FX_NSLIDE_UP,
  FX_OFFSET: () => FX_OFFSET,
  FX_OKT_ARP3: () => FX_OKT_ARP3,
  FX_OKT_ARP4: () => FX_OKT_ARP4,
  FX_OKT_ARP5: () => FX_OKT_ARP5,
  FX_PANBRELLO: () => FX_PANBRELLO,
  FX_PANBRELLO_WF: () => FX_PANBRELLO_WF,
  FX_PANSLIDE: () => FX_PANSLIDE,
  FX_PANSL_NOMEM: () => FX_PANSL_NOMEM,
  FX_PATT_DELAY: () => FX_PATT_DELAY,
  FX_PER_CANCEL: () => FX_PER_CANCEL,
  FX_PER_TPORTA: () => FX_PER_TPORTA,
  FX_PITCH_ADD: () => FX_PITCH_ADD,
  FX_PITCH_SUB: () => FX_PITCH_SUB,
  FX_PORTA_DN: () => FX_PORTA_DN,
  FX_PORTA_UP: () => FX_PORTA_UP,
  FX_REVERSE: () => FX_REVERSE,
  FX_S3M_ARPEGGIO: () => FX_S3M_ARPEGGIO,
  FX_S3M_BPM: () => FX_S3M_BPM,
  FX_S3M_SPEED: () => FX_S3M_SPEED,
  FX_SETPAN: () => FX_SETPAN,
  FX_SPEED: () => FX_SPEED,
  FX_SPEED_CP: () => FX_SPEED_CP,
  FX_SURROUND: () => FX_SURROUND,
  FX_TONEPORTA: () => FX_TONEPORTA,
  FX_TONE_VSLIDE: () => FX_TONE_VSLIDE,
  FX_TREMOLO: () => FX_TREMOLO,
  FX_TREMOR: () => FX_TREMOR,
  FX_TRK_FVSLIDE: () => FX_TRK_FVSLIDE,
  FX_TRK_VOL: () => FX_TRK_VOL,
  FX_TRK_VSLIDE: () => FX_TRK_VSLIDE,
  FX_ULT_TEMPO: () => FX_ULT_TEMPO,
  FX_ULT_TPORTA: () => FX_ULT_TPORTA,
  FX_VIBRATO: () => FX_VIBRATO,
  FX_VIBRATO2: () => FX_VIBRATO2,
  FX_VIBRA_VSLIDE: () => FX_VIBRA_VSLIDE,
  FX_VOLSET: () => FX_VOLSET,
  FX_VOLSLIDE: () => FX_VOLSLIDE,
  FX_VOLSLIDE_2: () => FX_VOLSLIDE_2,
  FX_VOL_ADD: () => FX_VOL_ADD,
  FX_VOL_SUB: () => FX_VOL_SUB,
  FX_VSLIDE_DN_2: () => FX_VSLIDE_DN_2,
  FX_VSLIDE_UP_2: () => FX_VSLIDE_UP_2,
  FX_XF_PORTA: () => FX_XF_PORTA,
  XX_XF_PORTA_DN: () => XX_XF_PORTA_DN,
  XX_XF_PORTA_UP: () => XX_XF_PORTA_UP
});
var FX_ARPEGGIO = 0;
var FX_PORTA_UP = 1;
var FX_PORTA_DN = 2;
var FX_TONEPORTA = 3;
var FX_VIBRATO = 4;
var FX_TONE_VSLIDE = 5;
var FX_VIBRA_VSLIDE = 6;
var FX_TREMOLO = 7;
var FX_OFFSET = 9;
var FX_VOLSLIDE = 10;
var FX_JUMP = 11;
var FX_VOLSET = 12;
var FX_BREAK = 13;
var FX_EXTENDED = 14;
var FX_SPEED = 15;
var FX_SETPAN = 8;
var FX_GLOBALVOL = 16;
var FX_GVOL_SLIDE = 17;
var FX_KEYOFF = 20;
var FX_ENVPOS = 21;
var FX_PANSLIDE = 25;
var FX_MULTI_RETRIG = 27;
var FX_TREMOR = 29;
var FX_XF_PORTA = 33;
var EX_FILTER = 0;
var EX_F_PORTA_UP = 1;
var EX_F_PORTA_DN = 2;
var EX_GLISS = 3;
var EX_VIBRATO_WF = 4;
var EX_FINETUNE = 5;
var EX_PATTERN_LOOP = 6;
var EX_TREMOLO_WF = 7;
var EX_SETPAN = 8;
var EX_RETRIG = 9;
var EX_F_VSLIDE_UP = 10;
var EX_F_VSLIDE_DN = 11;
var EX_CUT = 12;
var EX_DELAY = 13;
var EX_PATT_DELAY = 14;
var EX_INVLOOP = 15;
var XX_XF_PORTA_UP = 1;
var XX_XF_PORTA_DN = 2;
var FX_TRK_VOL = 128;
var FX_TRK_VSLIDE = 129;
var FX_TRK_FVSLIDE = 130;
var FX_IT_INSTFUNC = 131;
var FX_FLT_CUTOFF = 132;
var FX_FLT_RESN = 133;
var FX_IT_BPM = 135;
var FX_IT_ROWDELAY = 136;
var FX_IT_PANSLIDE = 137;
var FX_PANBRELLO = 138;
var FX_PANBRELLO_WF = 139;
var FX_HIOFFSET = 140;
var FX_IT_BREAK = 142;
var FX_MACRO_SET = 189;
var FX_MACRO = 190;
var FX_MACROSMOOTH = 191;
var FX_SURROUND = 141;
var FX_REVERSE = 143;
var FX_S3M_SPEED = 163;
var FX_VOLSLIDE_2 = 164;
var FX_FINETUNE = 166;
var FX_S3M_BPM = 171;
var FX_FINE_VIBRATO = 172;
var FX_F_VSLIDE_UP = 173;
var FX_F_VSLIDE_DN = 174;
var FX_F_PORTA_UP = 175;
var FX_F_PORTA_DN = 176;
var FX_VIBRATO2 = 146;
var FX_MED_RETRIG = 147;
var FX_PATT_DELAY = 179;
var FX_S3M_ARPEGGIO = 180;
var FX_PANSL_NOMEM = 181;
var FX_MED_HOLD = 177;
var FX_OKT_ARP3 = 112;
var FX_OKT_ARP4 = 113;
var FX_OKT_ARP5 = 114;
var FX_VSLIDE_UP_2 = 192;
var FX_VSLIDE_DN_2 = 193;
var FX_F_VSLIDE_UP_2 = 194;
var FX_F_VSLIDE_DN_2 = 195;
var FX_FC_AUTO_PORTA = 196;
var FX_FC_TONEPORTA_DURATION = 197;
var FX_FC_MED_SYNTH_JUMP = 198;
var FX_NSLIDE_DN = 156;
var FX_NSLIDE_UP = 157;
var FX_F_NSLIDE_DN = 117;
var FX_F_NSLIDE_UP = 118;
var FX_PER_TPORTA = 122;
var FX_SPEED_CP = 126;
var FX_FAR_TPORTA = 103;
var FX_ULT_TPORTA = 111;
var FX_FAR_TEMPO = 104;
var FX_FAR_F_TEMPO = 105;
var FX_PER_CANCEL = 127;
var FX_669_PORTA_UP = 96;
var FX_669_PORTA_DN = 97;
var FX_669_TPORTA = 98;
var FX_669_FINETUNE = 99;
var FX_669_VIBRATO = 100;
var FX_ULT_TEMPO = 95;
var FX_ICE_SPEED = 162;
var FX_MEGAARP = 178;
var FX_VOL_ADD = 182;
var FX_VOL_SUB = 183;
var FX_PITCH_ADD = 184;
var FX_PITCH_SUB = 185;
var FX_LINE_JUMP = 186;

// ../../packages/core/src/model/model.ts
var SampleFlags = {
  /** 16-bit sample data. */
  BITS16: 1 << 0,
  /** Forward loop (loopStart/loopEnd). */
  LOOP: 1 << 1,
  /** Bidirectional (ping-pong) loop. */
  BIDIR: 1 << 2,
  /** Backwards sample loop. */
  LOOP_REVERSE: 1 << 3,
  /** Play full sample before looping. */
  LOOP_FULL: 1 << 4,
  /** IT sustain loop (sustainStart/sustainEnd). */
  SUSTAIN: 1 << 5,
  /** IT bidirectional sustain loop. */
  SUSTAIN_BIDIR: 1 << 6,
  /** Interlaced stereo sample (data = L R L R). */
  STEREO: 1 << 7
};
var EnvelopeFlags = {
  ON: 1 << 0,
  SUS: 1 << 1,
  LOOP: 1 << 2,
  FLT: 1 << 3,
  SLOOP: 1 << 4,
  CARRY: 1 << 5
};
var Nna = {
  CUT: 0,
  CONT: 1,
  OFF: 2,
  FADE: 3
};
var Dct = {
  OFF: 0,
  NOTE: 1,
  SMP: 2,
  INST: 3
};
var ChannelFlags = {
  SYNTH: 1 << 0,
  MUTE: 1 << 1,
  SPLIT: 1 << 2,
  SURROUND: 1 << 4
};
var EMPTY_EVENT = Object.freeze({
  note: 0,
  ins: 0,
  vol: 0,
  fxt: 0,
  fxp: 0,
  f2t: 0,
  f2p: 0
});
var MED_SYNTH_ENV_LOOP = 1 << 0;
var FltEnvStage = {
  ATTACK_1: 0,
  ATTACK_2: 1,
  DECAY: 2,
  SUSTAIN: 3,
  RELEASE: 4
};
var Act = {
  NONE: 0,
  NOTE: 1,
  KEY: 2,
  VOL: 4,
  PAN: 8,
  PER: 16
};
var VoiceFlag = {
  RELEASE: 1 << 0,
  ANTICLICK: 1 << 1,
  SAMPLE_LOOP: 1 << 2,
  VOICE_REVERSE: 1 << 3,
  VOICE_BIDIR: 1 << 4,
  SAMPLE_QUEUED: 1 << 5,
  SAMPLE_PAUSED: 1 << 6
};
var INVALID = 65535;
var RowDelay = {
  ON: 1 << 0,
  FIRST_FRAME: 1 << 1
};
var PlayerFlag = {
  VBLANK: 1 << 0,
  FIXVOL: 1 << 2,
  FX9BUG: 1 << 4,
  A500: 1 << 6,
  A500FILTER: 1 << 7
};
var AMIGA_PERIODS = [
  1712,
  1663,
  1619,
  1538,
  1481,
  1437,
  1390,
  1328,
  1286,
  1244,
  1193,
  1141,
  856,
  831,
  809,
  769,
  740,
  718,
  695,
  664,
  643,
  622,
  596,
  570,
  428,
  415,
  404,
  384,
  370,
  359,
  347,
  332,
  321,
  311,
  298,
  285,
  214,
  207,
  202,
  192,
  185,
  179,
  173,
  166,
  160,
  155,
  149,
  143,
  107,
  103,
  101,
  96,
  92,
  89,
  87,
  83,
  80,
  78,
  75,
  71,
  53,
  52,
  50,
  48,
  46,
  45,
  43,
  42,
  40,
  39,
  37,
  36,
  27,
  26,
  25,
  24,
  23,
  22,
  22,
  21,
  20,
  20,
  19,
  18,
  14,
  13,
  13,
  12,
  12,
  11,
  11,
  10,
  10,
  10,
  9,
  9,
  7,
  7,
  6,
  6,
  6,
  6,
  5,
  5,
  5,
  5,
  5,
  4,
  4,
  4,
  4,
  4,
  3,
  3,
  3,
  3,
  3,
  3,
  3,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  2,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1
];
var MODRNG_PERIODS = [
  1712,
  1663,
  1619,
  1538,
  1481,
  1437,
  1390,
  1328,
  1286,
  1244,
  1193,
  1141,
  1071,
  1035,
  1005,
  953,
  918,
  891,
  863,
  821,
  791,
  764,
  732,
  700,
  664,
  643,
  622,
  596,
  571,
  551,
  535,
  509,
  490,
  474,
  453,
  436,
  428,
  415,
  404,
  384,
  370,
  359,
  347,
  332,
  321,
  311,
  298,
  285,
  269,
  260,
  252,
  239,
  231,
  224,
  217,
  207,
  201,
  195,
  186,
  180,
  179,
  173,
  166,
  159,
  153,
  148,
  144,
  138,
  134,
  131,
  125,
  121,
  115,
  112,
  109,
  103,
  100,
  97,
  94,
  91,
  88,
  85,
  82,
  79,
  75,
  73,
  70,
  67,
  65,
  63,
  61,
  59,
  57,
  55,
  53,
  51
];
var C4_PERIOD = 428;
var XMP_KEY_OFF = 129;
var XMP_KEY_CUT = 130;
var XMP_KEY_FADE = 131;
var XMP_KEY_CUT_FADE = 132;

// ../../packages/core/src/errors.ts
var ModplayError = class extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
};
var UnknownFormatError = class extends ModplayError {
  constructor() {
    super("no format plugin recognized this module");
  }
};
var ParseError = class extends ModplayError {
};
var PackedModuleError = class extends ModplayError {
  constructor(kind) {
    super(`packed modules are not supported (${kind}); provide an unpacked file`);
  }
};
var StateError = class extends ModplayError {
};
var PluginNotFoundError = class extends ModplayError {
};
var SampleError = class extends ModplayError {
};

// ../../packages/core/src/virtual.ts
var PERIOD_BASE = 13696;
function noteToPeriodMix(n, b) {
  return PERIOD_BASE / Math.pow(2, (n + b / 12800) / 12);
}
var MAXVOICES = 128;
var PastNote = {
  CUT: 0,
  OFF: 1,
  FADE: 2
};
var VIRT_INVALID = -1;
var VIRT_ACTIVE = 256;
var insKeys = /* @__PURE__ */ new WeakMap();
var nextInsKey = 1;
function insKey(ins) {
  let k = insKeys.get(ins);
  if (k === void 0) {
    k = nextInsKey++;
    insKeys.set(ins, k);
  }
  return k;
}
function keyInstruments(instruments) {
  for (const ins of instruments) insKey(ins);
}
function makeVoice(chn) {
  return {
    chn,
    root: 0,
    nnaAct: 0,
    note: 0,
    pan: 128,
    vol: 0,
    period: 0,
    pos: 0,
    frac: 0,
    pos0: 0,
    fidx: 0,
    ins: -1,
    smp: -1,
    start: 0,
    end: 0,
    act: Act.NONE,
    key: 0,
    old_vl: 0,
    old_vr: 0,
    sleft: 0,
    sright: 0,
    flags: 0,
    queued: { smp: -1 },
    filter: {
      r1: 0,
      r2: 0,
      l1: 0,
      l2: 0,
      a0: 0,
      b0: 0,
      b1: 0,
      cutoff: 255,
      resonance: 0
    }
  };
}
var VirtualLayer = class {
  /** ctx->s.bidir_adjust (mixer.c:379) — IT ping-pong loops shortened by
   * one sample; 0 for the non-IT formats until T18 wires it. */
  bidirAdjust = 0;
  /** Player channel count (= module channels; IT may exceed via NNA overflow). */
  numTracks = 0;
  /** Total virtual channels (tracks + overflow channels for NNA). */
  virtChannels = 0;
  map = [];
  /** Voice pool (preallocated one per slot; NNA reuses/steals slots). */
  voices = [];
  used = 0;
  /** Pool cap (C maxvoc = s->numvoc, virtual.c:107-118). */
  poolCap = 128;
  /** QUIRK_VIRTUAL — module requests NNA overflow channels. */
  extChannels = false;
  /** Allocate/reset for a new module + play session (virt_on, virtual.c:100). */
  on(numTracks, quirkVirtual = false, numvoc = 128) {
    this.off();
    this.numTracks = numTracks;
    const poolCap = Math.max(1, Math.min(numvoc, MAXVOICES));
    this.poolCap = poolCap;
    this.virtChannels = numTracks + (quirkVirtual ? poolCap : 0);
    this.extChannels = quirkVirtual;
    for (let i = 0; i < this.virtChannels; i++) {
      this.map.push({ voice: VIRT_INVALID, tail: VIRT_INVALID });
    }
    this.used = 0;
    for (let i = 0; i < poolCap; i++) {
      this.voices.push(makeVoice(VIRT_INVALID));
    }
    this.setChannelMute([]);
  }
  /** Free everything (virt_off, virtual.c:170). */
  off() {
    this.map = [];
    this.voices.length = 0;
    this.extChannels = false;
    this.virtChannels = 0;
    this.used = 0;
  }
  /** Reset all voices/mappings without resizing (virt_reset, virtual.c:195). */
  reset() {
    for (let i = 0; i < this.map.length; i++) {
      this.map[i].voice = VIRT_INVALID;
      this.map[i].tail = VIRT_INVALID;
    }
    for (const v of this.voices) {
      v.act = Act.NONE;
      v.flags = 0;
      v.smp = -1;
      v.ins = -1;
      v.pos = 0;
      v.pos0 = 0;
      v.vol = 0;
    }
    this.used = 0;
  }
  /** Map a virtual channel to its active voice index, or VIRT_INVALID (virt_mapchannel :293). */
  mapChannel(chn) {
    if (chn < 0 || chn >= this.virtChannels) return VIRT_INVALID;
    return this.map[chn].voice;
  }
  get usedVoices() {
    return this.used;
  }
  /**
   * C alloc_voice (virtual.c:250-274): find a free slot and IMMEDIATELY
   * bind it to the channel — `voice_array[i].chn = chn; root = chn;
   * virt_channel[chn].map = i`. The map entry is written by the allocator
   * itself, so no caller can leave a map pointing at a freed slot (the
   * stale-map alias bug: setPatchSmp's smp<0 path wiped a freshly
   * allocated slot whose chn was never bound, leaving map[chn] stale).
   */
  allocVoice(chn) {
    if (this.used < this.poolCap && this.used >= this.voices.length) {
      this.voices.push(makeVoice(this.voices.length));
    }
    const bind = (i) => {
      this.used++;
      this.voices[i].chn = chn;
      this.voices[i].root = chn;
      this.map[chn].voice = i;
      return i;
    };
    for (let i = 0; i < this.voices.length; i++) {
      if (this.voices[i].chn === VIRT_INVALID) {
        return bind(i);
      }
    }
    let steal = -1;
    let stealVol = Number.MAX_VALUE;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v.chn >= this.numTracks && v.vol < stealVol) {
        stealVol = v.vol;
        steal = i;
      }
    }
    if (steal >= 0) {
      const stolenChn = this.voices[steal].chn;
      if (this.map[stolenChn].voice === steal) {
        this.map[stolenChn].voice = VIRT_INVALID;
      }
      this.resetVoice(steal, false);
      return bind(steal);
    }
    if (this.voices.length < this.poolCap) {
      const idx = this.voices.length;
      this.voices.push(makeVoice(VIRT_INVALID));
      return bind(idx);
    }
    return VIRT_INVALID;
  }
  /**
   * libxmp_virt_setpatch (virtual.c:484-546): assign instrument+sample+note
   * to a virtual channel. `smp` is the sample number (sub.sid space);
   * `key` is the player note key (virtual.c:541 v.key = key). Duplicate
   * check runs the DCT against the channel's current voice; DCA decides
   * the loser's fate. smp < 0 resets the voice (virtual.c:528-530).
   */
  setPatch(chn, ins, smp, note, key, nna, dct, dca) {
    if (chn < 0 || chn >= this.virtChannels) return VIRT_INVALID;
    if (ins.nsm === 0) smp = -1;
    const curVoice = this.map[chn].voice;
    if (dct !== 0) {
      for (let i = 0; i < this.voices.length; i++) {
        const v2 = this.voices[i];
        if (v2.root !== chn || v2.ins !== insKey(ins)) continue;
        if (nna === 0) {
          this.resetVoice(i, true);
          continue;
        }
        v2.nnaAct = nna;
        if (nna === 2) v2.act = Act.KEY;
        else if (nna === 3) v2.act = Act.VOL;
        let match = false;
        switch (dct) {
          case 3:
            match = true;
            break;
          case 2:
            match = v2.smp === smp;
            break;
          case 1:
            match = v2.key === key;
            break;
        }
        if (match) {
          if (nna === 2 && dca === 3) {
            v2.nnaAct = 2;
            v2.act = Act.KEY;
          } else if (dca !== 0) {
            v2.nnaAct = dca;
            if (dca === 2) v2.act = Act.KEY;
            else if (dca === 3) v2.act = Act.VOL;
            else v2.act = Act.NOTE;
          } else {
            this.resetVoice(i, true);
          }
          if (dca === 1 && i === this.map[chn].voice) {
            this.map[chn].tail = i;
          }
        }
      }
    }
    const oldVoice = curVoice;
    const oldActive = oldVoice !== VIRT_INVALID && this.voices[oldVoice].act !== Act.NONE;
    let to = chn;
    let vidx;
    if (oldVoice !== VIRT_INVALID && !oldActive) {
      vidx = oldVoice;
      this.voices[vidx].chn = chn;
      this.voices[vidx].root = chn;
    } else {
      vidx = this.allocVoice(chn);
    }
    if (vidx === VIRT_INVALID) return VIRT_INVALID;
    if (vidx !== oldVoice) this.map[chn].voice = vidx;
    if (oldVoice !== VIRT_INVALID && oldActive) {
      let hunt = this.numTracks;
      while (hunt < this.virtChannels && this.map[hunt++].voice !== VIRT_INVALID) {
      }
      to = hunt - 1;
      const ov = this.voices[oldVoice];
      ov.chn = to;
      this.map[to].voice = oldVoice;
    }
    if (smp < 0) {
      this.resetVoice(vidx, true);
      return to;
    }
    const v = this.voices[vidx];
    v.chn = chn;
    v.ins = insKey(ins);
    v.smp = smp;
    v.note = note;
    v.key = key;
    this.channelStatesHook?.(chn, (xc) => {
      xc.note_flags &= ~NoteFlag.SAMPLE_END;
    });
    v.root = chn;
    v.act = nna;
    v.nnaAct = nna;
    v.flags = 0;
    v.pos = 0;
    v.pos0 = 0;
    v.old_vl = 0;
    v.old_vr = 0;
    return to;
  }
  /**
   * libxmp_virt_setnna (virtual.c:417-430): write the NNA action into the
   * channel's mapped voice's act. read_event.c calls this with NNA_CUT
   * before a toneporta re-patch (portamento_nna_sample.it, gxsmp2.it):
   * zeroing act makes the next virt_setpatch reuse the voice in place
   * instead of re-homing it to an overflow channel.
   */
  setNna(chn, nna) {
    if (!this.extChannels) return;
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return;
    this.voices[vi].act = nna;
  }
  /** Set the note played by the channel's voice (virt_setnote :472).
   *  NOTE: C's mixer_setnote (mixer.c:920-940) also clamps note > 149 and
   *  arms anticlick — but arming here breaks IT note-slide loop timing
   *  (pattern_loop_it1xx goldens): our slide path keeps the flag alive
   *  across the loop wrap where C's next virt_setperiod re-arms nothing.
   *  Retriggers arm via setPatchVoice (mixer_voicepos ac=1), which is the
   *  audibly relevant path. */
  setNote(chn, note) {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return false;
    if (note > 149) note = 149;
    this.voices[vi].note = note;
    return true;
  }
  /** Set final volume on the channel's voice, 0..volbase (virt_setvol :309). */
  setVol(chn, vol) {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return false;
    const v = this.voices[vi];
    if (!v) return false;
    const root = v.root;
    if (root >= 0 && root < this.channelMute.length && this.channelMute[root]) {
      vol = 0;
    }
    if (vol === 0) {
      v.flags |= VoiceFlag.ANTICLICK;
      v.old_vl = 0;
      v.old_vr = 0;
    }
    v.vol = vol;
    if (vol === 0 && chn >= this.numTracks) {
      this.resetVoice(vi, true);
    }
    return true;
  }
  /** PlayState.channel_mute, mirrored by Core before startPlayer. */
  channelMute = [];
  /** Install the mute table (Core wires this at startPlayer). */
  setChannelMute(mute) {
    this.channelMute = mute;
  }
  /** Set pan 0..255 on the channel's voice. */
  setPan(chn, pan) {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return false;
    this.voices[vi].pan = pan;
    return true;
  }
  /** Set the mixing period on the channel's voice. */
  setPeriod(chn, period) {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return false;
    this.voices[vi].period = period;
    return true;
  }
  /**
   * libxmp_virt_seteffect (virtual.c:366-377) + libxmp_mixer_seteffect
   * (mixer.c:1000-1024). Writes an IT filter parameter directly to the
   * channel's voice. `type` is one of the DSP_EFFECT_* codes (common.h:447-451).
   */
  setEffect(chn, type, val) {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return false;
    const f = this.voices[vi].filter;
    switch (type) {
      case 2:
        f.cutoff = val;
        break;
      case 3:
        f.resonance = val;
        break;
      case 176:
        f.a0 = val;
        break;
      case 177:
        f.b0 = val;
        break;
      case 178:
        f.b1 = val;
        break;
    }
    return true;
  }
  /**
   * libxmp_virt_voicepos (virtual.c:588-598) → libxmp_mixer_voicepos
   * (mixer.c:789-838). Queued-branch first (queued swap takes effect on
   * position change), then pos set, adjust_voice_end, forward-loop
   * restart / reverse-0-maps-to-end hack, anticlick (ac=1 always here).
   */
  voicePos(chn, pos) {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return false;
    const v = this.voices[vi];
    if ((v.flags & VoiceFlag.SAMPLE_QUEUED) !== 0) {
      v.flags &= ~VoiceFlag.SAMPLE_QUEUED;
      if (v.queued.smp < 0) {
        v.flags |= VoiceFlag.SAMPLE_PAUSED;
      } else if (v.smp !== v.queued.smp) {
        this.hotswapSample(v, v.queued.smp);
      }
      v.flags |= VoiceFlag.SAMPLE_LOOP;
    }
    const xxs = this.getSampleFor(v.smp);
    if (!xxs) return true;
    v.pos = pos;
    v.frac = pos - Math.trunc(pos);
    v.pos0 = Math.trunc(pos);
    this.adjustVoiceEndV(v, xxs);
    if (v.pos >= v.end) {
      v.pos = v.end;
      if ((v.flags & VoiceFlag.VOICE_REVERSE) === 0 && this.hasActiveLoop(v, xxs)) {
        this.loopRepositionV(v, xxs);
      }
    } else if ((v.flags & VoiceFlag.VOICE_REVERSE) !== 0 && v.pos <= 0.1) {
      v.pos = v.end;
    }
    v.flags |= VoiceFlag.ANTICLICK;
    v.old_vl = 0;
    v.old_vr = 0;
    return true;
  }
  /**
   * has_active_loop (mixer.c:326-330): sample LOOP flag OR an active
   * sustain loop. has_active_sustain_loop (mixer.c:315-324): module
   * sample, SLOOP set, voice not in release.
   */
  hasActiveLoop(v, xxs) {
    if ((xxs.flags & SampleFlags.LOOP) !== 0) return true;
    return v.smp >= 0 && (xxs.flags & SampleFlags.SUSTAIN) !== 0 && (v.flags & VoiceFlag.RELEASE) === 0;
  }
  /**
   * adjust_voice_end (mixer.c:333-355) for the virtual layer: recompute
   * v.start/v.end from the sample's loop state; clear/set VOICE_BIDIR.
   */
  adjustVoiceEndV(v, xxs) {
    v.flags &= ~VoiceFlag.VOICE_BIDIR;
    const sustainActive = (xxs.flags & SampleFlags.SUSTAIN) !== 0 && (v.flags & VoiceFlag.RELEASE) === 0;
    if (sustainActive) {
      v.start = xxs.sustainStart;
      v.end = xxs.sustainEnd;
      if ((xxs.flags & SampleFlags.SUSTAIN_BIDIR) !== 0) {
        v.flags |= VoiceFlag.VOICE_BIDIR;
      }
    } else if ((xxs.flags & SampleFlags.LOOP) !== 0) {
      v.start = xxs.loopStart;
      if ((xxs.flags & SampleFlags.LOOP_FULL) !== 0 && (v.flags & VoiceFlag.SAMPLE_LOOP) === 0) {
        v.end = xxs.length;
      } else {
        v.end = xxs.loopEnd;
        if ((xxs.flags & SampleFlags.BIDIR) !== 0) {
          v.flags |= VoiceFlag.VOICE_BIDIR;
        }
      }
    } else {
      v.start = 0;
      v.end = xxs.length;
    }
  }
  /**
   * loop_reposition (mixer.c:357-393): set SAMPLE_LOOP (adjust endpoints
   * on first entry), then wrap/flip position around the loop bounds.
   * Safety clamp vs sample length + 1 (:388-391).
   */
  loopRepositionV(v, xxs) {
    const loopChanged = (v.flags & VoiceFlag.SAMPLE_LOOP) === 0;
    v.flags |= VoiceFlag.SAMPLE_LOOP;
    if (loopChanged) this.adjustVoiceEndV(v, xxs);
    if ((v.flags & VoiceFlag.VOICE_BIDIR) === 0) {
      if ((v.flags & VoiceFlag.VOICE_REVERSE) === 0) {
        v.pos -= v.end - v.start;
      } else {
        v.pos += v.end - v.start;
      }
    } else {
      v.flags ^= VoiceFlag.VOICE_REVERSE;
      if ((v.flags & VoiceFlag.VOICE_REVERSE) !== 0) {
        v.pos = v.end * 2 - this.bidirAdjust - v.pos;
      } else {
        v.pos = v.start * 2 - v.pos;
      }
    }
    if (v.pos > xxs.length + 1) {
      v.pos = xxs.length + 1;
    }
  }
  /**
   * hotswap_sample (mixer.c:395-405): save vol/pan, setpatch (which zeros
   * them), force SAMPLE_LOOP, restore vol/pan.
   */
  hotswapSample(v, smp) {
    const voc = this.voices.indexOf(v);
    const vol = v.vol;
    const pan = v.pan;
    this.setPatchVoice(voc, smp, false);
    v.flags |= VoiceFlag.SAMPLE_LOOP;
    v.vol = vol;
    v.pan = pan;
  }
  /** Voice status (virt_cstat virtual.c:631-645): no voice → VIRT_INVALID;
   * root tracks (< num_tracks) → always VIRT_ACTIVE; else the voice act. */
  cstat(chn) {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return VIRT_INVALID;
    if (chn < this.numTracks) return VIRT_ACTIVE;
    return this.voices[vi].act;
  }
  /**
   * libxmp_virt_release (virtual.c:330-340) + libxmp_mixer_release
   * (mixer.c:958-981): set/clear the voice RELEASE flag. `rel` is the
   * NOTE_SAMPLE_RELEASE test result (play_channel player.c:1683).
   */
  releaseFlag(chn, rel, xxs) {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return;
    const v = this.voices[vi];
    if (rel) {
      if ((v.flags & VoiceFlag.RELEASE) === 0 && xxs !== void 0 && (xxs.flags & SampleFlags.SUSTAIN) !== 0 && (xxs.flags & SampleFlags.BIDIR) === 0) {
        v.flags &= ~VoiceFlag.VOICE_REVERSE;
      }
      v.flags |= VoiceFlag.RELEASE;
    } else {
      v.flags &= ~VoiceFlag.RELEASE;
    }
  }
  /**
   * libxmp_virt_getvoicepos (virtual.c:378-388) + libxmp_mixer_getvoicepos
   * (mixer.c:840-855): current sample position of the channel's voice.
   */
  getVoicePos(chn) {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return 0;
    return this.voices[vi].pos;
  }
  /** Direct voice access for the DSP mixer. */
  voiceAt(idx) {
    return this.voices[idx];
  }
  /** Sample id of the channel's mapped voice (-1 when unmapped/ended). */
  voiceSmp(chn) {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return -1;
    return this.voices[vi].smp;
  }
  /**
   * libxmp_virt_setsmp (virtual.c:392-412): hot-swap the channel voice's
   * sample, preserving the playback position. Used by the HMN synth
   * (hmn_extras.c:66-69) to retarget waveform slots mid-note.
   */
  setSmp(chn, smp) {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return;
    const v = this.voices[vi];
    if (v.smp === smp) return;
    const pos = this.getVoicePos(chn);
    this.hotswapSample(v, smp);
    const xxs = this.getSampleFor(smp);
    if (!xxs) return;
    v.pos = pos;
    v.frac = pos - Math.trunc(pos);
    v.pos0 = Math.trunc(pos);
    this.adjustVoiceEndV(v, xxs);
  }
  get numVoices() {
    return this.voices.length;
  }
  /**
   * do_virt_resetvoice (virtual.c:53-78) + libxmp_virt_resetvoice (:79-97).
   * Wipes the voice but preserves anticlick decay (sleft/sright + ANTICLICK
   * flag). `mute` ramps volume to 0 through the mixer first.
   */
  resetVoice(vi, mute) {
    if (vi < 0 || vi >= this.voices.length) return;
    const v = this.voices[vi];
    this.used--;
    if (mute) {
      v.flags |= VoiceFlag.ANTICLICK;
      v.old_vl = 0;
      v.old_vr = 0;
      v.vol = 0;
    }
    if (v.root >= 0 && v.root < this.map.length && this.map[v.root]) {
    }
    if (v.chn >= 0 && v.chn < this.map.length) {
      if (this.map[v.chn].voice === vi) this.map[v.chn].voice = VIRT_INVALID;
    }
    const anticlickL = v.sleft;
    const anticlickR = v.sright;
    const flags = v.flags & VoiceFlag.ANTICLICK;
    const queued = v.queued;
    const fresh = makeVoice(VIRT_INVALID);
    v.chn = VIRT_INVALID;
    v.root = VIRT_INVALID;
    v.note = fresh.note;
    v.pan = fresh.pan;
    v.vol = fresh.vol;
    v.period = fresh.period;
    v.pos = fresh.pos;
    v.pos0 = fresh.pos0;
    v.fidx = fresh.fidx;
    v.ins = fresh.ins;
    v.smp = fresh.smp;
    v.start = fresh.start;
    v.end = fresh.end;
    v.act = fresh.act;
    v.key = fresh.key;
    v.old_vl = fresh.old_vl;
    v.old_vr = fresh.old_vr;
    v.filter = fresh.filter;
    v.queued = queued;
    v.sleft = anticlickL;
    v.sright = anticlickR;
    v.flags = flags;
    v.chn = VIRT_INVALID;
    v.root = VIRT_INVALID;
  }
  /**
   * libxmp_virt_resetchannel (virtual.c:298-307): reset the channel's
   * current voice, muting it.
   */
  resetChannel(chn) {
    const vi = this.mapChannel(chn);
    if (vi === VIRT_INVALID) return;
    this.resetVoice(vi, true);
  }
  /**
   * libxmp_mixer_setpatch (mixer.c:855-900) semantics on a voice: assign
   * sample, zero vol/pan, clear loop/queue/reverse flags, reset fidx,
   * position 0 via voicepos(ac) semantics. Returns the sample for the
   * caller to refresh loop bounds (softmixer recomputes per tick).
   */
  setPatchVoice(vi, smp, ac) {
    const v = this.voices[vi];
    v.smp = smp;
    v.vol = 0;
    v.pan = 0;
    v.flags &= ~(VoiceFlag.SAMPLE_LOOP | VoiceFlag.SAMPLE_QUEUED | VoiceFlag.SAMPLE_PAUSED | VoiceFlag.VOICE_REVERSE | VoiceFlag.VOICE_BIDIR);
    v.fidx = 0;
    v.pos = 0;
    v.pos0 = 0;
    if (ac) {
      v.flags |= VoiceFlag.ANTICLICK;
      v.old_vl = 0;
      v.old_vr = 0;
    }
    const smpData = this.getSampleFor(vi);
    if (smpData) {
      if ((smpData.flags & SampleFlags.LOOP) !== 0) {
        v.start = smpData.loopStart;
        v.end = (smpData.flags & SampleFlags.LOOP_FULL) !== 0 && (~v.flags & VoiceFlag.SAMPLE_LOOP) !== 0 ? smpData.length : smpData.loopEnd;
        if ((smpData.flags & SampleFlags.BIDIR) !== 0) {
          v.flags |= VoiceFlag.VOICE_BIDIR;
        }
      } else {
        v.start = 0;
        v.end = smpData.length;
      }
      if (v.pos >= v.end) {
        v.pos = v.end;
        if ((~v.flags & VoiceFlag.VOICE_REVERSE) !== 0 && (smpData.flags & SampleFlags.LOOP) !== 0) {
          v.pos = v.start;
        }
      }
    }
    this.channelStatesHook?.(v.chn, (xc) => {
      xc.note_flags &= ~NoteFlag.SAMPLE_END;
    });
  }
  /**
   * Channel-state hook installed by Core (avoids an import cycle). Used by
   * setPatchVoice to mirror mixer.c:878 set_sample_end(ctx, voc, 0).
   * Returns false when the channel index is out of range.
   */
  channelStatesHook = null;
  setChannelStatesHook(fn) {
    this.channelStatesHook = fn;
  }
  /** Sample lookup hook installed by Core (avoids import cycle). */
  sampleLookup = null;
  /** Install the sample resolver (Core wires this at construction). */
  setSampleLookup(fn) {
    this.sampleLookup = fn;
  }
  getSampleFor(smpId) {
    if (smpId < 0 || !this.sampleLookup) return void 0;
    try {
      return this.sampleLookup(smpId);
    } catch {
      return void 0;
    }
  }
  /**
   * libxmp_virt_queuepatch (virtual.c:546-581): Protracker 1/2 instrument
   * swap — volume/finetune apply now, sample change waits for loop end.
   */
  queuePatch(chn, insNum, smp, note) {
    if (chn < 0 || chn >= this.virtChannels) return VIRT_INVALID;
    if (insNum < 0) smp = -1;
    const voc = this.map[chn].voice;
    if (voc > VIRT_INVALID) {
      const v = this.voices[voc];
      if (smp !== v.smp || (v.flags & VoiceFlag.SAMPLE_PAUSED) !== 0) {
        v.queued.smp = smp;
        v.flags |= VoiceFlag.SAMPLE_QUEUED;
      }
      if (insNum >= 0) {
        v.ins = insNum;
      }
      return chn;
    }
    if (smp < 0) return VIRT_INVALID;
    return this.setPatchSmp(chn, insNum, smp, note);
  }
  /**
   * libxmp_virt_setpatch (virtual.c:484-540) with the loader/player
   * call-shape (chn, ins, smp, note): resolves the instrument by number
   * and the sub-instrument by sample id (sub.sid === smp), then runs the
   * dct/dca check and voice allocation.
   */
  setPatchSmp(chn, insNum, smp, note) {
    if (chn < 0 || chn >= this.virtChannels) return VIRT_INVALID;
    if (insNum < 0) smp = -1;
    const mod = this.moduleRef?.();
    let voc = this.map[chn].voice;
    if (voc <= VIRT_INVALID) {
      voc = this.allocVoice(chn);
      if (voc === VIRT_INVALID) return VIRT_INVALID;
    }
    if (smp < 0) {
      this.resetVoice(voc, true);
      return chn;
    }
    const v = this.voices[voc];
    v.chn = chn;
    v.root = chn;
    this.setPatchVoice(voc, smp, true);
    const clampedNote = note > 149 ? 149 : note;
    v.note = clampedNote;
    v.period = noteToPeriodMix(clampedNote, 0);
    if (mod) {
      const ins = mod.instruments[insNum];
      v.ins = insNum >= 0 && ins ? insKey(ins) : -1;
    }
    v.nnaAct = 0;
    v.act = Act.NOTE;
    v.key = note;
    return chn;
  }
  /** Module reference hook (Core wires this; avoids a module-data import). */
  moduleRef = null;
  /** Install the module resolver (Core wires this at construction). */
  setModuleRef(fn) {
    this.moduleRef = fn;
  }
  /**
   * Key off / release a resolved voice per the past-note action
   * (virt_release :330 + libxmp_virt_pastnote). CUT stops immediately; OFF
   * starts release with note-off semantics; FADE only engages fadeout.
   */
  release(vi, action) {
    const v = this.voices[vi];
    if (!v || v.act === Act.NONE) return;
    switch (action) {
      case PastNote.CUT:
        this.resetVoice(vi, true);
        return;
      case PastNote.OFF:
        v.act = Act.KEY;
        v.flags |= VoiceFlag.RELEASE | VoiceFlag.ANTICLICK;
        break;
      case PastNote.FADE:
        v.act = Act.VOL;
        v.flags |= VoiceFlag.RELEASE | VoiceFlag.ANTICLICK;
        break;
    }
  }
  /**
   * libxmp_virt_pastnote (virtual.c:604-626): apply a past-note action to
   * every re-homed tail voice whose root is this channel. C does NOT
   * touch the channel's main voice here — the main voice's keyoff/release
   * is driven by the event's own note handling (XMP_KEY_OFF), and
   * unmapping it would cut a note C fades. For tails: OFF sets
   * NOTE_RELEASE on the tail's channel state (player_set_release
   * player.c:1856), FADE sets NOTE_FADEOUT (player_set_fadeout
   * player.c:1864) — that release drives the tail's fade in
   * process_volume (NNA Continue tails otherwise keep sounding at their
   * snapshot volume).
   */
  pastnote(chn, action) {
    for (let c = this.numTracks; c < this.virtChannels; c++) {
      const voc = this.mapChannel(c);
      if (voc < 0) continue;
      const v = this.voiceAt(voc);
      if (v.root !== chn) continue;
      switch (action) {
        case PastNote.CUT:
          this.resetVoice(voc, true);
          break;
        case PastNote.OFF:
          this.channelStatesHook?.(c, (xc) => {
            xc.note_flags |= NoteFlag.RELEASE;
          });
          break;
        case PastNote.FADE:
          this.channelStatesHook?.(c, (xc) => {
            xc.note_flags |= NoteFlag.FADEOUT;
          });
          break;
      }
    }
  }
  /** Mark the channel's current voice released (player KEY_OFF/NNA paths). */
  releaseChannel(chn, action) {
    const vi = this.mapChannel(chn);
    if (vi !== VIRT_INVALID) this.release(vi, action);
  }
  /** Per-mix-pass voice iteration: active voices plus anticlick-draining ones. */
  forEachActive(fn) {
    for (const v of this.voices) {
      if (v.act !== Act.NONE || (v.flags & VoiceFlag.ANTICLICK) !== 0) fn(v);
    }
  }
};

// ../../packages/core/src/samples.ts
var MAX_SAMPLE_SIZE = 268435456;
var DecodeFlag = {
  /** SAMPLE_FLAG_DIFF: delta-encoded samples. */
  DIFF: 1 << 8,
  /** SAMPLE_FLAG_8BDIFF: byte-level delta. */
  DIFF8: 1 << 9,
  /** SAMPLE_FLAG_UNS: unsigned PCM. */
  UNSIGNED: 1 << 10,
  /** SAMPLE_FLAG_BIGEND: big-endian 16-bit. */
  BIGEND: 1 << 11,
  /** SAMPLE_FLAG_7BIT: 7-bit VIDC-style data. */
  SEVENBIT: 1 << 12,
  /** SAMPLE_FLAG_ADPCM: XM ADPCM 4-bit encoding. */
  ADPCM: 1 << 13,
  /** Data already interleaved stereo (else planar L|R). */
  INTERLEAVED: 1 << 14
};
function signedByte(b) {
  return b << 24 >> 24;
}
function clamp16(v) {
  return v < -32768 ? -32768 : v > 32767 ? 32767 : v;
}
function convertDelta(bytes, frames, is16bit, channels) {
  if (is16bit) {
    const w = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let chn = 0; chn < channels; chn++) {
      let absval = 0;
      for (let i = 0; i < frames; i++) {
        const off = (chn * frames + i) * 2;
        absval = w.getUint16(off, true) + absval & 65535;
        w.setUint16(off, absval, true);
      }
    }
    void clamp16;
  } else {
    for (let chn = 0; chn < channels; chn++) {
      let absval = 0;
      for (let i = 0; i < frames; i++) {
        const off = chn * frames + i;
        absval = bytes[off] + absval & 255;
        bytes[off] = absval;
      }
    }
  }
}
function convertSignal(bytes, len, is16bit) {
  if (is16bit) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < len; i++) dv.setUint16(i * 2, dv.getUint16(i * 2, true) + 32768 & 65535, true);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = bytes[i] + 128 & 255;
  }
}
function convertEndian(bytes, len) {
  for (let i = 0; i < len; i++) {
    const b0 = bytes[i * 2];
    bytes[i * 2] = bytes[i * 2 + 1];
    bytes[i * 2 + 1] = b0;
  }
}
function adpcm4Decode(inp, tab, outp) {
  const t = tab ?? (() => {
    const at = new Int8Array(16);
    for (let i = 0; i < 16; i++) at[i] = signedByte(inp[i]);
    return at;
  })();
  const offset = 0;
  const outLen = outp.length;
  const nibbles = outLen + 1 >> 1;
  let delta = 0;
  for (let i = 0; i < nibbles; i++) {
    const b = inp[offset + i];
    delta += t[b & 15];
    if (i * 2 < outLen) outp[i * 2] = delta & 255;
    delta += t[b >> 4 & 15];
    if (i * 2 + 1 < outLen) outp[i * 2 + 1] = delta & 255;
  }
}
function normalize(raw, id) {
  const is16bit = (raw.flags & SampleFlags.BITS16) !== 0;
  const stereo = (raw.flags & SampleFlags.STEREO) !== 0;
  const df = raw.flags;
  let bytes = raw.data.slice(0);
  const loaderDataEmpty = raw.data.length === 0;
  let len = raw.length;
  if (stereo && (df & DecodeFlag.INTERLEAVED) === 0) {
  }
  const framelen = (is16bit ? 2 : 1) * (stereo ? 2 : 1);
  const needed = len * framelen;
  if (df & DecodeFlag.ADPCM) {
    const tab = new Int8Array(16);
    for (let i = 0; i < 16; i++) tab[i] = signedByte(bytes[i]);
    const expanded = new Uint8Array(needed);
    adpcm4Decode(bytes.subarray(16), tab, expanded);
    bytes = expanded;
  } else if (bytes.length === 0 && needed > 0) {
    bytes = new Uint8Array(needed);
    raw.flags &= ~DecodeFlag.UNSIGNED;
  } else if (bytes.length < needed) {
    const avail = bytes.length - bytes.length % framelen;
    len = avail / framelen;
  }
  if (df & DecodeFlag.SEVENBIT) {
    for (let i = 0; i < bytes.length; i++) bytes[i] = bytes[i] << 1 & 255;
  }
  if (is16bit && df & DecodeFlag.BIGEND) convertEndian(bytes, len * (stereo ? 2 : 1));
  if (df & DecodeFlag.DIFF) {
    convertDelta(bytes, len, is16bit, stereo ? 2 : 1);
  }
  if ((df & DecodeFlag.UNSIGNED) !== 0 && !loaderDataEmpty) convertSignal(bytes, len * (stereo ? 2 : 1), is16bit);
  if (stereo && (df & DecodeFlag.INTERLEAVED) === 0) {
    const half = len * (is16bit ? 2 : 1);
    const L = bytes.subarray(0, half);
    const R = bytes.subarray(half, half * 2);
    const out = new Uint8Array(half * 2);
    const fw = is16bit ? 2 : 1;
    for (let i = 0; i < len; i++) {
      for (let b = 0; b < fw; b++) {
        out[i * fw * 2 + b] = L[i * fw + b];
        out[i * fw * 2 + fw + b] = R[i * fw + b];
      }
    }
    bytes = out;
  }
  const chnCount = stereo ? 2 : 1;
  const floats = new Float32Array(len * chnCount + 4 * chnCount);
  if (is16bit) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < len * chnCount; i++) floats[i] = clamp16(dv.getInt16(i * 2, true)) / 32768;
  } else {
    for (let i = 0; i < len * chnCount; i++) floats[i] = signedByte(bytes[i]) / 128;
  }
  let loopStart = raw.loopStart;
  let loopEnd = raw.loopEnd;
  let flags = raw.flags;
  if (len > 0 && !loaderDataEmpty) {
    if (loopEnd > len) loopEnd = len;
    if (loopStart >= len || loopStart >= loopEnd) {
      loopStart = loopEnd = 0;
      flags &= ~(SampleFlags.LOOP | SampleFlags.BIDIR);
    }
    if ((flags & SampleFlags.BIDIR) !== 0 && (flags & SampleFlags.LOOP) === 0) {
      flags &= ~SampleFlags.BIDIR;
    }
  }
  let susS = raw.sustainStart;
  let susE = raw.sustainEnd;
  if ((flags & SampleFlags.SUSTAIN_BIDIR) !== 0 && (flags & SampleFlags.SUSTAIN) === 0) {
    flags &= ~SampleFlags.SUSTAIN_BIDIR;
  }
  if (susE > len) susE = len;
  if (susS >= len || susS >= susE) {
    susS = susE = 0;
    flags &= ~(SampleFlags.SUSTAIN | SampleFlags.SUSTAIN_BIDIR);
  }
  if (!loaderDataEmpty && (raw.flags & 512) !== 0 && loopStart === 0 && len > loopEnd) {
    flags |= SampleFlags.LOOP_FULL;
  }
  return {
    id,
    name: raw.name ?? "",
    data: floats,
    length: len,
    loopStart,
    loopEnd,
    sustainStart: susS,
    sustainEnd: susE,
    finetune: raw.finetune,
    volume: raw.volume,
    c5spd: raw.c5spd,
    flags: flags & 255,
    // keep only SampleFlags bits on stored samples
    decodeFlags: df
    // raw decode pipeline flags (UNSIGNED/ADPCM/DIFF)
  };
}
var SampleStore = class {
  entries = /* @__PURE__ */ new Map();
  nextId = 0;
  clear() {
    this.entries.clear();
    this.nextId = 0;
  }
  get size() {
    return this.entries.size;
  }
  /** Add a raw sample from a loader; returns its stable ID. Throws on invalid input. */
  add(raw) {
    const id = this.nextId++;
    if (raw.length > MAX_SAMPLE_SIZE) {
      this.entries.set(id, {
        sample: {
          id,
          name: raw.name ?? "",
          data: new Float32Array(0),
          length: raw.length,
          loopStart: raw.loopStart,
          loopEnd: raw.loopEnd,
          sustainStart: raw.sustainStart,
          sustainEnd: raw.sustainEnd,
          finetune: raw.finetune,
          volume: raw.volume,
          c5spd: raw.c5spd,
          flags: raw.flags & 255,
          decodeFlags: raw.flags
        }
      });
      return id;
    }
    this.entries.set(id, { sample: normalize(raw, id) });
    return id;
  }
  /** Lookup by ID; throws typed error when unknown. */
  get(id) {
    const e = this.entries.get(id);
    if (!e) throw new SampleError(`unknown sample id ${id}`);
    return e.sample;
  }
  /**
   * Hot-swap: replace stored data+meta atomically. Active voices pick up the
   * new array on their next read because they resolve by ID every read
   * (mixer.c:395-404 queued-swap parity).
   */
  swap(id, data, meta) {
    const cur = this.entries.get(id);
    if (!cur) throw new SampleError(`unknown sample id ${id}`);
    if (!data || data.length === 0) {
      throw new SampleError("swapSample requires non-empty data");
    }
    const s = cur.sample;
    s.data = data;
    s.length = meta?.length ?? data.length;
    if (meta?.length !== void 0 && data.length < meta.length) {
      s.length = data.length;
    }
    if (meta?.loopStart !== void 0) s.loopStart = meta.loopStart;
    if (meta?.loopEnd !== void 0) s.loopEnd = meta.loopEnd;
    if (meta?.sustainStart !== void 0) s.sustainStart = meta.sustainStart;
    if (meta?.sustainEnd !== void 0) s.sustainEnd = meta.sustainEnd;
    if (meta?.finetune !== void 0) s.finetune = meta.finetune;
    if (meta?.volume !== void 0) s.volume = meta.volume;
    if (meta?.flags !== void 0) s.flags = meta.flags;
    if (s.loopEnd > s.length) s.loopEnd = s.length;
    if (s.loopStart >= s.length || s.loopStart >= s.loopEnd) {
      s.loopStart = s.loopEnd = 0;
      s.flags &= ~(SampleFlags.LOOP | SampleFlags.BIDIR);
    }
    if (s.sustainEnd > s.length) s.sustainEnd = s.length;
    if (s.sustainStart >= s.length || s.sustainStart >= s.sustainEnd) {
      s.sustainStart = s.sustainEnd = 0;
      s.flags &= ~(SampleFlags.SUSTAIN | SampleFlags.SUSTAIN_BIDIR);
    }
  }
  /** Iterate stored samples (loader post-passes: MODRNG→Float32 already done here). */
  forEach(fn) {
    for (const e of this.entries.values()) fn(e.sample);
  }
};

// ../../packages/core/src/depack/md5.ts
var S = [
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21
];
var K = new Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
var rotl = (x, c) => (x << c | x >>> 32 - c) >>> 0;
function md5Hex(data) {
  const padded = new Uint8Array((data.length + 8 >> 6) + 1 << 6);
  padded.set(data);
  padded[data.length] = 128;
  const lo = data.length * 8 & 4294967295;
  const hi = data.length >= 536870912 ? Math.floor(data.length * 8 / 4294967296) : 0;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, lo >>> 0, true);
  dv.setUint32(padded.length - 4, hi >>> 0, true);
  let a0 = 1732584193;
  let b0 = 4023233417;
  let c0 = 2562383102;
  let d0 = 271733878;
  const M = new Int32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getInt32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F;
      let g;
      if (i < 16) {
        F = B & C | ~B & D;
        g = i;
      } else if (i < 32) {
        F = D & B | ~D & C;
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = 7 * i % 16;
      }
      F = F + A + K[i] + M[g] | 0;
      A = D;
      D = C;
      C = B;
      B = B + rotl(F, S[i]) >>> 0;
      A >>>= 0;
      C >>>= 0;
      D >>>= 0;
    }
    a0 = a0 + A >>> 0;
    b0 = b0 + B >>> 0;
    c0 = c0 + C >>> 0;
    d0 = d0 + D >>> 0;
  }
  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setInt32(0, a0 | 0, true);
  odv.setInt32(4, b0 | 0, true);
  odv.setInt32(8, c0 | 0, true);
  odv.setInt32(12, d0 | 0, true);
  let hex = "";
  for (const b of out) hex += b.toString(16).padStart(2, "0");
  return hex;
}

// ../../packages/core/src/registry.ts
var Registries = class {
  formats = /* @__PURE__ */ new Map();
  /** Format plugins in registration order — probe order matters. */
  formatList = [];
  effects = /* @__PURE__ */ new Map();
  effectList = [];
  dsps = /* @__PURE__ */ new Map();
  dspList = [];
  outputs = /* @__PURE__ */ new Map();
  outputList = [];
  exports = /* @__PURE__ */ new Map();
  exportList = [];
  registerFormat(p) {
    if (this.formats.has(p.name)) throw new PluginNotFoundError(`format '${p.name}' already registered`);
    this.formats.set(p.name, p);
    this.formatList.push(p);
  }
  registerEffect(p) {
    if (this.effects.has(p.name)) throw new PluginNotFoundError(`effect '${p.name}' already registered`);
    this.effects.set(p.name, p);
    this.effectList.push(p);
  }
  registerDsp(p) {
    if (this.dsps.has(p.name)) throw new PluginNotFoundError(`dsp '${p.name}' already registered`);
    this.dsps.set(p.name, p);
    this.dspList.push(p);
  }
  registerOutput(p) {
    if (this.outputs.has(p.name)) throw new PluginNotFoundError(`output '${p.name}' already registered`);
    this.outputs.set(p.name, p);
    this.outputList.push(p);
  }
  registerExport(p) {
    if (this.exports.has(p.name)) throw new PluginNotFoundError(`export '${p.name}' already registered`);
    this.exports.set(p.name, p);
    this.exportList.push(p);
  }
  /** First plugin whose test() passes over the bytes (add_loaders probe parity). */
  formatFor(bytes) {
    for (const p of this.formatList) {
      if (p.test(bytes)) return p;
    }
    return null;
  }
  /** Registered effects in registration order. */
  effectPlugins() {
    return this.effectList;
  }
  /** Registered DSPs in registration order. */
  dspPlugins() {
    return this.dspList;
  }
  /** Registered export (writer) plugins in registration order. */
  exportPlugins() {
    return this.exportList;
  }
  export(name) {
    const p = this.exports.get(name);
    if (!p) throw new PluginNotFoundError(`no export plugin '${name}'`);
    return p;
  }
  format(name) {
    const p = this.formats.get(name);
    if (!p) throw new PluginNotFoundError(`no format plugin '${name}'`);
    return p;
  }
  effect(name) {
    const p = this.effects.get(name);
    if (!p) throw new PluginNotFoundError(`no effect plugin '${name}'`);
    return p;
  }
  dsp(name) {
    const p = this.dsps.get(name);
    if (!p) throw new PluginNotFoundError(`no dsp plugin '${name}'`);
    return p;
  }
  output(name) {
    const p = this.outputs.get(name);
    if (!p) throw new PluginNotFoundError(`no output plugin '${name}'`);
    return p;
  }
};

// ../../packages/core/src/flow.ts
function resetFlow(f) {
  f.jumpline = 0;
  f.jump = -1;
  f.pbreak = 0;
  f.loop_dest = -1;
  f.loop_param = -1;
  f.loop_start = -1;
  f.loop_count = 0;
  f.loop_active_num = 0;
  f.delay = 0;
  f.rowdelay = 0;
  f.rowdelay_set = 0;
  f.force_reposition = 0;
  for (let i = 0; i < f.loop.length; i++) {
    f.loop[i].start = 0;
    f.loop[i].count = 0;
  }
}
function processPatternLoop(mod, f, chn, row, fxp) {
  const fm = mod.flowMode;
  let looped = 0;
  let start = refOf(() => f.loop[chn].start, (v) => {
    f.loop[chn].start = v;
  });
  let count = refOf(() => f.loop[chn].count, (v) => {
    f.loop[chn].count = v;
  });
  if ((fm & FlowFlag.LOOP_FIRST_EFFECT) !== 0 && f.loop_param >= 0) return;
  f.loop_param = fxp;
  if ((fm & FlowFlag.LOOP_GLOBAL_TARGET) !== 0) start = refOf(() => f.loop_start, (v) => {
    f.loop_start = v;
  });
  if ((fm & FlowFlag.LOOP_GLOBAL_COUNT) !== 0) count = refOf(() => f.loop_count, (v) => {
    f.loop_count = v;
  });
  if (fxp === 0) {
    if ((fm & FlowFlag.LOOP_IGNORE_TARGET) !== 0 && count.get() >= 1) return;
    start.set(row);
    if ((mod.quirks & Quirk.FT2BUGS) !== 0) f.jumpline = row;
  } else {
    if (start.get() < 0) {
      if ((fm & FlowFlag.LOOP_INIT_SAMEROW) !== 0) {
        start.set(row);
      } else {
        start.set(0);
      }
    }
    if (count.get() !== 0) {
      const next = count.get() - 1;
      count.set(next);
      if (next !== 0) {
        f.loop_dest = start.get();
        looped = 1;
      } else {
        if ((fm & FlowFlag.LOOP_END_ADVANCES) !== 0) start.set(row + 1);
        if ((fm & FlowFlag.LOOP_END_CANCELS) !== 0) f.loop_dest = -1;
        f.loop_active_num--;
      }
    } else {
      if ((fm & FlowFlag.LOOP_ONE_AT_A_TIME) !== 0) {
        for (let i = 0; i < mod.chn; i++) {
          if (i !== chn && f.loop[i].count !== 0) return;
        }
      }
      count.set(fxp);
      f.loop_dest = start.get();
      f.loop_active_num++;
      looped = 1;
    }
  }
  if (looped && f.pbreak !== 0) {
    if ((fm & FlowFlag.LOOP_SHARED_BREAK) !== 0) {
      f.jumpline = f.loop_dest;
    }
    if ((fm & FlowFlag.LOOP_UNSET_BREAK) !== 0 && f.jump < 0) {
      f.pbreak = 0;
    }
    if ((fm & FlowFlag.LOOP_UNSET_JUMP) !== 0 && f.jump >= 0) {
      f.pbreak = 0;
      f.jump = -1;
    }
  }
}
function processPatternJump(mod, f, fxp) {
  const fm = mod.flowMode;
  if ((fm & FlowFlag.LOOP_DELAY_JUMP) !== 0 && f.loop_dest >= 0) return;
  f.pbreak = 1;
  f.jump = fxp;
  if ((fm & FlowFlag.JUMP_NO_ROW_SET) === 0) {
    f.jumpline = 0;
  }
}
function processPatternBreak(mod, f, fxp) {
  const fm = mod.flowMode;
  if ((fm & FlowFlag.LOOP_DELAY_BREAK) !== 0 && f.loop_dest >= 0) return;
  f.pbreak = 1;
  f.jumpline = fxp;
}
function processLineJump(_mod, f, ord, fxp) {
  if (f.pbreak === 0) {
    f.pbreak = 1;
    f.jump = ord;
  }
  f.jumpline = fxp;
}
function refOf(get, set) {
  return { get, set };
}

// ../../packages/core/src/scan.ts
var XMP_MARK_END = 255;
var XMP_MIN_BPM = 32;
var NO_SEQUENCE = 255;
var MAX_SEQUENCES = 255;
var VBLANK_TIME_THRESHOLD = 48e4;
var MSN = (v) => v >> 4 & 15;
var LSN = (v) => v & 15;
function makeScanFlow(chn) {
  return {
    pbreak: 0,
    jump: -1,
    delay: 0,
    jumpline: 0,
    loop_dest: -1,
    loop_param: -1,
    loop_start: -1,
    loop_count: 0,
    loop_active_num: 0,
    loop: Array.from({ length: chn }, () => ({ start: 0, count: 0 })),
    num_rows: 0,
    end_point: 0,
    rowdelay: 0,
    rowdelay_set: 0,
    force_reposition: 0
  };
}
var FAR_OLD_TEMPO_MULT = 1 << 2;
var farTempos = [256, 128, 64, 42, 32, 25, 21, 18, 16, 14, 12, 11, 10, 9, 9, 8];
function farTranslateTempo(mode, fineChange, coarse, fine) {
  if (coarse < 0 || coarse > 15 || mode < 0 || mode > 1) return null;
  if (fineChange < 0 && farTempos[coarse] + fine.v <= 0) {
    fine.v = 0;
  } else if (fineChange > 0 && farTempos[coarse] + fine.v >= 100) {
    fine.v = 100;
  }
  let speed;
  let bpm;
  if (mode === 1) {
    const tempo = farTempos[coarse] + fine.v;
    if (tempo === 0) return null;
    let divisor = Math.trunc(1197255 / tempo);
    speed = 0;
    while (divisor > 65535) {
      divisor >>= 1;
      speed++;
    }
    if (speed >= 2) speed++;
    speed += 3;
    speed++;
    bpm = Math.trunc(1197255 / divisor);
  } else {
    speed = 4 * FAR_OLD_TEMPO_MULT;
    bpm = (farTempos[coarse] + fine.v * 2) * FAR_OLD_TEMPO_MULT;
  }
  if (bpm < XMP_MIN_BPM) bpm = XMP_MIN_BPM;
  return { speed, bpm };
}
var Scanner = class {
  mod;
  /** scan_cnt[ord][row] (m.scan_cnt). */
  scanCnt = [];
  /** p.sequence_control. */
  seqCtrl = new Uint8Array(0);
  /**
   * libxmp_scan_sequences (scan.c:733-820). Scans chain 0 from order 0,
   * then discovers further sequences from unvisited orders.
   */
  scan(mod) {
    this.mod = mod;
    const len = mod.len;
    const info = [];
    for (let i = 0; i < len; i++) {
      info.push({ time: -1, speed: 0, bpm: 0, gvl: -1, start_row: 0 });
    }
    this.seqCtrl = new Uint8Array(len).fill(NO_SEQUENCE);
    this.scanCnt = [];
    for (let i = 0; i < len; i++) {
      const pat = mod.xxo[i] ?? 0;
      const rows = pat >= mod.pat ? 1 : mod.patterns[pat]?.rows || 1;
      this.scanCnt.push(new Uint8Array(rows));
    }
    const scan = [];
    const entryPoints = [];
    let ep = 0;
    entryPoints[0] = 0;
    scan[0] = { time: this.scanModule(0, 0, info), ord: 0, row: 0, num: 0 };
    let seq = 1;
    if (mod.compare_vblank === true && !(mod.quirks & Quirk.NOBPM) && scan[0].time >= VBLANK_TIME_THRESHOLD) {
      const scanBackup = { ...scan[0] };
      const infoBackup = info.map((o) => ({ ...o }));
      const ctrlBackup = new Uint8Array(this.seqCtrl);
      const quirkBackup = mod.quirks;
      for (const o of info) o.time = -1;
      this.seqCtrl.fill(NO_SEQUENCE);
      mod.quirks ^= Quirk.NOBPM;
      scan[0] = { time: this.scanModule(0, 0, info), ord: 0, row: 0, num: 0 };
      if (scan[0].time >= scanBackup.time) {
        mod.quirks = quirkBackup;
        scan[0] = scanBackup;
        for (let i = 0; i < info.length; i++) info[i] = infoBackup[i];
        this.seqCtrl.set(ctrlBackup);
      }
    }
    if (scan[0].time < 0) {
    }
    while (true) {
      let firstUnvisited = -1;
      for (let i = 0; i < len; i++) {
        if (this.seqCtrl[i] === NO_SEQUENCE) {
          firstUnvisited = i;
          break;
        }
      }
      if (firstUnvisited >= 0 && seq < MAX_SEQUENCES) {
        ep = firstUnvisited;
        entryPoints[seq] = ep;
        const t = this.scanModule(ep, seq, info);
        if (t > 0) {
          scan[seq] = { time: t, ord: 0, row: 0, num: 0 };
          seq++;
        }
      } else {
        break;
      }
    }
    for (let i = 0; i < len; i++) {
      if ((this.seqCtrl[i] ?? 0) >= seq) {
        this.seqCtrl[i] = i > 0 ? this.seqCtrl[i - 1] : 0;
      }
    }
    for (let i = 0; i < seq; i++) {
      const pend = this.pendingScan[i];
      if (pend) {
        scan[i] = {
          time: scan[i]?.time ?? pend.time,
          ord: pend.ord,
          row: pend.row,
          num: pend.num
        };
      }
    }
    this.pendingScan.length = 0;
    return {
      xxo_info: info,
      sequence_control: Array.from(this.seqCtrl),
      num_sequences: seq,
      scan,
      entry_points: entryPoints
    };
  }
  /** end_module results per chain (p.scan[chain] written by scan_module). */
  pendingScan = [];
  /**
   * scan_module (scan.c:46-665). Returns the sequence duration in ms and
   * records the end point (ord/row/num) into pendingScan[chain].
   */
  scanModule(ep, chain, info) {
    const mod = this.mod;
    const quirk = mod.quirks;
    const hasMarker = (quirk & Quirk.MARKER) !== 0;
    const flowModes = mod.flowMode;
    const hasFineFx = (quirk & Quirk.FINEFX) !== 0;
    const vsall = (quirk & Quirk.VSALL) !== 0;
    const nobpm = (quirk & Quirk.NOBPM) !== 0;
    const isSt3 = mod.readEventType === 2;
    if (mod.len === 0) return 0;
    for (let i = 0; i < mod.len; i++) {
      const pat = mod.xxo[i] ?? 0;
      const rows = pat >= mod.pat ? 1 : mod.patterns[pat]?.rows || 1;
      this.scanCnt[i] = new Uint8Array(rows);
    }
    const rowLimit = mod.readEventType === ReadEventType.MED ? 3200 : 1024;
    const f = makeScanFlow(mod.chn);
    f.loop_dest = -1;
    f.loop_param = -1;
    f.loop_start = -1;
    f.loop_count = 0;
    f.loop_active_num = 0;
    f.jump = -1;
    f.jumpline = 0;
    let gvl = mod.gvol;
    let bpm = mod.bpm;
    let speed = mod.speed;
    const baseTime = mod.rrate;
    const timeFactor = mod.time_factor;
    let st26Speed = 0;
    let farTempoCoarse = 4;
    let farTempoFine = 0;
    let farTempoMode = 1;
    const hasMarkerQ = hasMarker;
    let ord = ep - 1;
    let gvolMemory = 0;
    let rowCount = 0, rowCountTotal = 0, frameCount = 0;
    let ordersSinceLastValid = 0, anyValid = 0;
    let time = 0, startTime = 0;
    let insideLoop = 0;
    let pdelay = 0;
    const tracks = [];
    let row = 0;
    endModule: while (true) {
      if (ordersSinceLastValid > 512) break;
      ordersSinceLastValid++;
      if (++ord >= mod.len) {
        if (mod.restart > mod.len || (mod.xxo[mod.restart] ?? 0) >= mod.pat) {
          ord = ep;
        } else {
          if ((this.seqCtrl[mod.restart] ?? NO_SEQUENCE) === chain) {
            ord = mod.restart;
          } else {
            ord = ep;
          }
        }
        const pat2 = mod.xxo[ord] ?? 0;
        if (hasMarkerQ && pat2 === XMP_MARK_END) break;
      }
      let pat = mod.xxo[ord] ?? 0;
      const oi = info[ord];
      if (ep !== 0 && this.seqCtrl[ord] !== NO_SEQUENCE) {
        if (pat >= mod.pat) {
          if (hasMarkerQ && pat === XMP_MARK_END) {
            ord = mod.len;
          }
          continue;
        }
        break;
      }
      this.seqCtrl[ord] = chain;
      if (pat >= mod.pat) {
        if (hasMarkerQ && pat === XMP_MARK_END) {
          ord = mod.len;
        }
        continue;
      }
      const pattern = mod.patterns[pat];
      if (!pattern) continue;
      if (f.jumpline >= pattern.rows) {
        f.jumpline = 0;
      }
      if ((flowModes & FlowFlag.LOOP_PATTERN_RESET) !== 0) {
        f.loop_start = -1;
        f.loop_count = 0;
        for (let i = 0; i < mod.chn; i++) {
          f.loop[i].start = 0;
          f.loop[i].count = 0;
        }
      }
      if ((this.scanCnt[ord]?.[f.jumpline] ?? 0) !== 0 && !insideLoop) {
        break;
      }
      if (oi.time < 0) {
        oi.gvl = gvl;
        oi.bpm = bpm;
        oi.speed = speed;
        oi.time = time + timeFactor * frameCount * baseTime / bpm;
        oi.start_row = f.jumpline;
      }
      if (oi.start_row === 0 && ord !== 0) {
        if (ord === ep) {
          startTime = time + timeFactor * frameCount * baseTime / bpm;
        }
      }
      for (let chn = 0; chn < mod.chn; chn++) {
        tracks[chn] = pattern.tracks[chn]?.event;
      }
      const lastRow = pattern.rows;
      for (row = f.jumpline, f.jumpline = 0; row < lastRow; row++, rowCount++, rowCountTotal++) {
        if (bpm < XMP_MIN_BPM) {
          bpm = XMP_MIN_BPM;
        }
        if (rowCountTotal > rowLimit) {
          break endModule;
        }
        if (f.loop_active_num === 0 && (this.scanCnt[ord]?.[row] ?? 0) !== 0) {
          rowCount--;
          break endModule;
        }
        this.scanCnt[ord][row] = this.scanCnt[ord][row] + 1 & 255;
        ordersSinceLastValid = 0;
        anyValid = 1;
        if (this.scanCnt[ord][row] === 0) {
          break endModule;
        }
        pdelay = 0;
        for (let chn = 0; chn < mod.chn; chn++) {
          const evs = tracks[chn];
          if (!evs || row >= evs.length) continue;
          const event = evs[row];
          const f1 = event.fxt, p1 = event.fxp;
          const f2 = event.f2t, p2 = event.f2p;
          if (f1 === 0 && f2 === 0) continue;
          if (f1 === FX_GLOBALVOL || f2 === FX_GLOBALVOL) {
            gvl = f1 === FX_GLOBALVOL ? p1 : p2;
            gvl = gvl > mod.gvolbase ? mod.gvolbase : gvl < 0 ? 0 : gvl;
          }
          if (f1 === FX_GVOL_SLIDE || f2 === FX_GVOL_SLIDE) {
            let parm = f1 === FX_GVOL_SLIDE ? p1 : p2;
            for (; ; ) {
              if (parm) {
                gvolMemory = parm;
                const h = MSN(parm);
                const l = LSN(parm);
                if (hasFineFx) {
                  if (l === 15 && h !== 0) {
                    gvl += h;
                  } else if (h === 15 && l !== 0) {
                    gvl -= l;
                  } else {
                    gvl += (h - l) * (vsall ? speed : speed - 1);
                  }
                } else {
                  gvl += (h - l) * (vsall ? speed : speed - 1);
                }
                break;
              } else {
                if ((parm = gvolMemory) !== 0) continue;
                break;
              }
            }
          }
          for (let i = 0; i < 2; i++) {
            const parm = i === 0 ? p2 : p1;
            if ((i === 0 ? f2 : f1) !== FX_SPEED || parm === 0) continue;
            frameCount += rowCount * speed;
            rowCount = 0;
            if (nobpm || parm < 32) {
              speed = parm;
              st26Speed = 0;
            } else {
              time += timeFactor * frameCount * baseTime / bpm;
              frameCount = 0;
              bpm = parm;
            }
          }
          let cf1 = f1, cp1 = p1;
          let cf2 = f2, cp2 = p2;
          if (cf1 === FX_SPEED_CP) cf1 = FX_S3M_SPEED;
          if (cf2 === FX_SPEED_CP) cf2 = FX_S3M_SPEED;
          if (cf1 === FX_ICE_SPEED && cp1) {
            if (LSN(cp1)) {
              st26Speed = MSN(cp1) << 8 | LSN(cp1);
            } else {
              st26Speed = MSN(cp1);
            }
          }
          if (cf1 === FX_FAR_TEMPO || cf1 === FX_FAR_F_TEMPO) {
            let fineChange = 0;
            if (cf1 === FX_FAR_TEMPO) {
              if (MSN(cp1)) {
                farTempoMode = MSN(cp1) - 1;
              } else {
                farTempoCoarse = LSN(cp1);
              }
            }
            if (cf1 === FX_FAR_F_TEMPO) {
              if (MSN(cp1)) {
                farTempoFine += MSN(cp1);
                fineChange = MSN(cp1);
              } else if (LSN(cp1)) {
                farTempoFine -= LSN(cp1);
                fineChange = -LSN(cp1);
              } else {
                farTempoFine = 0;
              }
            }
            const r = farTranslateTempo(
              farTempoMode,
              fineChange,
              farTempoCoarse,
              { get v() {
                return farTempoFine;
              }, set v(x) {
                farTempoFine = x;
              } }
            );
            if (r) {
              frameCount += rowCount * speed;
              rowCount = 0;
              time += timeFactor * frameCount * baseTime / bpm;
              frameCount = 0;
              speed = r.speed;
              bpm = r.bpm;
            }
          }
          if (cf1 === FX_ULT_TEMPO || cf2 === FX_ULT_TEMPO) {
            let parm2 = 0;
            let parm = 0;
            if (cf2 === FX_ULT_TEMPO) {
              if (cp2 === 0) {
                parm = 6;
                parm2 = 125;
              } else if (cp2 < 48) {
                parm = cp2;
              } else {
                parm2 = cp2;
              }
            }
            if (cf1 === FX_ULT_TEMPO) {
              if (cp1 === 0) {
                parm = 6;
                parm2 = 125;
              } else if (cp1 < 48) {
                parm = cp1;
              } else {
                parm2 = cp1;
              }
            }
            frameCount += rowCount * speed;
            rowCount = 0;
            if (parm > 0) {
              speed = parm;
              st26Speed = 0;
            }
            if (parm2 > 0) {
              time += timeFactor * frameCount * baseTime / bpm;
              frameCount = 0;
              bpm = parm2;
            }
          }
          if (cf1 === FX_S3M_SPEED && cp1 || cf2 === FX_S3M_SPEED && cp2) {
            const parm = cf1 === FX_S3M_SPEED ? cp1 : cp2;
            if (parm > 0) {
              frameCount += rowCount * speed;
              rowCount = 0;
              speed = parm;
              st26Speed = 0;
            }
          }
          if (cf1 === FX_S3M_BPM && cp1 || cf2 === FX_S3M_BPM && cp2) {
            const parm = cf1 === FX_S3M_BPM ? cp1 : cp2;
            if (parm >= XMP_MIN_BPM) {
              frameCount += rowCount * speed;
              rowCount = 0;
              time += timeFactor * frameCount * baseTime / bpm;
              frameCount = 0;
              bpm = parm;
            }
          }
          if (cf1 === FX_IT_BPM && cp1 || cf2 === FX_IT_BPM && cp2) {
            const parm = cf1 === FX_IT_BPM ? cp1 : cp2;
            frameCount += rowCount * speed;
            rowCount = 0;
            time += timeFactor * frameCount * baseTime / bpm;
            frameCount = 0;
            if (MSN(parm) === 0) {
              time += timeFactor * baseTime / bpm;
              for (let i = 1; i < speed; i++) {
                bpm -= LSN(parm);
                if (bpm < 32) bpm = 32;
                time += timeFactor * baseTime / bpm;
              }
              time -= timeFactor * speed * baseTime / bpm;
            } else if (MSN(parm) === 1) {
              time += timeFactor * baseTime / bpm;
              for (let i = 1; i < speed; i++) {
                bpm += LSN(parm);
                if (bpm > 255) bpm = 255;
                time += timeFactor * baseTime / bpm;
              }
              time -= timeFactor * speed * baseTime / bpm;
            } else {
              bpm = parm;
            }
          }
          if (cf1 === FX_IT_ROWDELAY) {
            const x = (this.scanCnt[ord][row] ?? 0) + (cp1 & 15);
            this.scanCnt[ord][row] = Math.min(x, 255);
            frameCount += (cp1 & 15) * speed;
          }
          if (cf1 === FX_IT_BREAK || cf2 === FX_IT_BREAK) {
            const parm = cf1 === FX_IT_BREAK ? cp1 : cp2;
            processPatternBreak(mod, f, parm);
          }
          if (cf1 === FX_JUMP || cf2 === FX_JUMP) {
            processPatternJump(mod, f, cf1 === FX_JUMP ? cp1 : cp2);
            if (f.pbreak) {
              insideLoop = 0;
            }
          }
          if (cf1 === FX_BREAK || cf2 === FX_BREAK) {
            const parm = cf1 === FX_BREAK ? cp1 : cp2;
            processPatternBreak(mod, f, 10 * MSN(parm) + LSN(parm));
          }
          if (cf1 === FX_LINE_JUMP || cf2 === FX_LINE_JUMP) {
            processLineJump(mod, f, ord, cf1 === FX_LINE_JUMP ? cp1 : cp2);
          }
          if (cf1 === FX_EXTENDED || cf2 === FX_EXTENDED) {
            const parm = cf1 === FX_EXTENDED ? cp1 : cp2;
            if (parm >> 4 === EX_PATT_DELAY) {
              if (!(isSt3 && pdelay)) {
                pdelay = parm & 15;
              }
            }
            if (parm >> 4 === EX_PATTERN_LOOP) {
              processPatternLoop(mod, f, chn, row, LSN(parm));
              if (LSN(parm) > 0 && f.loop_dest < 0) {
                insideLoop = 0;
              } else if (LSN(parm) === 0) {
                insideLoop = 1;
              }
            }
          }
          if (cf1 === FX_PATT_DELAY) pdelay += cp1;
          if (cf2 === FX_PATT_DELAY) pdelay += cp2;
        }
        if (pdelay > 0) {
          frameCount += pdelay * speed;
        }
        f.loop_param = -1;
        if (f.loop_dest >= 0) {
          row = f.loop_dest - 1;
          f.loop_dest = -1;
        }
        if (f.pbreak) {
          f.pbreak = 0;
          row = lastRow;
          continue;
        }
        if (st26Speed) {
          frameCount += rowCount * speed;
          rowCount = 0;
          if (st26Speed & 65536) {
            speed = (st26Speed & 65280) >> 8;
          } else {
            speed = st26Speed & 255;
          }
          st26Speed ^= 65536;
        }
      }
      if (f.jumpline && pdelay) {
        f.jumpline++;
      }
      if (f.jump >= 0) {
        ord = f.jump - 1;
        f.jump = -1;
      }
      frameCount += rowCount * speed;
      rowCountTotal = 0;
      rowCount = 0;
    }
    row = f.jumpline;
    if (!anyValid) {
      return -1;
    }
    let endPat = mod.xxo[ord] ?? 0;
    let endRow = row;
    if (endPat >= mod.pat || endRow >= (mod.patterns[endPat]?.rows ?? 0)) {
      endRow = 0;
    }
    const num = this.scanCnt[ord]?.[endRow] ?? 0;
    this.pendingScan[chain] = { time: 0, ord, row: endRow, num };
    time -= startTime;
    frameCount += rowCount * speed;
    return time + timeFactor * frameCount * baseTime / bpm;
  }
  /** libxmp_get_sequence (scan.c:708-713) via the stored control array. */
  getSequence(ord) {
    if (ord < 0 || ord >= this.seqCtrl.length) return NO_SEQUENCE;
    return this.seqCtrl[ord];
  }
};
function applyScanToModule(mod) {
  const sc = new Scanner();
  const res = sc.scan(mod);
  mod.num_sequences = res.num_sequences;
  mod.sequences = [];
  for (let i = 0; i < res.num_sequences; i++) {
    mod.sequences.push({
      ord: i,
      entry_point: res.entry_points[i] ?? 0,
      duration: Math.max(0, Math.min(res.scan[i]?.time ?? 0, 2147483647)),
      time: res.scan[i]?.time ?? 0,
      speed: res.xxo_info[res.entry_points[i] ?? 0]?.speed ?? 0,
      bpm: res.xxo_info[res.entry_points[i] ?? 0]?.bpm ?? 0,
      gvl: res.xxo_info[res.entry_points[i] ?? 0]?.gvl ?? -1,
      start_row: res.xxo_info[res.entry_points[i] ?? 0]?.start_row ?? 0
    });
  }
  return res;
}

// ../../packages/core/src/depack/ice.ts
var DEPACK_LIMIT = 268435456;
var ICE_BUFFER_SIZE = 4096;
var VERSION_113 = 113;
var VERSION_21X = 210;
var VERSION_21X_OR_220 = 215;
var VERSION_220 = 220;
var VERSION_23X = 230;
var ICE_OLD_MAGIC = 1231250721;
var ICE_NEW_MAGIC = 1229145377;
var CJ_MAGIC = 759384621;
var MICK_MAGIC = 1296646987;
var SHE_MAGIC = 1397245217;
var TMM_MAGIC = 1414352161;
var TSM_MAGIC = 1414745377;
var memU32be = (b, o) => (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0;
var memU16be = (b, o) => b[o] << 8 | b[o + 1];
var fail = (kind, why) => {
  throw new PackedModuleError(`Pack-Ice ${kind}: ${why}`);
};
function fillBuffer(ice, required) {
  if (ice.bufferPos > 4) return false;
  if (ice.bufferPos > 0) {
    ice.buffer.copyWithin(ice.nextLength, 0, 4);
  }
  if (ice.remaining < ice.nextLength) {
    ice.eof = true;
    return false;
  }
  ice.buffer.set(
    ice.stream.subarray(ice.remaining - ice.nextLength, ice.remaining),
    0
  );
  ice.remaining -= ice.nextLength;
  ice.bufferPos += ice.nextLength;
  ice.nextLength = ICE_BUFFER_SIZE;
  return ice.bufferPos >= required;
}
function readByte(ice) {
  if (ice.bufferPos < 1) {
    if (!fillBuffer(ice, 1)) return -1;
  }
  return ice.buffer[--ice.bufferPos];
}
function readU16le(ice) {
  if (ice.bufferPos < 2) {
    if (!fillBuffer(ice, 2)) return -1;
  }
  ice.bufferPos -= 2;
  return ice.buffer[ice.bufferPos] | ice.buffer[ice.bufferPos + 1] << 8;
}
function peekU32(ice) {
  if (ice.bufferPos < 4) {
    if (!fillBuffer(ice, 4)) return 0;
  }
  return memU32be(ice.buffer, ice.bufferPos - 4);
}
function preloadAdjust(bits, bitsLeft) {
  let tmp = bits.v >>> 32 - bitsLeft.v;
  if ((~bits.v & 2147483648) !== 0) return false;
  while ((~tmp & 1) !== 0) {
    tmp >>>= 1;
    bitsLeft.v--;
  }
  tmp >>>= 1;
  bitsLeft.v--;
  if (bitsLeft.v > 0) tmp = tmp << 32 - bitsLeft.v;
  bits.v = tmp >>> 0;
  return true;
}
function bitplaneFilter(dest, destLen, storedSize) {
  if (storedSize < 0 || storedSize * 8 > destLen) return false;
  let pos = destLen;
  const end = pos - storedSize * 8;
  let plane0 = 0;
  let plane1 = 0;
  let plane2 = 0;
  let plane3 = 0;
  while (pos > end) {
    for (let i = 0; i < 4; i++) {
      pos -= 2;
      let x = memU16be(dest, pos) << 16 >>> 0;
      for (let j = 0; j < 4; j++) {
        plane0 = (plane0 << 1 | x >>> 31) >>> 0;
        x = x << 1 >>> 0;
        plane1 = (plane1 << 1 | x >>> 31) >>> 0;
        x = x << 1 >>> 0;
        plane2 = (plane2 << 1 | x >>> 31) >>> 0;
        x = x << 1 >>> 0;
        plane3 = (plane3 << 1 | x >>> 31) >>> 0;
        x = x << 1 >>> 0;
      }
    }
    dest[pos] = plane0 >> 8 & 255;
    dest[pos + 1] = plane0 & 255;
    dest[pos + 2] = plane1 >> 8 & 255;
    dest[pos + 3] = plane1 & 255;
    dest[pos + 4] = plane2 >> 8 & 255;
    dest[pos + 5] = plane2 & 255;
    dest[pos + 6] = plane3 >> 8 & 255;
    dest[pos + 7] = plane3 & 255;
  }
  return true;
}
function readBits(ice, bits, bitsLeft, num, wide) {
  let ret;
  if (wide) {
    const left = num - bitsLeft.v;
    ret = bits.v >>> 32 - num;
    bitsLeft.v -= num;
    if (left <= 0) {
      bits.v = bits.v << num >>> 0;
    } else {
      bits.v = peekU32(ice);
      bitsLeft.v += 32;
      ice.bufferPos -= 4;
      ret = (ret | bits.v >>> 32 - left) >>> 0;
      bits.v = bits.v << left >>> 0;
    }
  } else {
    if (num > bitsLeft.v) {
      if (num > 8 && num - 8 > bitsLeft.v) {
        const v = readU16le(ice);
        bits.v = (bits.v | v << 16 - bitsLeft.v >>> 0) >>> 0;
        bitsLeft.v += 16;
      } else {
        const b = readByte(ice);
        if (b < 0) return -1;
        bits.v = (bits.v | b << 24 - bitsLeft.v >>> 0) >>> 0;
        bitsLeft.v += 8;
      }
    }
    ret = bits.v >>> 32 - num;
    bits.v = bits.v << num >>> 0;
    bitsLeft.v -= num;
  }
  return ret >>> 0;
}
function readLiteralLengthExt(ice, bits, bitsLeft, wide) {
  if (wide && ice.version === VERSION_113) {
    return readBits(ice, bits, bitsLeft, 10, wide) + 15;
  }
  let length = readBits(ice, bits, bitsLeft, 8, wide) + 15;
  if (length === 270) {
    length = readBits(ice, bits, bitsLeft, 15, wide) + 270;
  }
  return length;
}
function readLiteralLength(ice, bits, bitsLeft, wide) {
  let length = readBits(ice, bits, bitsLeft, 1, wide);
  if (length === 1) length = readBits(ice, bits, bitsLeft, 1, wide) + 1;
  if (length === 2) length = readBits(ice, bits, bitsLeft, 2, wide) + 2;
  if (length === 5) length = readBits(ice, bits, bitsLeft, 2, wide) + 5;
  if (length === 8) length = readBits(ice, bits, bitsLeft, 3, wide) + 8;
  if (length === 15) {
    length = readLiteralLengthExt(ice, bits, bitsLeft, wide);
  }
  if (ice.eof) return -1;
  return length;
}
function readWindowLength(ice, bits, bitsLeft, wide) {
  let length;
  if (readBits(ice, bits, bitsLeft, 1, wide) === 0) {
    length = 2;
  } else if (readBits(ice, bits, bitsLeft, 1, wide) === 0) {
    length = 3;
  } else if (readBits(ice, bits, bitsLeft, 1, wide) === 0) {
    length = 4 + readBits(ice, bits, bitsLeft, 1, wide);
  } else if (readBits(ice, bits, bitsLeft, 1, wide) === 0) {
    length = 6 + readBits(ice, bits, bitsLeft, 2, wide);
  } else {
    length = 10 + readBits(ice, bits, bitsLeft, 10, wide);
  }
  if (ice.eof) return -1;
  return length;
}
function readWindowDistance(ice, bits, bitsLeft, length, wide) {
  let dist;
  if (length === 2) {
    dist = 1 + readBits(ice, bits, bitsLeft, 7, wide);
    if (dist >= 65) {
      dist = (dist - 65 << 3) + 65 + readBits(ice, bits, bitsLeft, 3, wide);
    }
  } else {
    if (readBits(ice, bits, bitsLeft, 1, wide) === 0) {
      dist = 33 + readBits(ice, bits, bitsLeft, 8, wide);
    } else if (readBits(ice, bits, bitsLeft, 1, wide) === 0) {
      dist = 1 + readBits(ice, bits, bitsLeft, 5, wide);
    } else {
      dist = 289 + readBits(ice, bits, bitsLeft, 12, wide);
    }
  }
  if (ice.eof) return -1;
  return dist;
}
function atStreamStart(ice, bitsLeft) {
  return ice.remaining <= 0 && ice.bufferPos === 0 && bitsLeft.v <= 0;
}
function unpackFn(ice, bits, bitsLeft, dest, destLen, wide) {
  let pos = destLen;
  for (; ; ) {
    let length = readLiteralLength(ice, bits, bitsLeft, wide);
    if (length < 0) return false;
    if (length > pos) return false;
    for (; length > 0; length--) {
      const b = readByte(ice);
      if (b < 0) return false;
      dest[--pos] = b;
    }
    if (pos === 0) break;
    length = readWindowLength(ice, bits, bitsLeft, wide);
    if (length <= 0) return false;
    let dist = readWindowDistance(ice, bits, bitsLeft, length, wide);
    if (dist <= 0) return false;
    if (wide) {
      dist = dist + length - 1;
    } else if (dist > 1) {
      dist = dist + length - 2;
    }
    if (length > pos) return false;
    let windowPos = dist + pos;
    if (windowPos > destLen || windowPos <= 0) return false;
    for (; length > 0; length--) {
      dest[--pos] = dest[--windowPos];
    }
  }
  if (ice.version >= VERSION_21X && readBits(ice, bits, bitsLeft, 1, wide) === 1) {
    let bplLen = 320 * 200 / 16;
    if (!atStreamStart(ice, bitsLeft) && readBits(ice, bits, bitsLeft, 1, wide) === 1) {
      bplLen = readBits(ice, bits, bitsLeft, 16, wide) + 1;
      if (ice.eof) return false;
    }
    if (!bitplaneFilter(dest, destLen, bplLen)) return false;
  }
  return atStreamStart(ice, bitsLeft);
}
function unpack8(ice, dest, destLen) {
  const bits = { v: 0 };
  const bitsLeft = { v: 0 };
  const b = readByte(ice);
  if (b < 0) return false;
  bits.v = b << 24 >>> 0;
  bitsLeft.v += 8;
  if (ice.eof || !preloadAdjust(bits, bitsLeft)) return false;
  return unpackFn(ice, bits, bitsLeft, dest, destLen, false);
}
function unpack32(ice, dest, destLen) {
  const bits = { v: 0 };
  const bitsLeft = { v: 0 };
  bits.v = peekU32(ice);
  bitsLeft.v += 32;
  ice.bufferPos -= 4;
  if (ice.eof || !preloadAdjust(bits, bitsLeft)) return false;
  return unpackFn(ice, bits, bitsLeft, dest, destLen, true);
}
function initBuffer(ice) {
  ice.eof = false;
  ice.remaining = ice.streamLen;
  ice.nextLength = ice.streamLen % ICE_BUFFER_SIZE || ICE_BUFFER_SIZE;
  ice.bufferPos = 0;
  if (!fillBuffer(ice, 1)) return false;
  if (ice.version === VERSION_21X_OR_220) {
    const peek = peekU32(ice);
    if ((~peek & 128) !== 0 && (peek & 2147483648) !== 0) {
      ice.version = VERSION_21X;
    } else if ((peek & 128) !== 0 && (~peek & 2147483648) !== 0) {
      ice.version = VERSION_220;
    }
  }
  return true;
}
function iceUnpack(ice, dest, destLen, kind) {
  if (!initBuffer(ice)) fail(kind, "truncated stream");
  if (ice.version >= VERSION_21X_OR_220) {
    if (unpack8(ice, dest, destLen)) return;
  }
  if (ice.version === VERSION_21X_OR_220) {
    if (!initBuffer(ice)) fail(kind, "truncated stream");
  }
  if (ice.version <= VERSION_21X_OR_220) {
    if (unpack32(ice, dest, destLen)) return;
  }
  fail(kind, "depack failed");
}
function uncompressedBound(inLen) {
  const bestFactor = Math.trunc((1033 * 8 + 20) / (14 + 7));
  return inLen * bestFactor;
}
function ice1Unpack(src) {
  const n = src.length;
  if (n < 8 || memU32be(src, n - 4) !== ICE_OLD_MAGIC) {
    fail("ice1", "bad tail magic");
  }
  const uncompressedSize = memU32be(src, n - 8);
  if (uncompressedSize <= 0 || uncompressedSize > DEPACK_LIMIT) {
    fail("ice1", "bad uncompressed size");
  }
  if (uncompressedSize > uncompressedBound(n)) {
    fail("ice1", "expansion bound exceeded");
  }
  const out = new Uint8Array(uncompressedSize);
  const ice = {
    stream: src,
    streamLen: n - 8,
    remaining: n - 8,
    buffer: new Uint8Array(ICE_BUFFER_SIZE + 4),
    bufferPos: 0,
    nextLength: (n - 8) % ICE_BUFFER_SIZE || ICE_BUFFER_SIZE,
    eof: false,
    version: VERSION_113,
    uncompressedSize
  };
  iceUnpack(ice, out, uncompressedSize, "ice1");
  return { data: out, kind: "ice1" };
}
function ice2Unpack(src) {
  const n = src.length;
  if (n < 12) fail("ice2", "file too small");
  const magic = memU32be(src, 0);
  switch (magic) {
    case ICE_OLD_MAGIC:
    case ICE_NEW_MAGIC:
    case CJ_MAGIC:
    case MICK_MAGIC:
    case SHE_MAGIC:
    case TMM_MAGIC:
    case TSM_MAGIC:
      break;
    default:
      fail("ice2", "bad header magic");
  }
  const uncompressedSize = memU32be(src, 8);
  if (uncompressedSize <= 0 || uncompressedSize > DEPACK_LIMIT) {
    fail("ice2", "bad uncompressed size");
  }
  if (uncompressedSize > uncompressedBound(n)) {
    fail("ice2", "expansion bound exceeded");
  }
  const compressedSize = memU32be(src, 4);
  if (compressedSize !== n) fail("ice2", "compressed size mismatch");
  const out = new Uint8Array(uncompressedSize);
  const ice = {
    // The stream is the file minus the 12-byte header; all `remaining`
    // arithmetic is stream-relative (C's next_seek += 12 adjustment).
    stream: src.subarray(12),
    streamLen: n - 12,
    remaining: n - 12,
    buffer: new Uint8Array(ICE_BUFFER_SIZE + 4),
    bufferPos: 0,
    nextLength: (n - 12) % ICE_BUFFER_SIZE || ICE_BUFFER_SIZE,
    eof: false,
    version: magic === ICE_OLD_MAGIC ? VERSION_21X_OR_220 : magic === ICE_NEW_MAGIC ? VERSION_23X : VERSION_21X,
    uncompressedSize
  };
  iceUnpack(ice, out, uncompressedSize, "ice2");
  return { data: out, kind: "ice2" };
}
function ice1Test(src) {
  const n = src.length;
  return n >= 64 && memU32be(src, n - 4) === ICE_OLD_MAGIC;
}
function ice2Test(src) {
  const n = src.length;
  if (n < 64) return false;
  switch (memU32be(src, 0)) {
    case ICE_OLD_MAGIC:
    case ICE_NEW_MAGIC:
    case CJ_MAGIC:
    case MICK_MAGIC:
    case SHE_MAGIC:
    case TMM_MAGIC:
    case TSM_MAGIC:
      return true;
    default:
      return false;
  }
}
function isIcePacked(src) {
  return ice1Test(src) || ice2Test(src);
}
function depackIce(src) {
  if (ice1Test(src)) return ice1Unpack(src).data;
  if (ice2Test(src)) return ice2Unpack(src).data;
  throw new PackedModuleError("not an ICE file");
}

// ../../packages/core/src/depack/pp.ts
function readmem24b(m, off) {
  return m[off] << 16 | m[off + 1] << 8 | m[off + 2];
}
function ppDecrunch(src, srcOff, srcLen, dest, offsetLens, offsetLensOff, destLen, skipBits) {
  if (skipBits > 32) return false;
  let bufSrc = srcOff + srcLen;
  let out = destLen;
  let bitBuffer = 0;
  let bitsLeft = 0;
  let written = 0;
  let exhausted = false;
  const ppReadBits = (nbits) => {
    let bitCnt = nbits;
    while (bitsLeft < bitCnt) {
      if (bufSrc <= srcOff) {
        exhausted = true;
        return 0;
      }
      bitBuffer |= src[--bufSrc] << bitsLeft;
      bitsLeft += 8;
    }
    let v = 0;
    bitsLeft -= bitCnt;
    while (bitCnt-- > 0) {
      v = v << 1 | bitBuffer & 1;
      bitBuffer >>>= 1;
    }
    return v;
  };
  const byteOut = (b) => {
    if (out <= 0) {
      exhausted = true;
      return;
    }
    dest[--out] = b & 255;
    written++;
  };
  ppReadBits(skipBits);
  if (exhausted) return false;
  while (written < destLen) {
    let x = ppReadBits(1);
    if (exhausted) return false;
    if (x === 0) {
      let todo2 = 1;
      do {
        x = ppReadBits(2);
        if (exhausted) return false;
        todo2 += x;
      } while (x === 3);
      while (todo2-- > 0) {
        x = ppReadBits(8);
        if (exhausted) return false;
        byteOut(x);
        if (exhausted) return false;
      }
      if (written === destLen) break;
    }
    x = ppReadBits(2);
    if (exhausted) return false;
    const offbits = offsetLens[offsetLensOff + x];
    let todo = x + 2;
    let offset;
    if (x === 3) {
      x = ppReadBits(1);
      if (exhausted) return false;
      offset = ppReadBits(x === 0 ? 7 : offbits);
      if (exhausted) return false;
      do {
        x = ppReadBits(3);
        if (exhausted) return false;
        todo += x;
      } while (x === 7);
    } else {
      offset = ppReadBits(offbits);
      if (exhausted) return false;
    }
    if (out + offset >= destLen) return false;
    while (todo-- > 0) {
      const v = dest[out + offset];
      byteOut(v);
      if (exhausted) return false;
    }
  }
  return written === destLen;
}
function isPpPacked(src) {
  return src.length >= 16 && src[0] === 80 && src[1] === 80 && src[2] === 50 && src[3] === 48;
}
function depackPp(src) {
  const len = src.length;
  if (len < 16) return null;
  if (!(src[0] === 80 && src[1] === 80 && src[2] === 50 && src[3] === 48)) {
    return null;
  }
  if (len & 3) return null;
  const outlen = readmem24b(src, len - 4);
  const dest = new Uint8Array(outlen);
  const skipBits = src[len - 1];
  const ok = ppDecrunch(src, 8, len - 12, dest, src, 4, outlen, skipBits);
  return ok ? dest : null;
}

// ../../packages/core/src/depack/moduleQuirks.ts
var XmpMode = {
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
  ITSMP: 10
};
var XmpFlag = {
  /** Use vblank timing (FX_SPEED arms + compare-vblank scan). */
  VBLANK: 1 << 0,
  /** Emulate FX9 bug. */
  FX9BUG: 1 << 1,
  /** Emulate sample loop bug. */
  FIXLOOP: 1 << 2,
  /** Use Paula mixer in Amiga modules. */
  A500: 1 << 3
};
var MODULE_QUIRKS = [
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
  { md5: "ca378c0e874f1ecda3e98bdd11468d69", flags: XmpFlag.VBLANK, mode: XmpMode.AUTO }
];

// ../../packages/core/src/effects/helpers.ts
var WAVEFORM_SIZE = 64;
var SINE_WAVE = [
  0,
  24,
  49,
  74,
  97,
  120,
  141,
  161,
  180,
  197,
  212,
  224,
  235,
  244,
  250,
  253,
  255,
  253,
  250,
  244,
  235,
  224,
  212,
  197,
  180,
  161,
  141,
  120,
  97,
  74,
  49,
  24,
  0,
  -24,
  -49,
  -74,
  -97,
  -120,
  -141,
  -161,
  -180,
  -197,
  -212,
  -224,
  -235,
  -244,
  -250,
  -253,
  -255,
  -253,
  -250,
  -244,
  -235,
  -224,
  -212,
  -197,
  -180,
  -161,
  -141,
  -120,
  -97,
  -74,
  -49,
  -24
];
var MSN2 = (x) => (x & 240) >> 4;
var LSN2 = (x) => x & 15;
var SET = (xc, f) => {
  xc.flags |= f;
};
var RESET = (xc, f) => {
  xc.flags &= ~f;
};
var TEST = (xc, f) => (xc.flags & f) !== 0 ? 1 : 0;
var SET_PER = (xc, f) => {
  xc.per_flags |= f;
};
var RESET_PER = (xc, f) => {
  xc.per_flags &= ~f;
};
var TEST_PER = (xc, f) => (xc.per_flags & f) !== 0 ? 1 : 0;
var SET_NOTE = (xc, f) => {
  xc.note_flags |= f;
};
var RESET_NOTE = (xc, f) => {
  xc.note_flags &= ~f;
};
var TEST_NOTE = (xc, f) => (xc.note_flags & f) !== 0 ? 1 : 0;
var VOL_SLIDE = 1 << 0;
var PAN_SLIDE = 1 << 1;
var TONEPORTA = 1 << 2;
var PITCHBEND = 1 << 3;
var VIBRATO = 1 << 4;
var TREMOLO = 1 << 5;
var FINE_VOLS = 1 << 6;
var FINE_BEND = 1 << 7;
var OFFSET_FLAG = 1 << 8;
var TRK_VSLIDE = 1 << 9;
var TRK_FVSLIDE = 1 << 10;
var NEW_INS = 1 << 11;
var NEW_VOL = 1 << 12;
var VOL_SLIDE_2 = 1 << 13;
var NOTE_SLIDE = 1 << 14;
var FINE_NSLIDE = 1 << 15;
var NEW_NOTE = 1 << 16;
var FINE_TPORTA = 1 << 17;
var RETRIG = 1 << 18;
var PANBRELLO = 1 << 19;
var GVOL_SLIDE = 1 << 20;
var TEMPO_SLIDE = 1 << 21;
var VENV_PAUSE = 1 << 22;
var PENV_PAUSE = 1 << 23;
var FENV_PAUSE = 1 << 24;
var FINE_VOLS_2 = 1 << 25;
var KEY_OFF_FLAG = 1 << 26;
var TREMOR_FLAG = 1 << 27;
var MIDI_MACRO = 1 << 28;
var NOTE_FADEOUT = 1 << 0;
var NOTE_ENV_RELEASE = 1 << 1;
var NOTE_END = 1 << 2;
var NOTE_CUT = 1 << 3;
var NOTE_ENV_END = 1 << 4;
var NOTE_SAMPLE_END = 1 << 5;
var NOTE_SET = 1 << 6;
var NOTE_SUSEXIT = 1 << 7;
var NOTE_KEY_CUT = 1 << 8;
var NOTE_GLISSANDO = 1 << 9;
var NOTE_SAMPLE_RELEASE = 1 << 10;
var NOTE_RELEASE = NOTE_ENV_RELEASE | NOTE_SAMPLE_RELEASE;
var hasQuirk = (core, flag) => (core.quirks & flag) !== 0;
function effectMemory(core, p, m, st3Fallback, st3Assign) {
  let val = p;
  if (hasQuirk(core, Quirk.ST3BUGS)) {
    if (val === 0) {
      val = st3Fallback();
    } else {
      st3Assign(val);
    }
  } else {
    if (val === 0) {
      val = m.get();
    } else {
      m.set(val);
    }
  }
  return val;
}
function effectMemoryGet(core, p, mem, volMemory) {
  return hasQuirk(core, Quirk.ST3BUGS) ? volMemory : p === 0 ? mem : p;
}
function effectMemorySetOnly(core, p, memRef, volMemoryRef) {
  let val = p;
  if (val === 0) {
    val = memRef.get();
  } else {
    memRef.set(val);
  }
  if (hasQuirk(core, Quirk.ST3BUGS)) {
    if (val !== 0) volMemoryRef.set(val);
  }
  return val;
}
function effectMemoryS3m(core, p, volMemory) {
  let val = p;
  if (hasQuirk(core, Quirk.ST3BUGS)) {
    if (val === 0) {
      val = volMemory.get();
    } else {
      volMemory.set(val);
    }
  }
  return val;
}
var PERIOD_BASE2 = 13696;
var MIN_PERIOD_L = 0;
var MAX_PERIOD_L = 7680;
var MIN_NOTE_MOD = 48;
var MAX_NOTE_MOD = 83;
var M_LN2 = Math.LN2;
function libxmpRound(val) {
  return val >= 0 ? Math.floor(val + 0.5) : Math.ceil(val - 0.5);
}
function noteToPeriod(periodType, n, f, adj) {
  const d = n + f / 128;
  switch (periodType) {
    case PeriodType.LINEAR:
      return (240 - d) * 16;
    /* Linear */
    case PeriodType.CSPD:
      return 8363 * Math.pow(2, n / 12) / 32 + f;
    /* Hz */
    default:
      return PERIOD_BASE2 / Math.pow(2, d / 12) * (adj > 0.1 ? adj : 1);
  }
}
function periodToBend(periodType, p, n, adj) {
  if (n === 0 || p < 0.1) {
    return 0;
  }
  switch (periodType) {
    case PeriodType.LINEAR:
      return Math.trunc(100 * (8 * ((240 - n) * 16 - p)));
    case PeriodType.CSPD: {
      const d = noteToPeriod(periodType, n, 0, adj);
      return libxmpRound(100 * (1536 / M_LN2) * Math.log(p / d));
    }
    default: {
      const d = noteToPeriod(periodType, n, 0, adj);
      return libxmpRound(100 * (1536 / M_LN2) * Math.log(d / p));
    }
  }
}
function getLfoMod(lfo) {
  if (lfo.rate === 0) return 0;
  switch (lfo.type) {
    case 0:
      return SINE_WAVE[lfo.phase] * lfo.depth;
    case 1:
      return (255 - (lfo.phase << 3)) * lfo.depth;
    case 2:
      return (lfo.phase < WAVEFORM_SIZE / 2 ? 255 : -255) * lfo.depth;
    case 3:
      return (getRandom(512) - 256) * lfo.depth;
    case 669:
      return (lfo.phase & 1) * lfo.depth;
    default:
      return 0;
  }
}
var rngSeed = 305441741;
function getRandom(range) {
  let state = rngSeed | 0;
  if (state === 0) state = 1;
  state = state ^ (state << 13 | 0) | 0;
  state = state ^ state >>> 17 | 0;
  state = Math.imul(state, 32);
  rngSeed = state;
  return Math.floor(range * (state >>> 0) / 4294967296);
}
function getLfoSt3(lfo) {
  if (lfo.rate === 0) return 0;
  if (lfo.type === 2) {
    return (lfo.phase < WAVEFORM_SIZE / 2 ? 255 : 0) * lfo.depth;
  }
  return getLfoMod(lfo);
}
function getLfoFt2(lfo) {
  if (lfo.rate === 0) return 0;
  if (lfo.type === 1) {
    const phase = (lfo.phase + (WAVEFORM_SIZE >> 1)) % WAVEFORM_SIZE;
    return ((phase << 3) - 255) * lfo.depth;
  }
  return getLfoMod(lfo);
}
function lfoGet(readEventType, lfo, isVibrato) {
  switch (readEventType) {
    case 2:
      return getLfoSt3(lfo);
    case 1:
      return isVibrato ? getLfoFt2(lfo) : getLfoMod(lfo);
    case 3:
      return getLfoSt3(lfo);
    default:
      return getLfoMod(lfo);
  }
}
function lfoUpdate(lfo) {
  lfo.phase += lfo.rate;
  lfo.phase &= WAVEFORM_SIZE - 1;
}
function lfoSetPhase(lfo, phase) {
  lfo.phase = phase;
}
function lfoSetDepth(lfo, depth) {
  lfo.depth = depth;
}
function lfoSetRate(lfo, rate) {
  lfo.rate = rate;
}
function lfoSetWaveform(lfo, type) {
  lfo.type = type;
}
function setLfoNotzero(lfo, depth, rate) {
  if (depth !== 0) {
    lfo.depth = depth;
  }
  if (rate !== 0) {
    lfo.rate = rate;
  }
}
var isValidNote = (note) => note >>> 0 < 121;
var IS_VALID_INSTRUMENT = (ins) => ins >= 0 && ins < 64;
function doToneporta(core, xc, noteIn) {
  const mod = core.module;
  const instrument = mod.instruments[xc.ins];
  if (!instrument) return;
  let mappedXpo = 0;
  let mapped = 0;
  if (isValidNote(xc.key)) {
    mapped = instrument.map[xc.key] ?? 0;
  }
  if (mapped >= instrument.nsm) {
    mapped = 0;
  }
  const sub = instrument.sub[mapped];
  if (isValidNote(noteIn - 1) && xc.ins < mod.instruments.length) {
    const note = noteIn - 1;
    if (isValidNote(xc.key_porta)) {
      mappedXpo = instrument.mapXpo[xc.key_porta] ?? 0;
    }
    xc.porta.target = noteToPeriod(
      mod.periodType,
      note + (sub?.xpo ?? 0) + mappedXpo,
      xc.finetune,
      xc.per_adj
    );
  }
  xc.porta.dir = xc.period < xc.porta.target ? 1 : -1;
}

// ../../packages/core/src/effects/state.ts
var VolSlideFlag = {
  VOL_SLIDE: 1 << 0,
  PAN_SLIDE: 1 << 1,
  TONEPORTA: 1 << 2,
  PITCHBEND: 1 << 3,
  VIBRATO: 1 << 4,
  TREMOLO: 1 << 5,
  FINE_VOLS: 1 << 6,
  FINE_BEND: 1 << 7,
  OFFSET: 1 << 8,
  TRK_VSLIDE: 1 << 9,
  TRK_FVSLIDE: 1 << 10,
  NEW_INS: 1 << 11,
  NEW_VOL: 1 << 12,
  VOL_SLIDE_2: 1 << 13,
  NOTE_SLIDE: 1 << 14,
  FINE_NSLIDE: 1 << 15,
  NEW_NOTE: 1 << 16,
  FINE_TPORTA: 1 << 17,
  RETRIG: 1 << 18,
  PANBRELLO: 1 << 19,
  GVOL_SLIDE: 1 << 20,
  TEMPO_SLIDE: 1 << 21,
  VENV_PAUSE: 1 << 22,
  PENV_PAUSE: 1 << 23,
  FENV_PAUSE: 1 << 24,
  FINE_VOLS_2: 1 << 25,
  KEY_OFF: 1 << 26,
  /* for IT release on envloop end */
  TREMOR: 1 << 27,
  /* for XM tremor */
  MIDI_MACRO: 1 << 28
  /* IT midi macro */
};
var NoteFlag2 = {
  FADEOUT: 1 << 0,
  ENV_RELEASE: 1 << 1,
  END: 1 << 2,
  CUT: 1 << 3,
  ENV_END: 1 << 4,
  SAMPLE_END: 1 << 5,
  SET: 1 << 6,
  SUSEXIT: 1 << 7,
  KEY_CUT: 1 << 8,
  GLISSANDO: 1 << 9,
  SAMPLE_RELEASE: 1 << 10,
  RELEASE: 1 << 1 | 1 << 10
};

// ../../packages/core/src/effects/fx.ts
function fxArpeggio(core, xc, fxpIn, s3mMem) {
  let fxp = fxpIn;
  if (s3mMem) {
    if (fxp === 0) {
      fxp = xc.arpeggio.memory;
    } else if (hasQuirk(core, Quirk.ST3BUGS)) {
      xc.vol.memory = fxp;
      xc.arpeggio.memory = fxp;
    } else {
      xc.arpeggio.memory = fxp;
    }
  }
  if (!hasQuirk(core, Quirk.ARPMEM) || fxp !== 0) {
    xc.arpeggio.val[0] = 0;
    xc.arpeggio.val[1] = MSN2(fxp);
    xc.arpeggio.val[2] = LSN2(fxp);
    xc.arpeggio.size = 3;
  }
}
function fxOktArp(xc, variant, fxp) {
  if (fxp === 0) return;
  switch (variant) {
    case 3:
      xc.arpeggio.val[0] = -MSN2(fxp);
      xc.arpeggio.val[1] = 0;
      xc.arpeggio.val[2] = LSN2(fxp);
      xc.arpeggio.size = 3;
      break;
    case 4:
      xc.arpeggio.val[0] = 0;
      xc.arpeggio.val[1] = LSN2(fxp);
      xc.arpeggio.val[2] = 0;
      xc.arpeggio.val[3] = -MSN2(fxp);
      xc.arpeggio.size = 4;
      break;
    case 5:
      xc.arpeggio.val[0] = LSN2(fxp);
      xc.arpeggio.val[1] = LSN2(fxp);
      xc.arpeggio.val[2] = 0;
      xc.arpeggio.size = 3;
      break;
  }
}
function fxPortaUp(core, xc, fxpIn, fnum) {
  let fxp = fxpIn;
  if (fxp === 0) {
    fxp = xc.freq.memory;
  } else {
    xc.freq.memory = fxp;
  }
  if (hasQuirk(core, Quirk.FINEFX) && (fnum === 0 || !hasQuirk(core, Quirk.ITPOR))) {
    switch (MSN2(fxp)) {
      case 15:
        fxFPortaUp(core, xc, fxp & 15);
        return;
      case 14:
        fxXfPortaUp(core, xc, fxp & 15);
        return;
    }
  }
  if (fxp !== 0) {
    SET(xc, VolSlideFlag.PITCHBEND);
    xc.freq.slide = -fxp;
    if (hasQuirk(core, Quirk.UNISLD)) xc.porta.memory = fxp;
  }
}
function fxPortaDn(core, xc, fxpIn, fnum) {
  let fxp = fxpIn;
  if (hasQuirk(core, Quirk.FT2BUGS)) {
    if (fxp === 0) {
      fxp = xc.freq.down_memory;
    } else {
      xc.freq.down_memory = fxp;
    }
  } else {
    if (fxp === 0) {
      fxp = xc.freq.memory;
    } else {
      xc.freq.memory = fxp;
    }
  }
  if (hasQuirk(core, Quirk.FINEFX) && (fnum === 0 || !hasQuirk(core, Quirk.ITPOR))) {
    switch (MSN2(fxp)) {
      case 15:
        fxFPortaDn(core, xc, fxp & 15);
        return;
      case 14:
        fxXfPortaDn(core, xc, fxp & 15);
        return;
    }
  }
  if (fxp !== 0) {
    SET(xc, VolSlideFlag.PITCHBEND);
    xc.freq.slide = fxp;
    if (hasQuirk(core, Quirk.UNISLD)) xc.porta.memory = fxp;
  }
}
function fxToneporta(core, xc, fxpIn, note) {
  let fxp = fxpIn;
  if (fxp === 0) {
    fxp = xc.porta.memory;
  } else {
    xc.porta.memory = fxp;
  }
  if (hasQuirk(core, Quirk.ST3BUGS) && fxp !== 0) {
    xc.vol.memory = fxp;
  }
  if (fxp !== 0) {
    if (hasQuirk(core, Quirk.UNISLD)) xc.freq.memory = fxp;
    xc.porta.slide += fxp;
  }
  if (hasQuirk(core, Quirk.IGSTPOR)) {
    if (note === 0 && xc.porta.dir === 0) return;
  }
  if (!(xc.ins >= 0 && xc.ins < core.module.instruments.length)) return;
  doToneporta(core, xc, note);
  SET(xc, VolSlideFlag.TONEPORTA);
}
function fxVibrato(core, xc, fxpIn) {
  let fxp = fxpIn;
  if (fxp === 0) {
    fxp = xc.vibrato.memory;
  } else {
    xc.vibrato.memory = fxp;
  }
  if (hasQuirk(core, Quirk.ST3BUGS) && fxp !== 0) {
    xc.vol.memory = fxp;
  }
  SET(xc, VolSlideFlag.VIBRATO);
  setLfoNotzero(xc.vibrato.lfo, LSN2(fxp) << 2, MSN2(fxp));
}
function fxFineVibrato(core, xc, fxpIn) {
  let fxp = fxpIn;
  if (fxp === 0) {
    fxp = xc.vibrato.memory;
  } else {
    xc.vibrato.memory = fxp;
  }
  if (hasQuirk(core, Quirk.ST3BUGS) && fxp !== 0) {
    xc.vol.memory = fxp;
  }
  SET(xc, VolSlideFlag.VIBRATO);
  setLfoNotzero(xc.vibrato.lfo, LSN2(fxp), MSN2(fxp));
}
function fxTremolo(core, xc, fxpIn) {
  let fxp = fxpIn;
  if (fxp === 0) {
    fxp = hasQuirk(core, Quirk.ST3BUGS) ? xc.vol.memory : xc.tremolo.memory;
  } else {
    if (hasQuirk(core, Quirk.ST3BUGS)) xc.vol.memory = fxp;
    else xc.tremolo.memory = fxp;
  }
  SET(xc, VolSlideFlag.TREMOLO);
  setLfoNotzero(xc.tremolo.lfo, LSN2(fxp), MSN2(fxp));
}
function fxOffset(core, xc, fxpIn, ev) {
  let fxp = fxpIn;
  if (hasQuirk(core, Quirk.FT2BUGS)) {
    fxp = fxp ? fxp : xc.offset.memory;
  } else if (fxp === 0) {
    fxp = xc.offset.memory;
  } else {
    xc.offset.memory = fxp;
  }
  SET(xc, VolSlideFlag.OFFSET);
  if (ev.note) {
    xc.offset.val |= fxp << 8;
    xc.offset.val2 = fxp << 8;
  }
  if (ev.ins) {
    xc.offset.val2 = fxp << 8;
  }
}
function fxPanbrello(_core, xc, fxp) {
  SET(xc, VolSlideFlag.PANBRELLO);
  setLfoNotzero(xc.panbrello.lfo, LSN2(fxp) << 4, MSN2(fxp));
}
function fxPanbrelloWf(xc, fxp) {
  lfoSetWaveform(xc.panbrello.lfo, fxp & 3);
}
function fxFinetune(xc, fxp) {
  xc.finetune = fxp - 128 | 0;
}
function exFinetune(core, xc, fxp, note) {
  if (!hasQuirk(core, Quirk.FT2BUGS) || note > 0) {
    const v = fxp << 4 & 255;
    xc.finetune = v >= 128 ? v - 256 : v;
  }
}
function fxFPortaUp(_core, xc, fxp) {
  if (fxp) {
    SET(xc, VolSlideFlag.FINE_BEND);
    xc.freq.fslide = -fxp;
  }
}
function fxFPortaDn(_core, xc, fxp) {
  if (fxp) {
    SET(xc, VolSlideFlag.FINE_BEND);
    xc.freq.fslide = fxp;
  }
}
function fxXfPorta(core, xc, fxpIn) {
  const h = MSN2(fxpIn);
  const fxp = fxpIn & 15;
  switch (h) {
    case 1:
      fxXfPortaUp(core, xc, fxp);
      break;
    case 2:
      fxXfPortaDn(core, xc, fxp);
      break;
  }
}
function fxXfPortaUp(_core, xc, fxp) {
  SET(xc, VolSlideFlag.FINE_BEND);
  xc.freq.fslide = -0.25 * fxp;
}
function fxXfPortaDn(_core, xc, fxp) {
  SET(xc, VolSlideFlag.FINE_BEND);
  xc.freq.fslide = 0.25 * fxp;
}
function exGliss(xc, fxp) {
  if (fxp) {
    SET_NOTE(xc, NOTE_GLISSANDO);
  } else {
    RESET_NOTE(xc, NOTE_GLISSANDO);
  }
}
function exVibratoWf(xc, fxp) {
  lfoSetWaveform(xc.vibrato.lfo, fxp & 3);
}
function exTremoloWf(xc, fxp) {
  lfoSetWaveform(xc.tremolo.lfo, fxp & 3);
}
function exFilter(core, fxp) {
  const mod = core.module;
  const amigaMod = mod.readEventType === ReadEventType.MOD && mod.periodType === 1;
  if (amigaMod) {
    core.ctx.p.filter = fxp & 1 ? 0 : 1;
  }
}
function exInvloop(xc, fxp) {
  xc.invloop.speed = fxp;
}

// ../../packages/core/src/effects/vfx.ts
var XMP_MIN_BPM2 = 20;
var ROWDELAY_ON = 1 << 0;
var ROWDELAY_FIRST_FRAME = 1 << 1;
function fxVolSlide(core, xc, fxpIn) {
  let fxp = fxpIn;
  volslideLabel: while (true) {
    if (hasQuirk(core, Quirk.FINEFX)) {
      const h = MSN2(fxp);
      const l = LSN2(fxp);
      if (l === 15 && h !== 0) {
        xc.vol.memory = fxp;
        fxp >>= 4;
        fvslideUpShared(core, xc, fxp);
        return;
      } else if (h === 15 && l !== 0) {
        xc.vol.memory = fxp;
        fxp &= 15;
        fvslideDnShared(core, xc, fxp);
        return;
      }
    }
    if (fxp === 0) {
      if (xc.vol.memory !== 0) {
        fxp = xc.vol.memory;
        continue volslideLabel;
      }
    }
    if (fxp) {
      SET(xc, VolSlideFlag.VOL_SLIDE);
      xc.vol.memory = fxp;
      const h = MSN2(fxp);
      const l = LSN2(fxp);
      if (core.ctx.m.flowMode === FLOW_MODE_ORPHEUS) {
        xc.vol.slide = h - l;
      } else if (hasQuirk(core, Quirk.VOLPDN)) {
        xc.vol.slide = l ? -l : h;
      } else {
        xc.vol.slide = h ? h : -l;
      }
    }
    if (hasQuirk(core, Quirk.FINEFX)) {
      if (MSN2(xc.vol.memory) === 15 || LSN2(xc.vol.memory) === 15) {
        SET(xc, VolSlideFlag.FINE_VOLS);
        xc.vol.fslide = xc.vol.slide;
      }
    }
    return;
  }
}
function fvslideUpShared(_core, xc, fxp) {
  SET(xc, VolSlideFlag.FINE_VOLS);
  xc.vol.fslide = fxp;
}
function fvslideDnShared(_core, xc, fxp) {
  SET(xc, VolSlideFlag.FINE_VOLS);
  xc.vol.fslide = -fxp;
}
function fxVolSet(core, xc, fxp) {
  SET(xc, VolSlideFlag.NEW_VOL);
  xc.volume = fxp;
  if (xc.split) {
    const pair = core.ctx.channelStates[xc.pair];
    if (pair) pair.volume = xc.volume;
  }
}
function fxTrkVSlide(core, xc, fxpIn) {
  let fxp = fxpIn;
  if (fxp === 0) {
    const mem = xc.trackvol.memory;
    if (mem === 0) return;
    fxp = mem;
  }
  if (hasQuirk(core, Quirk.FINEFX)) {
    const h = MSN2(fxp);
    const l = LSN2(fxp);
    if (h === 15 && l !== 0) {
      xc.trackvol.memory = fxp;
      fxTrkFVSlide(xc, fxp & 15);
      return;
    } else if (l === 15 && h !== 0) {
      xc.trackvol.memory = fxp;
      fxTrkFVSlide(xc, fxp & 240);
      return;
    }
  }
  SET(xc, VolSlideFlag.TRK_VSLIDE);
  if (fxp) {
    const h = MSN2(fxp);
    const l = LSN2(fxp);
    xc.trackvol.memory = fxp;
    if (hasQuirk(core, Quirk.VOLPDN)) {
      xc.trackvol.slide = l ? -l : h;
    } else {
      xc.trackvol.slide = h ? h : -l;
    }
  }
}
function fxTrkFVSlide(xc, fxp) {
  SET(xc, VolSlideFlag.TRK_FVSLIDE);
  if (fxp) {
    xc.trackvol.fslide = MSN2(fxp) - LSN2(fxp);
  }
}
function fxSetPan(xc, fxp) {
  xc.pan.val = fxp;
  xc.pan.surround = 0;
  xc.rpv = 0;
}
function fxPanSlide(core, xc, fxpIn, mem) {
  void core;
  let fxp = fxpIn;
  if (mem) {
    if (fxp === 0) fxp = xc.pan.memory;
    else xc.pan.memory = fxp;
  }
  SET(xc, VolSlideFlag.PAN_SLIDE);
  xc.pan.slide = LSN2(fxp) - MSN2(fxp);
}
function fxItPanSlide(xc, fxp) {
  SET(xc, VolSlideFlag.PAN_SLIDE);
  if (fxp) {
    if (MSN2(fxp) === 15) {
      xc.pan.slide = 0;
      xc.pan.fslide = LSN2(fxp);
    } else if (LSN2(fxp) === 15) {
      xc.pan.slide = 0;
      xc.pan.fslide = -MSN2(fxp);
    } else {
      SET(xc, VolSlideFlag.PAN_SLIDE);
      xc.pan.slide = LSN2(fxp) - MSN2(fxp);
      xc.pan.fslide = 0;
    }
  }
}
function fxSurround(xc, fxp) {
  xc.pan.surround = fxp;
}
function fxTremor(core, xc, fxpIn) {
  let fxp = fxpIn;
  if (fxp === 0) {
    fxp = hasQuirk(core, Quirk.ST3BUGS) ? xc.vol.memory : xc.tremor.memory;
  } else if (hasQuirk(core, Quirk.ST3BUGS)) {
    xc.vol.memory = fxp;
    xc.tremor.memory = fxp;
  } else {
    xc.tremor.memory = fxp;
  }
  xc.tremor.up = MSN2(fxp);
  xc.tremor.down = LSN2(fxp);
  if (core.module.readEventType !== 1) {
    if (xc.tremor.up === 0) xc.tremor.up++;
    if (xc.tremor.down === 0) xc.tremor.down++;
  }
  SET(xc, VolSlideFlag.TREMOR);
}
function exRetrig(core, xc, fxp) {
  SET(xc, VolSlideFlag.RETRIG);
  xc.retrig.val = fxp;
  xc.retrig.count = fxp + 1;
  xc.retrig.type = 0;
  xc.retrig.limit = hasQuirk(core, Quirk.RTONCE) ? 1 : 0;
}
function exCut(xc, fxp) {
  SET(xc, VolSlideFlag.RETRIG);
  xc.note_flags |= NOTE_CUT;
  xc.retrig.val = fxp + 1;
  xc.retrig.count = xc.retrig.val;
  xc.retrig.type = 16;
}
function fxMultiRetrig(core, xc, fxpIn, note) {
  let fxp = effectMemoryS3m(core, fxpIn, {
    get: () => xc.vol.memory,
    set: (v) => {
      xc.vol.memory = v;
    }
  });
  if (fxp) {
    xc.retrig.val = LSN2(fxp);
    xc.retrig.type = MSN2(fxp);
  }
  if (note) {
    xc.retrig.count = xc.retrig.val + 1;
  }
  xc.retrig.limit = 0;
  SET(xc, VolSlideFlag.RETRIG);
}
function fxGlobalVol(core, fxp) {
  if (fxp > core.module.gvolbase) {
    core.ctx.p.gvol = core.module.gvolbase;
  } else {
    core.ctx.p.gvol = fxp;
  }
}
function fxGvolSlide(core, xc, fxpIn) {
  let fxp = fxpIn;
  if (fxp) {
    gvolslideShared(core, xc, fxp);
    return;
  }
  if (xc.gvol.memory !== 0) {
    gvolslideShared(core, xc, xc.gvol.memory);
  }
}
function gvolslideShared(core, xc, fxpIn) {
  let fxp = fxpIn;
  SET(xc, VolSlideFlag.GVOL_SLIDE);
  xc.gvol.memory = fxp;
  const h = MSN2(fxp);
  const l = LSN2(fxp);
  if (hasQuirk(core, Quirk.FINEFX)) {
    if (l === 15 && h !== 0) {
      xc.gvol.slide = 0;
      xc.gvol.fslide = h;
    } else if (h === 15 && l !== 0) {
      xc.gvol.slide = 0;
      xc.gvol.fslide = -l;
    } else {
      xc.gvol.slide = h ? h : -l;
      xc.gvol.fslide = 0;
    }
  } else {
    xc.gvol.slide = h ? h : -l;
    xc.gvol.fslide = 0;
  }
  void fxp;
}
function fxKeyoff(xc, fxp) {
  xc.keyoff = fxp + 1;
}
function fxEnvPos(core, xc, fxp) {
  if (hasQuirk(core, Quirk.FT2BUGS)) {
    const instrument = core.module.instruments[xc.ins];
    if (instrument) {
      const ENV_SUS = 1 << 1;
      if ((instrument.aei.flags & ENV_SUS) !== 0) {
        xc.p_idx = fxp;
      }
    }
  } else {
    xc.p_idx = fxp;
  }
  xc.v_idx = fxp;
  xc.f_idx = fxp;
}
function fxSpeed(core, fxp) {
  const useVblank = hasQuirk(core, Quirk.NOBPM) || (core.ctx.p.flags & 1) !== 0;
  if (useVblank || fxp < 32) {
    s3mSpeedShared(core, fxp);
    return;
  }
  s3mBpmShared(core, fxp);
}
function fxS3mSpeed(core, fxp) {
  s3mSpeedShared(core, fxp);
}
function s3mSpeedShared(core, fxp) {
  if (fxp) {
    core.ctx.p.speed = fxp;
  }
}
function fxS3mBpm(core, fxp) {
  s3mBpmShared(core, fxp);
}
function s3mBpmShared(core, fxpIn) {
  let fxp = fxpIn;
  const minBpm = Math.trunc(0.5 + core.module.time_factor * XMP_MIN_BPM2 / 10);
  if (fxp < minBpm) fxp = minBpm;
  core.ctx.p.bpm = fxp;
}
function fxItBpm(core, xc, fxp) {
  if (MSN2(fxp) === 0) {
    SET(xc, VolSlideFlag.TEMPO_SLIDE);
    if (LSN2(fxp)) xc.tempo_slide = -LSN2(fxp);
  } else if (MSN2(fxp) === 1) {
    SET(xc, VolSlideFlag.TEMPO_SLIDE);
    xc.tempo_slide = LSN2(fxp);
  } else {
    let b = fxp;
    if (b < XMP_MIN_BPM2) b = XMP_MIN_BPM2;
    core.ctx.p.bpm = b;
  }
}
function fxItRowDelay(core, fxp) {
  const f = core.ctx.p.flow;
  if (!f.rowdelay_set) {
    f.rowdelay = fxp;
    f.rowdelay_set = ROWDELAY_ON | ROWDELAY_FIRST_FRAME;
  }
}

// ../../packages/core/src/effects/extras.ts
var MED_VER_210 = 528;
var MED_VER_300 = 768;
var MED_VER_320 = 800;
var MED_VER_OCTAMED_100 = 4096;
var MED_VER_OCTAMED_200 = 8192;
var MED_VER_OCTAMED_300 = 12288;
var MED_VER_OCTAMED_400 = 16384;
var MED_VER_OCTAMED_500 = 20480;
var MED_VER_OCTAMED_502 = 20482;
var MED_VER_OCTAMED_SS_1 = 24576;
var MED_VER_OCTAMED_SS_2 = 28672;
var MEGAARP = [
  [0, 3, 7, 12, 15, 12, 7, 3, 0, 3, 7, 12, 15, 12, 7, 3],
  [0, 4, 7, 12, 16, 12, 7, 4, 0, 4, 7, 12, 16, 12, 7, 4],
  [0, 3, 8, 12, 15, 12, 8, 3, 0, 3, 8, 12, 15, 12, 8, 3],
  [0, 4, 8, 12, 16, 12, 8, 4, 0, 4, 8, 12, 16, 12, 8, 4],
  [0, 5, 8, 12, 17, 12, 8, 5, 0, 5, 8, 12, 17, 12, 8, 5],
  [0, 5, 9, 12, 17, 12, 9, 5, 0, 5, 9, 12, 17, 12, 9, 5],
  [12, 0, 7, 0, 3, 0, 7, 0, 12, 0, 7, 0, 3, 0, 7, 0],
  [12, 0, 7, 0, 4, 0, 7, 0, 12, 0, 7, 0, 4, 0, 7, 0],
  [0, 3, 7, 3, 7, 12, 7, 12, 15, 12, 7, 12, 7, 3, 7, 3],
  [0, 4, 7, 4, 7, 12, 7, 12, 16, 12, 7, 12, 7, 4, 7, 4],
  [31, 27, 24, 19, 15, 12, 7, 3, 0, 3, 7, 12, 15, 19, 24, 27],
  [31, 28, 24, 19, 16, 12, 7, 4, 0, 4, 7, 12, 16, 19, 24, 28],
  [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12],
  [0, 12, 24, 12, 0, 12, 24, 12, 0, 12, 24, 12, 0, 12, 24, 12],
  [0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3],
  [0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4]
];
function hmnPlayExtras(core, chn, xc) {
  const ins = core.module.instruments[xc.ins];
  const ie = ins.extras;
  const ce = xc.extras;
  if (!ie || !ce || !("datapos" in ce)) return;
  if (core.ctx.p.frame === 0 && (TEST(xc, VolSlideFlag.NEW_NOTE) !== 0 || TEST(xc, VolSlideFlag.NEW_INS) !== 0)) {
    ce.datapos = 0;
  }
  const pos = ce.datapos & 63;
  const waveform = ie.data[pos] ?? 0;
  const volume = (ie.progvolume[pos] ?? 0) & 127;
  if (waveform < ins.nsm && ins.sub[waveform].sid !== xc.smp) {
    xc.smp = ins.sub[waveform].sid;
    core.virt.setSmp(chn, xc.smp);
  }
  let next = pos + 1;
  if (next > ie.dataloopend) next = ie.dataloopstart;
  ce.datapos = next;
  ce.volume = volume;
}
function fltTickEnvelope(ce, target, rate, nextStage) {
  let x;
  if (target > ce.volume) {
    x = ce.volume + rate;
    if (x > target) x = target;
  } else {
    x = ce.volume - rate;
    if (x < target) x = target;
  }
  ce.volume = x;
  if (x === target) {
    ce.env_stage = nextStage;
  }
}
function fltPlayExtras(core, chn, xc) {
  const mod = core.module;
  const ins = mod.instruments[xc.ins];
  const ie = ins.extras;
  const ce = xc.extras;
  if (!ie || !ce || !("env_stage" in ce)) return;
  if (core.ctx.p.frame === 0) {
    if (TEST(xc, VolSlideFlag.NEW_NOTE) !== 0 && TEST(xc, VolSlideFlag.TONEPORTA) === 0) {
      ce.volume = ie.l0;
      ce.sustain = ie.st;
      ce.env_stage = FltEnvStage.ATTACK_1;
    } else if (TEST(xc, VolSlideFlag.NEW_INS) !== 0) {
      ce.volume = 0;
      ce.env_stage = FltEnvStage.RELEASE;
    } else if (TEST(xc, VolSlideFlag.NEW_NOTE) !== 0 && TEST(xc, VolSlideFlag.TONEPORTA) !== 0) {
      xc.porta.target /= 1 << ie.fq;
      xc.porta.dir = xc.period < xc.porta.target ? 1 : -1;
    }
  }
  switch (ce.env_stage) {
    case FltEnvStage.ATTACK_1:
      fltTickEnvelope(ce, ie.a1l, ie.a1s, FltEnvStage.ATTACK_2);
      break;
    case FltEnvStage.ATTACK_2:
      fltTickEnvelope(ce, ie.a2l, ie.a2s, FltEnvStage.DECAY);
      break;
    case FltEnvStage.DECAY:
      fltTickEnvelope(ce, ie.sl, ie.ds, FltEnvStage.SUSTAIN);
      break;
    case FltEnvStage.SUSTAIN:
      if (ce.sustain > 0) {
        ce.sustain--;
      } else {
        ce.env_stage = FltEnvStage.RELEASE;
      }
      break;
    case FltEnvStage.RELEASE:
      fltTickEnvelope(ce, 0, ie.rs, FltEnvStage.RELEASE);
      break;
  }
  xc.period += ie.p_fall;
  void chn;
}
function playExtras(core, chn, xc) {
  const mod = core.module;
  if (mod.extras?.kind === "flt" && xc.extras && "env_stage" in xc.extras) {
    fltPlayExtras(core, chn, xc);
    return;
  }
  if (xc.ins >= mod.ins) return;
  const ie = mod.instruments[xc.ins]?.extras;
  if (ie && "volTable" in ie) {
    medPlayExtras(core, chn, xc);
  } else if (ie && "progvolume" in ie) {
    hmnPlayExtras(core, chn, xc);
  }
}
function extrasGetVolume(core, xc) {
  const mod = core.module;
  if (xc.ins < 0 || xc.ins >= mod.ins) return xc.volume;
  const ie = mod.instruments[xc.ins]?.extras;
  const ce = xc.extras;
  if (!ie || !ce) return xc.volume;
  if ("progvolume" in ie && "datapos" in ce) {
    return Math.trunc(ce.volume * xc.volume / 64);
  }
  if ("volTable" in ie && "hold_count" in ce) {
    return Math.trunc(ce.volume * xc.volume / 64);
  }
  if ("env_stage" in ce) {
    return Math.trunc(ce.volume / 4);
  }
  return xc.volume;
}
function extrasGetPeriod(xc) {
  const ce = xc.extras;
  if (ce && "hold_count" in ce) return medChangePeriod(xc);
  return 0;
}
function extrasGetLinearBend(core, xc) {
  const ce = xc.extras;
  if (ce && "hold_count" in ce) return medLinearBend(core, xc);
  return 0;
}
function extrasProcessFx(xc, fxt, fxp, note, ins) {
  const ce = xc.extras;
  if (ce && "hold_count" in ce) {
    switch (fxt) {
      case fx_exports.FX_MED_HOLD:
        if (note - 1 >= 0 && note - 1 < 121 && ins - 1 >= 0) {
          medSetHoldDecay(xc, fxp & 15, fxp >> 4 & 15);
        }
        break;
    }
  }
}
function hmnProcessFx(xc, fxt, fxp) {
  if (fxt === fx_exports.FX_MEGAARP) {
    const idx = fxp & 15;
    const table = MEGAARP[idx];
    for (let i = 0; i < 16; i++) xc.arpeggio.val[i] = table[i];
    xc.arpeggio.size = 16;
  }
}
var MED_SINE = [
  0,
  49,
  97,
  141,
  180,
  212,
  235,
  250,
  255,
  250,
  235,
  212,
  180,
  141,
  97,
  49,
  0,
  -49,
  -97,
  -141,
  -180,
  -212,
  -235,
  -250,
  -255,
  -250,
  -235,
  -212,
  -180,
  -141,
  -97,
  -49
];
function vt(ce, ie) {
  if (ce.vp >= 0 && ie.volTable && ce.vp < ie.vtlen) {
    return ie.volTable[ce.vp++];
  }
  ce.vp++;
  return 255;
}
function wt(ce, ie) {
  if (ce.wp >= 0 && ie.wavTable && ce.wp < ie.wtlen) {
    return ie.wavTable[ce.wp++];
  }
  ce.wp++;
  return 255;
}
function medArp(ie, idx) {
  return ie.wavTable && idx < ie.wtlen ? ie.wavTable[idx] : 253;
}
function medChangePeriod(xc) {
  const ce = xc.extras;
  if (!ce) return 0;
  const vib = Math.trunc(MED_SINE[ce.vib_idx >> 5 & 31] * ce.vib_depth / (1 << 10));
  ce.vib_idx = (ce.vib_idx + ce.vib_speed) % (32 << 5);
  return vib;
}
function medLinearBend(core, xc) {
  const mod = core.module;
  const ce = xc.extras;
  const ie = mod.instruments[xc.ins]?.extras;
  if (!ce || ce.arp === 0 || !ie) return 0;
  if (medArp(ie, ce.arp) === 253) return 0;
  let arp = medArp(ie, ce.aidx);
  if (arp === 253) {
    ce.aidx = ce.arp;
    arp = medArp(ie, ce.aidx);
  }
  ce.aidx++;
  return (100 << 7) * arp;
}
function medSetHoldDecay(xc, hold, decay) {
  const ce = xc.extras;
  if (!ce) return;
  if (hold <= 0) {
    hold = -1;
    decay = -1;
  }
  ce.hold_active = hold > 0 ? 1 : 0;
  ce.hold_count = hold;
  ce.decay_value = decay;
}
function medHoldRetrigger(core, xc) {
  const mod = core.module;
  const ce = xc.extras;
  if (!ce) return;
  const trackerVersion = mod.extras?.kind === "med" ? mod.extras.trackerVersion : 0;
  if (trackerVersion >= MED_VER_OCTAMED_300 && ce.hold_active) {
    ce.hold_count += core.ctx.p.frame;
  }
}
function medGetNextEvent(core, chn) {
  const p = core.ctx.p;
  const mod = core.module;
  const pat = mod.xxo[p.ord] ?? 0;
  const track = mod.patterns[pat]?.tracks[chn];
  if (!track) return null;
  if (p.row + 1 >= track.rows) return null;
  return track.event[p.row + 1] ?? null;
}
function medCheckHoldSymbol(core, xc, chn) {
  const mod = core.module;
  const ce = xc.extras;
  if (!ce) return;
  ce.hold_sustained = 0;
  const trackerVersion = mod.extras?.kind === "med" ? mod.extras.trackerVersion : 0;
  if (trackerVersion < MED_VER_300) return;
  if (ce.hold_count <= 0) return;
  const e = medGetNextEvent(core, chn);
  if (e === null) return;
  if (!isValidNoteNext(e.note) && e.ins !== 0) {
    ce.hold_sustained = 1;
    return;
  }
  if (isValidNoteNext(e.note) && (e.fxt === fx_exports.FX_TONEPORTA || e.f2t === fx_exports.FX_TONEPORTA)) {
    ce.hold_sustained = 1;
  }
}
function isValidNoteNext(note) {
  return note - 1 >= 0 && note - 1 < 121;
}
function medTickHoldDecay(core, xc, ce, trackerVersion) {
  const p = core.ctx.p;
  if (ce.hold_count === 0) {
    const dec = ce.decay_value ? ce.decay_value : xc.volume;
    xc.volume -= dec;
    if (xc.volume < 0) xc.volume = 0;
    if (xc.volume > core.module.volbase) xc.volume = core.module.volbase;
    if (xc.volume === 0) {
      ce.hold_count = -1;
      ce.decay_value = -1;
    }
    ce.hold_active = 0;
  }
  if (ce.hold_sustained && trackerVersion < MED_VER_OCTAMED_SS_2 && p.frame >= p.speed) {
    ce.hold_sustained = 0;
  }
  if (ce.hold_count > 0 && !ce.hold_sustained) {
    ce.hold_count--;
  }
}
function medPlayExtras(core, chn, xc) {
  const mod = core.module;
  const p = core.ctx.p;
  const ce = xc.extras;
  if (!ce) return;
  const ie = mod.instruments[xc.ins]?.extras;
  const trackerVersion = mod.extras?.kind === "med" ? mod.extras.trackerVersion : 0;
  medTickHoldDecay(core, xc, ce, trackerVersion);
  if (!ie || !ie.volTable || !ie.wavTable) {
    ce.volume = 64;
    return;
  }
  if (p.frame === 0 && TEST(xc, VolSlideFlag.NEW_NOTE) !== 0) {
    ce.period = xc.period;
    if (TEST(xc, VolSlideFlag.NEW_INS) !== 0) {
      ce.arp = 0;
      ce.aidx = 0;
      ce.vp = 0;
      ce.vc = 0;
      ce.vw = 0;
      ce.wp = 0;
      ce.wc = 0;
      ce.ww = 0;
      ce.env_wav = -1;
      ce.env_idx = 0;
      ce.flags &= ~MED_SYNTH_ENV_LOOP;
      ce.vv = 0;
      ce.wv = 0;
      ce.vs = ie.vts;
      ce.ws = ie.wts;
    }
  }
  let jws = 0;
  let jvs = 0;
  if (ce.vs > 0 && ce.vc-- === 0) {
    ce.vc = ce.vs - 1;
    if (ce.vw > 0) {
      ce.vw--;
    } else {
      let loop = 0;
      nextVt: for (; ; ) {
        const b = vt(ce, ie);
        switch (b) {
          case 255:
          // END
          case 251:
            ce.vp--;
            break nextVt;
          case 254: {
            if (loop) break nextVt;
            const temp = vt(ce, ie);
            ce.vp = temp;
            loop = 1;
            continue nextVt;
          }
          case 250:
            jws = vt(ce, ie);
            break nextVt;
          case 245:
            ce.env_wav = vt(ce, ie);
            ce.flags |= MED_SYNTH_ENV_LOOP;
            break nextVt;
          case 244:
            ce.env_wav = vt(ce, ie);
            break nextVt;
          case 243:
            ce.vv = vt(ce, ie);
            break nextVt;
          case 242:
            ce.vv = -vt(ce, ie);
            break nextVt;
          case 241:
            ce.vw = vt(ce, ie);
            break nextVt;
          case 240:
            ce.vs = vt(ce, ie);
            break nextVt;
          default:
            if (b >= 0 && b <= 64) ce.volume = b;
            break nextVt;
        }
      }
      if (ce.env_wav >= 0 && ce.env_wav < mod.instruments[xc.ins].nsm) {
        const sid = mod.instruments[xc.ins].sub[ce.env_wav].sid;
        const smp = core.getSample(sid);
        if (smp.length === 128) {
          const b = smp.data[ce.env_idx];
          const signed = b >= 0.5 ? b * 128 - 128 : b < -0.5 ? b * 128 : b * 128;
          const v = (Math.round(b * 128) | (Math.round(b * 128) & 128 ? -256 : 0)) + 128 >> 2;
          void signed;
          ce.volume = v;
          ce.env_idx++;
          if (ce.env_idx >= 128) {
            if ((ce.flags & MED_SYNTH_ENV_LOOP) === 0) {
              ce.env_wav = -1;
            }
            ce.env_idx = 0;
          }
        }
      }
      ce.volume += ce.vv;
      if (ce.volume < 0) ce.volume = 0;
      if (ce.volume > 64) ce.volume = 64;
    }
  }
  if (ce.ws > 0 && ce.wc-- === 0) {
    ce.wc = ce.ws - 1;
    if (ce.ww > 0) {
      ce.ww--;
    } else {
      let loop = 0;
      nextWt: for (; ; ) {
        const b = wt(ce, ie);
        switch (b) {
          case 255:
          // END
          case 251:
            ce.wp--;
            break nextWt;
          case 254: {
            if (loop) break nextWt;
            const temp = wt(ce, ie);
            if (temp === 255) {
              ce.wp--;
              break nextWt;
            }
            ce.wp = temp;
            loop = 1;
            continue nextWt;
          }
          case 253:
            break nextWt;
          case 252: {
            ce.arp = ce.aidx = ce.wp++;
            let bb = b;
            while (bb !== 253 && bb !== 255) bb = wt(ce, ie);
            break nextWt;
          }
          case 250:
            jvs = wt(ce, ie);
            break nextWt;
          case 247:
            ce.vwf = wt(ce, ie);
            break nextWt;
          case 246:
            xc.period = ce.period;
            break nextWt;
          case 245:
            ce.vib_speed = wt(ce, ie);
            break nextWt;
          case 244:
            ce.vib_depth = wt(ce, ie);
            break nextWt;
          case 243:
            ce.wv = -wt(ce, ie);
            break nextWt;
          case 242:
            ce.wv = wt(ce, ie);
            break nextWt;
          case 241:
            ce.ww = wt(ce, ie);
            break nextWt;
          case 240:
            ce.ws = wt(ce, ie);
            break nextWt;
          default: {
            const ins = mod.instruments[xc.ins];
            if (b < ins.nsm && ins.sub[b].sid !== xc.smp) {
              xc.smp = ins.sub[b].sid;
              core.virt.setSmp(chn, xc.smp);
            }
            break nextWt;
          }
        }
      }
      xc.period += ce.wv;
    }
  }
  if (jws) {
    ce.wp = jws;
  }
  if (jvs) {
    ce.vp = jvs;
  }
}

// ../../packages/core/src/effects/process.ts
var PERIOD_BASE3 = 13696;
var NOTE_GLISSANDO_BIT = 1 << 9;
function processFx(core, xc, chn, ev, fnum, hooks = {}) {
  const mod = core.module;
  if (mod.readEventType !== 3) {
    xc.key_porta = xc.key;
  }
  const note = ev.note;
  let fxt;
  let fxp;
  if (fnum === 0) {
    fxt = ev.fxt;
    fxp = ev.fxp;
  } else {
    fxt = ev.f2t;
    fxp = ev.f2p;
  }
  switch (fxt) {
    case fx_exports.FX_ARPEGGIO:
      if (!hasQuirk(core, Quirk.ARPMEM) || fxp !== 0) {
        xc.arpeggio.val[0] = 0;
        xc.arpeggio.val[1] = MSN2(fxp);
        xc.arpeggio.val[2] = LSN2(fxp);
        xc.arpeggio.size = 3;
      }
      break;
    case fx_exports.FX_S3M_ARPEGGIO:
      if (fxp === 0) {
        fxp = hasQuirk(core, Quirk.ST3BUGS) ? xc.vol.memory : xc.arpeggio.memory;
      } else if (hasQuirk(core, Quirk.ST3BUGS)) {
        xc.vol.memory = fxp;
        xc.arpeggio.memory = fxp;
      } else {
        xc.arpeggio.memory = fxp;
      }
      if (!hasQuirk(core, Quirk.ARPMEM) || fxp !== 0) {
        xc.arpeggio.val[0] = 0;
        xc.arpeggio.val[1] = MSN2(fxp);
        xc.arpeggio.val[2] = LSN2(fxp);
        xc.arpeggio.size = 3;
      }
      break;
    case fx_exports.FX_OKT_ARP3:
      if (fxp !== 0) {
        xc.arpeggio.val[0] = -MSN2(fxp);
        xc.arpeggio.val[1] = 0;
        xc.arpeggio.val[2] = LSN2(fxp);
        xc.arpeggio.size = 3;
      }
      break;
    case fx_exports.FX_OKT_ARP4:
      if (fxp !== 0) {
        xc.arpeggio.val[0] = 0;
        xc.arpeggio.val[1] = LSN2(fxp);
        xc.arpeggio.val[2] = 0;
        xc.arpeggio.val[3] = -MSN2(fxp);
        xc.arpeggio.size = 4;
      }
      break;
    case fx_exports.FX_OKT_ARP5:
      if (fxp !== 0) {
        xc.arpeggio.val[0] = LSN2(fxp);
        xc.arpeggio.val[1] = LSN2(fxp);
        xc.arpeggio.val[2] = 0;
        xc.arpeggio.size = 3;
      }
      break;
    case fx_exports.FX_PORTA_UP:
      processPortaUp(core, xc, fxp, fnum);
      break;
    case fx_exports.FX_PORTA_DN:
      processPortaDn(core, xc, fxp, fnum);
      break;
    case fx_exports.FX_TONEPORTA:
      toneportaShared(core, xc, fxp, note);
      break;
    case fx_exports.FX_VIBRATO:
      vibratoShared(core, xc, fxp, false);
      break;
    case fx_exports.FX_FINE_VIBRATO:
      vibratoShared(core, xc, fxp, true);
      break;
    case fx_exports.FX_TREMOLO:
      tremoloShared(core, xc, fxp);
      break;
    case fx_exports.FX_OFFSET: {
      let val = fxp;
      if (hasQuirk(core, Quirk.FT2BUGS)) {
        val = val ? val : xc.offset.memory;
      } else if (val === 0) {
        val = xc.offset.memory;
      } else {
        xc.offset.memory = val;
      }
      SET(xc, VolSlideFlag.OFFSET);
      if (note) {
        xc.offset.val &= ~65535;
        xc.offset.val |= val << 8;
        xc.offset.val2 = val << 8;
      }
      if (ev.ins) {
        xc.offset.val2 = val << 8;
      }
      break;
    }
    case fx_exports.FX_XF_PORTA: {
      const h = MSN2(fxp);
      let fp = fxp & 15;
      switch (h) {
        case 1:
          if (fp === 0) {
            fp = xc.fine_porta.xf_up_memory;
          } else {
            xc.fine_porta.xf_up_memory = fp;
          }
          fxXfPortaUp(core, xc, fp);
          break;
        case 2:
          if (fp === 0) {
            fp = xc.fine_porta.xf_down_memory;
          } else {
            xc.fine_porta.xf_down_memory = fp;
          }
          fxXfPortaDn(core, xc, fp);
          break;
      }
      break;
    }
    default:
      processRest(core, xc, chn, ev, fnum, fxt, fxp, note, hooks);
      break;
  }
}
function processPortaUp(core, xc, fxpIn, fnum) {
  let fxp = fxpIn;
  if (fxp === 0) {
    fxp = xc.freq.memory;
  } else {
    xc.freq.memory = fxp;
  }
  if (hasQuirk(core, Quirk.FINEFX) && (fnum === 0 || !hasQuirk(core, Quirk.ITPOR))) {
    switch (MSN2(fxp)) {
      case 15:
        fxFPortaUp(core, xc, fxp & 15);
        return;
      case 14:
        fxXfPortaUp(core, xc, fxp & 15);
        return;
    }
  }
  if (fxp !== 0) {
    SET(xc, VolSlideFlag.PITCHBEND);
    xc.freq.slide = -fxp;
    if (hasQuirk(core, Quirk.UNISLD)) xc.porta.memory = fxp;
  }
}
function processPortaDn(core, xc, fxpIn, fnum) {
  let fxp = fxpIn;
  if (hasQuirk(core, Quirk.FT2BUGS)) {
    if (fxp === 0) fxp = xc.freq.down_memory;
    else xc.freq.down_memory = fxp;
  } else {
    if (fxp === 0) fxp = xc.freq.memory;
    else xc.freq.memory = fxp;
  }
  if (hasQuirk(core, Quirk.FINEFX) && (fnum === 0 || !hasQuirk(core, Quirk.ITPOR))) {
    switch (MSN2(fxp)) {
      case 15:
        fxFPortaDn(core, xc, fxp & 15);
        return;
      case 14:
        fxXfPortaDn(core, xc, fxp & 15);
        return;
    }
  }
  if (fxp !== 0) {
    SET(xc, VolSlideFlag.PITCHBEND);
    xc.freq.slide = fxp;
    if (hasQuirk(core, Quirk.UNISLD)) xc.porta.memory = fxp;
  }
}
function toneportaShared(core, xc, fxpIn, note) {
  let fxp = fxpIn;
  if (fxp === 0) {
    fxp = xc.porta.memory;
  } else {
    xc.porta.memory = fxp;
  }
  if (hasQuirk(core, Quirk.ST3BUGS) && fxp !== 0) {
    xc.vol.memory = fxp;
  }
  if (fxp !== 0) {
    if (hasQuirk(core, Quirk.UNISLD)) xc.freq.memory = fxp;
    xc.porta.slide += fxp;
  }
  if (hasQuirk(core, Quirk.IGSTPOR)) {
    if (note === 0 && xc.porta.dir === 0) return;
  }
  if (!(xc.ins >= 0 && xc.ins < core.module.instruments.length)) return;
  doToneportaCore(core, xc, note);
  SET(xc, VolSlideFlag.TONEPORTA);
}
function vibratoShared(core, xc, fxpIn, fine) {
  let fxp = fxpIn;
  if (fxp === 0) {
    fxp = xc.vibrato.memory;
  } else {
    xc.vibrato.memory = fxp;
  }
  if (hasQuirk(core, Quirk.ST3BUGS) && fxp !== 0) {
    xc.vol.memory = fxp;
  }
  SET(xc, VolSlideFlag.VIBRATO);
  setLfoNotzero(
    xc.vibrato.lfo,
    fine ? LSN2(fxp) : LSN2(fxp) << 2,
    MSN2(fxp)
  );
}
function tremoloShared(core, xc, fxpIn) {
  let fxp = fxpIn;
  if (fxp === 0) {
    fxp = hasQuirk(core, Quirk.ST3BUGS) ? xc.vol.memory : xc.tremolo.memory;
  } else if (hasQuirk(core, Quirk.ST3BUGS)) {
    xc.vol.memory = fxp;
    xc.tremolo.memory = fxp;
  } else {
    xc.tremolo.memory = fxp;
  }
  SET(xc, VolSlideFlag.TREMOLO);
  setLfoNotzero(xc.tremolo.lfo, LSN2(fxp), MSN2(fxp));
}
function processRest(core, xc, chn, ev, _fnum, fxt, fxpIn, note, hooks) {
  const mod = core.module;
  let fxp = fxpIn;
  switch (fxt) {
    /* Dual effects. C (effects.c:257-267):
     *   Lxy TONE_VSLIDE: EFFECT_MEMORY_GET(porta.memory); porta.slide += l;
     *     do_toneporta; SET(TONEPORTA); goto fx_volslide (full fxp).
     *   6xy VIBRA_VSLIDE: SET(VIBRATO) only — no LFO update, no memory —
     *     then goto fx_volslide (full fxp).
     * The volslide label runs the shared FX_VOLSLIDE body with the whole
     * parameter (both nibbles: x = up, y = down). */
    case fx_exports.FX_TONE_VSLIDE: {
      const l = hasQuirk(core, Quirk.ST3BUGS) ? xc.vol.memory : xc.porta.memory;
      xc.porta.slide += l;
      if (xc.ins >= 0 && xc.ins < mod.instruments.length) {
        doToneportaCore(core, xc, note);
        SET(xc, VolSlideFlag.TONEPORTA);
      }
      fxVolSlide(core, xc, fxp);
      break;
    }
    case fx_exports.FX_VIBRA_VSLIDE:
      SET(xc, VolSlideFlag.VIBRATO);
      fxVolSlide(core, xc, fxp);
      break;
    case fx_exports.FX_VOLSLIDE:
      fxVolSlide(core, xc, fxp);
      break;
    /* OpenMPT VolColMemory.it: a/b/c/d share one memory NOT shared with Dxy.
     * effects.c:560-577: all four _2 arms write EFFECT_MEMORY(fxp, xc->vol.memory2).
     * FX_VOLSLIDE_2 (XM 6xy/7xy) is the no-memory variant (effects.c:368-374). */
    case fx_exports.FX_VOLSLIDE_2:
      if (fxp !== 0) {
        SET(xc, VolSlideFlag.VOL_SLIDE_2);
        xc.vol.slide2 = MSN2(fxp) ? MSN2(fxp) : -LSN2(fxp);
      }
      break;
    case fx_exports.FX_F_VSLIDE_UP_2:
      if (fxp !== 0) {
        xc.vol.memory2 = fxp;
        SET(xc, VolSlideFlag.FINE_VOLS_2);
        xc.vol.fslide2 = fxp;
      }
      break;
    case fx_exports.FX_F_VSLIDE_DN_2:
      if (fxp !== 0) {
        xc.vol.memory2 = fxp;
        SET(xc, VolSlideFlag.FINE_VOLS_2);
        xc.vol.fslide2 = -fxp;
      }
      break;
    case fx_exports.FX_VSLIDE_UP_2:
      if (fxp !== 0) {
        xc.vol.memory2 = fxp;
        SET(xc, VolSlideFlag.VOL_SLIDE_2);
        xc.vol.slide2 = fxp;
      }
      break;
    case fx_exports.FX_VSLIDE_DN_2:
      if (fxp !== 0) {
        xc.vol.memory2 = fxp;
        SET(xc, VolSlideFlag.VOL_SLIDE_2);
        xc.vol.slide2 = -fxp;
      }
      break;
    case fx_exports.FX_JUMP:
      hooks.patternJump ? hooks.patternJump(core, fxp) : flowPatternJump(mod, core.ctx.p.flow, fxp);
      break;
    case fx_exports.FX_VOLSET:
      fxVolSet(core, xc, fxp);
      break;
    case fx_exports.FX_TRK_VOL:
      if (fxp <= mod.volbase) {
        xc.mastervol = fxp;
      }
      break;
    case fx_exports.FX_TRK_VSLIDE:
      fxTrkVSlide(core, xc, fxp);
      break;
    case fx_exports.FX_TRK_FVSLIDE:
      fxTrkFVSlide(xc, fxp);
      break;
    case fx_exports.FX_BREAK:
      hooks.patternBreak ? hooks.patternBreak(core, 10 * MSN2(fxp) + LSN2(fxp)) : flowPatternBreak(mod, core.ctx.p.flow, 10 * MSN2(fxp) + LSN2(fxp));
      break;
    case fx_exports.FX_EXTENDED:
      extendedFx(core, xc, chn, ev, fxp, note, hooks);
      break;
    case fx_exports.FX_S3M_SPEED:
      if (hasQuirk(core, Quirk.ST3BUGS)) {
        if (fxp === 0) fxp = xc.vol.memory;
        else xc.vol.memory = fxp;
      }
      fxS3mSpeed(core, fxp);
      break;
    case fx_exports.FX_S3M_BPM:
      fxS3mBpm(core, fxp);
      break;
    case fx_exports.FX_IT_BPM:
      fxItBpm(core, xc, fxp);
      break;
    case fx_exports.FX_IT_ROWDELAY:
      fxItRowDelay(core, fxp);
      break;
    case fx_exports.FX_SURROUND:
      fxSurround(xc, fxp);
      break;
    case fx_exports.FX_SPEED:
      speedArmImpl(core, fxp);
      break;
    case fx_exports.FX_ICE_SPEED:
      if (fxp !== 0) {
        if (LSN2(fxp) !== 0) {
          core.ctx.p.st26_speed = MSN2(fxp) << 8 | LSN2(fxp);
        } else {
          core.ctx.p.st26_speed = MSN2(fxp);
        }
      }
      break;
    case fx_exports.FX_SETPAN:
      if (!hasQuirk(core, Quirk.PROTRACK)) {
        setPanArmImpl(core, xc, fxp);
      }
      break;
    case fx_exports.FX_VOL_ADD:
      if (xc.ins < 0 || xc.ins >= (core.module?.ins ?? 0)) break;
      SET(xc, VolSlideFlag.NEW_VOL);
      xc.volume = (core.module?.instruments[xc.ins]?.sub[0]?.vol ?? 0) + fxp;
      if (xc.volume > mod.volbase) xc.volume = mod.volbase;
      break;
    case fx_exports.FX_VOL_SUB:
      if (xc.ins < 0 || xc.ins >= (core.module?.ins ?? 0)) break;
      SET(xc, VolSlideFlag.NEW_VOL);
      xc.volume = (core.module?.instruments[xc.ins]?.sub[0]?.vol ?? 0) - fxp;
      if (xc.volume < 0) xc.volume = 0;
      break;
    case fx_exports.FX_PITCH_ADD:
      SET_PER(xc, TONEPORTA);
      xc.porta.target = noteToPeriod(mod.periodType, note - 1, xc.finetune, 0) + fxp;
      xc.porta.slide = 2;
      xc.porta.dir = 1;
      break;
    case fx_exports.FX_PITCH_SUB:
      SET_PER(xc, TONEPORTA);
      xc.porta.target = noteToPeriod(mod.periodType, note - 1, xc.finetune, 0) - fxp;
      xc.porta.slide = 2;
      xc.porta.dir = -1;
      break;
    case fx_exports.FX_SPEED_CP:
      if (fxp !== 0) {
        core.ctx.p.speed = fxp;
        core.ctx.p.st26_speed = 0;
      }
      xc.per_flags = 0;
      break;
    case fx_exports.FX_PER_CANCEL:
      xc.per_flags = 0;
      break;
    /* 669 effects (effects.c:1063-1092) */
    case fx_exports.FX_669_PORTA_UP:
      SET_PER(xc, PITCHBEND);
      xc.freq.slide = 80 * fxp;
      xc.freq.memory = fxp;
      if (fxp === 0) RESET_PER(xc, PITCHBEND);
      break;
    case fx_exports.FX_669_PORTA_DN:
      SET_PER(xc, PITCHBEND);
      xc.freq.slide = -80 * fxp;
      xc.freq.memory = fxp;
      if (fxp === 0) RESET_PER(xc, PITCHBEND);
      break;
    case fx_exports.FX_669_TPORTA:
      if (xc.ins < 0 || xc.ins >= (core.module?.ins ?? 0)) break;
      SET_PER(xc, TONEPORTA);
      doToneporta(core, xc, note);
      xc.porta.slide = 40 * fxp;
      if (fxp === 0) RESET_PER(xc, TONEPORTA);
      break;
    case fx_exports.FX_669_FINETUNE:
      xc.finetune = 80 * ((fxp & 255) << 24 >> 24);
      break;
    case fx_exports.FX_669_VIBRATO:
      if (LSN2(fxp) !== 0) {
        lfoSetWaveform(xc.vibrato.lfo, 669);
        SET_PER(xc, VIBRATO);
      } else {
        RESET_PER(xc, VIBRATO);
      }
      setLfoNotzero(xc.vibrato.lfo, 669, 1);
      break;
    case fx_exports.FX_GLOBALVOL:
      fxGlobalVol(core, fxp);
      break;
    case fx_exports.FX_GVOL_SLIDE:
      fxGvolSlide(core, xc, fxp);
      break;
    case fx_exports.FX_KEYOFF:
      fxKeyoff(xc, fxp);
      break;
    case fx_exports.FX_ENVPOS:
      fxEnvPos(core, xc, fxp);
      break;
    case fx_exports.FX_IT_PANSLIDE:
      fxItPanSlide(xc, fxp);
      break;
    case fx_exports.FX_IT_INSTFUNC:
      switch (LSN2(fxp)) {
        case 0:
          core.virt.pastnote(chn, PastNote.CUT);
          break;
        case 1:
          core.virt.pastnote(chn, PastNote.OFF);
          break;
        case 2:
          core.virt.pastnote(chn, PastNote.FADE);
          break;
        case 3:
          core.virt.setNna(chn, 0);
          break;
        case 4:
          core.virt.setNna(chn, 1);
          break;
        case 5:
          core.virt.setNna(chn, 2);
          break;
        case 6:
          core.virt.setNna(chn, 3);
          break;
        case 7:
          SET(xc, VolSlideFlag.VENV_PAUSE);
          break;
        case 8:
          xc.per_flags &= ~VolSlideFlag.VENV_PAUSE;
          break;
        case 9:
          SET(xc, VolSlideFlag.PENV_PAUSE);
          break;
        case 10:
          xc.per_flags &= ~VolSlideFlag.PENV_PAUSE;
          break;
        case 11:
          SET(xc, VolSlideFlag.FENV_PAUSE);
          break;
        case 12:
          xc.per_flags &= ~VolSlideFlag.FENV_PAUSE;
          break;
      }
      break;
    case fx_exports.FX_PANSLIDE:
      fxPanSlide(core, xc, fxp, true);
      break;
    case fx_exports.FX_PANBRELLO:
      fxPanbrello(core, xc, fxp);
      break;
    case fx_exports.FX_PANBRELLO_WF:
      fxPanbrelloWf(xc, fxp);
      break;
    case fx_exports.FX_REVERSE: {
      const voc = core.virt.mapChannel(chn);
      if (voc >= 0) {
        const v = core.virt.voiceAt(voc);
        if (v.smp >= 0) {
          if (fxp === 1) {
            v.flags |= VoiceFlag.VOICE_REVERSE;
          } else {
            v.flags &= ~VoiceFlag.VOICE_REVERSE;
          }
        }
      }
      break;
    }
    case fx_exports.FX_HIOFFSET: {
      xc.offset.val = xc.offset.val & 65535 | fxp << 16;
      break;
    }
    case fx_exports.FX_IT_BREAK:
      hooks.patternBreak ? hooks.patternBreak(core, fxp) : flowPatternBreak(mod, core.ctx.p.flow, fxp);
      break;
    case fx_exports.FX_MULTI_RETRIG:
      fxMultiRetrig(core, xc, fxp, note);
      break;
    case fx_exports.FX_TREMOR:
      fxTremor(core, xc, fxp);
      break;
    case fx_exports.FX_MACRO_SET:
      xc.macro.active = LSN2(fxp);
      break;
    case fx_exports.FX_MACRO:
      SET(xc, VolSlideFlag.MIDI_MACRO);
      xc.macro.val = fxp;
      xc.macro.slide = 0;
      break;
    case fx_exports.FX_MACROSMOOTH:
      if (core.ctx.p.speed !== 0 && xc.macro.val < 128) {
        SET(xc, VolSlideFlag.MIDI_MACRO);
        xc.macro.target = fxp;
        xc.macro.slide = Math.fround(
          Math.fround(fxp - xc.macro.val) / core.ctx.p.speed
        );
      }
      break;
  }
}
function flowPatternJump(mod, f, ord) {
  if ((mod.flowMode & FlowFlag.LOOP_DELAY_JUMP) !== 0 && f.loop_dest >= 0) return;
  f.pbreak = 1;
  f.jump = ord;
  if ((mod.flowMode & FlowFlag.JUMP_NO_ROW_SET) === 0) f.jumpline = 0;
}
function flowPatternBreak(mod, f, row) {
  if ((mod.flowMode & FlowFlag.LOOP_DELAY_BREAK) !== 0 && f.loop_dest >= 0) return;
  f.pbreak = 1;
  f.jumpline = row;
}
function flowPatternLoop(core, chn, row, fxp) {
  const anyCore = core;
  if (typeof anyCore.applyPatternLoop === "function") {
    anyCore.applyPatternLoop.call(core, chn, row, fxp);
    return;
  }
  const f = core.ctx.p.flow;
  const lt = f.loop[chn];
  if (!lt) return;
  if (fxp === 0) {
    lt.start = row;
    lt.count = -1;
  } else if (lt.count === -1 || lt.count > 0) {
    lt.count = lt.count === -1 ? fxp : lt.count - 1;
    if (lt.count > 0) f.loop_dest = lt.start;
  }
}
function flowPattDelay(core, fxp) {
  const f = core.ctx.p.flow;
  if (core.module.readEventType !== 2 || !f.delay) {
    f.delay = fxp;
  }
}
function speedArmImpl(core, fxp) {
  const vblank = (core.ctx.p.flags & PlayerFlag.VBLANK) !== 0;
  if (hasQuirk(core, Quirk.NOBPM) || vblank || fxp < 32) {
    s3mSpeedShared2(core, fxp);
    return;
  }
  s3mBpmShared2(core, fxp);
}
function s3mSpeedShared2(core, fxp) {
  if (fxp) core.ctx.p.speed = fxp;
}
function s3mBpmShared2(core, fxpIn) {
  let fxp = fxpIn;
  const minBpm = Math.trunc(0.5 + (core.module.time_factor ?? 10) * XMP_MIN_BPM2 / 10);
  if (fxp < minBpm) fxp = minBpm;
  core.ctx.p.bpm = fxp;
}
function setPanArmImpl(_core, xc, fxp) {
  fxSetPan(xc, fxp);
}
function doToneportaCore(core, xc, note) {
  const mod = core.module;
  const instrument = mod.instruments[xc.ins];
  if (!instrument) return;
  let mappedXpo = 0;
  let mapped = 0;
  if (xc.key >= 0 && xc.key <= 119) {
    mapped = instrument.map[xc.key] ?? 0;
  }
  if (mapped >= instrument.nsm) mapped = 0;
  const sub = instrument.sub[mapped];
  if (isValidNoteRange(note - 1) && xc.ins < mod.instruments.length) {
    const n = note - 1;
    if (isValidNoteRange(xc.key_porta)) {
      mappedXpo = instrument.mapXpo[xc.key_porta] ?? 0;
    }
    xc.porta.target = noteToPeriodMod(mod.periodType, n + (sub?.xpo ?? 0) + mappedXpo, xc.finetune, xc.per_adj);
  }
  xc.porta.dir = xc.period < xc.porta.target ? 1 : -1;
}
function isValidNoteRange(n) {
  return n >>> 0 < 121;
}
function noteToPeriodMod(periodType, n, f, adj) {
  const d = n + f / 128;
  switch (periodType) {
    case 2:
      return (240 - d) * 16;
    case 3:
      return 8363 * Math.pow(2, n / 12) / 32 + f;
    default:
      return PERIOD_BASE3 / Math.pow(2, d / 12) * (adj > 0.1 ? adj : 1);
  }
}
function extendedFx(core, xc, chn, ev, fxpRaw, note, hooks) {
  let fxp = fxpRaw;
  if (hasQuirk(core, Quirk.ST3BUGS)) {
    if (fxp === 0) {
      fxp = xc.vol.memory;
    } else {
      xc.vol.memory = fxp;
    }
  }
  const fxt = fxp >> 4;
  fxp &= 15;
  switch (fxt) {
    case fx_exports.EX_FILTER:
      exFilterAmiga(core, fxp);
      break;
    case fx_exports.EX_F_PORTA_UP:
      if (fxp === 0) fxp = xc.fine_porta.up_memory;
      else xc.fine_porta.up_memory = fxp;
      fxFPortaUp(core, xc, fxp);
      break;
    case fx_exports.EX_F_PORTA_DN:
      if (fxp === 0) fxp = xc.fine_porta.down_memory;
      else xc.fine_porta.down_memory = fxp;
      fxFPortaDn(core, xc, fxp);
      break;
    case fx_exports.EX_GLISS:
      if (fxp) xc.note_flags |= NOTE_GLISSANDO_BIT;
      else xc.note_flags &= ~NOTE_GLISSANDO_BIT;
      break;
    case fx_exports.EX_VIBRATO_WF:
      lfoSetWaveform(xc.vibrato.lfo, fxp & 3);
      break;
    case fx_exports.EX_FINETUNE:
      if (!hasQuirk(core, Quirk.FT2BUGS) || note > 0) {
        const v = fxp << 4 & 255;
        xc.finetune = v >= 128 ? v - 256 : v;
      }
      break;
    case fx_exports.EX_PATTERN_LOOP:
      if (hooks.patternLoop) {
        hooks.patternLoop(core, chn, core.ctx.p.row, fxp);
      } else {
        flowPatternLoop(core, chn, core.ctx.p.row, fxp);
      }
      break;
    case fx_exports.EX_TREMOLO_WF:
      lfoSetWaveform(xc.tremolo.lfo, fxp & 3);
      break;
    case fx_exports.EX_SETPAN:
      setPanArmImpl(core, xc, fxp << 4);
      break;
    case fx_exports.EX_RETRIG:
      exRetrig(core, xc, fxp);
      break;
    case fx_exports.EX_F_VSLIDE_UP:
      if (fxp === 0) fxp = xc.fine_vol.up_memory;
      else xc.fine_vol.up_memory = fxp;
      fvslideUpShared(core, xc, fxp);
      break;
    case fx_exports.EX_F_VSLIDE_DN:
      if (fxp === 0) fxp = xc.fine_vol.down_memory;
      else xc.fine_vol.down_memory = fxp;
      fvslideDnShared(core, xc, fxp);
      break;
    case fx_exports.EX_CUT:
      exCut(xc, fxp);
      break;
    case fx_exports.EX_DELAY:
      break;
    case fx_exports.EX_PATT_DELAY:
      if (hooks.pattDelay) {
        hooks.pattDelay(core, xc, fxp);
      } else {
        flowPattDelay(core, fxp);
      }
      break;
    case fx_exports.EX_INVLOOP:
      xc.invloop.speed = fxp;
      break;
  }
  if (core.module.extras?.kind === "hmn") {
    hmnProcessFx(xc, fxt, fxp);
  }
  if (core.module.extras?.kind === "med") {
    extrasProcessFx(xc, fxt, fxp, note, ev.ins);
  }
  void ev;
}
function exFilterAmiga(core, fxp) {
  const mod = core.module;
  if (mod.readEventType === 0 && mod.periodType === 1) {
    core.ctx.p.filter = fxp & 1 ? 0 : 1;
  }
}

// ../../packages/core/src/effects/midi-macro.ts
var CLAMP = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
function midiNibble(core, xc, chn, midiStr, inSt) {
  if (inSt.buffer >= 0) {
    const val = inSt.buffer;
    inSt.buffer = -1;
    return val;
  }
  while (midiStr.charCodeAt(inSt.pos) !== 0 && inSt.pos < midiStr.length) {
    const val = midiStr.charCodeAt(inSt.pos);
    inSt.pos++;
    if (val >= 48 && val <= 57) return val - 48;
    if (val >= 65 && val <= 70) return val - 65 + 10;
    let byte = -1;
    switch (val) {
      case 122:
        byte = inSt.param;
        break;
      case 110:
        byte = xc.key & 127;
        break;
      case 104:
        byte = chn;
        break;
      case 111:
        byte = xc.offset.memory;
        break;
      case 109: {
        const voc = core.virt.mapChannel(chn);
        byte = voc >= 0 && (core.virt.voices[voc].flags & VoiceFlag.VOICE_REVERSE) !== 0 ? 1 : 0;
        break;
      }
      case 118: {
        const xxi = core.module.instruments[xc.ins];
        const vol = xxi ? xxi.volume : 64;
        byte = (core.ctx.p.gvol >>> 0) * (xc.volume >>> 0) * (xc.mastervol >>> 0) * (xc.gvl >>> 0) * (vol >>> 0) >>> 24;
        byte = CLAMP(byte, 1, 127);
        break;
      }
      case 117:
        byte = CLAMP(xc.macro.finalvol >> 3, 1, 127);
        break;
      case 120:
        byte = CLAMP(xc.macro.notepan >> 1, 0, 127);
        break;
      case 121:
        byte = CLAMP(xc.info_finalpan >> 1, 0, 127);
        break;
      case 97:
      // 'a' — Ins MIDI Bank hi
      case 98:
      // 'b' — Ins MIDI Bank lo
      case 112:
      // 'p' — Ins MIDI Program
      case 115:
        byte = 0;
        break;
      case 99:
        return 0;
    }
    if (byte >= 0) {
      inSt.buffer = byte & 15;
      return byte >> 4 & 15;
    }
  }
  return -1;
}
function midiByte(core, xc, chn, midiStr, inSt) {
  const a = midiNibble(core, xc, chn, midiStr, inSt);
  const b = midiNibble(core, xc, chn, midiStr, inSt);
  return a >= 0 && b >= 0 ? a << 4 | b : -1;
}
function applyMidiMacroEffect(xc, type, val) {
  switch (type) {
    case 0:
      xc.filter.cutoff = val << 1;
      break;
    case 1:
      xc.filter.resonance = val << 1;
      break;
  }
}
function executeMidiMacro(core, xc, chn, data, param) {
  let end = 0;
  while (end < 32 && data[end] !== 0) end++;
  const midiStr = String.fromCharCode(...data.subarray(0, end));
  const inSt = { pos: 0, buffer: -1, param };
  while (inSt.pos < midiStr.length) {
    let cmd = -1;
    let byte = midiByte(core, xc, chn, midiStr, inSt);
    if (byte === 240) {
      byte = midiByte(core, xc, chn, midiStr, inSt);
      if (byte === 240 || byte === 241) cmd = byte & 15;
    }
    if (cmd < 0) {
      if (byte === 250 || byte === 252 || byte === 255) {
        applyMidiMacroEffect(xc, 0, 127);
        applyMidiMacroEffect(xc, 1, 0);
      }
      continue;
    }
    cmd = midiByte(core, xc, chn, midiStr, inSt) | cmd << 8;
    const val = midiByte(core, xc, chn, midiStr, inSt);
    if (cmd < 0 || cmd >= 128 || val < 0 || val >= 128) {
      continue;
    }
    applyMidiMacroEffect(xc, cmd, val);
  }
}
function updateMidiMacro(core, chn) {
  const p = core.ctx.p;
  const mod = core.module;
  const xc = core.ctx.channelStates[chn];
  const midicfg = mod.midi;
  if (TEST(xc, VolSlideFlag.MIDI_MACRO) !== 0 && hasQuirk(core, Quirk.FILTER)) {
    if (xc.macro.slide > 0) {
      xc.macro.val = Math.fround(xc.macro.val + xc.macro.slide);
      if (xc.macro.val > xc.macro.target) {
        xc.macro.val = xc.macro.target;
        xc.macro.slide = 0;
      }
    } else if (xc.macro.slide < 0) {
      xc.macro.val = Math.fround(xc.macro.val + xc.macro.slide);
      if (xc.macro.val < xc.macro.target) {
        xc.macro.val = xc.macro.target;
        xc.macro.slide = 0;
      }
    } else if (p.frame !== 0) {
      return;
    }
    const val = Math.trunc(xc.macro.val);
    if (val >= 128) {
      if (midicfg) {
        executeMidiMacro(core, xc, chn, midicfg.fixed[val - 128], val);
      } else if (val < 144) {
        applyMidiMacroEffect(xc, 1, val - 128 << 3);
      }
    } else if (midicfg) {
      executeMidiMacro(core, xc, chn, midicfg.param[xc.macro.active], val);
    } else if (xc.macro.active === 0) {
      applyMidiMacroEffect(xc, 0, val);
    }
  }
}

// ../../packages/core/src/effects/tick.ts
var TREMOR_ON = 128;
var TREMOR_SUPPRESS = 64;
var PAN_SURROUND = 32768;
var XMP_FORMAT_MONO = 1 << 2;
var VIRT_ACTION_CUT = 0;
var VIRT_ACTION_CONT = 1;
var VIRT_ACTION_OFF = 2;
var VIRT_ACTION_FADE = 3;
var VIRT_ACTIVE2 = 256;
var VIRT_INVALID2 = -1;
var DSP_EFFECT_CUTOFF = 2;
var DSP_EFFECT_RESONANCE = 3;
var DSP_EFFECT_FILTER_A0 = 176;
var DSP_EFFECT_FILTER_B0 = 177;
var DSP_EFFECT_FILTER_B1 = 178;
var FILTER_SHIFT = 22;
var rval = [
  { s: 0, m: 1, d: 1 },
  { s: -1, m: 1, d: 1 },
  { s: -2, m: 1, d: 1 },
  { s: -4, m: 1, d: 1 },
  { s: -8, m: 1, d: 1 },
  { s: -16, m: 1, d: 1 },
  { s: 0, m: 2, d: 3 },
  { s: 0, m: 1, d: 2 },
  { s: 0, m: 1, d: 1 },
  { s: 1, m: 1, d: 1 },
  { s: 2, m: 1, d: 1 },
  { s: 4, m: 1, d: 1 },
  { s: 8, m: 1, d: 1 },
  { s: 16, m: 1, d: 1 },
  { s: 0, m: 3, d: 2 },
  { s: 0, m: 2, d: 1 },
  { s: 0, m: 0, d: 1 }
  /* Note cut */
];
var invloop_table = [
  0,
  5,
  6,
  7,
  8,
  10,
  11,
  13,
  16,
  19,
  22,
  26,
  32,
  43,
  64,
  128
];
var resonance_table = [
  1,
  0.978644609451294,
  0.9577452540397644,
  0.937292218208313,
  0.9172759056091309,
  0.8976871371269226,
  0.878516674041748,
  0.8597555756568909,
  0.8413951396942139,
  0.8234267830848694,
  0.8058421611785889,
  0.7886331081390381,
  0.7717915177345276,
  0.7553095817565918,
  0.7391796708106995,
  0.7233941555023193,
  0.7079457640647888,
  0.6928272843360901,
  0.6780316829681396,
  0.6635520458221436,
  0.6493816375732422,
  0.6355138421058655,
  0.6219421625137329,
  0.6086603403091431,
  0.5956621170043945,
  0.5829415321350098,
  0.5704925656318665,
  0.5583094954490662,
  0.5463865399360657,
  0.5347182154655457,
  0.5232990980148315,
  0.5121238231658936,
  0.5011872053146362,
  0.4904841780662537,
  0.4800096750259399,
  0.4697588682174683,
  0.4597269892692566,
  0.4499093294143677,
  0.4403013288974762,
  0.430898517370224,
  0.4216965138912201,
  0.4126909971237183,
  0.4038778245449066,
  0.3952528536319733,
  0.3868120610713959,
  0.3785515129566193,
  0.3704673945903778,
  0.3625559210777283,
  0.3548133969306946,
  0.3472362160682678,
  0.3398208320140839,
  0.3325638175010681,
  0.3254617750644684,
  0.318511426448822,
  0.311709463596344,
  0.305052787065506,
  0.2985382676124573,
  0.2921628654003143,
  0.2859236001968384,
  0.2798175811767578,
  0.2738419771194458,
  0.2679939568042755,
  0.2622708380222321,
  0.2566699385643005,
  0.2511886358261108,
  0.2458244115114212,
  0.2405747324228287,
  0.2354371547698975,
  0.2304092943668366,
  0.2254888117313385,
  0.2206734120845795,
  0.215960830450058,
  0.2113489061594009,
  0.206835463643074,
  0.2024184018373489,
  0.1980956792831421,
  0.1938652694225311,
  0.1897251904010773,
  0.1856735348701477,
  0.1817083954811096,
  0.1778279393911362,
  0.1740303486585617,
  0.1703138649463654,
  0.1666767448186874,
  0.1631172895431519,
  0.1596338599920273,
  0.1562248021364212,
  0.1528885662555695,
  0.1496235728263855,
  0.1464282870292664,
  0.1433012634515762,
  0.1402409970760346,
  0.1372461020946503,
  0.1343151479959488,
  0.1314467936754227,
  0.1286396980285645,
  0.1258925348520279,
  0.1232040524482727,
  0.1205729842185974,
  0.1179980933666229,
  0.1154781952500343,
  0.1130121126770973,
  0.1105986908078194,
  0.1082368120551109,
  0.1059253737330437,
  0.103663295507431,
  0.1014495193958283,
  0.0992830246686935,
  0.0971627980470657,
  0.0950878411531448,
  0.093057207763195,
  0.0910699293017387,
  0.0891250967979431,
  0.0872217938303947,
  0.0853591337800026,
  0.0835362523794174,
  0.0817523002624512,
  0.0800064504146576,
  0.0782978758215904,
  0.076625794172287,
  0.0749894231557846,
  0.0733879879117012,
  0.0718207582831383,
  0.0702869966626167,
  0.0687859877943993,
  0.0673170387744904,
  0.0658794566988945,
  0.064472571015358
];
var CLAMP2 = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
var IS_PLAYER_MODE_IT = (core) => core.ctx.m.readEventType === ReadEventType.IT;
var IS_PLAYER_MODE_FT2 = (core) => core.ctx.m.readEventType === ReadEventType.FT2;
function getInstrument(core, ins) {
  const m = core.ctx.m;
  const i = ins >= 0 && ins < m.instruments.length ? ins : 0;
  return m.instruments[i];
}
function checkEnvelopeEnd(env, x) {
  if ((~env.flags & EnvelopeFlags.ON) !== 0 || env.npt <= 0) {
    return 0;
  }
  const idx = env.npt - 1;
  if (x >= env.x[idx] || idx === 0) {
    if ((~env.flags & EnvelopeFlags.LOOP) !== 0) {
      return 1;
    }
  }
  return 0;
}
function getEnvelope(env, x, def) {
  if (x < 0 || (~env.flags & EnvelopeFlags.ON) !== 0 || env.npt <= 0) {
    return def;
  }
  let idx = env.npt - 1;
  let x1 = env.x[idx];
  if (x >= x1 || idx === 0) {
    return env.y[idx];
  }
  do {
    idx -= 1;
    x1 = env.x[idx];
  } while (idx > 0 && x1 > x);
  const y1 = env.y[idx];
  const x2 = env.x[idx + 1];
  const y2 = env.y[idx + 1];
  if (x < x1 || x2 < x1) return y1;
  return x2 === x1 ? y2 : Math.trunc((y2 - y1) * (x - x1) / (x2 - x1)) + y1;
}
function updateEnvelopeGeneric(env, x, release) {
  const hasLoop = (env.flags & EnvelopeFlags.LOOP) !== 0;
  let hasSus = (env.flags & EnvelopeFlags.SUS) !== 0;
  const lps = env.lps;
  const lpe = env.lpe;
  const sus = env.sus;
  if (hasLoop && hasSus && sus === lpe) {
    if (!release) {
      hasSus = false;
    }
  }
  if (hasLoop && x > env.x[lpe] + 1) {
    release = true;
  } else if (hasSus && x > env.x[sus] + 1) {
    release = true;
  }
  if (hasSus && !release) {
    if (x >= env.x[sus]) {
      x = env.x[sus];
    }
  }
  if (hasLoop && x >= env.x[lpe]) {
    if (!(release && hasSus && sus === lpe)) {
      x = env.x[lps];
    }
  }
  return x;
}
function updateEnvelopeXm(env, x, release) {
  const hasLoop = (env.flags & EnvelopeFlags.LOOP) !== 0;
  const hasSus = (env.flags & EnvelopeFlags.SUS) !== 0;
  const lps = env.lps;
  const lpe = env.lpe;
  const sus = env.sus;
  if (hasSus && x > env.x[sus] + 1) {
    release = true;
  }
  if (hasSus && !release) {
    if (x >= env.x[sus]) {
      x = env.x[sus];
    }
  }
  if (hasLoop && x === env.x[lpe]) {
    if (!(release && hasSus && sus === lpe)) {
      x = env.x[lps];
    }
  }
  return x;
}
function updateEnvelopeIt(env, x, release, keyOff) {
  const hasLoop = (env.flags & EnvelopeFlags.LOOP) !== 0;
  const hasSus = (env.flags & EnvelopeFlags.SUS) !== 0;
  const lps = env.lps;
  const lpe = env.lpe;
  const sus = env.sus;
  const sue = env.sue;
  if (hasSus && keyOff && x === env.x[sue] + 1) {
    x = env.x[sus];
  } else if (hasSus && !release) {
    if (x === env.x[sue] + 1) {
      x = env.x[sus];
    }
  } else if (hasLoop) {
    if (x > env.x[lpe]) {
      x = env.x[lps];
    }
  }
  return x;
}
function updateEnvelope(core, env, x, release, keyOff) {
  if (x < 65535) {
    x++;
  }
  if (x < 0) {
    return -1;
  }
  if ((~env.flags & EnvelopeFlags.ON) !== 0 || env.npt <= 0) {
    return x;
  }
  if (IS_PLAYER_MODE_IT(core)) {
    return updateEnvelopeIt(env, x, release, keyOff);
  }
  if (!hasQuirk(core, Quirk.FT2ENV)) {
    return updateEnvelopeGeneric(env, x, release);
  }
  return updateEnvelopeXm(env, x, release);
}
function checkEnvelopeFade(env, x) {
  if ((~env.flags & EnvelopeFlags.ON) !== 0) {
    return 0;
  }
  const idx = env.npt - 1;
  if (x > env.x[idx]) {
    if (env.y[idx] === 0) {
      return -1;
    } else {
      return 1;
    }
  }
  return 0;
}
function ft2Arpeggio(core, xc) {
  const p = core.ctx.p;
  if (xc.arpeggio.val[1] === 0 && xc.arpeggio.val[2] === 0) {
    return 0;
  }
  if (p.frame === 0) {
    return 0;
  }
  const i = p.speed - p.frame % p.speed;
  if (i === 16) {
    return 0;
  } else if (i > 16) {
    return xc.arpeggio.val[2];
  }
  return xc.arpeggio.val[i % 3];
}
function arpeggio(core, xc) {
  let arp;
  if (hasQuirk(core, Quirk.FT2BUGS)) {
    arp = ft2Arpeggio(core, xc);
  } else {
    arp = xc.arpeggio.val[xc.arpeggio.count] ?? 0;
  }
  xc.arpeggio.count++;
  xc.arpeggio.count %= xc.arpeggio.size;
  return arp;
}
function isFirstFrame(core) {
  const p = core.ctx.p;
  switch (core.ctx.m.readEventType) {
    case ReadEventType.IT:
    case ReadEventType.ST3:
      return p.frame % p.speed === 0;
    default:
      return p.frame === 0;
  }
}
function tremorFt2(core, xc, finalvol) {
  const p = core.ctx.p;
  if (TEST(xc, TREMOR_FLAG) !== 0 && p.frame !== 0) {
    xc.tremor.count &= ~TREMOR_SUPPRESS;
    if (xc.tremor.count === 0) {
      xc.tremor.count = xc.tremor.up | TREMOR_ON;
    } else if (xc.tremor.count === TREMOR_ON) {
      xc.tremor.count = xc.tremor.down;
    } else {
      xc.tremor.count--;
    }
  }
  if ((xc.tremor.count & (TREMOR_ON | TREMOR_SUPPRESS)) === 0) {
    finalvol = 0;
  }
  return finalvol;
}
function tremorS3m(xc, finalvol) {
  if (TEST(xc, TREMOR_FLAG) !== 0) {
    if (xc.tremor.count === 0) {
      xc.tremor.count = xc.tremor.up | TREMOR_ON;
    } else if (xc.tremor.count === TREMOR_ON) {
      xc.tremor.count = xc.tremor.down;
    }
    xc.tremor.count--;
    if ((~xc.tremor.count & TREMOR_ON) !== 0) {
      finalvol = 0;
    }
  }
  return finalvol;
}
function delayedKeyoff(core, chn) {
  const p = core.ctx.p;
  const xc = core.ctx.channelStates[chn];
  const instrument = getInstrument(core, xc.ins);
  switch (core.ctx.m.readEventType) {
    case ReadEventType.FT2:
      if (p.frame >= p.speed) {
        break;
      }
      if ((instrument.aei.flags & EnvelopeFlags.ON) !== 0) {
        SET_NOTE(xc, NOTE_RELEASE);
      } else {
        xc.volume = 0;
      }
      SET_NOTE(xc, NOTE_FADEOUT);
      break;
    default:
      SET_NOTE(xc, NOTE_RELEASE);
  }
}
function updateInvloop(core, xc) {
  const p = core.ctx.p;
  const xxs = core.getSample(xc.smp);
  let lps = 0;
  let len = -1;
  if (p.frame === 0 && TEST(xc, NEW_INS) !== 0) {
    xc.invloop.pos = 0;
  }
  xc.invloop.count += invloop_table[xc.invloop.speed] ?? 0;
  if (xxs != null) {
    if ((xxs.flags & SampleFlags.LOOP) !== 0) {
      lps = xxs.loopStart;
      len = xxs.loopEnd - lps;
    } else if ((xxs.flags & SampleFlags.SUSTAIN) !== 0) {
      lps = xxs.sustainStart;
      len = xxs.sustainEnd - lps;
    }
  }
  if (len >= 0 && xc.invloop.count >= 128) {
    xc.invloop.count = 0;
    if (++xc.invloop.pos > len) {
      xc.invloop.pos = 0;
    }
    if (xxs.data.length === 0) {
      return;
    }
    if ((xxs.flags & SampleFlags.BITS16) === 0) {
      const pos = lps + xc.invloop.pos;
      xxs.data[pos] = -xxs.data[pos] - 1 / 128;
    }
  }
}
function updateVolume(core, chn) {
  const p = core.ctx.p;
  const m = core.ctx.m;
  const f = p.flow;
  const xc = core.ctx.channelStates[chn];
  if (p.frame % p.speed !== 0 || hasQuirk(core, Quirk.VSALL)) {
    if (TEST(xc, GVOL_SLIDE) !== 0) {
      p.gvol += xc.gvol.slide;
    }
    if (TEST(xc, VOL_SLIDE) !== 0 || TEST_PER(xc, VOL_SLIDE) !== 0) {
      xc.volume += xc.vol.slide;
    }
    if (TEST(xc, VOL_SLIDE_2) !== 0) {
      xc.volume += xc.vol.slide2;
    }
    if (TEST(xc, TRK_VSLIDE) !== 0) {
      xc.mastervol += xc.trackvol.slide;
    }
  }
  if (p.frame % p.speed === 0) {
    if (TEST(xc, FINE_VOLS) !== 0) {
      xc.volume += xc.vol.fslide;
    }
    if (TEST(xc, FINE_VOLS_2) !== 0) {
      if (f.rowdelay_set === 0 || (f.rowdelay_set & RowDelay.FIRST_FRAME) !== 0) {
        xc.volume += xc.vol.fslide2;
      }
    }
    if (TEST(xc, TRK_FVSLIDE) !== 0) {
      xc.mastervol += xc.trackvol.fslide;
    }
    if (TEST(xc, GVOL_SLIDE) !== 0) {
      p.gvol += xc.gvol.fslide;
    }
  }
  xc.volume = CLAMP2(xc.volume, 0, m.volbase);
  p.gvol = CLAMP2(p.gvol, 0, m.gvolbase);
  xc.mastervol = CLAMP2(xc.mastervol, 0, m.volbase);
  if (xc.split) {
    core.ctx.channelStates[xc.pair].volume = xc.volume;
  }
}
function updateFrequency(core, chn) {
  const m = core.ctx.m;
  const xc = core.ctx.channelStates[chn];
  if (!isFirstFrame(core) || hasQuirk(core, Quirk.PBALL)) {
    if (TEST(xc, PITCHBEND) !== 0 || TEST_PER(xc, PITCHBEND) !== 0) {
      xc.period += xc.freq.slide;
      if (hasQuirk(core, Quirk.PROTRACK)) {
        xc.porta.target = xc.period;
      }
    }
    if (TEST(xc, TONEPORTA) !== 0 || TEST_PER(xc, TONEPORTA) !== 0) {
      if (xc.porta.target > 0) {
        let end = false;
        if (xc.porta.dir > 0) {
          xc.period += xc.porta.slide;
          if (xc.period >= xc.porta.target) {
            end = true;
          }
        } else {
          xc.period -= xc.porta.slide;
          if (xc.period <= xc.porta.target) {
            end = true;
          }
        }
        if (end) {
          xc.period = xc.porta.target;
          xc.porta.dir = 0;
          RESET(xc, TONEPORTA);
          RESET_PER(xc, TONEPORTA);
          if (hasQuirk(core, Quirk.PROTRACK)) {
            xc.porta.target = -1;
          }
        }
      }
    }
  }
  if (isFirstFrame(core)) {
    if (TEST(xc, FINE_BEND) !== 0) {
      xc.period += xc.freq.fslide;
    }
    if (TEST(xc, FINE_NSLIDE) !== 0) {
      xc.note += xc.noteslide.fslide;
      xc.period = noteToPeriod(m.periodType, xc.note, xc.finetune, xc.per_adj);
    }
  }
  switch (m.periodType) {
    case PeriodType.LINEAR:
      xc.period = CLAMP2(xc.period, MIN_PERIOD_L, MAX_PERIOD_L);
      break;
    case PeriodType.MODRNG: {
      const minPeriod = noteToPeriod(m.periodType, MAX_NOTE_MOD, xc.finetune, 0);
      const maxPeriod = noteToPeriod(m.periodType, MIN_NOTE_MOD, xc.finetune, 0);
      xc.period = CLAMP2(xc.period, minPeriod, maxPeriod);
      break;
    }
  }
  if (xc.period < 0.25) {
    core.virt.setVol(chn, 0);
  }
}
function updatePan(core, chn) {
  const xc = core.ctx.channelStates[chn];
  if (TEST(xc, PAN_SLIDE) !== 0) {
    if (isFirstFrame(core)) {
      xc.pan.val += xc.pan.fslide;
    } else {
      xc.pan.val += xc.pan.slide;
    }
    if (xc.pan.val < 0) {
      xc.pan.val = 0;
    } else if (xc.pan.val > 255) {
      xc.pan.val = 255;
    }
  }
}
var DOENV_RELEASE = (xc, act) => TEST_NOTE(xc, NOTE_ENV_RELEASE) !== 0 || act === VIRT_ACTION_OFF;
function getChannelVol(core, chn) {
  const p = core.ctx.p;
  const virt = core.virt;
  if (chn < virt.numTracks) {
    return p.channel_vol[chn];
  }
  if (chn >= virt.virtChannels) {
    return 0;
  }
  const voc = virt.mapChannel(chn);
  if (voc < 0) {
    return 0;
  }
  const root = virt.voiceAt(voc).root;
  if (root < 0) {
    return 0;
  }
  return p.channel_vol[root];
}
function processVolume(core, chn, act) {
  const p = core.ctx.p;
  const m = core.ctx.m;
  const xc = core.ctx.channelStates[chn];
  let fade = false;
  const instrument = getInstrument(core, xc.ins);
  if (hasQuirk(core, Quirk.KEYOFF)) {
    if (TEST_NOTE(xc, NOTE_ENV_RELEASE) !== 0 || act === VIRT_ACTION_OFF) {
      if ((~instrument.aei.flags & EnvelopeFlags.ON) !== 0 || (instrument.aei.flags & EnvelopeFlags.LOOP) !== 0) {
        fade = true;
      }
    }
  } else if (!IS_PLAYER_MODE_FT2(core)) {
    if ((~instrument.aei.flags & EnvelopeFlags.ON) !== 0) {
      if (TEST_NOTE(xc, NOTE_ENV_RELEASE) !== 0) {
        xc.fadeout = 0;
      }
    }
    if (TEST_NOTE(xc, NOTE_ENV_RELEASE) !== 0 || act === VIRT_ACTION_OFF) {
      fade = true;
    }
  }
  if (TEST_PER(xc, VENV_PAUSE) === 0) {
    xc.v_idx = updateEnvelope(
      core,
      instrument.aei,
      xc.v_idx,
      DOENV_RELEASE(xc, act),
      TEST(xc, KEY_OFF_FLAG) !== 0
    );
  }
  const volEnvelope = getEnvelope(instrument.aei, xc.v_idx, 64);
  if (checkEnvelopeEnd(instrument.aei, xc.v_idx) !== 0) {
    if (volEnvelope === 0) {
      SET_NOTE(xc, NOTE_END);
    }
    SET_NOTE(xc, NOTE_ENV_END);
  }
  switch (checkEnvelopeFade(instrument.aei, xc.v_idx)) {
    case -1:
      SET_NOTE(xc, NOTE_END);
      break;
    case 0:
      break;
    default:
      if (hasQuirk(core, Quirk.ENVFADE)) {
        SET_NOTE(xc, NOTE_FADEOUT);
      }
  }
  if (TEST_NOTE(xc, NOTE_FADEOUT) !== 0 || act === VIRT_ACTION_FADE) {
    fade = true;
  }
  if (fade) {
    if (xc.fadeout > xc.ins_fade) {
      xc.fadeout -= xc.ins_fade;
    } else {
      xc.fadeout = 0;
      SET_NOTE(xc, NOTE_END);
    }
  }
  if (TEST_NOTE(xc, NOTE_END) !== 0 && chn >= core.virt.numTracks) {
    core.virt.releaseChannel(chn, PastNote.CUT);
    return;
  }
  let finalvol = extrasGetVolume(core, xc);
  if (IS_PLAYER_MODE_IT(core)) {
    finalvol = Math.trunc(xc.volume * (100 - xc.rvv) / 100);
  }
  if (TEST(xc, TREMOLO) !== 0) {
    if (!isFirstFrame(core) || !hasQuirk(core, Quirk.PROTRACK)) {
      finalvol += Math.trunc(lfoGet(m.readEventType, xc.tremolo.lfo, false) / (1 << 6));
    }
    if (!isFirstFrame(core) || hasQuirk(core, Quirk.VIBALL)) {
      lfoUpdate(xc.tremolo.lfo);
    }
  }
  finalvol = CLAMP2(finalvol, 0, m.volbase);
  finalvol = finalvol * xc.fadeout >> 6;
  {
    const t2 = Math.trunc(
      volEnvelope * p.gvol * xc.mastervol / m.gvolbase
    );
    const t3 = Math.trunc(finalvol * 64 / m.volbase);
    finalvol = Math.imul(t2, t3) >>> 0 >> 18;
  }
  finalvol = Math.trunc(finalvol * getChannelVol(core, chn) / 100);
  if (hasQuirk(core, Quirk.INSVOL)) {
    finalvol = finalvol * instrument.volume * xc.gvl >> 12;
  }
  if (IS_PLAYER_MODE_FT2(core)) {
    finalvol = tremorFt2(core, xc, finalvol);
  } else {
    finalvol = tremorS3m(xc, finalvol);
  }
  xc.macro.finalvol = finalvol;
  if (chn < m.chn) {
    finalvol = Math.trunc(finalvol * p.master_vol / 100);
  } else {
    finalvol = Math.trunc(finalvol * p.smix_vol / 100);
  }
  xc.info_finalvol = TEST_NOTE(xc, NOTE_SAMPLE_END) !== 0 ? 0 : finalvol;
  core.virt.setVol(chn, finalvol);
  if (xc.split) {
    core.virt.setVol(xc.pair, finalvol);
  }
}
function filterSetup(srate, cutoff, res) {
  cutoff = CLAMP2(cutoff, 0, 255);
  res = CLAMP2(res, 0, 255);
  const fr = Math.fround;
  const FREQ_PARAM_MULT = fr(128 / fr(24 * 256));
  const PI_F = fr(3.14159265358979);
  const fs = fr(srate);
  const expo = fr(fr(cutoff) * FREQ_PARAM_MULT + fr(0.25));
  let fc = fr(110 * fr(Math.pow(2, expo)));
  if (fc > fr(fs / 2)) fc = fr(fs / 2);
  const r = fr(fs / (2 * PI_F * fc));
  const d = fr(resonance_table[res >> 1] * (r + 1) - 1);
  const e = fr(r * r);
  const den = 1 + d + e;
  const fg = fr(1 / den);
  const fb0 = fr(fr(fr(d + e) + e) / den);
  const fb1 = fr(-e / den);
  const shift = 1 << FILTER_SHIFT;
  return {
    a0: Math.trunc(fg * shift),
    b0: Math.trunc(fb0 * shift),
    b1: Math.trunc(fb1 * shift)
  };
}
var IS_PERIOD_MODRNG = (core) => core.ctx.m.periodType === PeriodType.MODRNG;
var INT_MAX = 2147483647;
function processFrequency(core, chn, act) {
  const p = core.ctx.p;
  const m = core.ctx.m;
  const s = core.ctx.s;
  const xc = core.ctx.channelStates[chn];
  const instrument = getInstrument(core, xc.ins);
  if (TEST_PER(xc, FENV_PAUSE) === 0) {
    xc.f_idx = updateEnvelope(
      core,
      instrument.fei,
      xc.f_idx,
      DOENV_RELEASE(xc, act),
      TEST(xc, KEY_OFF_FLAG) !== 0
    );
  }
  const frqEnvelope = getEnvelope(instrument.fei, xc.f_idx, 0);
  if (TEST(xc, NOTE_SLIDE) !== 0) {
    if (xc.noteslide.count === 0) {
      xc.note += xc.noteslide.slide;
      xc.period = noteToPeriod(m.periodType, xc.note, xc.finetune, xc.per_adj);
      xc.noteslide.count = xc.noteslide.speed;
    }
    xc.noteslide.count--;
    core.virt.setNote(chn, xc.note);
  }
  let vibrato = 1 * lfoGet(m.readEventType, xc.insvib.lfo, true) / (4096 * (1 + xc.insvib.sweep));
  lfoUpdate(xc.insvib.lfo);
  if (xc.insvib.sweep > 1) {
    xc.insvib.sweep -= 2;
  } else {
    xc.insvib.sweep = 0;
  }
  if (TEST(xc, VIBRATO) !== 0 || TEST_PER(xc, VIBRATO) !== 0) {
    if (!isFirstFrame(core) || !hasQuirk(core, Quirk.PROTRACK)) {
      const shift = hasQuirk(core, Quirk.VIBHALF) ? 10 : 9;
      const vib = Math.trunc(lfoGet(m.readEventType, xc.vibrato.lfo, true) / (1 << shift));
      if (hasQuirk(core, Quirk.VIBINV)) {
        vibrato -= vib;
      } else {
        vibrato += vib;
      }
    }
    if (!isFirstFrame(core) || hasQuirk(core, Quirk.VIBALL)) {
      lfoUpdate(xc.vibrato.lfo);
    }
  }
  let period = xc.period;
  period += extrasGetPeriod(xc);
  if (hasQuirk(core, Quirk.ST3BUGS)) {
    if (period < 0.25) {
      core.virt.releaseChannel(chn, PastNote.CUT);
    }
  }
  if (period < 0.1) {
    period = 0.1;
  }
  let arp = arpeggio(core, xc);
  let linearBend = periodToBend(m.periodType, period + vibrato, xc.note, xc.per_adj);
  if (TEST_NOTE(xc, NOTE_GLISSANDO) !== 0 && TEST(xc, TONEPORTA) !== 0) {
    if (linearBend > 0) {
      linearBend = Math.trunc((linearBend + 6400) / 12800) * 12800;
    } else if (linearBend < 0) {
      linearBend = Math.trunc((linearBend - 6400) / 12800) * 12800;
    }
  }
  if (hasQuirk(core, Quirk.FT2BUGS)) {
    if (arp !== 0) {
      linearBend = Math.trunc(linearBend / 12800) * 12800 + xc.finetune * 100;
      if (xc.note + arp > 107) {
        if (p.speed - p.frame % p.speed > 0) {
          arp = 108 - xc.note;
        }
      }
    }
  }
  if (xc.f_idx >= 0 && (~instrument.fei.flags & EnvelopeFlags.FLT) !== 0) {
    linearBend += frqEnvelope * 128;
  }
  if (arp !== 0) {
    linearBend += (100 << 7) * arp;
    if (hasQuirk(core, Quirk.PROTRACK)) {
      if (xc.note + arp > MAX_NOTE_MOD + 1) {
        linearBend -= 12800 * (3 * 12);
      } else if (xc.note + arp > MAX_NOTE_MOD) {
        core.virt.setVol(chn, 0);
      }
    }
  }
  linearBend += extrasGetLinearBend(core, xc);
  let finalPeriod = noteToPeriodMix2(xc.note, linearBend);
  if (hasQuirk(core, Quirk.ST3BUGS)) {
    if (finalPeriod < 16.23927) {
      finalPeriod = 16.23927;
    }
  }
  core.virt.setPeriod(chn, finalPeriod);
  xc.info_pitchbend = linearBend >> 7;
  xc.info_period = Math.min(finalPeriod * 4096, INT_MAX);
  if (IS_PERIOD_MODRNG(core)) {
    const minPeriod = noteToPeriod(m.periodType, MAX_NOTE_MOD, xc.finetune, 0) * 4096;
    const maxPeriod = noteToPeriod(m.periodType, MIN_NOTE_MOD, xc.finetune, 0) * 4096;
    xc.info_period = CLAMP2(xc.info_period, minPeriod, maxPeriod);
  } else if (xc.info_period < 1 << 12) {
    xc.info_period = 1 << 12;
  }
  if (!hasQuirk(core, Quirk.FILTER)) {
    return;
  }
  let cutoff;
  if (xc.f_idx >= 0 && (instrument.fei.flags & EnvelopeFlags.FLT) !== 0) {
    if (frqEnvelope < 254) {
      xc.filter.envelope = frqEnvelope;
    }
    cutoff = xc.filter.cutoff * xc.filter.envelope >> 8;
  } else {
    cutoff = xc.filter.cutoff;
  }
  const resonance = xc.filter.resonance;
  if (cutoff > 255) {
    cutoff = 255;
  }
  if (cutoff < 254 || resonance > 0 || xc.filter.can_disable) {
    const fx = filterSetup(s.freq, cutoff, resonance);
    core.virt.setEffect(chn, DSP_EFFECT_FILTER_A0, fx.a0);
    core.virt.setEffect(chn, DSP_EFFECT_FILTER_B0, fx.b0);
    core.virt.setEffect(chn, DSP_EFFECT_FILTER_B1, fx.b1);
    core.virt.setEffect(chn, DSP_EFFECT_RESONANCE, resonance);
    core.virt.setEffect(chn, DSP_EFFECT_CUTOFF, cutoff);
    xc.filter.can_disable = 0;
  }
}
function noteToPeriodMix2(n, b) {
  const d = n + b / 12800;
  return PERIOD_BASE2 / Math.pow(2, d / 12);
}
function processPan(core, chn, act) {
  const m = core.ctx.m;
  const s = core.ctx.s;
  const xc = core.ctx.channelStates[chn];
  let panbrello = 0;
  const instrument = getInstrument(core, xc.ins);
  if (TEST_PER(xc, PENV_PAUSE) === 0) {
    xc.p_idx = updateEnvelope(
      core,
      instrument.pei,
      xc.p_idx,
      DOENV_RELEASE(xc, act),
      TEST(xc, KEY_OFF_FLAG) !== 0
    );
  }
  const panEnvelope = getEnvelope(instrument.pei, xc.p_idx, 32);
  if (TEST(xc, PANBRELLO) !== 0) {
    panbrello = Math.trunc(lfoGet(m.readEventType, xc.panbrello.lfo, false) / 512);
    if (isFirstFrame(core)) {
      lfoUpdate(xc.panbrello.lfo);
    }
  }
  xc.macro.notepan = xc.pan.val + panbrello + 128;
  const channelPan = xc.pan.val;
  let finalpan = channelPan + panbrello + Math.trunc((panEnvelope - 32) * (128 - Math.abs(xc.pan.val - 128)) / 32);
  if (IS_PLAYER_MODE_IT(core)) {
    finalpan = finalpan + xc.rpv * 4;
  }
  finalpan = CLAMP2(finalpan, 0, 255);
  if ((s.format & XMP_FORMAT_MONO) !== 0 || xc.pan.surround !== 0) {
    finalpan = 0;
  } else {
    finalpan = Math.trunc((finalpan - 128) * s.mix / 100);
  }
  xc.info_finalpan = finalpan + 128;
  if (xc.pan.surround !== 0) {
    core.virt.setPan(chn, PAN_SURROUND);
  } else {
    core.virt.setPan(chn, finalpan);
  }
}
function processTick(core, chn) {
  const p = core.ctx.p;
  const mod = core.ctx.m;
  const xc = core.ctx.channelStates[chn];
  let act;
  xc.info_finalvol = 0;
  if (!isFirstFrame(core) && TEST(xc, TEMPO_SLIDE) !== 0) {
    p.bpm += xc.tempo_slide;
    p.bpm = CLAMP2(p.bpm, 32, 255);
  }
  if (xc.delay > 0) {
    if (--xc.delay === 0) {
      core.readEvent(chn);
    }
  }
  updateMidiMacro(core, chn);
  const cst = core.virt.cstat(chn);
  if (cst === VIRT_INVALID2) {
    act = VIRT_INVALID2;
  } else if (cst === VIRT_ACTIVE2) {
    act = VIRT_ACTIVE2;
  } else {
    switch (cst) {
      case Act.NONE:
        act = VIRT_ACTION_CUT;
        break;
      case Act.KEY:
        act = VIRT_ACTION_OFF;
        break;
      case Act.VOL:
        act = VIRT_ACTION_FADE;
        break;
      default:
        act = VIRT_ACTIVE2;
    }
  }
  if (act === VIRT_INVALID2) {
    updateVolume(core, chn);
    return;
  }
  if (p.frame === 0 && act !== VIRT_ACTIVE2) {
    if (!isValidInstrumentOrSfx(core, xc.ins) || act === VIRT_ACTION_CUT) {
      core.virt.releaseChannel(chn, PastNote.CUT);
      return;
    }
  }
  if (!isValidInstrumentOrSfx(core, xc.ins)) {
    return;
  }
  playExtras(core, chn, xc);
  if (TEST(xc, RETRIG) !== 0) {
    const cond = hasQuirk(core, Quirk.S3MRTG) ? --xc.retrig.count <= 0 : --xc.retrig.count === 0;
    if (cond) {
      if (xc.retrig.type < 16) {
        core.virt.voicePos(chn, 0);
      } else {
        SET_NOTE(xc, NOTE_END);
      }
      xc.volume += rval[xc.retrig.type].s;
      xc.volume = Math.trunc(xc.volume * rval[xc.retrig.type].m / rval[xc.retrig.type].d);
      xc.retrig.count = xc.retrig.val;
      if (xc.retrig.limit > 0) {
        --xc.retrig.limit;
        if (xc.retrig.limit === 0) {
          RESET(xc, RETRIG);
        }
      }
    }
  }
  if (xc.keyoff) {
    if (--xc.keyoff === 0) {
      delayedKeyoff(core, chn);
    }
  }
  const relSample = core.getSample(core.virt.voiceSmp(chn));
  core.virt.releaseFlag(
    chn,
    TEST_NOTE(xc, NOTE_SAMPLE_RELEASE) !== 0 ? 1 : 0,
    relSample
  );
  updateVolume(core, chn);
  updateFrequency(core, chn);
  updatePan(core, chn);
  processVolume(core, chn, act);
  processFrequency(core, chn, act);
  processPan(core, chn, act);
  if (hasQuirk(core, Quirk.PROTRACK | Quirk.INVLOOP) && xc.ins < mod.ins) {
    updateInvloop(core, xc);
  }
  if (TEST_NOTE(xc, NOTE_SUSEXIT) !== 0) {
    SET_NOTE(xc, NOTE_ENV_RELEASE);
  }
  xc.info_position = core.virt.getVoicePos(chn);
}
function isValidInstrumentOrSfx(core, ins) {
  const m = core.ctx.m;
  return ins >>> 0 < m.ins && ins >= 0 && m.instruments[ins] !== void 0 && (m.instruments[ins].nsm ?? 0) > 0;
}

// ../../packages/core/src/effects/readevent.ts
function isValidInstrument(core, ins) {
  const mod = core.module;
  return ins >= 0 && ins < mod.ins && (mod.instruments[ins]?.nsm ?? 0) > 0;
}
var isToneportaFx = (x) => x === fx_exports.FX_TONEPORTA || x === fx_exports.FX_TONE_VSLIDE || x === fx_exports.FX_PER_TPORTA || x === fx_exports.FX_ULT_TPORTA || x === fx_exports.FX_FAR_TPORTA;
var isSfxPitch = (x) => x === fx_exports.FX_PITCH_ADD || x === fx_exports.FX_PITCH_SUB;
var isModRetrig = (x, p) => x === fx_exports.FX_EXTENDED && MSN2(p) === 14 && LSN2(p) !== 0;
function setPatch(core, chn, ins, smp, note) {
  return core.virt.setPatchSmp(chn, ins, smp, note);
}
function isValidSample(core, smp) {
  const mod = core.module;
  if (smp < 0 || smp >= mod.samples.length) return false;
  return core.getSample(smp).length > 0;
}
function getSubinstrument(core, ins, key) {
  const mod = core.module;
  if (!isValidInstrument(core, ins)) return null;
  const instrument = mod.instruments[ins];
  if (isValidNote(key)) {
    const mapped = instrument.map[key] ?? 255;
    if (mapped !== 255 && mapped >= 0 && mapped < instrument.nsm) {
      return instrument.sub[mapped] ?? null;
    }
  } else {
    if (instrument.nsm > 0) {
      return instrument.sub[0] ?? null;
    }
  }
  return null;
}
function getInstrument2(core, ins) {
  return isValidInstrument(core, ins) ? core.module.instruments[ins] : null;
}
function resetEnvelopes(core, xc) {
  if (!isValidInstrument(core, xc.ins)) return;
  RESET_NOTE(xc, NOTE_ENV_END2);
  xc.v_idx = -1;
  xc.p_idx = -1;
  xc.f_idx = -1;
}
var NOTE_ENV_END2 = 1 << 4;
function setEffectDefaults(core, note, sub, xc, isToneporta) {
  if (sub !== null && note >= 0) {
    if ((core.quirks & Quirk.PROTRACK) === 0) {
      xc.finetune = sub.fin;
    }
    xc.gvl = sub.gvl;
    if (sub.ifc & 128) {
      xc.filter.cutoff = (sub.ifc - 128) * 2;
    }
    xc.filter.envelope = 256;
    if (sub.ifr & 128) {
      xc.filter.resonance = (sub.ifr - 128) * 2;
    }
    xc.filter.can_disable = !isToneporta ? 1 : 0;
    xc.insvib.lfo.depth = sub.vde;
    xc.insvib.lfo.rate = sub.vra + 2 >> 2;
    xc.insvib.lfo.type = sub.vwf;
    xc.insvib.sweep = sub.vsw;
    xc.vibrato.lfo.phase = 0;
    xc.tremolo.lfo.phase = 0;
  }
  xc.delay = 0;
  xc.tremor.up = 0;
  xc.tremor.down = 0;
  xc.arpeggio.val[0] = 0;
  xc.arpeggio.count = 0;
  xc.arpeggio.size = 1;
  if (isToneporta) {
    xc.porta.slide = 0;
  }
}
function setChannelVolume(xc, vol) {
  if (vol >= 0) {
    xc.volume = vol;
    SET(xc, VolSlideFlag.NEW_VOL);
  }
}
function setChannelPan(xc, pan) {
  if (pan >= 0) {
    xc.pan.val = pan;
    xc.pan.surround = 0;
  }
}
function sustainCheckEnv(env, idx) {
  return !!(env && env.flags & EnvelopeFlags.ON && env.flags & EnvelopeFlags.SUS && ~env.flags & EnvelopeFlags.LOOP && idx === env.x[env.sus]);
}
function setPeriod(core, note, sub, xc, isToneporta) {
  if (sub === null && (core.quirks & Quirk.PROTRACK) === 0) return;
  if (note >= 0) {
    const per = noteToPeriod(core.module.periodType, note, xc.finetune, xc.per_adj);
    if ((core.quirks & Quirk.PROTRACK) === 0 || note > 0 && isToneporta) {
      xc.porta.target = per;
    }
    if (xc.period < 1 || !isToneporta) {
      xc.period = per;
    }
  }
}
function setPeriodFt2(core, key, note, sub, xc, isToneporta) {
  const mod = core.module;
  if (isValidNote(key - 1) && isToneporta) {
    let n = key - 1;
    if (sub !== null) {
      const ins = isValidInstrument(core, xc.ins) ? mod.instruments[xc.ins] : null;
      n += ins ? ins.mapXpo[key - 1] ?? 0 : 0;
      n += sub.xpo;
    }
    xc.porta.target = noteToPeriod(mod.periodType, n, xc.finetune, xc.per_adj);
  }
  if (sub !== null && note >= 0) {
    if (xc.period < 1 || !isToneporta) {
      xc.period = noteToPeriod(mod.periodType, note, xc.finetune, xc.per_adj);
    }
  }
}

// ../../packages/core/src/effects/readevent-st3.ts
function readEventSt3(core, e, chn) {
  const mod = core.module;
  const xc = core.ctx.channelStates[chn];
  let note = -1;
  let sub;
  let notSameIns = 0;
  let isToneporta = 0;
  xc.flags = 0;
  if (isToneportaFx(e.fxt) || isToneportaFx(e.f2t)) {
    isToneporta = 1;
  }
  if (core.virt.mapChannel(chn) < 0 && xc.ins !== e.ins - 1) {
    isToneporta = 0;
  }
  if (isValidNote(e.note - 1) && !isToneporta) {
    xc.key = e.note - 1;
  }
  if (e.ins) {
    const ins = e.ins - 1;
    SET(xc, VolSlideFlag.NEW_INS);
    xc.fadeout = 65536;
    xc.per_flags = 0;
    xc.offset.val = 0;
    RESET_NOTE(xc, NoteFlag2.RELEASE | NoteFlag2.FADEOUT);
    if (isValidInstrument(core, ins)) {
      if (xc.ins !== ins) {
        notSameIns = 1;
        if (!isToneporta) {
          xc.ins = ins;
          xc.ins_fade = getInstrument2(core, ins)?.rls ?? 0;
        }
      }
      sub = getSubinstrument(core, ins, xc.key);
      if (sub !== null && e.note !== /* XMP_KEY_OFF */
      129) {
        setChannelVolume(xc, sub.vol);
        setChannelPan(xc, sub.pan);
      }
    } else {
      xc.flags = 0;
    }
  }
  if (e.note !== 0) {
    SET(xc, VolSlideFlag.NEW_NOTE);
    if (e.note === /* XMP_KEY_OFF */
    129) {
      SET_NOTE(xc, NoteFlag2.RELEASE);
    } else if (isToneporta) {
      if (notSameIns) {
        xc.offset.val = 0;
      }
    } else if (isValidNote(e.note - 1)) {
      RESET_NOTE(xc, NoteFlag2.END);
      sub = getSubinstrument(core, xc.ins, xc.key);
      if (sub !== null) {
        const transp = getInstrument2(core, xc.ins)?.mapXpo[xc.key] ?? 0;
        let smp;
        note = xc.key + sub.xpo + transp;
        smp = sub.sid;
        if (!isValidSample(core, smp)) {
          smp = -1;
        }
        if (smp >= 0 && smp < mod.samples.length) {
          setPatch(core, chn, xc.ins, smp, note);
          xc.smp = smp;
        }
      } else {
        xc.flags = 0;
      }
    }
  }
  sub = getSubinstrument(core, xc.ins, xc.key);
  setEffectDefaults(core, note, sub, xc, isToneporta !== 0);
  if (e.ins && sub !== null) {
    resetEnvelopes(core, xc);
  }
  setChannelVolume(xc, e.vol - 1);
  processFx(core, xc, chn, e, 1);
  processFx(core, xc, chn, e, 0);
  setPeriod(core, note, sub, xc, isToneporta !== 0);
  if (sub === null) {
    return;
  }
  if (note >= 0) {
    xc.note = note;
    core.virt.voicePos(chn, xc.offset.val);
  }
  if ((core.quirks & Quirk.ST3BUGS) !== 0 && TEST(xc, VolSlideFlag.NEW_VOL) !== 0) {
    xc.volume = Math.trunc(xc.volume * core.ctx.p.gvol / mod.volbase);
  }
}

// ../../packages/core/src/effects/readevent-ft2.ts
var FT2_NOTE_BN1 = 11;
var FT2_NOTE_C0 = 12;
var FT2_NOTE_AS9 = 130;
var EX_DELAY2 = 13;
function readEventFt2(core, e, chn) {
  const p = core.ctx.p;
  const xc = core.ctx.channelStates[chn];
  let note = -1;
  let key;
  let sub;
  let isToneporta = 0;
  let isDelayed = 0;
  if (p.frame >= p.speed) {
    return;
  }
  const ev = { ...e };
  xc.flags = 0;
  note = -1;
  key = ev.note;
  isToneporta = 0;
  isDelayed = 0;
  if (ev.fxt === fx_exports.FX_EXTENDED && MSN2(ev.fxp) === EX_DELAY2 && (ev.fxp & 15) !== 0) {
    key = key !== 0 ? key : xc.key_memory !== 0 ? xc.key_memory : xc.key + 1;
    if ((core.quirks & Quirk.FT2BUGS) !== 0 && key === XMP_KEY_OFF && !ev.ins && ev.f2t === fx_exports.FX_SETPAN) {
      ev.f2t = 0;
      ev.f2p = 0;
    }
    isDelayed = 1;
  }
  if (isToneportaFx(ev.fxt) || isToneportaFx(ev.f2t)) {
    isToneporta = 1;
    if ((core.quirks & Quirk.FT2BUGS) !== 0 && ev.fxt === fx_exports.FX_TONEPORTA && isToneportaFx(ev.f2t)) {
      ev.fxp = 0;
    }
  }
  if (ev.fxt === fx_exports.FX_KEYOFF && ev.fxp === 0) {
    ev.fxt = 0;
    if (!isToneporta) {
      key = XMP_KEY_OFF;
    }
  }
  if (ev.ins) {
    SET(xc, VolSlideFlag.NEW_INS);
    xc.per_flags = 0;
  }
  if (isValidNote(key - 1) && !isToneporta) {
    const ins = ev.ins ? ev.ins : xc.old_ins;
    let smp = -1;
    let n = key - 1;
    xc.key_memory = key;
    let xxi = null;
    if (isValidInstrument(core, ins - 1)) {
      xxi = getInstrument2(core, ins - 1);
      sub = getSubinstrument(core, ins - 1, key - 1);
      if (sub) {
        n += xxi?.mapXpo[key - 1] ?? 0;
        n += sub.xpo;
        smp = sub.sid;
      }
    }
    if (ev.ins) {
      xc.ins_fade = xxi ? xxi.rls : 128 << 1;
    }
    if (n >= FT2_NOTE_BN1 && n <= FT2_NOTE_AS9) {
      if (n >= FT2_NOTE_C0) {
        xc.note = n;
      }
      xc.key = key - 1;
      xc.ins = isValidInstrument(core, ins - 1) ? ins - 1 : -1;
      xc.smp = isValidSample(core, smp) ? smp : -1;
    } else {
      key = 0;
    }
  }
  sub = getSubinstrument(core, xc.ins, xc.key);
  if (key !== 0) {
    SET(xc, VolSlideFlag.NEW_NOTE);
  }
  if (isValidNote(key - 1) && !isToneporta) {
    RESET_NOTE(xc, NoteFlag2.END);
    setPatch(core, chn, xc.ins, xc.smp, xc.note);
    note = xc.note;
  }
  if (key === XMP_KEY_OFF) {
    let env = null;
    if (isValidInstrument(core, xc.ins)) {
      env = getInstrument2(core, xc.ins).aei;
    }
    if (env !== void 0 && env !== null && env.flags & 1) {
      if (sustainCheckEnv(env, xc.v_idx)) {
        SET_NOTE(xc, NoteFlag2.SUSEXIT);
      } else {
        SET_NOTE(xc, NoteFlag2.RELEASE);
      }
    } else {
      setChannelVolume(xc, 0);
    }
    SET_NOTE(xc, NoteFlag2.FADEOUT);
  }
  if (ev.ins && key !== XMP_KEY_OFF || isDelayed) {
    xc.fadeout = 65536;
    RESET_NOTE(xc, NoteFlag2.FADEOUT);
    RESET_NOTE(xc, NoteFlag2.RELEASE | NoteFlag2.SUSEXIT);
    if (sub !== null) {
      resetEnvelopes(core, xc);
    }
    xc.tremor.count = TREMOR_SUPPRESS;
  }
  setEffectDefaults(core, note, sub, xc, isToneporta !== 0);
  if (ev.ins) {
    setChannelVolume(xc, sub ? sub.vol : 0);
    setChannelPan(xc, sub ? sub.pan : 128);
  }
  setChannelVolume(xc, ev.vol - 1);
  xc.offset.val = 0;
  processFx(core, xc, chn, ev, 1);
  processFx(core, xc, chn, ev, 0);
  setPeriodFt2(core, key, note, sub, xc, isToneporta !== 0);
  if (TEST(xc, VolSlideFlag.NEW_VOL) !== 0) {
    xc.tremor.count |= TREMOR_SUPPRESS;
  }
  if (note >= 0) {
    if ((core.quirks & Quirk.FT2BUGS) !== 0 && TEST(xc, VolSlideFlag.OFFSET) !== 0) {
      xc.offset.memory = (xc.offset.val & 65280) >> 8;
      if (!isValidSample(core, xc.smp) || xc.offset.val >= (core.getSample(xc.smp)?.length ?? 0)) {
        core.virt.resetChannel(chn);
      }
    }
    core.virt.voicePos(chn, xc.offset.val);
  }
}

// ../../packages/core/src/effects/readevent-it.ts
var XMP_KEY_OFF2 = 129;
var XMP_KEY_CUT2 = 130;
var XMP_KEY_FADE2 = 131;
var NNA_CONT = 1;
var NNA_CUT = 0;
var DCT_OFF = 0;
function resetEnvelopeVolume(core, xc) {
  if (!isValidInstrument(core, xc.ins)) return;
  RESET_NOTE(xc, NoteFlag2.ENV_END);
  xc.v_idx = -1;
}
function resetEnvelopesCarry(core, xc) {
  if (!isValidInstrument(core, xc.ins)) return;
  RESET_NOTE(xc, NoteFlag2.ENV_END);
  const xxi = getInstrument2(core, xc.ins);
  if (!xxi) return;
  if ((~xxi.aei.flags & 1 << 5) !== 0) {
    xc.v_idx = -1;
  }
  if ((~xxi.pei.flags & 1 << 5) !== 0) {
    xc.p_idx = -1;
  }
  if ((~xxi.fei.flags & 1 << 5) !== 0) {
    xc.f_idx = -1;
  }
}
function copyChannel(core, to, from) {
  if (to > 0 && to !== from) {
    const arr = core.channelStates;
    const src = arr[from];
    const dst = arr[to];
    if (!src || !dst) return;
    deepCopyChannel(src, dst);
  }
}
function deepCopyChannel(src, dst) {
  dst.flags = src.flags;
  dst.per_flags = src.per_flags;
  dst.note_flags = src.note_flags;
  dst.note = src.note;
  dst.key = src.key;
  dst.period = src.period;
  dst.finalPeriod = src.finalPeriod;
  dst.ins = src.ins;
  dst.old_ins = src.old_ins;
  dst.smp = src.smp;
  dst.mastervol = src.mastervol;
  dst.delay = src.delay;
  dst.keyoff = src.keyoff;
  dst.fadeout = src.fadeout;
  dst.ins_fade = src.ins_fade;
  Object.assign(dst.macro, src.macro);
  Object.assign(dst.noteslide, src.noteslide);
  dst.volume = src.volume;
  dst.gvl = src.gvl;
  dst.rvv = src.rvv;
  dst.rpv = src.rpv;
  dst.split = src.split;
  dst.pair = src.pair;
  dst.v_idx = src.v_idx;
  dst.p_idx = src.p_idx;
  dst.f_idx = src.f_idx;
  dst.key_porta = src.key_porta;
  dst.finetune = src.finetune;
  dst.per_adj = src.per_adj;
  Object.assign(dst.vibrato.lfo, src.vibrato.lfo);
  dst.vibrato.memory = src.vibrato.memory;
  Object.assign(dst.tremolo.lfo, src.tremolo.lfo);
  dst.tremolo.memory = src.tremolo.memory;
  Object.assign(dst.panbrello.lfo, src.panbrello.lfo);
  dst.panbrello.memory = src.panbrello.memory;
  dst.arpeggio.val = src.arpeggio.val.slice();
  dst.arpeggio.size = src.arpeggio.size;
  dst.arpeggio.count = src.arpeggio.count;
  dst.arpeggio.memory = src.arpeggio.memory;
  Object.assign(dst.insvib.lfo, src.insvib.lfo);
  dst.insvib.sweep = src.insvib.sweep;
  Object.assign(dst.offset, src.offset);
  Object.assign(dst.retrig, src.retrig);
  Object.assign(dst.tremor, src.tremor);
  Object.assign(dst.vol, src.vol);
  Object.assign(dst.fine_vol, src.fine_vol);
  Object.assign(dst.gvol, src.gvol);
  Object.assign(dst.trackvol, src.trackvol);
  Object.assign(dst.freq, src.freq);
  Object.assign(dst.porta, src.porta);
  Object.assign(dst.fine_porta, src.fine_porta);
  Object.assign(dst.pan, src.pan);
  Object.assign(dst.invloop, src.invloop);
  dst.tempo_slide = src.tempo_slide;
  Object.assign(dst.filter, src.filter);
  Object.assign(dst.delayed_event, src.delayed_event);
  dst.delayed_ins = src.delayed_ins;
  dst.key_memory = src.key_memory;
  dst.info_period = src.info_period;
  dst.info_pitchbend = src.info_pitchbend;
  dst.info_position = src.info_position;
  dst.info_finalvol = src.info_finalvol;
  dst.info_finalpan = src.info_finalpan;
  dst.info_notepan = src.info_notepan;
}
function checkFadeout(core, xc, ins) {
  const xxi = getInstrument2(core, ins);
  if (xxi === null) {
    return true;
  }
  const ON = 1 << 0;
  const CARRY = 1 << 5;
  return (~xxi.aei.flags & ON) !== 0 || (~xxi.aei.flags & CARRY) !== 0 || xc.ins_fade === 0 || xc.fadeout <= xc.ins_fade;
}
function checkInvalidSample(core, ins, key) {
  const mod = core.module;
  if (ins >= 0 && ins < mod.ins) {
    const xxi = mod.instruments[ins];
    if (!xxi) return true;
    const smp = xxi.map[key] ?? 255;
    if (smp === 255 || smp >= mod.samples.length) {
      return true;
    }
  }
  return false;
}
function fixPeriod(core, chn, sub) {
  if (sub.nna === NNA_CONT) {
    const mod = core.module;
    const xc = core.channelStates[chn];
    const xxi = getInstrument2(core, xc.ins);
    if (!xxi) return;
    xc.period = noteToPeriod(
      mod.periodType,
      xc.key + sub.xpo + (xxi.mapXpo[xc.key_porta] ?? 0),
      xc.finetune,
      xc.per_adj
    );
  }
}
function isSameSid(core, chn, ins, key) {
  const xc = core.channelStates[chn];
  const s1 = getSubinstrument(core, ins, key);
  const s2 = getSubinstrument(core, xc.ins, xc.key);
  return !!(s1 && s2 && s1.sid === s2.sid);
}
function readEventIt(core, e, chn) {
  const mod = core.module;
  const xc = core.channelStates[chn];
  let sub;
  let note = -1;
  let key = e.note;
  let notSameIns = 0;
  let notSameSmp = 0;
  let newInvalidIns = 0;
  let isToneporta = 0;
  let isRelease = 0;
  let resetEnv = 0;
  let resetSusloop = 0;
  let useInsVol = 0;
  let candidateIns = xc.ins;
  const sampleMode = (core.quirks & Quirk.VIRTUAL) === 0 ? 1 : 0;
  let toneportaOffset = 0;
  let retrigIns = 0;
  const ev = { ...e };
  if (ev.ins) {
    xc.delayed_ins = 0;
  } else if (ev.note && xc.delayed_ins) {
    ev.ins = xc.delayed_ins;
    xc.delayed_ins = 0;
  }
  xc.flags = 0;
  if ((core.quirks & Quirk.ITOLDFX) !== 0) {
    if (ev.note === XMP_KEY_OFF2 && isValidInstrument(core, ev.ins - 1)) {
      retrigIns = 1;
    }
  }
  if (ev.ins) {
    if (ev.ins <= mod.ins && isValidNote(ev.note - 1)) {
      const ins = ev.ins - 1;
      if (checkInvalidSample(core, ins, ev.note - 1)) {
        candidateIns = ins;
        ev.note = 0;
        ev.ins = 0;
        ev.vol = 0;
        ev.fxt = 0;
        ev.fxp = 0;
        ev.f2t = 0;
        ev.f2p = 0;
      }
    }
  } else {
    if (isValidNote(ev.note - 1)) {
      const ins = xc.old_ins - 1;
      if (!isValidInstrument(core, ins)) {
        newInvalidIns = 1;
      } else if (checkInvalidSample(core, ins, ev.note - 1)) {
        ev.note = 0;
        ev.ins = 0;
        ev.vol = 0;
        ev.fxt = 0;
        ev.fxp = 0;
        ev.f2t = 0;
        ev.f2p = 0;
      }
    }
  }
  if (isToneportaFx(ev.fxt) || isToneportaFx(ev.f2t)) {
    isToneporta = 1;
  }
  if (TEST_NOTE(xc, NoteFlag2.ENV_RELEASE | NoteFlag2.FADEOUT) !== 0) {
    isRelease = 1;
  }
  if (xc.period <= 0 || TEST_NOTE(xc, NoteFlag2.END) !== 0) {
    isToneporta = 0;
  }
  if (isToneporta && ev.fxt === 9) {
    toneportaOffset = 1;
    if ((core.quirks & Quirk.PRENV) === 0) {
      RESET_NOTE(xc, NoteFlag2.ENV_END);
    }
  }
  if (ev.ins) {
    const ins = ev.ins - 1;
    let setNewIns = 1;
    if (isRelease && !key) {
      if (isToneporta) {
        if ((core.quirks & Quirk.PRENV) !== 0 || TEST_NOTE(xc, NoteFlag2.SET) !== 0) {
          isToneporta = 0;
          resetEnvelopesCarry(core, xc);
        }
      } else {
        resetEnvelopesCarry(core, xc);
      }
    }
    if (isToneporta && xc.ins === ins) {
      if ((core.quirks & Quirk.PRENV) === 0) {
        if (isSameSid(core, chn, ins, key - 1)) {
          setNewIns = isRelease ? 0 : 1;
        } else {
          notSameIns = 1;
          notSameSmp = 1;
        }
      }
    }
    if (setNewIns) {
      SET(xc, VolSlideFlag.NEW_INS);
      resetEnv = 1;
    }
    useInsVol = 1;
    xc.per_flags = 0;
    if (isValidInstrument(core, ins)) {
      if (!key && TEST_NOTE(xc, NoteFlag2.KEY_CUT) === 0) {
        if (sampleMode && TEST_NOTE(xc, NoteFlag2.END) !== 0) {
          core.virt.voicePos(chn, 0);
        }
        if (xc.ins === ins) {
          SET(xc, VolSlideFlag.NEW_INS);
          useInsVol = 1;
        } else {
          key = xc.key + 1;
        }
        RESET_NOTE(xc, NoteFlag2.SET);
      }
      if (xc.ins !== ins && (isToneporta === 0 || (core.quirks & Quirk.PRENV) === 0)) {
        candidateIns = ins;
        if (!isSameSid(core, chn, ins, key - 1)) {
          notSameIns = 1;
          if (isToneporta) {
            sub = getSubinstrument(core, ins, key);
            if (sub !== null) {
              xc.volume = sub.vol;
              useInsVol = 0;
            }
          }
        }
      }
    } else {
      if (sampleMode) {
        xc.volume = 0;
      }
      newInvalidIns = 1;
      xc.flags = 0;
      useInsVol = 0;
    }
  }
  if (key) {
    SET(xc, VolSlideFlag.NEW_NOTE);
    SET_NOTE(xc, NoteFlag2.SET);
    if (key === XMP_KEY_FADE2) {
      SET_NOTE(xc, NoteFlag2.FADEOUT);
      resetEnv = 0;
      resetSusloop = 0;
      useInsVol = 0;
    } else if (key === XMP_KEY_CUT2) {
      SET_NOTE(xc, NoteFlag2.END | NoteFlag2.CUT | NoteFlag2.KEY_CUT);
      xc.period = 0;
      core.virt.resetChannel(chn);
    } else if (key === XMP_KEY_OFF2) {
      let env = null;
      if (isValidInstrument(core, xc.ins)) {
        env = mod.instruments[xc.ins].aei;
      }
      if (sustainCheckEnv(env, xc.v_idx)) {
        SET_NOTE(xc, NoteFlag2.SUSEXIT);
      } else {
        SET_NOTE(xc, NoteFlag2.RELEASE);
      }
      SET(xc, VolSlideFlag.KEY_OFF);
      resetEnv = 0;
      resetSusloop = 0;
      if (!ev.ins) {
        useInsVol = 0;
      }
    } else if (!newInvalidIns) {
      if (!isToneporta) {
        resetEnv = 1;
        resetSusloop = 1;
      }
      if (isToneporta) {
        if (notSameIns || TEST_NOTE(xc, NoteFlag2.END) !== 0) {
          SET(xc, VolSlideFlag.NEW_INS);
          RESET_NOTE(xc, NoteFlag2.ENV_RELEASE | NoteFlag2.SUSEXIT | NoteFlag2.FADEOUT);
        } else {
          if (isValidNote(key - 1)) {
            xc.key_porta = key - 1;
          }
          key = 0;
        }
      }
    }
  }
  if (isValidNote(key - 1) && !newInvalidIns) {
    if (TEST_NOTE(xc, NoteFlag2.CUT) !== 0) {
      useInsVol = 1;
    }
    xc.key = --key;
    RESET_NOTE(xc, NoteFlag2.END);
    sub = getSubinstrument(core, candidateIns, key);
    if (sub !== null) {
      const transp = mod.instruments[candidateIns].mapXpo[key] ?? 0;
      let smp;
      let to;
      let dct;
      xc.delay = 0;
      note = key + sub.xpo + transp;
      smp = sub.sid;
      if (!isValidSample(core, smp)) {
        smp = -1;
      }
      dct = sub.dct;
      if (notSameSmp) {
        fixPeriod(core, chn, sub);
        core.virt.setNna(chn, NNA_CUT);
        dct = DCT_OFF;
      }
      const insObj = mod.instruments[candidateIns];
      to = core.virt.setPatch(
        chn,
        insObj,
        smp,
        note,
        key,
        sub.nna,
        dct,
        sub.dca
      );
      let rvv = sub.rvv !== void 0 ? sub.rvv & 255 : 0;
      if (rvv) {
        rvv = rvv < 0 ? 0 : rvv > 100 ? 100 : rvv;
        xc.rvv = getRandom(rvv + 1);
      } else {
        xc.rvv = 0;
      }
      let rpv = sub.rvv !== void 0 ? (sub.rvv & 65280) >> 8 : 0;
      if (rpv) {
        rpv = rpv < 0 ? 0 : rpv > 64 ? 64 : rpv;
        xc.rpv = getRandom(rpv + 1) - Math.trunc(rpv / 2);
      } else {
        xc.rpv = 0;
      }
      if (to < 0) return;
      if (to !== chn) {
        copyChannel(core, to, chn);
        core.channelStates[to].flags = 0;
      }
      if (smp >= 0) {
        xc.smp = smp;
      }
    } else {
      xc.flags = 0;
      useInsVol = 0;
    }
  }
  if (isToneporta || retrigIns) {
    if ((core.quirks & Quirk.PRENV) !== 0 && ev.ins) {
      resetEnvelopesCarry(core, xc);
    }
  }
  if (isValidInstrument(core, candidateIns)) {
    if (xc.ins !== candidateIns) {
      resetEnvelopes(core, xc);
    }
    xc.ins = candidateIns;
    xc.ins_fade = mod.instruments[candidateIns].rls;
  }
  if (ev.ins && TEST_NOTE(xc, NoteFlag2.ENV_END) !== 0) {
    if (checkFadeout(core, xc, candidateIns)) {
      resetEnvelopeVolume(core, xc);
    } else {
      resetEnv = 0;
    }
  }
  if (resetEnv) {
    if (ev.note) {
      RESET_NOTE(xc, NoteFlag2.ENV_RELEASE | NoteFlag2.SUSEXIT | NoteFlag2.FADEOUT);
    }
    xc.fadeout = 65536;
  }
  if (resetSusloop && ev.note) {
    RESET_NOTE(xc, NoteFlag2.SAMPLE_RELEASE);
  }
  if (retrigIns && notSameIns) {
    SET(xc, VolSlideFlag.NEW_INS);
    core.virt.voicePos(chn, 0);
    xc.fadeout = 65536;
    RESET_NOTE(xc, NoteFlag2.RELEASE | NoteFlag2.SUSEXIT | NoteFlag2.FADEOUT);
  }
  sub = getSubinstrument(core, xc.ins, xc.key);
  setEffectDefaults(core, note, sub, xc, isToneporta !== 0);
  if (sub !== null) {
    if (note >= 0) {
      setChannelPan(xc, sub.pan);
      if (TEST_NOTE(xc, NoteFlag2.CUT) !== 0) {
        resetEnvelopes(core, xc);
      } else if (toneportaOffset === 0 || (core.quirks & Quirk.PRENV) !== 0) {
        resetEnvelopesCarry(core, xc);
      }
      RESET_NOTE(xc, NoteFlag2.CUT);
    }
  }
  if (ev.vol && (TEST_NOTE(xc, NoteFlag2.CUT) === 0 || ev.ins !== 0)) {
    setChannelVolume(xc, ev.vol - 1);
  }
  xc.offset.val &= ~65535;
  processFx(core, xc, chn, ev, 0);
  processFx(core, xc, chn, ev, 1);
  setPeriod(core, note, sub, xc, isToneporta !== 0);
  if (sub === null) {
    return;
  }
  if (note >= 0) {
    xc.note = note;
  }
  if (note >= 0 || toneportaOffset) {
    let off = 0;
    if (TEST(xc, VolSlideFlag.OFFSET) !== 0 && ((core.quirks & Quirk.ITOLDFX) !== 0 || isValidSample(core, xc.smp) && xc.offset.val < (mod.samples[xc.smp]?.length ?? 0))) {
      off = xc.offset.val;
    }
    core.virt.voicePos(chn, off);
  }
  if (useInsVol && TEST(xc, VolSlideFlag.NEW_VOL) === 0) {
    xc.volume = sub.vol;
  }
}

// ../../packages/core/src/core.ts
var MSN3 = (v) => v >> 4 & 15;
var LSN3 = (v) => v & 15;
var XMP_MARK_END2 = 255;
var XMP_MARK_SKIP = 254;
var ANTICLICK_SHIFT = 3;
var DEFAULT_TIME_FACTOR = 10;
var PAL_RATE = 250;
var MAXVOICES_LIMIT = 128;
function getTicksize(freq, timeFactor, rrate, bpm) {
  if (freq <= 0 || bpm <= 0 || timeFactor <= 0 || rrate <= 0) return -1;
  const calc = freq * timeFactor * rrate / bpm / 1e3;
  if (!Number.isFinite(calc)) return -1;
  let ticksize = Math.trunc(calc);
  if (ticksize < 1 << ANTICLICK_SHIFT) ticksize = 1 << ANTICLICK_SHIFT;
  return ticksize;
}
function makeChannelState() {
  return {
    flags: 0,
    per_flags: 0,
    note_flags: 0,
    note: 0,
    key: 0,
    period: 0,
    finalPeriod: 0,
    ins: -1,
    old_ins: 0,
    smp: -1,
    mastervol: 0,
    delay: 0,
    keyoff: 0,
    fadeout: 0,
    ins_fade: 0,
    macro: { val: 0, target: 0, slide: 0, active: 0, finalvol: 0, notepan: 0 },
    noteslide: { slide: 0, fslide: 0, count: 0, speed: 0 },
    volume: 0,
    gvl: 0,
    rvv: 0,
    rpv: 0,
    split: 0,
    pair: 0,
    v_idx: 0,
    p_idx: 0,
    f_idx: 0,
    key_porta: 0,
    finetune: 0,
    per_adj: 0,
    vibrato: { lfo: { type: 0, rate: 0, depth: 0, phase: 0 }, memory: 0 },
    tremolo: { lfo: { type: 0, rate: 0, depth: 0, phase: 0 }, memory: 0 },
    panbrello: { lfo: { type: 0, rate: 0, depth: 0, phase: 0 }, memory: 0 },
    arpeggio: { val: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], size: 0, count: 0, memory: 0 },
    insvib: { lfo: { type: 0, rate: 0, depth: 0, phase: 0 }, sweep: 0 },
    offset: { val: 0, val2: 0, memory: 0 },
    retrig: { val: 0, count: 0, type: 0, limit: 0 },
    tremor: { up: 0, down: 0, count: 0, memory: 0 },
    vol: { slide: 0, fslide: 0, slide2: 0, memory: 0, fslide2: 0, memory2: 0 },
    fine_vol: { up_memory: 0, down_memory: 0 },
    gvol: { slide: 0, fslide: 0, memory: 0 },
    trackvol: { slide: 0, fslide: 0, memory: 0 },
    freq: { slide: 0, fslide: 0, memory: 0, down_memory: 0 },
    porta: { target: 0, dir: 0, slide: 0, memory: 0, note_memory: 0 },
    fine_porta: { up_memory: 0, down_memory: 0, xf_up_memory: 0, xf_down_memory: 0 },
    pan: { val: 128, slide: 0, fslide: 0, memory: 0, surround: 0 },
    invloop: { speed: 0, count: 0, pos: 0 },
    tempo_slide: 0,
    filter: { cutoff: 255, resonance: 0, envelope: 0, can_disable: 0 },
    delayed_event: { ...EMPTY_EVENT },
    delayed_ins: 0,
    key_memory: 0,
    info_period: 0,
    info_pitchbend: 0,
    info_position: 0,
    info_finalvol: 0,
    info_finalpan: 128,
    info_notepan: 0
  };
}
var Core = class {
  registries = new Registries();
  samples = new SampleStore();
  virt = new VirtualLayer();
  _timeFactorRelative = 1;
  /** Reserved smix channels (xmp_start_smix) — appended after the song's
   * mod.chn; playNote()/stopNote() inject events into them. */
  smixChannels = 0;
  smixNext = 0;
  activeDspName = "softmixer";
  eventScratch = [];
  _state = CoreState.UNLOADED;
  _module = null;
  /** Per-order time/speed/bpm info (xxo_info) — used by the demo's seek bar. */
  ordInfo = [];
  /** scan[seq] end ord/row/num per sequence — flattened for sequence 0 use. */
  scanEnd = { ord: 0, row: 0, num: 0 };
  /** Per-sequence scan endpoints (C's p->scan[seq]) for setPosition. */
  _scan = [];
  _p;
  _flow;
  _xc = [];
  _s = {
    freq: 44100,
    format: 0,
    interp: 1,
    amplify: 1,
    mix: 100,
    numvoc: 128,
    ticksize: 0,
    dtright: 0,
    dtleft: 0,
    bidir_adjust: 0
  };
  constructor(config) {
    this.initPlayerState();
    if (config?.sampleRate) this._s.freq = config.sampleRate;
    if (config?.interp !== void 0) this._s.interp = config.interp;
    if (config?.numVoices) this._s.numvoc = config.numVoices;
  }
  initPlayerState() {
    this._p = {
      ord: 0,
      pos: 0,
      row: 0,
      frame: -1,
      speed: 6,
      bpm: 125,
      st26_speed: 0,
      sequence: 0,
      loop_count: 0,
      sequence_control: [],
      bad_sequence: 0,
      gvol: 64,
      master_vol: 100,
      smix_vol: 100,
      channel_vol: [],
      channel_mute: [],
      inject_event: [],
      flow: {
        pbreak: 0,
        jump: -1,
        delay: 0,
        jumpline: 0,
        loop_dest: -1,
        loop_param: -1,
        loop_start: -1,
        loop_count: 0,
        loop_active_num: 0,
        loop: [],
        num_rows: 0,
        end_point: 0,
        rowdelay: 0,
        rowdelay_set: 0,
        force_reposition: 0
      },
      current_time: 0,
      filter: 0,
      flags: 0
    };
    this._flow = this._p.flow;
  }
  get mixerState() {
    return this._s;
  }
  // ------------------------------------------------------------------
  // state views
  // ------------------------------------------------------------------
  get state() {
    return this._state;
  }
  get module() {
    return this._module;
  }
  get channels() {
    return this._module?.chn ?? 0;
  }
  get quirks() {
    return this._module?.quirks ?? 0;
  }
  get playState() {
    return {
      ord: this._p.ord,
      row: this._p.row,
      frame: this._p.frame,
      speed: this._p.speed,
      bpm: this._p.bpm,
      timeMs: this._p.current_time,
      loopCount: this._p.loop_count
    };
  }
  get channelStates() {
    return this._xc;
  }
  get voiceStates() {
    return this.virt.voices;
  }
  get sampleRate() {
    return this._s.freq;
  }
  get ticksize() {
    return this._s.ticksize;
  }
  /**
   * The context view is read on every effect call and every mixer tick, so it
   * is built once per Core instead of allocating a fresh getter object per
   * access. The getters still read live state; only the wrapper is reused.
   */
  _ctx;
  get ctx() {
    if (this._ctx) return this._ctx;
    const self = this;
    return this._ctx = {
      get p() {
        return self.internalP;
      },
      get s() {
        return self.mixerState;
      },
      get m() {
        return self._module;
      },
      get channelStates() {
        return self._xc;
      },
      get voiceStates() {
        return self.virt.voices;
      },
      get state() {
        return self._state;
      },
      get quirks() {
        return self.quirks;
      }
    };
  }
  // ------------------------------------------------------------------
  // loading
  // ------------------------------------------------------------------
  /**
   * Load via registered format plugins (load.c:233-332): probe → parse →
   * scan sequences. Parser fills ModuleData + RawSamples through LoadCtx;
   * the core normalizes samples into the store and rewrites mod.samples to
   * stored ids.
   */
  loadModule(bytes, opts) {
    if (this._state === CoreState.PLAYING) this.stopPlayer();
    this.samples.clear();
    let data = bytes;
    if (isPpPacked(data)) {
      const out = depackPp(data);
      if (out) data = out;
    }
    if (isIcePacked(data)) {
      data = depackIce(data);
    }
    const fmt = this.registries.formatFor(data);
    if (!fmt) {
      throw new ModplayError("unknown module format");
    }
    const loaderCtx = {
      sampleRate: this._s.freq,
      outputRate: this._s.freq,
      addSample: (raw) => this.samples.add(raw),
      sidecarNt: opts?.sidecarNt,
      externalInstrument: opts?.externalInstrument
    };
    const mod = fmt.load(data, loaderCtx);
    this.finalizeModule(mod, data);
  }
  /**
   * In-memory module entry point (studio/creator path): same finalize
   * sequence as loadModule — sequence scan, ordInfo, instrument keys —
   * but takes a caller-constructed ModuleData and registers its samples
   * through the store so voices resolve them by id.
   *
   * IMPORTANT: store ids are assigned in registration order, so the
   * caller MUST register samples in the same order as mod.samples
   * (instrument sub.sid values index mod.samples).
   */
  loadModuleData(mod) {
    if (this._state === CoreState.PLAYING) this.stopPlayer();
    this.samples.clear();
    for (const raw of mod.samples) this.samples.add(raw);
    this.finalizeModule(mod);
  }
  /** Shared loadModule/loadModuleData tail: scan + sequence setup + keys. */
  finalizeModule(mod, raw) {
    const adjust = (s) => {
      let out = "";
      for (const ch of s) {
        const c = ch.codePointAt(0);
        out += c > 127 || c < 32 && c !== 0 || c === 127 ? " " : ch;
      }
      return out.replace(/ +$/, "");
    };
    mod.title = adjust(mod.title);
    for (const ins of mod.instruments) ins.name = adjust(ins.name);
    if (this.samples.size === 0 && mod.samples.length > 0) {
      for (const raw2 of mod.samples) this.samples.add(raw2);
    }
    for (const smp of mod.samples) {
      if (smp.name) smp.name = adjust(smp.name);
    }
    let md5 = "";
    let quirkFlags = 0;
    let forceMode = XmpMode.AUTO;
    if (raw) {
      md5 = md5Hex(raw);
      for (const q of MODULE_QUIRKS) {
        if (q.md5 === md5) {
          quirkFlags |= q.flags;
          if (q.mode !== XmpMode.AUTO) forceMode = q.mode;
        }
      }
      if (md5 === "93f146aeb758c39d8b5fbc98bf237a43") {
        quirkFlags |= XmpFlag.FIXLOOP;
      }
    }
    if (forceMode !== XmpMode.AUTO) {
      const apply = (c4rate, quirk, flowMode, readEventType, periodType) => {
        mod.c4rate = c4rate;
        mod.quirks = quirk;
        mod.flowMode = flowMode;
        mod.readEventType = readEventType;
        mod.periodType = periodType;
      };
      switch (forceMode) {
        case XmpMode.MOD:
          apply(8287, 0, FLOW_MODE_GENERIC, ReadEventType.MOD, PeriodType.AMIGA);
          break;
        case XmpMode.NOISETRACKER:
          apply(8287, Quirk.NOBPM, FLOW_MODE_GENERIC, ReadEventType.MOD, PeriodType.MODRNG);
          break;
        case XmpMode.PROTRACKER:
          apply(8287, Quirk.PROTRACK, FLOW_MODE_GENERIC, ReadEventType.MOD, PeriodType.MODRNG);
          break;
      }
    }
    this._p.flags = quirkFlags;
    void md5;
    {
      const volbase = mod.volbase;
      for (const ins of mod.instruments) {
        for (const env of [ins.aei, ins.fei, ins.pei]) {
          if (env.npt <= 0 || env.npt > 32) {
            env.flags &= ~EnvelopeFlags.ON;
          }
          if (env.lps >= env.npt || env.lpe >= env.npt) {
            env.flags &= ~EnvelopeFlags.LOOP;
          }
          if (env.sus >= env.npt || env.sue >= env.npt) {
            env.flags &= ~EnvelopeFlags.SUS;
          }
        }
        for (const env of [ins.aei, ins.fei, ins.pei]) {
          while (env.x.length < 32) env.x.push(0);
          while (env.y.length < 32) env.y.push(0);
        }
        if (ins.aei.flags & EnvelopeFlags.ON) {
          for (let k = 0; k < ins.aei.npt; k++) {
            let y = ins.aei.y[k] ?? 0;
            if (y !== y << 16 >> 16) y = y << 16 >> 16;
            if (y < 0) y = 0;
            else if (y > volbase) y = volbase;
            ins.aei.y[k] = y;
          }
        }
      }
    }
    {
      mod.len = Math.max(0, Math.min(
        mod.len,
        1024
        /* XMP_MAX_MOD_LENGTH */
      ));
      mod.pat = Math.max(0, Math.min(mod.pat, 257));
      mod.ins = Math.max(0, Math.min(mod.ins, 255));
      mod.chn = Math.max(0, Math.min(
        mod.chn,
        64
        /* XMP_MAX_CHANNELS */
      ));
      if (mod.restart >= mod.len) mod.restart = 0;
      if (mod.speed <= 0 || mod.speed > 255) mod.speed = 6;
      mod.bpm = Math.max(20, Math.min(1e3, mod.bpm));
    }
    const sc = new Scanner();
    const res = sc.scan(mod);
    this.ordInfo = res.xxo_info;
    this._sequenceControl = res.sequence_control;
    mod.num_sequences = res.num_sequences;
    const endlessDurations = mod.endless ? mod.sequences.map((sq) => sq.duration) : [];
    mod.sequences = [];
    for (let i = 0; i < res.num_sequences; i++) {
      const epOrd = res.entry_points[i] ?? 0;
      mod.sequences.push({
        ord: i,
        entry_point: epOrd,
        duration: mod.endless && endlessDurations[i] ? endlessDurations[i] : Math.max(0, Math.min(res.scan[i]?.time ?? 0, 2147483647)),
        time: res.scan[i]?.time ?? 0,
        speed: res.xxo_info[epOrd]?.speed ?? 0,
        bpm: res.xxo_info[epOrd]?.bpm ?? 0,
        gvl: res.xxo_info[epOrd]?.gvl ?? -1,
        start_row: res.xxo_info[epOrd]?.start_row ?? 0
      });
    }
    const s0 = res.scan[0];
    this.scanEnd = { ord: s0?.ord ?? 0, row: s0?.row ?? 0, num: s0?.num ?? 0 };
    this._scan = res.scan.map((s) => ({
      ord: s?.ord ?? 0,
      row: s?.row ?? 0,
      num: s?.num ?? 0
    }));
    keyInstruments(mod.instruments);
    this._module = mod;
    this._state = CoreState.LOADED;
  }
  // ------------------------------------------------------------------
  // lifecycle
  // ------------------------------------------------------------------
  startPlayer() {
    if (this._state < CoreState.LOADED) {
      throw new StateError("no module loaded");
    }
    if (this._state > CoreState.LOADED) this.stopPlayer();
    const mod = this.module;
    const p = this._p;
    this._timeFactorRelative = 1;
    p.master_vol = 100;
    p.gvol = this._module.volbase;
    p.pos = p.ord = 0;
    p.frame = -1;
    p.row = 0;
    p.current_time = 0;
    p.loop_count = 0;
    p.sequence = 0;
    p.bad_sequence = 0;
    for (let i = 0; i < mod.chn + this.smixChannels; i++) {
      p.channel_mute[i] = i < mod.chn && (mod.channels[i]?.flg ?? 0) & 4 ? true : false;
      p.channel_vol[i] = 100;
      p.inject_event[i] = { ...EMPTY_EVENT };
    }
    this.virt.setChannelMute(p.channel_mute);
    if (this.skipInvalidOrders() < 0) {
      p.ord = 0;
      p.row = 0;
      p.bad_sequence = 1;
      this._flow.end_point = 0;
      this._flow.num_rows = 0;
    } else {
      this._flow.num_rows = mod.patterns[mod.xxo[p.ord]]?.rows ?? 0;
      this._flow.end_point = this.seqScan().num;
    }
    this.updateFromOrdInfo();
    this.virt.setSampleLookup((id) => this.samples.get(id));
    this.virt.setModuleRef(() => this._module);
    this.virt.setChannelStatesHook((chn, apply) => {
      const xc = this._xc[chn];
      if (xc === void 0) return false;
      apply(xc);
      return true;
    });
    this.virt.on(
      mod.chn + this.smixChannels,
      (mod.quirks & Quirk.VIRTUAL) !== 0,
      this._s.numvoc
    );
    this._flow.loop = Array.from({ length: this.virt.virtChannels }, () => ({
      start: 0,
      count: 0
    }));
    resetFlow(this._flow);
    this.resetChannels();
    this.recomputeTicksize();
    this._state = CoreState.PLAYING;
  }
  stopPlayer() {
    if (this._state < CoreState.PLAYING) return;
    this._state = CoreState.LOADED;
    this.virt.off();
  }
  destroy() {
    this.stopPlayer();
    this._module = null;
    this._state = CoreState.UNLOADED;
    this.samples.clear();
  }
  // ------------------------------------------------------------------
  // tempo/speed/rate
  // ------------------------------------------------------------------
  setTempo(bpm) {
    this._p.bpm = bpm;
    this.recomputeTicksize();
  }
  setSpeed(speed) {
    this._p.speed = speed;
  }
  setSampleRate(hz) {
    this._s.freq = hz;
    this.recomputeTicksize();
  }
  /** Stereo mixing / pan separation (xmp_set_player XMP_PLAYER_MIX,
   * control.c:446 → s->mix). 100 = full stereo field as panned; 0 =
   * mono downmix; values above 100 push the field wider. Consumed in
   * process_pan (player.c:1402): finalpan = (finalpan - 0x80) × mix / 100. */
  setPanSeparation(v) {
    this._s.mix = Math.max(0, Math.min(v, 200));
  }
  getPanSeparation() {
    return this._s.mix;
  }
  /** Interpolation mode (xmp_set_player XMP_PLAYER_INTERP, control.c:452-456
   * → s->interp): 0 nearest, 1 linear, 2 spline. Clamped to the valid range;
   * takes effect on the next rendered frame (the softmixer reads s.interp
   * per renderFrame). */
  setInterpolation(v) {
    this._s.interp = Math.max(0, Math.min(v, 2));
  }
  getInterpolation() {
    return this._s.interp;
  }
  /**
   * Softmixer voice budget (xmp_set_player XMP_PLAYER_VOICES, control.c:506-508
   * → s->numvoc). Caps the virtual-layer voice pool. C semantics
   * (virtual.c:107-118): the pool holds `numvoc` voices total; the NNA
   * overflow adds `numvoc` virtual channels for QUIRK_VIRTUAL modules.
   * Takes effect on the next startPlayer (virt_on), like C's virt_on.
   */
  setNumVoices(v) {
    this._s.numvoc = Math.max(1, Math.min(v, MAXVOICES_LIMIT));
  }
  getNumVoices() {
    return this._s.numvoc;
  }
  setTempoFactor(f) {
    this._timeFactorRelative = f;
    this.recomputeTicksize();
  }
  // ------------------------------------------------------------------
  // plugin accessors
  // ------------------------------------------------------------------
  setDsp(name) {
    if (this._state === CoreState.PLAYING) {
      throw new StateError("cannot switch DSP while playing");
    }
    this.registries.dsp(name);
    this.activeDspName = name;
  }
  dsp(name) {
    return this.registries.dsp(name ?? this.activeDspName);
  }
  output(name) {
    return this.registries.output(name);
  }
  format(name) {
    return this.registries.format(name);
  }
  // ------------------------------------------------------------------
  // samples
  // ------------------------------------------------------------------
  swapSample(id, data, meta) {
    this.samples.swap(id, data, meta);
  }
  getSample(id) {
    return this.samples.get(id);
  }
  /**
   * xmp_start_smix (smix.c:197-233): reserve `channels` extra channels
   * (appended after the song's mod.chn) for playNote()/stopNote().
   * Call after loadModule, before startPlayer — C requires state <= LOADED.
   */
  startSmix(channels = 4) {
    if (channels < 1) throw new StateError("smix channels must be >= 1");
    if (this._state >= CoreState.PLAYING) {
      if (this.smixChannels === channels) return;
      throw new StateError("cannot change smix channels while playing");
    }
    this.smixChannels = channels;
  }
  /**
   * xmp_smix_play_instrument (smix.c:241-270): inject note+ins+vol into
   * reserved smix channel `chn` (0-based over the reserved pool). Re-triggering
   * the same channel retakes it. note 0 = middle C (60), C convention.
   */
  playNote(ins, note = 60, vol = 64, chn = -1) {
    const mod = this._module;
    if (this._state !== CoreState.PLAYING || !mod) {
      throw new StateError("player not started");
    }
    if (this.smixChannels === 0 || ins < 0 || ins >= mod.ins) {
      throw new StateError("invalid smix note");
    }
    const c = chn >= 0 ? chn % this.smixChannels : this.smixNext++ % this.smixChannels;
    const e = {
      note: note > 0 && note < 120 ? note + 1 : note,
      ins: ins + 1,
      vol: Math.min(64, Math.max(0, vol)) + 1,
      fxt: 0,
      fxp: 0,
      f2t: 0,
      f2p: 0
    };
    this._p.inject_event[mod.chn + c] = e;
  }
  /** xmp_smix_stop... inject a key-off on the reserved channel. */
  stopNote(chn) {
    const mod = this._module;
    if (this._state !== CoreState.PLAYING || !mod) {
      throw new StateError("player not started");
    }
    if (chn < 0 || chn >= this.smixChannels) {
      throw new StateError("invalid smix channel");
    }
    this._p.inject_event[mod.chn + chn] = {
      note: XMP_KEY_OFF,
      ins: 0,
      vol: 0,
      fxt: 0,
      fxp: 0,
      f2t: 0,
      f2p: 0
    };
  }
  /** xmp_channel_mute (control.c:345): -1 query / 0 unmute / 1 mute. */
  setChannelMute(chn, mute) {
    const p = this._p;
    if (chn < 0 || chn >= p.channel_mute.length) return;
    p.channel_mute[chn] = mute;
    this.virt.setChannelMute(p.channel_mute);
  }
  getChannelMute(chn) {
    return this._p.channel_mute[chn] ?? false;
  }
  /** xmp_channel_vol (control.c:369): 0..100 per-channel volume. */
  setChannelVol(chn, vol) {
    const p = this._p;
    if (chn < 0 || chn >= p.channel_vol.length) return;
    p.channel_vol[chn] = Math.max(0, Math.min(100, vol));
  }
  getChannelVol(chn) {
    return this._p.channel_vol[chn] ?? 100;
  }
  // ------------------------------------------------------------------
  // rendering
  // ------------------------------------------------------------------
  /** Render exactly one tick into out (play_frame → softmixer). Returns
   * interleaved floats written, or -1 at end-of-module. ticksize is
   * recomputed EVERY tick (mixer.c:525 libxmp_mixer_prepare → :456
   * get_ticksize) so a tempo change on the current row applies to the
   * current tick's mix. */
  frame(out) {
    if (this._state < CoreState.PLAYING) {
      throw new StateError("player not started");
    }
    const n = this.renderFrameToBuf();
    if (n < 0) return n;
    const copy = Math.min(n, out.length);
    out.set(this._frameBuf.subarray(0, copy), 0);
    return n;
  }
  /** Stage buffer for one rendered frame (see renderFrameToBuf). */
  _frameBuf = new Float32Array(0);
  /** Consumed samples of the staged frame (xmp_play_buffer buffer_data). */
  _bufConsumed = 0;
  /** Total samples of the staged frame. */
  _bufSize = 0;
  /**
   * Render one tick into the staging buffer, returning its sample count
   * (interleaved), or a negative value at end-of-module. The staging
   * buffer is what xmp_play_buffer carries between calls as
   * p->buffer_data (player.c:2244-2250): a frame that does not fit the
   * caller's buffer is split and the remainder is copied on the next
   * call, not dropped.
   */
  renderFrameToBuf() {
    const rc = this.playFrame();
    if (rc < 0) return rc;
    this.recomputeTicksize();
    const need = this.ticksize * 2;
    if (this._frameBuf.length < need) this._frameBuf = new Float32Array(need);
    this.mixTick(this._frameBuf);
    return need;
  }
  /**
   * xmp_play_buffer (player.c:2178-2260): render whole ticks until `size`
   * samples are filled, carrying a partially copied frame into the next
   * call exactly like C's p->buffer_data. `loop` > 0 stops replay once
   * loop_count reaches it; -1 signals end-of-replay with nothing written,
   * and the finishing call pads the tail with silence.
   */
  playBuffer(out, size, loop = 1) {
    let filled = 0;
    while (filled < size) {
      if (this._bufConsumed === this._bufSize) {
        const ret = this.renderFrameToBuf();
        if (ret < 0 || loop > 0 && !this._module?.endless && this._p.loop_count >= loop) {
          if (filled === 0) {
            this._bufConsumed = 0;
            this._bufSize = 0;
            return -1;
          }
          out.fill(0, filled, size);
          return 0;
        }
        this._bufConsumed = 0;
        this._bufSize = ret;
      }
      const copySize = Math.min(size - filled, this._bufSize - this._bufConsumed);
      out.set(
        this._frameBuf.subarray(this._bufConsumed, this._bufConsumed + copySize),
        filled
      );
      this._bufConsumed += copySize;
      filled += copySize;
    }
    return filled;
  }
  // ------------------------------------------------------------------
  // internals — frame sequencing (all anchors in reference/libxmp/src/player.c)
  // ------------------------------------------------------------------
  /** xmp_play_frame body minus mixer call (player.c:2064-2171). */
  playFrame() {
    const p = this._p;
    const f = this._flow;
    const mod = this._module;
    if (mod.len <= 0) return -1;
    if (p.ord !== p.pos || f.force_reposition) {
      const start = this._module.sequences[p.sequence]?.entry_point ?? 0;
      const sc = this.seqScan();
      f.force_reposition = 0;
      if (p.pos === -2) return -1;
      if (p.pos === -1) {
        p.pos = start;
      }
      if (p.pos === start) {
        f.end_point = sc.num;
      }
      if (p.pos > sc.ord) {
        f.end_point = 0;
      }
      f.jump = -1;
      p.ord = p.pos - 1;
      if (p.ord < start) p.ord = start - 1;
      if (this.nextOrder(-1) < 0) return -1;
      this.updateFromOrdInfo();
      this.virt.reset();
      this.resetChannels();
    } else {
      if (p.bad_sequence) return -1;
      p.frame++;
      if (p.frame >= p.speed * (1 + f.delay)) {
        if ((this.quirks & Quirk.PROTRACK) !== 0 && f.delay && f.pbreak) {
          if (this.nextRow() < 0) return -1;
          this.checkEndOfModule();
        }
        if (this.nextRow() < 0) return -1;
      }
    }
    for (let i = 0; i < mod.chn; i++) {
      this._xc[i].flags &= ~VolSlideFlag.KEY_OFF;
    }
    if (p.frame === 0) {
      this.checkEndOfModule();
      this.readRow(mod.xxo[p.ord] ?? 0, p.row);
      if (p.st26_speed !== 0) {
        if ((p.st26_speed & 65536) !== 0) {
          p.speed = (p.st26_speed & 65280) >> 8;
        } else {
          p.speed = p.st26_speed & 255;
        }
        p.st26_speed ^= 65536;
      }
    }
    this.injectEvent();
    for (let i = 0; i < this.virt.virtChannels; i++) {
      for (const ep of this.registries.effectPlugins()) {
        ep.onTick?.(this, i);
      }
      processTick(this, i);
      for (const ep of this.registries.effectPlugins()) {
        ep.onTickPost?.(this, i);
      }
    }
    f.rowdelay_set &= ~RowDelay.FIRST_FRAME;
    if (p.bpm !== 0) {
      const mod2 = this._module;
      p.current_time += mod2.time_factor * mod2.rrate / p.bpm;
    }
    return 0;
  }
  /** Current sequence's scan endpoint (C's p->scan[p->sequence]). */
  seqScan() {
    return this._scan[this._p.sequence] ?? this.scanEnd;
  }
  /**
   * skip_invalid_orders (player.c:1737-1760): advance p->ord past invalid
   * patterns (xxo >= pat) until a playable one, or fail at the order-list
   * end / an end marker.
   */
  skipInvalidOrders() {
    const p = this._p;
    const mod = this._module;
    if (p.ord < 0) p.ord = 0;
    for (; ; ) {
      if (p.ord >= mod.len || (this.quirks & Quirk.MARKER) !== 0 && mod.xxo[p.ord] === XMP_MARK_END2) {
        return -1;
      }
      if ((mod.xxo[p.ord] ?? Infinity) < mod.pat) break;
      p.ord++;
    }
    return 0;
  }
  /** next_order (player.c:1762-1837). Returns -1 when the sequence has no
   *  reachable valid order (p->bad_sequence set). */
  nextOrder(lastOrd) {
    const p = this._p;
    const f = this._flow;
    const mod = this._module;
    p.ord++;
    if (this.skipInvalidOrders() < 0) {
      const ep = this._module.sequences[p.sequence]?.entry_point ?? 0;
      if (mod.restart > mod.len || (mod.xxo[mod.restart] ?? Infinity) >= mod.pat || p.ord < ep) {
        p.ord = ep;
      } else if (this.getSequence(mod.restart) === p.sequence) {
        p.ord = mod.restart;
      } else {
        p.ord = ep;
      }
      if (this.skipInvalidOrders() < 0) {
        p.bad_sequence = 1;
        return -1;
      }
      p.gvol = this.ordInfo[p.ord]?.gvl ?? this._module.gvol;
      lastOrd = -1;
    }
    p.bad_sequence = 0;
    if (lastOrd !== p.ord) p.current_time = this.ordInfo[p.ord]?.time ?? 0;
    const pat = mod.patterns[mod.xxo[p.ord]];
    f.num_rows = pat?.rows ?? 0;
    if (f.jumpline >= f.num_rows) f.jumpline = 0;
    p.row = f.jumpline;
    f.jumpline = 0;
    p.pos = p.ord;
    p.frame = 0;
    if ((this._module.flowMode & FlowFlag.LOOP_PATTERN_RESET) !== 0) {
      f.loop_start = -1;
      f.loop_count = 0;
      for (let i = 0; i < mod.chn; i++) {
        f.loop[i].start = 0;
        f.loop[i].count = 0;
      }
    }
    if ((this.quirks & Quirk.PERPAT) !== 0) {
      for (let chn = 0; chn < mod.chn; chn++) this._xc[chn].per_flags = 0;
    }
    return 0;
  }
  /** next_row (player.c:1839-1873). */
  nextRow() {
    const p = this._p;
    const f = this._flow;
    const lastOrd = p.ord;
    p.frame = 0;
    f.delay = 0;
    f.loop_param = -1;
    if (f.pbreak) {
      f.pbreak = 0;
      f.loop_dest = -1;
      if (f.jump !== -1) {
        p.ord = f.jump - 1;
        f.jump = -1;
      }
      return this.nextOrder(lastOrd);
    } else {
      if (f.rowdelay === 0) {
        p.row++;
        f.rowdelay_set = 0;
      } else {
        f.rowdelay--;
      }
      if (f.loop_dest >= 0) {
        p.row = f.loop_dest;
        f.loop_dest = -1;
      }
      if (p.row >= f.num_rows) {
        return this.nextOrder(lastOrd);
      }
    }
    return 0;
  }
  /** check_end_of_module (player.c:2047-2061). */
  checkEndOfModule() {
    const p = this._p;
    const f = this._flow;
    const sc = this.seqScan();
    if (p.ord === sc.ord && p.row === sc.row) {
      if (f.end_point === 0) {
        p.loop_count++;
        f.end_point = sc.num;
      }
      f.end_point--;
    }
  }
  /** read_row (player.c:814-857). Dispatches to the format plugin's reader. */
  readRow(patIdx, row) {
    const f = this._flow;
    const mod = this._module;
    const pat = mod.patterns[patIdx];
    const isFt2 = mod.readEventType === 1;
    for (let chn = 0; chn < mod.chn; chn++) {
      const xc = this._xc[chn];
      const track = pat?.tracks[chn];
      let event;
      if (track && row < track.rows) {
        event = track.event[row] ?? EMPTY_EVENT;
      } else {
        event = EMPTY_EVENT;
      }
      if (isFt2) {
        xc.keyoff = 0;
        RESET(xc, TREMOR_FLAG);
      }
      if (!this.checkDelay(event, chn)) {
        if (f.rowdelay_set === 0 || (f.rowdelay_set & RowDelay.FIRST_FRAME) !== 0 && f.rowdelay > 0) {
          this.registries.format(mod.format).readEvent(this, chn, row);
          for (const ep of this.registries.effectPlugins()) {
            ep.onRow?.(this, chn, event);
          }
          for (const dp of this.registries.dspPlugins()) {
            dp.onRow?.(this, chn, event);
          }
        }
      } else if (mod.readEventType === 3) {
        xc.flags = 0;
      }
    }
  }
  /** check_delay (player.c:744-812). Returns 1 when the event was delayed. */
  checkDelay(e, chn) {
    const p = this._p;
    const xc = this._xc[chn];
    if (e.fxt === FX_SPEED && e.fxp < 32 || e.fxt === FX_S3M_SPEED) {
      if (e.fxp) p.speed = e.fxp;
    }
    if (e.f2t === FX_SPEED && e.f2p < 32 || e.f2t === FX_S3M_SPEED) {
      if (e.f2p) p.speed = e.f2p;
    }
    let delayed = false;
    if (e.fxt === FX_EXTENDED && MSN3(e.fxp) === EX_DELAY && LSN3(e.fxp) !== 0) {
      xc.delay = LSN3(e.fxp) + 1;
      delayed = true;
    } else if (e.f2t === FX_EXTENDED && MSN3(e.f2p) === EX_DELAY && LSN3(e.f2p) !== 0) {
      xc.delay = LSN3(e.f2p) + 1;
      delayed = true;
    }
    if (!delayed) {
      if (e.fxt === FX_MED_RETRIG && MSN3(e.fxp)) {
        RESET(xc, RETRIG);
        xc.delay = MSN3(e.fxp) + 1;
        delayed = true;
      } else if (e.f2t === FX_MED_RETRIG && MSN3(e.f2p)) {
        RESET(xc, RETRIG);
        xc.delay = MSN3(e.f2p) + 1;
        delayed = true;
      }
    }
    if (!delayed) return 0;
    xc.delayed_event = { ...e };
    if (e.ins) xc.delayed_ins = e.ins;
    return 1;
  }
  /** inject_event (player.c:1715-1730). */
  injectEvent() {
    const p = this._p;
    const mod = this._module;
    for (let chn = 0; chn < mod.chn + this.smixChannels; chn++) {
      const e = p.inject_event[chn];
      if (e && (e.note !== 0 || e.ins !== 0 || e.vol !== 0 || e.fxt !== 0 || e.f2t !== 0)) {
        this.readSingleEvent(chn, e);
        p.inject_event[chn] = { ...EMPTY_EVENT };
      }
    }
  }
  /** Single-channel event application shared by inject_event + delayed events. */
  readSingleEvent(chn, ev) {
    const mod = this._module;
    this.eventScratch[chn] = ev;
    this.registries.format(mod.format).readEvent(this, chn, 0);
    this.eventScratch[chn] = void 0;
  }
  /**
   * play_channel delay arm (player.c:1619-1623):
   * libxmp_read_event(ctx, &xc->delayed_event, chn) — the STORED delayed
   * event, when the EDx count expires. No FT2 keyoff/tremor reset here; that
   * happens only in read_row (player.c:838-844). The format plugin's
   * readEvent() pulls the event from readEventScratch(chn).
   */
  readEvent(chn) {
    const xc = this._xc[chn];
    this.readSingleEvent(chn, xc.delayed_event);
  }
  /** Event source for format readers: the delayed/injected scratch event. */
  readEventScratch(chn) {
    return this.eventScratch[chn];
  }
  /** Event source for format readers: pattern track cell (read_row path). */
  readEventAt(patIdx, chn, row) {
    const mod = this._module;
    const pat = mod.patterns[patIdx];
    const track = pat?.tracks[chn];
    if (track && row < track.rows) {
      return track.event[row] ?? EMPTY_EVENT;
    }
    return EMPTY_EVENT;
  }
  /** reset_channels (player.c:683-742). */
  resetChannels() {
    const mod = this._module;
    const xcAll = [];
    for (let i = 0; i < this.virt.virtChannels; i++) {
      xcAll.push(makeChannelState());
      const xc = xcAll[i];
      xc.ins = -1;
      xc.old_ins = 0;
      xc.key = -1;
      xc.volume = this._module.volbase;
      if (mod.extras?.kind === "hmn") {
        xc.extras = { datapos: 0, volume: 0 };
      } else if (mod.extras?.kind === "flt") {
        xc.extras = { volume: 0, sustain: 0, env_stage: 0 };
      } else if (mod.extras?.kind === "med") {
        xc.extras = {
          vp: 0,
          vv: 0,
          vs: 0,
          vc: 0,
          vw: 0,
          wp: 0,
          wv: 0,
          ws: 0,
          wc: 0,
          ww: 0,
          period: 0,
          arp: 0,
          aidx: 0,
          vwf: 0,
          vib_depth: 0,
          vib_speed: 0,
          vib_idx: 0,
          vib_wf: 0,
          volume: 0,
          hold_active: 0,
          hold_sustained: 0,
          hold_count: -1,
          decay_value: 0,
          env_wav: 0,
          env_idx: 0,
          flags: 0
        };
      }
    }
    this._xc = xcAll;
    for (let i = 0; i < this.virt.numTracks; i++) {
      const xc = this._xc[i];
      xc.mastervol = mod.channels[i]?.vol ?? 64;
      xc.pan.val = mod.channels[i]?.pan ?? 128;
      xc.filter.cutoff = 255;
      const flg = mod.channels[i]?.flg ?? 0;
      if (flg & ChannelFlags.SPLIT) {
        xc.split = ((flg & 48) >> 4) + 1;
        for (let j = 0; j < i; j++) {
          if ((mod.channels[j]?.flg ?? 0) & ChannelFlags.SPLIT && this._xc[j].split === xc.split) {
            this._xc[j].pair = i;
            xc.pair = j;
          }
        }
      } else {
        xc.split = 0;
      }
      if (flg & ChannelFlags.SURROUND) xc.pan.surround = 1;
    }
  }
  /** update_from_ord_info (player.c:1886-1900). */
  updateFromOrdInfo() {
    const p = this._p;
    const oi = this.ordInfo[p.ord];
    if (!oi) return;
    if (oi.speed) p.speed = oi.speed;
    p.bpm = oi.bpm;
    p.gvol = oi.gvl;
    p.current_time = oi.time;
  }
  /**
   * set_position (control.c:63-132): jump playback to order `ord`,
   * optionally to `row` within it (xmp_set_position + the flow jumpline
   * mechanism). Works while playing — the next frame() takes the
   * reposition path. Skips marker orders (xxo >= mod.pat) like C's
   * marker walk, resets flow state so no stale pattern jump fires, and
   * adjusts end_point for the new scan position.
   */
  setPosition(ord, row = 0, dir = 0) {
    if (this._state < CoreState.PLAYING) return;
    const mod = this._module;
    const p = this._p;
    const f = this._flow;
    if (ord < 0 || ord >= mod.len) return;
    const seq = dir === 0 ? this.getSequence(ord) : p.sequence;
    if (seq < 0 || seq >= mod.num_sequences) return;
    p.sequence = seq;
    const hasMarker = (mod.quirks & Quirk.MARKER) !== 0;
    let pos = ord;
    while (hasMarker && pos > 0 && pos < mod.len - 1 && mod.xxo[pos] === XMP_MARK_SKIP) {
      pos += dir < 0 ? -1 : 1;
    }
    if (pos >= mod.len) return;
    const pat = mod.xxo[pos];
    if (hasMarker && pat === XMP_MARK_END2) return;
    if (pat < mod.pat) {
      if (pos > this._scan[seq].ord) {
        f.end_point = 0;
      } else {
        f.num_rows = mod.patterns[pat]?.rows ?? 0;
        f.end_point = this._scan[seq].num;
        f.jumpline = 0;
      }
    }
    p.pos = pos === 0 ? -1 : pos;
    resetFlow(f);
    f.jumpline = Math.max(0, Math.min(row, (mod.patterns[mod.xxo[pos]]?.rows ?? 1) - 1));
    f.force_reposition = 1;
    p.current_time = this.ordInfo[pos]?.time ?? p.current_time;
    this.recomputeTicksize();
  }
  /** Master volume percent (xmp_set_player XMP_PLAYER_VOLUME):
   * 0 = silence, 100 = full. Consumed in process_volume (tick.ts:908). */
  setVolume(percent) {
    this._p.master_vol = Math.max(0, Math.min(100, Math.round(percent)));
  }
  /**
   * seek_time (control.c:242-341): jump as close as possible to `ms`
   * milliseconds into the current sequence. First the coarse step — the
   * last order whose scan time ≤ target (skipping invalid patterns and
   * other sequences) is set as position with dir=1, which keeps the
   * sequence; jumpline comes from the order's scan start_row. Then the
   * fine step — play frames until current_time crosses the target
   * (bounded at 8192 frames), since only the scan knows per-row timing.
   * The played frames are discarded, exactly like C's xmp_seek_time_frame.
   */
  seekTime(ms) {
    if (this._state < CoreState.PLAYING) return -1;
    const mod = this._module;
    const p = this._p;
    let i = mod.len - 1;
    for (; i >= 0; i--) {
      const pat = mod.xxo[i];
      if (pat >= mod.pat) continue;
      if (this.getSequence(i) !== p.sequence) continue;
      const t2 = Math.max(0, Math.min(this.ordInfo[i]?.time ?? 0, 2147483647));
      if (ms >= t2) {
        this.setPosition(i, 0, 1);
        break;
      }
    }
    if (i < 0) this.setPosition(0, 0);
    const pos = p.pos >= 0 ? p.pos : mod.sequences[p.sequence]?.entry_point ?? 0;
    const oinfo = this.ordInfo[pos];
    if (oinfo) {
      this._flow.jumpline = oinfo.start_row;
      this._flow.force_reposition = 1;
      p.current_time = oinfo.time;
      p.bpm = oinfo.bpm;
    }
    const maxTime = (mod.sequences[p.sequence]?.duration ?? 0) - 0.1;
    const t = Math.min(ms, maxTime);
    const scratch = new Float32Array(65536);
    for (let n = 0; n < 1 << 13; n++) {
      const prev = p.current_time;
      const frameTime = p.bpm !== 0 ? mod.time_factor * mod.rrate / p.bpm : 0;
      if (p.current_time + frameTime > t) break;
      if (this.frame(scratch) < 0 || p.current_time < prev) break;
    }
    return p.pos < 0 ? 0 : p.pos;
  }
  getVolume() {
    return this._p.master_vol;
  }
  /** get_sequence parity via stored control array. */
  getSequence(ord) {
    const ctrl = this._sequenceControl;
    if (ctrl.length === 0) return 255;
    return ctrl[ord] ?? 255;
  }
  _sequenceControl = [];
  /** Recompute ticksize per binding formula with relative factor. */
  recomputeTicksize() {
    const m = this._module;
    const tf = (m?.time_factor ?? DEFAULT_TIME_FACTOR) * this._timeFactorRelative;
    const ts = getTicksize(this._s.freq, tf, m?.rrate ?? PAL_RATE, this._p.bpm);
    this._s.ticksize = ts > 0 ? ts : 1 << ANTICLICK_SHIFT;
  }
  /** Render one tick worth of audio via the active DSP (fixed ticksize return). */
  mixTick(out) {
    this.dsp().renderFrame(this, out, 1);
    return this.ticksize * 2;
  }
  // Internal accessors used by DSP/effect plumbing.
  get internalP() {
    return this._p;
  }
  get internalFlow() {
    return this._flow;
  }
  /** Expose flow handlers for effects (T13 will dispatch Bxx/Dxx/E6x here). */
  applyPatternLoop(chn, row, fxp) {
    processPatternLoop(this._module, this._flow, chn, row, fxp);
  }
  applyPatternJump(fxp) {
    processPatternJump(this._module, this._flow, fxp);
  }
  applyPatternBreak(fxp) {
    processPatternBreak(this._module, this._flow, fxp);
  }
};
export {
  AMIGA_PERIODS,
  Act,
  C4_NTSC_RATE,
  C4_PAL_RATE,
  C4_PERIOD,
  ChannelFlags,
  Core as CorePlayer,
  CoreState,
  DSP_EFFECT_CUTOFF,
  DSP_EFFECT_FILTER_A0,
  DSP_EFFECT_FILTER_B0,
  DSP_EFFECT_FILTER_B1,
  DSP_EFFECT_RESONANCE,
  Dct,
  DecodeFlag,
  EMPTY_EVENT,
  EX_CUT,
  EX_DELAY,
  EX_FILTER,
  EX_FINETUNE,
  EX_F_PORTA_DN,
  EX_F_PORTA_UP,
  EX_F_VSLIDE_DN,
  EX_F_VSLIDE_UP,
  EX_GLISS,
  EX_INVLOOP,
  EX_PATTERN_LOOP,
  EX_PATT_DELAY,
  EX_RETRIG,
  EX_SETPAN,
  EX_TREMOLO_WF,
  EX_VIBRATO_WF,
  EnvelopeFlags,
  FENV_PAUSE,
  FINE_BEND,
  FINE_NSLIDE,
  FINE_TPORTA,
  FINE_VOLS,
  FINE_VOLS_2,
  FLOW_MODE_DTM_2015,
  FLOW_MODE_GENERIC,
  FLOW_MODE_IT_100,
  FLOW_MODE_IT_104,
  FLOW_MODE_IT_200,
  FLOW_MODE_IT_210,
  FLOW_MODE_LIQUID,
  FLOW_MODE_LIQUID_COMPAT,
  FLOW_MODE_MPT_116,
  FLOW_MODE_OCTALYSER,
  FLOW_MODE_ORPHEUS,
  FLOW_MODE_ST2,
  FLOW_MODE_ST3_301,
  FLOW_MODE_ST3_321,
  fx_exports as FX,
  FX_669_FINETUNE,
  FX_669_PORTA_DN,
  FX_669_PORTA_UP,
  FX_669_TPORTA,
  FX_669_VIBRATO,
  FX_ARPEGGIO,
  FX_BREAK,
  FX_ENVPOS,
  FX_EXTENDED,
  FX_FC_AUTO_PORTA,
  FX_FC_MED_SYNTH_JUMP,
  FX_FC_TONEPORTA_DURATION,
  FX_FINETUNE,
  FX_FINE_VIBRATO,
  FX_FLT_CUTOFF,
  FX_FLT_RESN,
  FX_F_NSLIDE_DN,
  FX_F_NSLIDE_UP,
  FX_F_PORTA_DN,
  FX_F_PORTA_UP,
  FX_F_VSLIDE_DN,
  FX_F_VSLIDE_DN_2,
  FX_F_VSLIDE_UP,
  FX_F_VSLIDE_UP_2,
  FX_GLOBALVOL,
  FX_GVOL_SLIDE,
  FX_HIOFFSET,
  FX_ICE_SPEED,
  FX_IT_BPM,
  FX_IT_BREAK,
  FX_IT_INSTFUNC,
  FX_IT_PANSLIDE,
  FX_IT_ROWDELAY,
  FX_JUMP,
  FX_KEYOFF,
  FX_MACRO,
  FX_MACROSMOOTH,
  FX_MACRO_SET,
  FX_MED_HOLD,
  FX_MED_RETRIG,
  FX_MEGAARP,
  FX_MULTI_RETRIG,
  FX_NSLIDE_DN,
  FX_NSLIDE_UP,
  FX_OFFSET,
  FX_OKT_ARP3,
  FX_OKT_ARP4,
  FX_OKT_ARP5,
  FX_PANBRELLO,
  FX_PANBRELLO_WF,
  FX_PANSLIDE,
  FX_PANSL_NOMEM,
  FX_PATT_DELAY,
  FX_PER_CANCEL,
  FX_PITCH_ADD,
  FX_PITCH_SUB,
  FX_PORTA_DN,
  FX_PORTA_UP,
  FX_REVERSE,
  FX_S3M_ARPEGGIO,
  FX_S3M_BPM,
  FX_S3M_SPEED,
  FX_SETPAN,
  FX_SPEED,
  FX_SPEED_CP,
  FX_SURROUND,
  FX_TONEPORTA,
  FX_TONE_VSLIDE,
  FX_TREMOLO,
  FX_TREMOR,
  FX_TRK_FVSLIDE,
  FX_TRK_VOL,
  FX_TRK_VSLIDE,
  FX_VIBRATO,
  FX_VIBRATO2,
  FX_VIBRA_VSLIDE,
  FX_VOLSET,
  FX_VOLSLIDE,
  FX_VOLSLIDE_2,
  FX_VOL_ADD,
  FX_VOL_SUB,
  FX_VSLIDE_DN_2,
  FX_VSLIDE_UP_2,
  FX_XF_PORTA,
  FlowFlag,
  FltEnvStage,
  GVOL_SLIDE,
  INVALID,
  IS_VALID_INSTRUMENT,
  Interp,
  KEY_OFF_FLAG,
  LSN2 as LSN,
  MAX_NOTE_MOD,
  MAX_PERIOD_L,
  MED_SYNTH_ENV_LOOP,
  MED_VER_210,
  MED_VER_300,
  MED_VER_320,
  MED_VER_OCTAMED_100,
  MED_VER_OCTAMED_200,
  MED_VER_OCTAMED_300,
  MED_VER_OCTAMED_400,
  MED_VER_OCTAMED_500,
  MED_VER_OCTAMED_502,
  MED_VER_OCTAMED_SS_1,
  MED_VER_OCTAMED_SS_2,
  MIDI_MACRO,
  MIN_NOTE_MOD,
  MIN_PERIOD_L,
  MODRNG_PERIODS,
  MSN2 as MSN,
  ModplayError,
  NEW_INS,
  NEW_NOTE,
  NEW_VOL,
  NOTE_CUT,
  NOTE_END,
  NOTE_ENV_END,
  NOTE_ENV_RELEASE,
  NOTE_FADEOUT,
  NOTE_GLISSANDO,
  NOTE_KEY_CUT,
  NOTE_RELEASE,
  NOTE_SAMPLE_END,
  NOTE_SAMPLE_RELEASE,
  NOTE_SET,
  NOTE_SLIDE,
  NOTE_SUSEXIT,
  Nna,
  NoteFlag,
  OFFSET_FLAG,
  PANBRELLO,
  PAN_SLIDE,
  PAN_SURROUND,
  PENV_PAUSE,
  PERIOD_BASE2 as PERIOD_BASE,
  PITCHBEND,
  PackedModuleError,
  ParseError,
  PastNote,
  PeriodType,
  PlayerFlag,
  PluginKind,
  PluginNotFoundError,
  QUIRKS_FT2,
  QUIRKS_IT,
  QUIRKS_ST3,
  Quirk,
  RESET,
  RESET_NOTE,
  RESET_PER,
  RETRIG,
  ROWDELAY_FIRST_FRAME,
  ROWDELAY_ON,
  ReadEventType,
  Registries,
  RowDelay,
  SET,
  SET_NOTE,
  SET_PER,
  SINE_WAVE,
  SampleError,
  SampleFlags,
  SampleStore,
  Scanner,
  StateError,
  TEMPO_SLIDE,
  TEST,
  TEST_NOTE,
  TEST_PER,
  TONEPORTA,
  TREMOLO,
  TREMOR_FLAG,
  TREMOR_ON,
  TREMOR_SUPPRESS,
  TRK_FVSLIDE,
  TRK_VSLIDE,
  UnknownFormatError,
  VENV_PAUSE,
  VIBRATO,
  VIRT_ACTION_CONT,
  VIRT_ACTION_CUT,
  VIRT_ACTION_FADE,
  VIRT_ACTION_OFF,
  VIRT_ACTIVE2 as VIRT_ACTIVE,
  VIRT_INVALID,
  VOL_SLIDE,
  VOL_SLIDE_2,
  VirtualLayer,
  VoiceFlag,
  VolSlideFlag,
  WAVEFORM_SIZE,
  XMP_KEY_CUT,
  XMP_KEY_CUT_FADE,
  XMP_KEY_FADE,
  XMP_KEY_OFF,
  XMP_MIN_BPM2 as XMP_MIN_BPM,
  XX_XF_PORTA_DN,
  XX_XF_PORTA_UP,
  adpcm4Decode,
  applyScanToModule,
  arpeggio,
  checkEnvelopeEnd,
  checkEnvelopeFade,
  doToneporta,
  effectMemory,
  effectMemoryGet,
  effectMemoryS3m,
  effectMemorySetOnly,
  exCut,
  exFilter,
  exFinetune,
  exGliss,
  exInvloop,
  exRetrig,
  exTremoloWf,
  exVibratoWf,
  extrasGetLinearBend,
  extrasGetPeriod,
  extrasGetVolume,
  extrasProcessFx,
  filterSetup,
  fvslideDnShared,
  fvslideUpShared,
  fxArpeggio,
  fxEnvPos,
  fxFPortaDn,
  fxFPortaUp,
  fxFineVibrato,
  fxFinetune,
  fxGlobalVol,
  fxGvolSlide,
  fxItBpm,
  fxItPanSlide,
  fxItRowDelay,
  fxKeyoff,
  fxMultiRetrig,
  fxOffset,
  fxOktArp,
  fxPanSlide,
  fxPanbrello,
  fxPanbrelloWf,
  fxPortaDn,
  fxPortaUp,
  fxS3mBpm,
  fxS3mSpeed,
  fxSetPan,
  fxSpeed,
  fxSurround,
  fxToneporta,
  fxTremolo,
  fxTremor,
  fxTrkFVSlide,
  fxTrkVSlide,
  fxVibrato,
  fxVolSet,
  fxVolSlide,
  fxXfPorta,
  fxXfPortaDn,
  fxXfPortaUp,
  getEnvelope,
  getInstrument2 as getInstrument,
  getRandom,
  getSubinstrument,
  hasQuirk,
  hmnProcessFx,
  isFirstFrame,
  isModRetrig,
  isSfxPitch,
  isToneportaFx,
  isValidInstrument,
  isValidNote,
  isValidSample,
  keyInstruments,
  lfoGet,
  lfoSetDepth,
  lfoSetPhase,
  lfoSetRate,
  lfoSetWaveform,
  lfoUpdate,
  md5Hex,
  medChangePeriod,
  medCheckHoldSymbol,
  medHoldRetrigger,
  medLinearBend,
  medSetHoldDecay,
  noteToPeriod,
  noteToPeriodMix2 as noteToPeriodMix,
  periodToBend,
  playExtras,
  processFrequency,
  processFx,
  processLineJump,
  processPan,
  processPatternBreak,
  processPatternJump,
  processPatternLoop,
  processTick,
  processVolume,
  readEventFt2,
  readEventIt,
  readEventSt3,
  resetEnvelopes,
  resetFlow,
  setChannelPan,
  setChannelVolume,
  setEffectDefaults,
  setLfoNotzero,
  setPatch,
  setPeriod,
  setPeriodFt2,
  sustainCheckEnv,
  updateEnvelope,
  updateFrequency,
  updateMidiMacro,
  updatePan,
  updateVolume
};
