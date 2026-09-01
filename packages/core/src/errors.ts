// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// Typed errors thrown by the core. All are subclasses of ModplayError so
// callers can catch one family; each case has its own class for precise
// programmatic handling.

export class ModplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** No registered format plugin recognized the byte stream. */
export class UnknownFormatError extends ModplayError {
  constructor() {
    super('no format plugin recognized this module');
  }
}

/** A format plugin found structurally invalid data (bad header, truncated data, OOB). */
export class ParseError extends ModplayError {}

/**
 * Module byte stream looks like a packed/compressed module
 * (PP20/XPK/LZW/ICE/gzip). Documented boundary: depackers are out of scope.
 */
export class PackedModuleError extends ModplayError {
  constructor(kind: string) {
    super(`packed modules are not supported (${kind}); provide an unpacked file`);
  }
}

/** Playback/state machine misuse (start before load, setDsp during play…). */
export class StateError extends ModplayError {}

/** Unknown plugin id requested from the registry. */
export class PluginNotFoundError extends ModplayError {}

/** Sample-store misuse: unknown id, empty swap, oversized data. */
export class SampleError extends ModplayError {}
