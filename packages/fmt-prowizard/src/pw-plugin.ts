// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/pw_load.c (pw_test :44-56,
// pw_load :58-190).

import type { Core, FormatPlugin, LoadCtx, ModuleData } from '@modplayjs/core';
import { pwCheck, pwWizardry } from './prowiz.js';
import { loadDepackedMod, readEvent } from '@modplayjs/fmt-mod';

/** pw_test (pw_load.c:44-56): pw_check-based probe. */
export function pwTest(bytes: Uint8Array): boolean {
  return pwCheck(bytes, 0) !== null;
}

/** pw_load (pw_load.c:58-190): depack then parse the M.K. result. */
export function pwLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  const nameBox: { name?: string } = {};
  const depacked = pwWizardry(bytes, 0, nameBox);
  const name = nameBox.name ?? 'prowizard';
  return loadDepackedMod(depacked, ctx, name);
}

/** ProWizard format plugin (libxmp loaders/pw_load.c + MOD reader). */
export const pwPlugin: FormatPlugin = {
  name: 'prowizard',
  test: pwTest,
  load: pwLoad,
  readEvent(core: Core, chn: number, row: number): void {
    readEvent(core, chn, row);
  },
};
