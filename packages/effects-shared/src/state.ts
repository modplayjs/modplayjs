// Persistent effect flag bits, mirroring player.h:38-65. Re-declared here as
// a grouped const so the per-tick stage and format readers share one source.

export const VolSlideFlag = {
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
  KEY_OFF: 1 << 26, /* for IT release on envloop end */
  TREMOR: 1 << 27, /* for XM tremor */
  MIDI_MACRO: 1 << 28, /* IT midi macro */
} as const;

/** Note flags (player.h:59-70). */
export const NoteFlag = {
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
  RELEASE: (1 << 1) | (1 << 10),
} as const;
