// SPDX-License-Identifier: BSD-3-Clause
// Android host contract. Serialisable only: this crosses JNI.
export const SCHEMA_VERSION = 1 as const;

export type RepeatMode = 'off' | 'all' | 'one';
export type TrackState = 'available' | 'missing';

export interface AndroidSettings {
  schemaVersion: 1;
  transport: {
    volume: number;
    panSeparation: number;
    sampleRate: number | null;
    interpolation: 0 | 1 | 2;
    numVoices: number;
    tempoFactor: number;
  };
  mixer: {
    mode: 'libxmp' | 'paula';
    layout: 'panned' | 'lrlr' | 'lrrl';
    amigaFilter: 'a500' | 'a500led';
    amplify: number;
  };
  sid: {
    model: 0 | 6581 | 8580;
    videoStandard: 0 | 1 | null;
    quality: 'light' | 'hq' | 'sinc';
    stereo: 0 | 1 | 3;
    volume: number;
  };
  playback: { repeat: RepeatMode; shuffle: boolean; autoAdvance: boolean; jamMode: boolean };
  view: {
    theme: 'dark' | 'light';
    artwork: boolean;
    patternView: boolean;
    follow: boolean;
    stripDots: boolean;
    reducedMotion: boolean;
    visualizer: 'off' | 'spectrum' | 'waveform' | 'both';
    showChannelStrip: boolean;
  };
}

export interface AndroidCapabilities {
  loaded: boolean;
  streamed: boolean;
  sid: boolean;
  endless: boolean;
  seekable: boolean;
  patternView: boolean;
  mixer: boolean;
  mixerMode: boolean;
  amigaFilter: boolean;
  panSeparation: boolean;
  sidPanel: boolean;
  sidStereo: boolean;
  audition: boolean;
  channelMute: boolean;
}

export interface AndroidChannel {
  index: number;
  label: string;
  muted: boolean;
  solo: boolean;
  volume: number;
  canMute: boolean;
}

export interface AndroidTrack {
  id: string;
  name: string;
  title: string;
  format: string;
  tracker: string;
  channels: number;
  orders: number;
  orderList: number[];
  patterns: number;
  instruments: number;
  instrumentList: { index: number; name: string; sampleId: number | null }[];
  samples: number;
  sampleList: { index: number; name: string; length: number; loop: boolean }[];
  restart: number;
  globalVolume: number;
  globalVolumeBase: number;
  masterVolume?: number;
  masterVolumeBase?: number;
  message?: string;
  durationMs: number;
  endless: boolean;
  streamed: { format: string; channels: number; sampleRate: number; durationMs: number } | null;
  artwork: { kind: 'none' | 'generated' | 'embedded'; uri?: string; palette?: string } | null;
}

export interface AndroidState {
  playing: boolean;
  paused: boolean;
  ended: boolean;
  seeking: boolean;
  positionMs: number;
  durationMs: number;
  durationKnown: boolean;
  ord: number;
  row: number;
  pattern: number;
  rowProgress: number;
  speed: number;
  bpm: number;
  loopCount: number;
  trackIndex: number;
  repeat: RepeatMode;
  shuffle: boolean;
}

export interface AndroidSnapshot {
  schemaVersion: 1;
  /**
   * Signature of what this engine build can play, e.g. the registered format
   * ids. The app rescans its library when it changes.
   */
  engineVersion: string;
  state: AndroidState;
  track: AndroidTrack | null;
  channels: AndroidChannel[];
  capabilities: AndroidCapabilities;
  settings: AndroidSettings;
  soloChannel: number | null;
}

export interface AndroidCommand {
  type:
    | 'play'
    | 'pause'
    | 'resume'
    | 'stop'
    | 'seek'
    | 'select'
    | 'next'
    | 'previous'
    | 'setVolume'
    | 'setPanSeparation'
    | 'setMixerMode'
    | 'setMixerLayout'
    | 'setAmigaFilter'
    | 'setAmplify'
    | 'setSidModel'
    | 'setSidVideo'
    | 'setSidQuality'
    | 'setSidStereo'
    | 'setSidVolume'
    | 'setInterpolation'
    | 'setNumVoices'
    | 'setSampleRate'
    | 'setTempoFactor'
    | 'toggleChannelMute'
    | 'setChannelMute'
    | 'soloChannel'
    | 'clearSolo'
    | 'muteAllChannels'
    | 'unmuteAllChannels'
    | 'resetChannels'
    | 'auditionInstrument'
    | 'auditionSample'
    | 'stopAudition'
    | 'setJamMode'
    | 'setRepeat'
    | 'setShuffle'
    | 'setAutoAdvance'
    | 'setTheme'
    | 'setArtwork'
    | 'setPatternView'
    | 'setFollow'
    | 'setStripDots'
    | 'setReducedMotion'
    | 'setVisualizer'
    | 'setShowChannelStrip'
    | 'loadSidSongLengths'
    | 'setSettings';
  [key: string]: unknown;
}
