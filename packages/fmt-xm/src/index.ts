// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// @modplayjs/fmt-xm — XM loader + event reader.
// Port of reference/libxmp/src/loaders/xm_load.c (xm_test/xm_load) with
// read_event_ft2 from @modplayjs/effects-shared; Ogg Vorbis sample
// decode via bundled stb-vorbis (is_ogg_sample/oggdec parity).

export { xmTest, xmLoad, plugin } from './xm.js';
export { xmExportPlugin } from './xmWrite.js';
