// SPDX-License-Identifier: BSD-3-Clause
// Android/headless engine entry. V8 evaluates this file once, then calls the
// global API. No DOM, no Web Audio, no WASM, no prerender.
//
// Format plugins are NOT imported here. The monolith build (apps/android) has
// a provider module that registers all of them before this file runs; the
// modular build (apps/xr) installs one per format at runtime through
// globalThis.__modplayInstall. Everything the engine needs from an optional
// package beyond its plugin value is injected via engine-services.
import { CorePlayer } from '@modplayjs/core';
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
  type AndroidPattern,
  type AndroidSettings,
  type AndroidSnapshot,
  type AndroidState,
  type AndroidTrack,
} from '@modplayjs/out-android';
import { services, staticFormatNames } from './engine-services.js';

const core = new CorePlayer();

// The monolith bundle imports the provider first, which leaves this hook on the
// global object. The modular build has no provider: formats arrive later through
// __modplayInstall instead.
(globalThis as unknown as { __modplayProvide?: (core: CorePlayer) => void })
  .__modplayProvide?.(core);

/**
 * What this engine can play, handed to the app so it can rescan its library
 * when the set changes (a format added, removed or replaced). Decoder changes
 * that keep the set identical need no rescan.
 *
 * Built from the installed set, not from a compile-time list: in the modular
 * build a format exists only after its install bridge ran.
 */
const installedFormats: string[] = [...staticFormatNames];
const engineVersion = (): string => `formats:${installedFormats.join(',')}`;

/**
 * Register one format bridge's plugins.
 *
 * Called once per format by the modular build, and by the provider module in
 * the monolith build before this file runs. Re-registering a name throws in
 * the registry, so a repeated install is filtered here instead of crashing the
 * audio thread on a track change.
 */
let pendingFcReader = false;

function installFormat(_name: string, plugins: unknown[]): boolean {
  let added = 0;
  for (const candidate of plugins) {
    const plugin = candidate as { name?: string } | null;
    if (!plugin || typeof plugin.name !== 'string') continue;
    if (installedFormats.includes(plugin.name)) continue;
    try {
      core.registries.registerFormat(plugin as never);
      installedFormats.push(plugin.name);
      added++;
    } catch {
      // Already registered by another bridge: keep going, the format works.
    }
  }
  if (pendingFcReader && installedFormats.includes('mod') && services.fc) {
    try {
      services.fc.installEventReader(core);
      pendingFcReader = false;
    } catch {
      // Still no reader: try again on the next install.
    }
  }
  return added > 0;
}

(globalThis as unknown as { __modplayInstall?: unknown }).__modplayInstall = installFormat;

/**
 * Attach an optional package's services after startup.
 *
 * A plugin is a value the registry can take at any time, but the SID DSP and
 * the FC effect are consulted by the player and by the event reader. In the
 * monolith build the provider sets them before this file runs; in the modular
 * build they arrive when their format is installed, which can be after the
 * first track. Installing them here keeps both builds on one code path.
 */
function attachServices(kind: string, value: unknown): boolean {
  if (kind === 'sid') {
    const sid = value as NonNullable<typeof services.sid>;
    services.sid = sid;
    try {
      core.registries.registerDsp(sid.dsp);
    } catch {
      // Already registered (a repeated install): the DSP is a singleton.
    }
    return true;
  }
  if (kind === 'fc') {
    const fc = value as NonNullable<typeof services.fc>;
    services.fc = fc;
    try {
      core.registries.registerEffect(fc.effect);
    } catch {
      // Already registered.
    }
    // The event reader needs the MOD format plugin; skip it if FC arrives
    // before MOD and install it later when MOD does.
    try {
      fc.installEventReader(core);
    } catch {
      pendingFcReader = true;
    }
    return true;
  }
  return false;
}

(globalThis as unknown as { __modplayAttach?: unknown }).__modplayAttach = attachServices;

core.registries.registerDsp(createPaulaPlugin());
const mixer = createSoftMixerPlugin() as SoftMixer;
core.registries.registerDsp(mixer);
if (services.sid) core.registries.registerDsp(services.sid.dsp);
if (services.fc) core.registries.registerEffect(services.fc.effect);
services.fc?.installEventReader(core);

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
let spatialEnabled = false;

const isStreamed = (): boolean => streamed !== null;
const isSid = (): boolean => core.module?.format === 'sid';

function durationMs(): number {
  if (streamed) return streamed.durationMs;
  const mod = core.module;
  if (!mod) return 0;
  // No `endless` early return: an endless player is not the same thing as an
  // unknown length. A SID tune loops forever, but its runtime is known from the
  // HVSC song-length database, and that number is what the seekbar needs.
  let total = 0;
  for (const seq of mod.sequences) total += seq.duration;
  return total;
}

function modulePosition(): number {
  if (streamed) return (streamedFrames / sampleRate) * 1000;
  if (isSid()) return (services.sid?.playTimeSeconds() ?? 0) * 1000;
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
  mixer.spatial = spatialEnabled && !isSid();
  if (!isSid()) applyMutes();
}

function applyMutes(): void {
  if (!loaded || isStreamed() || isSid()) return;
  const n = core.module?.chn ?? 0;
  for (let i = 0; i < n; i++) core.setChannelMute(i, channelMutes[i] === true);
}

function applySidSettings(): void {
  services.sid?.applySettings({
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
      durationMs: streamed.durationMs,
      endless: false,
      streamed: {
        format: streamedFormat ?? 'audio',
        channels: streamed.channels,
        sampleRate: streamed.sampleRate,
        durationMs: streamed.durationMs,
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
    // The slider scales the position by the duration, so a length is the
    // precondition, not a nicety: without one the UI can only show "infinity"
    // and a dead handle. All three paths can seek - trackers by `seekTime`, a
    // stream by its decoded buffer, SID by fast-forwarding the emulation - so
    // the rule is just "we know how long it is".
    seekable: loaded && durationMs() > 0,
    patternView: tracker,
    mixer: tracker,
    mixerMode: tracker && mod.format === 'mod' && mod.chn === 4,
    amigaFilter: tracker && mod.format === 'mod' && mod.chn === 4,
    panSeparation: tracker && (settings.mixer.layout === 'panned' || settings.mixer.layout === 'spatial3d'),
    sidPanel: sid,
    sidStereo: sid && (services.sid?.chipCount() ?? 0) > 1,
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
    engineVersion: engineVersion(),
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
    if (sidBytes && isSid()) {
      services.sid?.applyInitSettings(settings.sid.model, settings.sid.videoStandard);
      services.sid?.startTune(sidBytes, sampleRate, 1);
    }
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
    services.sid?.seek(target / 1000);
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
  // Chip model and video standard are init-time only: the C64 setup reads them
  // while loading the tune, so they have to be set before startTune. Without
  // this the two settings restarted the tune but changed nothing.
  services.sid?.applyInitSettings(settings.sid.model, settings.sid.videoStandard);
  services.sid?.startTune(sidBytes, sampleRate, 1);
  core.startPlayer();
  applySidSettings();
  services.sid?.seek(pos / 1000);
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

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const FX_LETTERS = '0123456789ABCDEFHIJKLMNOPQRSTUVWXWZ';

function noteText(note: number): string {
  if (note <= 0 || note > 120) return '...';
  const n = note - 1;
  return NOTE_NAMES[n % 12] + String(Math.floor(n / 12));
}

function fxText(fxt: number, fxp: number): string {
  if (!fxt && !fxp) return '...';
  const letter = fxt >= 0 && fxt < FX_LETTERS.length ? FX_LETTERS[fxt] : '?';
  return letter + (fxp & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

/** One cell as fixed-width tracker text: note, instrument, volume, effect. */
function cellText(
  event: { note: number; ins: number; vol: number; fxt: number; fxp: number } | undefined,
): string {
  const note = event && event.note ? noteText(event.note) : '...';
  const ins = event && event.ins ? String(event.ins).padStart(2, ' ') : '..';
  const vol = event && event.vol ? String(Math.min(event.vol, 99)).padStart(2, ' ') : '..';
  const fx = event && (event.fxt || event.fxp) ? fxText(event.fxt, event.fxp) : '...';
  return `${note} ${ins} ${vol} ${fx}`;
}

/**
 * The pattern at an order position, as preformatted cells. Fetched on demand:
 * rows x channels strings is far too much for the 4 Hz snapshot.
 */
function patternObject(order: number): AndroidPattern {
  const mod = core.module;
  const empty: AndroidPattern = { pattern: order, rows: 0, channels: 0, cells: [] };
  if (!mod) return empty;
  const orderIndex = order >= 0 ? order : core.playState.ord;
  const patIndex = mod.xxo[orderIndex] ?? orderIndex;
  const pat = mod.patterns[patIndex];
  if (!pat) return empty;
  const channels = mod.chn;
  const cells: string[] = new Array(pat.rows * channels);
  for (let row = 0; row < pat.rows; row++) {
    for (let ch = 0; ch < channels; ch++) {
      cells[row * channels + ch] = cellText(pat.tracks[ch]?.event?.[row]);
    }
  }
  return { pattern: orderIndex, rows: pat.rows, channels, cells };
}

/**
 * Cheap playhead poll: ord/row/pattern/position only.
 *
 * The full snapshot() rebuilds the track object (instrument and sample lists
 * included) and is meant for 2 Hz. A pattern view needs a new row every ~120 ms
 * at 125 BPM speed 6, so it polls this instead — a few numbers, no arrays.
 */
function playhead(): string {
  const mod = core.module;
  const ps = core.playState;
  return JSON.stringify({
    playing: playing && !paused && !ended,
    paused,
    ended,
    positionMs: modulePosition(),
    ord: streamed ? 0 : ps.ord,
    row: streamed ? 0 : ps.row,
    pattern: streamed || !mod ? 0 : (mod.xxo[ps.ord] ?? 0),
  });
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
    case 'getPattern':
      return JSON.stringify(patternObject(typeof c.pattern === 'number' ? c.pattern : -1));
    case 'playhead':
      return playhead();
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
      services.sid?.loadSongLengths(s(c.text));
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
    case 'setSpatial':
      spatialEnabled = c.enabled === true;
      applySettings();
      break;
    case 'spatialInfo':
      return spatialInfo();
    default:
      setSetting(s(c.key), c.value);
      break;
  }
  return snapshot();
}

/**
 * Spatial render: one mono stem per tracker channel, taken from the mixer's
 * per-channel buses. The pan/layout information is not applied here — it
 * leaves as an azimuth in spatialInfo(), so the XR host can place each
 * channel as its own audio object.
 */
const spatialStage: Float32Array[] = [];
let spatialStageLen = 0;
let spatialStageOff = 0;

function spatialChannels(): number {
  return core.module?.chn ?? 0;
}

function azimuthFor(i: number): number {
  // Raw channel azimuth only: the module pan times the pan separation. Layout
  // mapping (Front 180, 360, Amiga pairs) is the host's single table in
  // SpatialLayout.kt; keeping a second copy here is what made the two disagree.
  const xc = core.channelStates[i];
  const pan = xc ? (xc.info_finalpan - 0x80) / 0x80 : 0;
  return pan * 60 * (settings.transport.panSeparation / 100);
}

function spatialInfo(): string {
  const n = spatialChannels();
  const azimuths: number[] = [];
  for (let i = 0; i < n; i++) azimuths.push(Math.round(azimuthFor(i) * 10) / 10);
  return JSON.stringify({
    enabled: spatialEnabled,
    available: loaded && !isStreamed() && !isSid(),
    layout: settings.mixer.layout,
    channels: n,
    azimuths,
  });
}

function renderSpatial(frames: number): Float32Array {
  if (!loaded || !playing || paused || ended || frames <= 0) return new Float32Array(0);
  if (isStreamed() || isSid()) return new Float32Array(0);
  const n = spatialChannels();
  if (n <= 0) return new Float32Array(0);
  const mix = core.dsp() as unknown as { spatial: boolean; stemOut: Float32Array[] };
  mix.spatial = true;
  const out = new Float32Array(n * frames);
  let filled = 0;
  while (filled < frames) {
    if (spatialStageOff >= spatialStageLen) {
      const scratch = new Float32Array(core.ticksize * 2);
      const ret = core.playBuffer(scratch, scratch.length);
      if (ret <= 0) {
        if (ret < 0) ended = true;
        break;
      }
      spatialStageLen = core.ticksize;
      spatialStageOff = 0;
      for (let ch = 0; ch < n; ch++) {
        const src = mix.stemOut[ch];
        let dst = spatialStage[ch];
        if (!dst || dst.length < spatialStageLen) {
          dst = new Float32Array(spatialStageLen);
          spatialStage[ch] = dst;
        } else {
          dst.fill(0, 0, spatialStageLen);
        }
        if (src) dst.set(src.subarray(0, spatialStageLen));
      }
    }
    const take = Math.min(spatialStageLen - spatialStageOff, frames - filled);
    for (let ch = 0; ch < n; ch++) {
      const src = spatialStage[ch];
      if (src) out.set(src.subarray(spatialStageOff, spatialStageOff + take), ch * frames + filled);
    }
    spatialStageOff += take;
    filled += take;
  }
  return filled === frames ? out : out.subarray(0, n * filled);
}

const api = {
  load,
  play,
  pause,
  resume,
  stop,
  seek,
  render,
  renderSpatial,
  spatialInfo,
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
