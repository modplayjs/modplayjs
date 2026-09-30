// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// @modplayjs/fmt-med — MED/OctaMED loaders (MMD0/1/C, MMD2/3, MED2/3/4)
// + event reader. Port of reference/libxmp src/loaders/mmd_common.c,
// mmd1_load.c, mmd3_load.c, med2_load.c, med3_load.c, med4_load.c.

import type { Core, FormatPlugin, LoadCtx, ModuleData } from '@modplayjs/core';
import { mmd1Test, mmd1Load } from './mmd1.js';
import { mmd3Test, mmd3Load } from './mmd3.js';
import { med2Test, med2Load } from './med2.js';
import { med3Test, med3Load } from './med3.js';
import { med4Test, med4Load } from './med4.js';
import { readEventMed } from './readevent.js';

export {
  mmdConvertTempo,
  mmdXlatFx,
  mmdSetBpm,
  mmdTrackerVersion,
  MED_TIME_FACTOR,
  FLAG_INSTRSATT,
  type MedExpData,
  type MedInstrExt,
  type MedSample,
} from './mmdCommon.js';
export { mmd1Test, mmd1Load, mmdReadTitle } from './mmd1.js';
export { mmd3Test, mmd3Load } from './mmd3.js';
export { med2Test, med2Load } from './med2.js';
export { med3Test, med3Load } from './med3.js';
export { med4Test, med4Load } from './med4.js';
export { readEventMed } from './readevent.js';

function makePlugin(
  name: string,
  test: (bytes: Uint8Array) => boolean,
  load: (bytes: Uint8Array, ctx: LoadCtx) => ModuleData,
): FormatPlugin {
  return {
    name,
    test,
    load,
    readEvent(core: Core, chn: number, row: number): void {
      const mod = core.module as ModuleData;
      const e =
        core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
      readEventMed(core, e, chn);
    },
  };
}

/** MMD0/MMD1/MMDC (MED 2.10 / OctaMED). */
export const plugin = makePlugin('med', mmd1Test, mmd1Load);
/** MMD2/MMD3 (OctaMED / OctaMED Soundstudio). */
export const mmd3Plugin = makePlugin('mmd3', mmd3Test, mmd3Load);
/** MED 1.12 MED2. */
export const med2Plugin = makePlugin('med2', med2Test, med2Load);
/** MED 2.00 MED3. */
export const med3Plugin = makePlugin('med3', med3Test, med3Load);
/** MED 2.10 MED4. */
export const med4Plugin = makePlugin('med4', med4Test, med4Load);
