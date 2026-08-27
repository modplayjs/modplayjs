// @modplayjs/fmt-mod — MOD (Protracker/FT2/ST3 family) format plugin.

export { modTest, modLoad } from './mod.js';
export { readEventDispatch as readEvent } from './readevent.js';
export { readEventMod, isToneportaFx, isSfxPitch, isModRetrig, setPatch } from './readevent.js';
export { readEventFt2 } from '@modplayjs/effects-shared';
export { readEventSt3 } from '@modplayjs/effects-shared';

import type { Core, FormatPlugin } from '@modplayjs/core';
import { modLoad, modTest } from './mod.js';
import { readEventDispatch } from './readevent.js';

/** MOD format plugin (libxmp loaders/mod_load.c + read_event MOD family). */
export const plugin: FormatPlugin = {
  name: 'mod',
  test: modTest,
  load: modLoad,
  readEvent(core: Core, chn: number, row: number): void {
    readEventDispatch(core, chn, row);
  },
};
