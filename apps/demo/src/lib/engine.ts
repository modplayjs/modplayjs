// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// One player engine, shared by the layouts. No DOM here: the UI reads state
// from Player and calls into these objects.
import { CorePlayer, type Core } from '@modplayjs/core';
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
import { plugin as mo3Plugin } from '@modplayjs/fmt-mo3';
import { plugin as sidPlugin, sidDsp } from '@modplayjs/fmt-sid';
import { plugin as fcPlugin, fcEffect, setModEventReader } from '@modplayjs/fmt-fc';
import { pwPlugin } from '@modplayjs/fmt-prowizard';
import { createPaulaPlugin } from '@modplayjs/dsp-paula';
import { createSoftMixerPlugin, type SoftMixer } from '@modplayjs/dsp-softmixer';
import { WebAudioOutput } from '@modplayjs/out-webaudio';
import { Playhead } from '@modplayjs/playhead';

export const core = new CorePlayer();
core.registries.registerFormat(modPlugin);
core.registries.registerFormat(hmnPlugin);
core.registries.registerFormat(fltPlugin);
core.registries.registerFormat(s3mPlugin);
core.registries.registerFormat(xmPlugin);
core.registries.registerFormat(itPlugin);
core.registries.registerFormat(mtmPlugin);
core.registries.registerFormat(stmPlugin);
core.registries.registerFormat(s69Plugin);
core.registries.registerFormat(sfxPlugin);
core.registries.registerFormat(digiPlugin);
core.registries.registerFormat(asylumPlugin);
core.registries.registerFormat(icePlugin);
core.registries.registerFormat(medPlugin);
core.registries.registerFormat(mmd3Plugin);
core.registries.registerFormat(med2Plugin);
core.registries.registerFormat(med3Plugin);
core.registries.registerFormat(med4Plugin);
core.registries.registerFormat(stPlugin);
core.registries.registerFormat(mo3Plugin);
core.registries.registerFormat(sidPlugin);
core.registries.registerFormat(fcPlugin);
core.registries.registerEffect(fcEffect);
setModEventReader((c: Core, chn: number, row: number) => {
  // The shared MOD reader is the registered fmt-mod plugin's readEvent.
  core.registries.format('mod').readEvent(c, chn, row);
});
core.registries.registerFormat(pwPlugin);
core.registries.registerDsp(createPaulaPlugin());
export const mixerInstance = createSoftMixerPlugin() as SoftMixer;
core.registries.registerDsp(mixerInstance);
core.registries.registerDsp(sidDsp);

export const output = new WebAudioOutput();

// Playback clock (pattern-view sync). The renderer runs AHEAD of the speaker
// by the ring's high-water mark (~0.7 s) plus the device latency, so
// `core.playState` shows a row the listener has not heard yet. The playhead
// records (frames rendered, position) on every pull and resolves the position
// at the frame the sink has actually played out.
export const playhead = new Playhead();
playhead.setConsumedProvider(() => output.audibleFrames);
