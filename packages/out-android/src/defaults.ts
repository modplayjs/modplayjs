import type { AndroidSettings } from './types.js';

export const DEFAULT_SETTINGS: AndroidSettings = {
  schemaVersion: 1,
  transport: {
    volume: 100,
    panSeparation: 100,
    sampleRate: null,
    interpolation: 1,
    numVoices: 32,
    tempoFactor: 1,
  },
  mixer: { mode: 'libxmp', layout: 'panned', amigaFilter: 'a500', amplify: 1 },
  sid: { model: 0, videoStandard: null, quality: 'light', stereo: 0, volume: 255 },
  playback: { repeat: 'off', shuffle: false, autoAdvance: true, jamMode: false },
  view: {
    theme: 'dark',
    artwork: false,
    patternView: false,
    follow: true,
    stripDots: false,
    reducedMotion: false,
    visualizer: 'off',
    showChannelStrip: true,
  },
};

export const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : min;

export function normaliseSettings(input: Partial<AndroidSettings>): AndroidSettings {
  const d = DEFAULT_SETTINGS;
  return {
    schemaVersion: 1,
    transport: {
      volume: clamp(input.transport?.volume ?? d.transport.volume, 0, 100),
      panSeparation: clamp(input.transport?.panSeparation ?? d.transport.panSeparation, 0, 100),
      sampleRate: input.transport?.sampleRate ?? d.transport.sampleRate,
      interpolation: (input.transport?.interpolation ?? d.transport.interpolation) as 0 | 1 | 2,
      numVoices: clamp(input.transport?.numVoices ?? d.transport.numVoices, 4, 64),
      tempoFactor: Math.min(
        4,
        Math.max(0.25, input.transport?.tempoFactor ?? d.transport.tempoFactor),
      ),
    },
    mixer: { ...d.mixer, ...input.mixer },
    sid: {
      ...d.sid,
      ...input.sid,
      volume: clamp(input.sid?.volume ?? d.sid.volume, 0, 255),
    },
    playback: { ...d.playback, ...input.playback },
    view: { ...d.view, ...input.view },
  };
}
