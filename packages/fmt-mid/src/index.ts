// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// @modplayjs/fmt-mid — Standard MIDI File (.mid) format plugin: a pristine
// 1:1 TypeScript port of TinySoundFont (tml.h SMF parser + tsf.h SoundFont2
// synthesizer).

export {
  midTest,
  midLoad,
  midSetSoundfont,
  midHasSoundfont,
  midStartTune,
  midSeek,
  getMidPlayTimeMs,
  midDsp,
  plugin,
} from './midplugin.js';
export { tml_load_memory, tml_get_info, tml_get_tempo_value, TmlMessage } from './tml.js';
export {
  Tsf,
  tsf_load_memory,
  tsf_render_float,
  tsf_render_short,
  TSF_RENDER_EFFECTSAMPLEBLOCK,
  TSF_STEREO_INTERLEAVED,
  TSF_STEREO_UNWEAVED,
  TSF_MONO,
} from './tsf.js';
