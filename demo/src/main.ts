// modplayjs demo — load + play/stop verification vehicle (T22).
// File input (MOD/S3M/XM/IT) → loadModule → DSP by format (Paula for MOD,
// softmixer for the rest — set AFTER loadModule, BEFORE startPlayer) →
// out-webaudio.start(core). No auto-play before a user gesture.

import { CorePlayer, StateError } from '@modplayjs/core';
import workletUrl from './worklet-url';
import { plugin as modPlugin } from '@modplayjs/fmt-mod';
import { plugin as s3mPlugin } from '@modplayjs/fmt-s3m';
import { plugin as xmPlugin } from '@modplayjs/fmt-xm';
import { plugin as itPlugin } from '@modplayjs/fmt-it';
import { createPaulaPlugin } from '@modplayjs/dsp-paula';
import { createSoftMixerPlugin } from '@modplayjs/dsp-softmixer';
import { WebAudioOutput } from '@modplayjs/out-webaudio';

const fileInput = document.getElementById('file') as HTMLInputElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLPreElement;

const core = new CorePlayer();
core.registries.registerFormat(modPlugin);
core.registries.registerFormat(s3mPlugin);
core.registries.registerFormat(xmPlugin);
core.registries.registerFormat(itPlugin);
core.registries.registerDsp(createPaulaPlugin());
core.registries.registerDsp(createSoftMixerPlugin());

const output = new WebAudioOutput();

let loaded = false;
let playing = false;

function show(msg: string): void {
  status.textContent = msg;
}

if (typeof window !== 'undefined' && !window.isSecureContext) {
  show(
    'WARNING: this page is not in a secure context (HTTPS or localhost). ' +
      'AudioWorklet is unavailable — open via http://localhost:<port> instead.',
  );
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (playing) {
      output.stop();
      playing = false;
    }
    core.loadModule(bytes);
    const mod = core.module;
    if (!mod) throw new StateError('module did not load');
    // DSP by format (T22 contract): Paula for MOD, softmixer otherwise.
    core.setDsp(mod.format === 'mod' ? 'paula' : 'softmixer');
    loaded = true;
    playBtn.disabled = false;
    show(
      `format: ${mod.format.toUpperCase()} | DSP: ${core.dsp().name} | ` +
      `channels: ${mod.chn} | patterns: ${mod.pat} | tracker: ${mod.tracker}`,
    );
  } catch (err) {
    loaded = false;
    playBtn.disabled = true;
    const msg = err instanceof Error ? err.message : String(err);
    show(`unsupported or corrupt file: ${msg}`);
  }
});

playBtn.addEventListener('click', async () => {
  if (!loaded || playing) return;
  try {
    // Device-rate matching (T22): render at the AudioContext rate --
    // otherwise 44.1k data drains at the device rate (48k) -> pitch-up +
    // periodic underruns (stutter/clack every ~2s).
    const deviceRate = await output.deviceSampleRate();
    core.setSampleRate(deviceRate);
    core.startPlayer();
    await output.start(core, workletUrl); // click handler = user gesture
    playing = true;
    stopBtn.disabled = false;
    show(
      `playing | DSP: ${core.dsp().name} | sample rate: ${output.audioContextSampleRate} Hz`,
    );
    // Live status: posted/diagnose silent output.
    const tick = window.setInterval(() => {
      if (!playing) {
        window.clearInterval(tick);
        return;
      }
      show(
        `playing | DSP: ${core.dsp().name} | rate: ${output.audioContextSampleRate} Hz | ` +
          `rendered: ${output.debugInfo.renderedFrames} frames | posted: ${output.debugInfo.postedChunks} chunks`,
      );
    }, 500);
  } catch (err) {
    const msg = err instanceof StateError || err instanceof Error ? err.message : String(err);
    const secureHint =
      typeof window !== 'undefined' && !window.isSecureContext
        ? ' — serve the demo over HTTPS or http://localhost (AudioWorklet is unavailable on plain http://<ip>)'
        : '';
    show(`play failed: ${msg}${secureHint}`);
  }
});

stopBtn.addEventListener('click', () => {
  if (!playing) return;
  output.stop();
  playing = false;
  stopBtn.disabled = true;
  show('stopped');
});
