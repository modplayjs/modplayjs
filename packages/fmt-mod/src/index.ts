// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// @modplayjs/fmt-mod — MOD (Protracker/FT2/ST3 family) format plugin.

export { modTest, modLoad } from './mod.js';
export { loadDepackedMod } from './modcore.js';
export { readEventDispatch as readEvent } from './readevent.js';
export { decodeEvent, periodToNote } from './mod.js';
export { readEventMod, isToneportaFx, isSfxPitch, isModRetrig, setPatch } from './readevent.js';
export { readEventFt2 } from '@modplayjs/core';
export { readEventSt3 } from '@modplayjs/core';
export { hmnTest, hmnLoad } from './hmn.js';
export { fltTest, fltLoad, fltPlugin } from './flt.js';

import type { Core, FormatPlugin } from '@modplayjs/core';
import { modLoad, modTest } from './mod.js';
import { readEventDispatch } from './readevent.js';
import { hmnLoad, hmnTest } from './hmn.js';

/** MOD format plugin (libxmp loaders/mod_load.c + read_event MOD family). */
export const plugin: FormatPlugin = {
  name: 'mod',
  test: modTest,
  load: modLoad,
  readEvent(core: Core, chn: number, row: number): void {
    readEventDispatch(core, chn, row);
  },
};

/** His Master's Noise plugin (libxmp loaders/hmn_load.c). Read events are
 *  the plain MOD dispatch (read_event_type = READ_EVENT_MOD); the HMN
 *  extras run through the core's extras hooks. */
export const hmnPlugin: FormatPlugin = {
  name: 'hmn',
  test: hmnTest,
  load: hmnLoad,
  readEvent(core: Core, chn: number, row: number): void {
    readEventDispatch(core, chn, row);
  },
};
export { modExportPlugin } from './modWrite.js';
