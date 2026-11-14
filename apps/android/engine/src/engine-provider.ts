// SPDX-License-Identifier: BSD-3-Clause
// Monolith provider: registers every format and wires the optional services
// before the engine entry builds its player.
//
// apps/android and apps/xr share engine-entry.ts. The XR build never loads this
// file - it installs one format at a time from its assets and fills
// engine-services from the install bridges. Keeping the monolith as a provider
// means there is exactly one engine implementation, not two that drift apart.
//
// The provider cannot import the entry (the entry creates the player), so it
// leaves a function on the global object and the entry calls it. The android
// bundle imports this module first, which is what makes it run first.
import type { CorePlayer } from '@modplayjs/core';
import { plugin as modPlugin, hmnPlugin, fltPlugin } from '@modplayjs/fmt-mod';
import { plugin as s3mPlugin } from '@modplayjs/fmt-s3m';
import { plugin as xmPlugin } from '@modplayjs/fmt-xm';
import { plugin as itPlugin } from '@modplayjs/fmt-it';
import { plugin as mtmPlugin } from '@modplayjs/fmt-mtm';
import { plugin as stmPlugin } from '@modplayjs/fmt-stm';
import { plugin as s69Plugin } from '@modplayjs/fmt-669';
import { plugin as sfxPlugin } from '@modplayjs/fmt-sfx';
import { plugin as digiPlugin } from '@modplayjs/fmt-digi';
import { plugin as asylumPlugin } from '@modplayjs/fmt-asylum';
import { plugin as icePlugin } from '@modplayjs/fmt-ice';
import {
  plugin as medPlugin,
  mmd3Plugin,
  med2Plugin,
  med3Plugin,
  med4Plugin,
} from '@modplayjs/fmt-med';
import { plugin as stPlugin } from '@modplayjs/fmt-st';
import {
  plugin as sidPlugin,
  sidDsp,
  sidStartTune,
  sidSeek,
  applySidSettingsLive,
  setSidInitOverrides,
  loadSidSongLengths,
  getSidChipCount,
  getSidPlayTimeSeconds,
} from '@modplayjs/fmt-sid';
import { plugin as fcPlugin, fcEffect, setModEventReader } from '@modplayjs/fmt-fc';
import {
  plugin as midPlugin,
  midDsp,
  midSetSoundfont,
  midHasSoundfont,
  midStartTune,
  midSeek,
  getMidPlayTimeMs,
} from '@modplayjs/fmt-mid';
import { pwPlugin } from '@modplayjs/fmt-prowizard';
import { services, staticFormatNames } from './engine-services.js';

/**
 * Formats in probe order: the first plugin whose test() accepts the bytes wins,
 * so the order is part of the behaviour, not a list to sort.
 */
const FORMAT_PLUGINS = [
  modPlugin,
  hmnPlugin,
  fltPlugin,
  s3mPlugin,
  xmPlugin,
  itPlugin,
  mtmPlugin,
  stmPlugin,
  s69Plugin,
  sfxPlugin,
  digiPlugin,
  asylumPlugin,
  icePlugin,
  medPlugin,
  mmd3Plugin,
  med2Plugin,
  med3Plugin,
  med4Plugin,
  stPlugin,
  sidPlugin,
  midPlugin,
  fcPlugin,
  pwPlugin,
];

function provide(core: CorePlayer): void {
  for (const plugin of FORMAT_PLUGINS) {
    if (!staticFormatNames.includes(plugin.name)) staticFormatNames.push(plugin.name);
    core.registries.registerFormat(plugin);
  }
  services.sid = {
    dsp: sidDsp,
    startTune: sidStartTune,
    seek: sidSeek,
    playTimeSeconds: getSidPlayTimeSeconds,
    chipCount: getSidChipCount,
    applySettings: applySidSettingsLive,
    applyInitSettings: (model, videoStandard) =>
      setSidInitOverrides(
        model as 0 | 6581 | 8580,
        videoStandard === 0 || videoStandard === 1 ? videoStandard : undefined,
      ),
    loadSongLengths: loadSidSongLengths,
  };
  services.fc = {
    effect: fcEffect,
    installEventReader: () => {
      setModEventReader((c, chn, row) => {
        core.registries.format('mod').readEvent(c, chn, row);
      });
    },
  };
  services.mid = {
    dsp: midDsp,
    setSoundfont: midSetSoundfont,
    hasSoundfont: midHasSoundfont,
    startTune: midStartTune,
    seek: midSeek,
    playTimeMs: getMidPlayTimeMs,
  };
}

(globalThis as unknown as { __modplayProvide?: unknown }).__modplayProvide = provide;
