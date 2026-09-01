// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// URL of the TRANSFORMED worklet module. Vite: `?worker&url` bundles the
// worklet as a hashed ES asset addModule can load. Headless harnesses
// replace this module via the `worklet-url-impl` alias (URL is irrelevant
// there).
import impl from 'worklet-url-impl';
export default impl;
