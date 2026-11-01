// SPDX-License-Identifier: BSD-3-Clause
// Android/headless engine entry. V8 evaluates this file once, then calls the
// global API. No DOM, no Web Audio, no WASM, no prerender.
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
import {
  plugin as sidPlugin,
  sidDsp,
  sidStartTune,
  sidSeek,
  applySidSettingsLive,
  loadSidSongLengths,
  getSidChipCount,
  getSidPlayTimeSeconds,
} from '@modplayjs/fmt-sid';
import { plugin as fcPlugin, fcEffect, setModEventReader } from '@modplayjs/fmt-fc';
import { pwPlugin } from '@modplayjs/fmt-prowizard';
import { createPaulaPlugin } from '@modplayjs/dsp-paula';
import { createSoftMixerPlugin, type SoftMixer } from '@modplayjs/dsp-softmixer';
import {
  createStreamedSource,
  detectStreamedFormat,
  type StreamedSource,
} from '@modplayjs/stream-audio';
import {
  normaliseSettings,
  SCHEMA_VERSION,
  type AndroidCapabilities,
  type AndroidChannel,
  type AndroidCommand,
  type AndroidSettings,
  type AndroidSnapshot,
  type AndroidState,
  type AndroidTrack,
} from '@modplayjs/out-android';

const core = new CorePlayer();
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
core.registries.registerFormat(sidPlugin);
core.registries.registerFormat(fcPlugin);
core.registries.registerEffect(fcEffect);
setModEventReader((c: Core, chn: number, row: number) => {
  core.registries.format('mod').readEvent(c, chn, row);
});
core.registries.registerFormat(pwPlugin);
core.registries.registerDsp(createPaulaPlugin());
const mixer = createSoftMixerPlugin() as SoftMixer;
core.registries.registerDsp(mixer);
core.registries.registerDsp(sidDsp);

let settings: AndroidSettings = normaliseSettings({});
let sampleRate = 48000;
let loaded = false;
let playing = false;
let paused = false;
let ended = false;
let trackName = '';
let streamed: StreamedSource | null = null;
let streamedFormat: string | null = null;
let streamedFrames = 0;
let sidBytes: Uint8Array | null = null;
let channelMutes: boolean[] = [];
let soloChannel: number | null = null;
let savedMutes: boolean[] | null = null;

const isStreamed = (): boolean => streamed !== null;
const isSid = (): boolean => core.module?.format === 'sid';

function durationMs(): number {
  if (streamed) return streamed.duration;
  const mod = core.module;
  if (!mod || mod.endless) return 0;
  let total = 0;
  for (const seq of mod.sequences) total += seq.duration;
  return total;
}

function modulePosition(): number {
  if (streamed) return (streamedFrames / sampleRate) * 1000;
  if (isSid()) return getSidPlayTimeSeconds() * 1000;
  return core.playState.timeMs;
}

function applySettings(): void {
  if (!loaded || isStreamed()) return;
  core.setVolume(settings.transport.volume);
  core.setPanSeparation(settings.transport.panSeparation);
  core.setInterpolation(settings.transport.interpolation);
  core.setNumVoices(settings.transport.numVoices);
  core.setTempoFactor(settings.transport.tempoFactor);
  mixer.configure({
    mode: settings.mixer.mode,
    layout: settings.mixer.layout,
    amigaFilter: settings.mixer.amigaFilter,
    amplify: settings.mixer.amplify,
  });
  if (!isSid()) applyMutes();
}

function applyMutes(): void {
  if (!loaded || isStreamed() || isSid()) return;
  const n = core.module?.chn ?? 0;
  for (let i = 0; i < n; i++) core.setChannelMute(i, channelMutes[i] === true);
}

function applySidSettings(): void {
  applySidSettingsLive({
    volume: settings.sid.volume,
    highQualitySID: settings.sid.quality !== 'light',
    highQualityResampler: settings.sid.quality === 'sinc',
    stereo: settings.sid.stereo,
  });
}

function buildChannels(): AndroidChannel[] {
  const n = core.module?.chn ?? 0;
  const out: AndroidChannel[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      index: i,
      label: `C${i + 1}`,
      muted: channelMutes[i] === true,
      solo: soloChannel === i,
      volume: core.getChannelVol(i),
      canMute: !isSid(),
    });
  }
  return out;
}

function buildTrack(): AndroidTrack {
  if (streamed) {
    return {
      id: trackName,
      name: trackName,
      title: trackName.replace(/\.[^.]+$/, ''),
      format: streamedFormat ?? 'audio',
      tracker: '',
      channels: streamed.channels,
      orders: 0,
      orderList: [],
      patterns: 0,
      instruments: 0,
      instrumentList: [],
      samples: 0,
      sampleList: [],
      restart: 0,
      globalVolume: 0,
      globalVolumeBase: 0,
      durationMs: streamed.duration,
      endless: false,
      streamed: {
        format: streamedFormat ?? 'audio',
        channels: streamed.channels,
        sampleRate: streamed.sampleRate,
        durationMs: streamed.duration,
      },
      artwork: null,
    };
  }
  const mod = core.module;
  if (!mod)
    return {
      id: trackName,
      name: trackName,
      title: trackName,
      format: '',
      tracker: '',
      channels: 0,
      orders: 0,
      orderList: [],
      patterns: 0,
      instruments: 0,
      instrumentList: [],
      samples: 0,
      sampleList: [],
      restart: 0,
      globalVolume: 0,
      globalVolumeBase: 0,
      durationMs: 0,
      endless: false,
      streamed: null,
      artwork: null,
    };
  const clean = (name: string): string =>
    settings.view.stripDots ? name.replace(/\.+$/, '') : name;
  const instrumentList = mod.instruments.map((ins, i) => ({
    index: i,
    name: clean(ins.name),
    sampleId: ins.nsm > 0 ? (ins.sub[0]?.sid ?? null) : null,
  }));
  const sampleList: { index: number; name: string; length: number; loop: boolean }[] = [];
  for (let i = 0; i < core.samples.size; i++) {
    const s = core.samples.get(i);
    sampleList.push({
      index: i,
      name: clean(s.name),
      length: s.length,
      loop: s.loopEnd > s.loopStart,
    });
  }
  return {
    id: trackName,
    name: trackName,
    title: mod.title || trackName,
    format: mod.format,
    tracker: mod.tracker,
    channels: mod.chn,
    orders: mod.len,
    orderList: mod.xxo.slice(0, mod.len),
    patterns: mod.pat,
    instruments: mod.ins,
    instrumentList,
    samples: core.samples.size,
    sampleList,
    restart: mod.restart,
    globalVolume: mod.gvol,
    globalVolumeBase: mod.gvolbase,
    ...(mod.mvol !== undefined ? { masterVolume: mod.mvol, masterVolumeBase: mod.mvolbase } : {}),
    ...(mod.comment ? { message: mod.comment } : {}),
    durationMs: durationMs(),
    endless: mod.endless === true,
    streamed: null,
    artwork: null,
  };
}

function buildCapabilities(): AndroidCapabilities {
  const mod = core.module;
  const tracker = loaded && !streamed && mod !== null && mod.format !== 'sid';
  const sid = loaded && isSid();
  return {
    loaded,
    streamed: isStreamed(),
    sid,
    endless: sid || mod?.endless === true,
    seekable: loaded && !(sid || mod?.endless === true),
    patternView: tracker,
    mixer: tracker,
    mixerMode: tracker && mod.format === 'mod' && mod.chn === 4,
    amigaFilter: tracker && mod.format === 'mod' && mod.chn === 4,
    panSeparation: tracker && settings.mixer.layout === 'panned',
    sidPanel: sid,
    sidStereo: sid && getSidChipCount() > 1,
    audition: tracker && (mod.ins > 0 || core.samples.size > 0),
    channelMute: tracker && mod.chn > 0,
  };
}

function buildState(): AndroidState {
  const mod = core.module;
  const ps = core.playState;
  const dur = durationMs();
  const pos = modulePosition();
  return {
    playing: playing && !paused && !ended,
    paused,
    ended,
    seeking: false,
    positionMs: pos,
    durationMs: dur,
    durationKnown: dur > 0,
    ord: streamed ? 0 : ps.ord,
    row: streamed ? 0 : ps.row,
    pattern: streamed || !mod ? 0 : (mod.xxo[ps.ord] ?? 0),
    rowProgress: 0,
    speed: streamed ? 0 : ps.speed,
    bpm: streamed ? 0 : ps.bpm,
    loopCount: streamed ? 0 : ps.loopCount,
    trackIndex: 0,
    repeat: settings.playback.repeat,
    shuffle: settings.playback.shuffle,
  };
}

function snapshotObject(): AndroidSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    state: buildState(),
    track: loaded ? buildTrack() : null,
    channels: loaded ? buildChannels() : [],
    capabilities: buildCapabilities(),
    settings,
    soloChannel,
  };
}

function snapshot(): string {
  return JSON.stringify(snapshotObject());
}

function load(bytes: Uint8Array, name: string): void {
  playing = false;
  paused = false;
  ended = false;
  streamed = null;
  streamedFormat = null;
  streamedFrames = 0;
  sidBytes = null;
  soloChannel = null;
  savedMutes = null;
  trackName = name;
  const fmt = detectStreamedFormat(bytes, name);
  if (fmt) {
    const src = createStreamedSource(bytes, fmt, sampleRate);
    if (src) {
      streamed = src;
      streamedFormat = fmt;
      loaded = true;
      channelMutes = [];
      return;
    }
  }
  core.loadModule(bytes);
  const mod = core.module;
  if (!mod) throw new Error('module did not load');
  channelMutes = new Array(mod.chn).fill(false);
  if (mod.format === 'sid') {
    sidBytes = bytes;
    core.setDsp('sid');
  } else {
    core.setDsp('softmixer');
    applySettings();
  }
  loaded = true;
}

function play(): void {
  if (!loaded) return;
  if (paused) {
    paused = false;
    playing = true;
    return;
  }
  if (playing) return;
  ended = false;
  if (!streamed) {
    core.setSampleRate(sampleRate);
    if (sidBytes && isSid()) sidStartTune(sidBytes, sampleRate, 1);
    core.startSmix(4);
    core.startPlayer();
    applySettings();
    if (isSid()) applySidSettings();
  }
  playing = true;
}

function pause(): void {
  if (playing) paused = true;
}
function resume(): void {
  if (playing) paused = false;
}
function stop(): void {
  playing = false;
  paused = false;
  ended = true;
  if (!streamed) {
    try {
      core.stopPlayer();
    } catch {
      /* already stopped */
    }
  }
  if (streamed) streamed.seek(0);
  streamedFrames = 0;
}

function seek(ms: number): void {
  if (!loaded) return;
  const target = Math.max(0, ms);
  if (streamed) {
    streamed.seek(target);
    streamedFrames = (target / 1000) * sampleRate;
  } else if (isSid()) {
    sidSeek(target / 1000);
  } else {
    core.seekTime(target);
  }
}

let renderScratch = new Float32Array(0);
function render(frames: number): Float32Array {
  if (!loaded || !playing || paused || ended || frames <= 0) return new Float32Array(0);
  const need = frames * 2;
  if (renderScratch.length < need) renderScratch = new Float32Array(need);
  const n = streamed
    ? streamed.playBuffer(renderScratch, need)
    : core.playBuffer(renderScratch, need);
  if (n <= 0) {
    playing = false;
    ended = true;
    return new Float32Array(0);
  }
  if (streamed) streamedFrames += n / 2;
  return renderScratch.subarray(0, n);
}

function setSetting(key: string, value: unknown): void {
  const parts = key.split('.');
  let obj: Record<string, unknown> = settings as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = obj[parts[i]!];
    if (typeof next !== 'object' || next === null) return;
    obj = next as Record<string, unknown>;
  }
  obj[parts[parts.length - 1]!] = value;
  settings = normaliseSettings(settings);
}

function restartSid(): void {
  if (!sidBytes || !isSid()) return;
  const pos = modulePosition();
  try {
    core.stopPlayer();
  } catch {
    /* no-op */
  }
  sidStartTune(sidBytes, sampleRate, 1);
  core.startPlayer();
  applySidSettings();
  sidSeek(pos / 1000);
}

function auditionInstrument(index: number, note = 60, volume = 64): void {
  if (!loaded || streamed || isSid()) return;
  if (!playing) play();
  core.playNote(index, note, volume);
}

function auditionSample(sampleId: number, note = 60, volume = 64): void {
  const mod = core.module;
  if (!mod) return;
  for (let i = 0; i < mod.instruments.length; i++) {
    const ins = mod.instruments[i]!;
    for (let k = 0; k < ins.nsm; k++) {
      if (ins.sub[k]?.sid === sampleId) {
        const key = ins.map.indexOf(k);
        auditionInstrument(i, key >= 0 ? key : note, volume);
        return;
      }
    }
  }
}

function command(json: string): string {
  let c: AndroidCommand;
  try {
    c = JSON.parse(json) as AndroidCommand;
  } catch {
    return snapshot();
  }
  const n = (v: unknown): number => (typeof v === 'number' ? v : 0);
  const s = (v: unknown): string => (typeof v === 'string' ? v : '');
  switch (c.type) {
    case 'play':
      play();
      break;
    case 'pause':
      pause();
      break;
    case 'resume':
      resume();
      break;
    case 'stop':
      stop();
      break;
    case 'seek':
      seek(n(c.positionMs));
      break;
    case 'setVolume': {
      settings.transport.volume = n(c.value);
      settings = normaliseSettings(settings);
      if (!isStreamed()) core.setVolume(settings.transport.volume);
      break;
    }
    case 'setPanSeparation': {
      settings.transport.panSeparation = n(c.value);
      settings = normaliseSettings(settings);
      if (!isStreamed()) core.setPanSeparation(settings.transport.panSeparation);
      break;
    }
    case 'setInterpolation':
      settings.transport.interpolation = n(c.value) as 0 | 1 | 2;
      settings = normaliseSettings(settings);
      if (!isStreamed()) core.setInterpolation(settings.transport.interpolation);
      break;
    case 'setNumVoices':
      settings.transport.numVoices = n(c.value);
      settings = normaliseSettings(settings);
      if (!isStreamed()) core.setNumVoices(settings.transport.numVoices);
      break;
    case 'setTempoFactor':
      settings.transport.tempoFactor = n(c.value);
      settings = normaliseSettings(settings);
      if (!isStreamed()) core.setTempoFactor(settings.transport.tempoFactor);
      break;
    case 'setSampleRate': {
      const v = n(c.value);
      if (v > 0) sampleRate = v;
      settings.transport.sampleRate = v > 0 ? v : null;
      break;
    }
    case 'setMixerMode':
      settings.mixer.mode = s(c.value) === 'paula' ? 'paula' : 'libxmp';
      mixer.configure({ ...settings.mixer });
      break;
    case 'setMixerLayout':
      settings.mixer.layout = s(c.value) as AndroidSettings['mixer']['layout'];
      settings = normaliseSettings(settings);
      mixer.configure({ ...settings.mixer });
      break;
    case 'setAmigaFilter':
      settings.mixer.amigaFilter = s(c.value) === 'a500led' ? 'a500led' : 'a500';
      mixer.configure({ ...settings.mixer });
      break;
    case 'setAmplify':
      settings.mixer.amplify = n(c.value);
      settings = normaliseSettings(settings);
      mixer.configure({ ...settings.mixer });
      break;
    case 'setSidQuality': {
      const q = s(c.value);
      settings.sid.quality = q === 'hq' ? 'hq' : q === 'sinc' ? 'sinc' : 'light';
      applySidSettings();
      break;
    }
    case 'setSidStereo':
      settings.sid.stereo = n(c.value) as 0 | 1 | 3;
      applySidSettings();
      break;
    case 'setSidVolume':
      settings.sid.volume = n(c.value);
      settings = normaliseSettings(settings);
      applySidSettings();
      break;
    case 'setSidModel':
      settings.sid.model = n(c.value) as 0 | 6581 | 8580;
      if (isSid()) restartSid();
      break;
    case 'setSidVideo': {
      const v = c.value;
      settings.sid.videoStandard = v === null ? null : n(v) === 1 ? 1 : 0;
      if (isSid()) restartSid();
      break;
    }
    case 'toggleChannelMute': {
      const i = n(c.index);
      if (i >= 0 && i < channelMutes.length) channelMutes[i] = !channelMutes[i];
      applyMutes();
      break;
    }
    case 'setChannelMute': {
      const i = n(c.index);
      if (i >= 0 && i < channelMutes.length) channelMutes[i] = c.muted === true;
      applyMutes();
      break;
    }
    case 'soloChannel': {
      const i = n(c.index);
      if (soloChannel === i) {
        soloChannel = null;
        if (savedMutes) channelMutes = savedMutes;
        savedMutes = null;
      } else {
        if (soloChannel === null) savedMutes = channelMutes.slice();
        soloChannel = i;
        channelMutes = channelMutes.map((_, k) => k !== i);
      }
      applyMutes();
      break;
    }
    case 'clearSolo':
      soloChannel = null;
      if (savedMutes) channelMutes = savedMutes;
      savedMutes = null;
      applyMutes();
      break;
    case 'muteAllChannels':
      channelMutes = channelMutes.map(() => true);
      applyMutes();
      break;
    case 'unmuteAllChannels':
      channelMutes = channelMutes.map(() => false);
      soloChannel = null;
      applyMutes();
      break;
    case 'resetChannels':
      channelMutes = channelMutes.map(() => false);
      soloChannel = null;
      savedMutes = null;
      applyMutes();
      break;
    case 'auditionInstrument':
      auditionInstrument(n(c.index), n(c.note) || 60, n(c.volume) || 64);
      break;
    case 'auditionSample':
      auditionSample(n(c.sampleId), n(c.note) || 60, n(c.volume) || 64);
      break;
    case 'stopAudition':
      if (!isStreamed()) {
        for (let i = 0; i < (core.module?.chn ?? 0); i++) core.setChannelVol(i, 100);
      }
      break;
    case 'setJamMode':
      settings.playback.jamMode = c.enabled === true;
      if (!isStreamed() && !isSid()) {
        if (settings.playback.jamMode)
          for (let i = 0; i < (core.module?.chn ?? 0); i++) core.setChannelVol(i, 0);
        else for (let i = 0; i < (core.module?.chn ?? 0); i++) core.setChannelVol(i, 100);
      }
      break;
    case 'setSettings': {
      const next = (c as unknown as { settings?: Partial<AndroidSettings> }).settings;
      if (next) {
        const old = settings;
        settings = normaliseSettings(next);
        if (settings.transport.sampleRate && settings.transport.sampleRate > 0)
          sampleRate = settings.transport.sampleRate;
        applySettings();
        if (isSid()) {
          applySidSettings();
          if (
            old.sid.model !== settings.sid.model ||
            old.sid.videoStandard !== settings.sid.videoStandard
          )
            restartSid();
        }
      }
      break;
    }
    case 'loadSidSongLengths':
      loadSidSongLengths(s(c.text));
      break;
    case 'setRepeat':
      settings.playback.repeat = s(c.value) as AndroidSettings['playback']['repeat'];
      break;
    case 'setShuffle':
      settings.playback.shuffle = c.enabled === true;
      break;
    case 'setAutoAdvance':
      settings.playback.autoAdvance = c.enabled === true;
      break;
    default:
      setSetting(s(c.key), c.value);
      break;
  }
  return snapshot();
}

const api = {
  load,
  play,
  pause,
  resume,
  stop,
  seek,
  render,
  command,
  snapshot,
  setSettings: (json: string): void => {
    settings = normaliseSettings(JSON.parse(json) as Partial<AndroidSettings>);
    applySettings();
  },
  setSampleRate: (hz: number): void => {
    sampleRate = hz;
  },
};
(globalThis as unknown as { __modplay?: typeof api }).__modplay = api;
