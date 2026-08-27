// Effect type constants, mirroring reference/libxmp/src/effects.h.
// Core player effects (the big four: MOD/S3M/XM/IT) plus the shared
// extended-effect subcodes. Values are the canonical libxmp numbers.

// Protracker effects
export const FX_ARPEGGIO = 0x00;
export const FX_PORTA_UP = 0x01;
export const FX_PORTA_DN = 0x02;
export const FX_TONEPORTA = 0x03;
export const FX_VIBRATO = 0x04;
export const FX_TONE_VSLIDE = 0x05;
export const FX_VIBRA_VSLIDE = 0x06;
export const FX_TREMOLO = 0x07;
export const FX_OFFSET = 0x09;
export const FX_VOLSLIDE = 0x0a;
export const FX_JUMP = 0x0b;
export const FX_VOLSET = 0x0c;
export const FX_BREAK = 0x0d;
export const FX_EXTENDED = 0x0e;
export const FX_SPEED = 0x0f;

// Fast Tracker effects
export const FX_SETPAN = 0x08;

// Fast Tracker II effects
export const FX_GLOBALVOL = 0x10;
export const FX_GVOL_SLIDE = 0x11;
export const FX_KEYOFF = 0x14;
export const FX_ENVPOS = 0x15;
export const FX_PANSLIDE = 0x19;
export const FX_MULTI_RETRIG = 0x1b;
export const FX_TREMOR = 0x1d;
export const FX_XF_PORTA = 0x21;

// Protracker extended effects
export const EX_FILTER = 0x00;
export const EX_F_PORTA_UP = 0x01;
export const EX_F_PORTA_DN = 0x02;
export const EX_GLISS = 0x03;
export const EX_VIBRATO_WF = 0x04;
export const EX_FINETUNE = 0x05;
export const EX_PATTERN_LOOP = 0x06;
export const EX_TREMOLO_WF = 0x07;
export const EX_SETPAN = 0x08;
export const EX_RETRIG = 0x09;
export const EX_F_VSLIDE_UP = 0x0a;
export const EX_F_VSLIDE_DN = 0x0b;
export const EX_CUT = 0x0c;
export const EX_DELAY = 0x0d;
export const EX_PATT_DELAY = 0x0e;
export const EX_INVLOOP = 0x0f;

// XM extended effects 2
export const XX_XF_PORTA_UP = 0x01;
export const XX_XF_PORTA_DN = 0x02;

// IT effects (defined for completeness; IT is v0.2)
export const FX_TRK_VOL = 0x80;
export const FX_TRK_VSLIDE = 0x81;
export const FX_TRK_FVSLIDE = 0x82;
export const FX_IT_INSTFUNC = 0x83;
export const FX_FLT_CUTOFF = 0x84;
export const FX_FLT_RESN = 0x85;
export const FX_IT_BPM = 0x87;
export const FX_IT_ROWDELAY = 0x88;
export const FX_IT_PANSLIDE = 0x89;
export const FX_PANBRELLO = 0x8a;
export const FX_PANBRELLO_WF = 0x8b;
export const FX_HIOFFSET = 0x8c;
export const FX_IT_BREAK = 0x8e;
export const FX_MACRO_SET = 0xbd;
export const FX_MACRO = 0xbe;
export const FX_MACROSMOOTH = 0xbf;

// Shared extra effects
export const FX_SURROUND = 0x8d; // S3M/IT
export const FX_REVERSE = 0x8f; // XM/IT/others: play forward/reverse
export const FX_S3M_SPEED = 0xa3; // S3M
export const FX_VOLSLIDE_2 = 0xa4;
export const FX_FINETUNE = 0xa6;
export const FX_S3M_BPM = 0xab; // S3M
export const FX_FINE_VIBRATO = 0xac; // S3M/PTM/IMF/LIQ
export const FX_F_VSLIDE_UP = 0xad; // MMD
export const FX_F_VSLIDE_DN = 0xae; // MMD
export const FX_F_PORTA_UP = 0xaf; // MMD
export const FX_F_PORTA_DN = 0xb0; // MMD
export const FX_PATT_DELAY = 0xb3; // MMD
export const FX_S3M_ARPEGGIO = 0xb4;
export const FX_PANSL_NOMEM = 0xb5; // XM volume column

// Oktalyzer arpeggio variants (effects.h:58-60)
export const FX_OKT_ARP3 = 0x70;
export const FX_OKT_ARP4 = 0x71;
export const FX_OKT_ARP5 = 0x72;

// Note-slide family (effects.h:132-135; player.c note_slide stage 1158)
export const FX_VSLIDE_UP_2 = 0xc0;
export const FX_VSLIDE_DN_2 = 0xc1;
export const FX_F_VSLIDE_UP_2 = 0xc2;
export const FX_F_VSLIDE_DN_2 = 0xc3;
// Note-slide family (effects.h:132-135; player.c note_slide stage 1158)
export const FX_NSLIDE_DN = 0x9c;
export const FX_NSLIDE_UP = 0x9d;
export const FX_F_NSLIDE_DN = 0x75;
export const FX_F_NSLIDE_UP = 0x76;

// Extra effects needed by the FULL (non-CORE) variant (effects.h).
export const FX_PER_TPORTA = 0x7a; // effects.h:69
export const FX_SPEED_CP = 0x7e; // effects.h:73
export const FX_FAR_TPORTA = 0x67; // effects.h:86
export const FX_ULT_TPORTA = 0x6f; // effects.h:97
export const FX_FAR_TEMPO = 0x68; // effects.h:87
export const FX_FAR_F_TEMPO = 0x69; // effects.h:88
export const FX_ULT_TEMPO = 0x5f; // effects.h:96
export const FX_ICE_SPEED = 0xa2; // effects.h:142
export const FX_MED_HOLD = 0xb1; // effects.h:144
export const FX_PITCH_ADD = 0xb8; // effects.h:148
export const FX_PITCH_SUB = 0xb9; // effects.h:149
export const FX_LINE_JUMP = 0xba; // effects.h:150
