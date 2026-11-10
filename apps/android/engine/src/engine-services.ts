// SPDX-License-Identifier: BSD-3-Clause
// Services the engine needs from optional packages.
//
// A format plugin is a value: register it and the registry knows it. Some
// packages also export *functions* the engine calls directly (SID tuning and
// seeking, the FC effect reader). Those cannot be lazy-loaded by registration
// alone, so they are injected here: the monolith build fills this object with
// static imports, the modular build fills it from the install bridges.

import type { Core, DspPlugin, EffectPlugin } from '@modplayjs/core';

export interface SidServices {
  readonly dsp: DspPlugin;
  startTune(bytes: Uint8Array, sampleRate: number, subtune: number): void;
  seek(seconds: number): void;
  playTimeSeconds(): number;
  chipCount(): number;
  applySettings(settings: {
    volume: number;
    highQualitySID: boolean;
    highQualityResampler: boolean;
    stereo: number;
  }): void;
  /**
   * Init-time SID overrides, applied on the next startTune: chip model and
   * video standard are consumed only by the C64 init, not live.
   */
  applyInitSettings(model: number, videoStandard: number | null | undefined): void;
  loadSongLengths(text: string): void;
}

export interface FcServices {
  readonly effect: EffectPlugin;
  /** Installs the FC event reader; needs the MOD format plugin registered. */
  installEventReader(core: Core): void;
}

export interface EngineServices {
  sid?: SidServices;
  fc?: FcServices;
}

/** Filled by the provider module and by `__modplayInstall`. */
export const services: EngineServices = {};

/** Names of the formats present when the engine was created. */
export const staticFormatNames: string[] = [];
