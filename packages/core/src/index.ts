// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// @modplayjs/core — public API
//
// Plugin contracts (T2), data-model types (T3). The Core implementation
// lands in T4-T8.

export type {
  Core,
  CoreConfig,
  LoadCtx,
  FormatPlugin,
  EffectPlugin,
  DspPlugin,
  OutputPlugin,
} from './types/index';

export {
  // enums / constants (T3)
  CoreState,
  Quirk,
  QUIRKS_ST3,
  QUIRKS_FT2,
  QUIRKS_IT,
  FlowFlag,
  FLOW_MODE_GENERIC,
  FLOW_MODE_ST2,
  FLOW_MODE_ST3_301,
  FLOW_MODE_ST3_321,
  FLOW_MODE_IT_100,
  FLOW_MODE_IT_104,
  FLOW_MODE_IT_200,
  FLOW_MODE_IT_210,
  FLOW_MODE_MPT_116,
  FLOW_MODE_ORPHEUS,
  FLOW_MODE_LIQUID,
  FLOW_MODE_LIQUID_COMPAT,
  FLOW_MODE_OCTALYSER,
  FLOW_MODE_DTM_2015,
  C4_PAL_RATE,
  C4_NTSC_RATE,
  ReadEventType,
  PeriodType,
  Interp,
  PluginKind,
  NoteFlag,
} from './model/constants';

export {
  // all FX constants
  FX_ARPEGGIO, FX_PORTA_UP, FX_PORTA_DN, FX_TONEPORTA, FX_VIBRATO,
  FX_TONE_VSLIDE, FX_VIBRA_VSLIDE, FX_TREMOLO, FX_OFFSET, FX_VOLSLIDE,
  FX_JUMP, FX_VOLSET, FX_BREAK, FX_EXTENDED, FX_SPEED, FX_SETPAN,
  FX_GLOBALVOL, FX_GVOL_SLIDE, FX_KEYOFF, FX_ENVPOS, FX_PANSLIDE,
  FX_MULTI_RETRIG, FX_TREMOR, FX_XF_PORTA,
  EX_FILTER, EX_F_PORTA_UP, EX_F_PORTA_DN, EX_GLISS, EX_VIBRATO_WF,
  EX_FINETUNE, EX_PATTERN_LOOP, EX_TREMOLO_WF, EX_SETPAN, EX_RETRIG,
  EX_F_VSLIDE_UP, EX_F_VSLIDE_DN, EX_CUT, EX_DELAY, EX_PATT_DELAY,
  EX_INVLOOP, XX_XF_PORTA_UP, XX_XF_PORTA_DN,
  FX_TRK_VOL, FX_TRK_VSLIDE, FX_TRK_FVSLIDE, FX_IT_INSTFUNC,
  FX_FLT_CUTOFF, FX_FLT_RESN, FX_IT_BPM, FX_IT_ROWDELAY, FX_IT_PANSLIDE,
  FX_PANBRELLO, FX_PANBRELLO_WF, FX_HIOFFSET, FX_IT_BREAK,
  FX_MACRO_SET, FX_MACRO, FX_MACROSMOOTH,
  FX_SURROUND, FX_REVERSE, FX_S3M_SPEED, FX_VOLSLIDE_2, FX_FINETUNE,
  FX_S3M_BPM, FX_FINE_VIBRATO, FX_F_VSLIDE_UP, FX_F_VSLIDE_DN,
  FX_F_PORTA_UP, FX_F_PORTA_DN, FX_PATT_DELAY, FX_S3M_ARPEGGIO,
  FX_PANSL_NOMEM, FX_VSLIDE_UP_2, FX_VSLIDE_DN_2, FX_F_VSLIDE_UP_2,
  FX_F_VSLIDE_DN_2, FX_OKT_ARP3, FX_OKT_ARP4, FX_OKT_ARP5,
  FX_NSLIDE_DN, FX_NSLIDE_UP, FX_F_NSLIDE_DN, FX_F_NSLIDE_UP,
} from './model/fx';

import * as FX from './model/fx';
export { FX };

// Data-model types + model constants (T3)
export * from './model/model';

// Core implementation (T4-T8)
export { ModplayError, UnknownFormatError, ParseError, PackedModuleError, StateError, PluginNotFoundError, SampleError } from './errors';
export { VirtualLayer, PastNote, VIRT_INVALID } from './virtual';
export { SampleStore, DecodeFlag, adpcm4Decode } from './samples';
export { Registries } from './registry';
export {
  Scanner,
  applyScanToModule,
  type ScanResult,
  type ScanData,
  type OrdInfo,
} from './scan';
export { resetFlow, processPatternLoop, processPatternJump, processPatternBreak, processLineJump } from './flow';
export { Core as CorePlayer } from './core';