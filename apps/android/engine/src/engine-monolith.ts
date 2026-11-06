// SPDX-License-Identifier: BSD-3-Clause
// Monolith entry for apps/android: the provider registers every format, then
// the shared engine runs. ES module imports are evaluated in order, so the
// provider's `__modplayProvide` hook is on the global object before the engine
// body calls it.
//
// apps/xr does not use this file. It evaluates engine-core.js, which is the
// same engine-entry.ts without a provider, and installs formats from its
// assets at runtime.
import './engine-provider.js';
import './engine-entry.js';
