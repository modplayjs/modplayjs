// ../../packages/out-android/src/types.ts
var SCHEMA_VERSION = 1;

// ../../packages/out-android/src/defaults.ts
var DEFAULT_SETTINGS = {
  schemaVersion: 1,
  transport: {
    volume: 100,
    panSeparation: 100,
    sampleRate: null,
    interpolation: 1,
    numVoices: 32,
    tempoFactor: 1
  },
  mixer: { mode: "libxmp", layout: "panned", amigaFilter: "a500", amplify: 1 },
  sid: { model: 0, videoStandard: null, quality: "light", stereo: 0, volume: 255 },
  playback: { repeat: "off", shuffle: false, autoAdvance: true, jamMode: false },
  view: {
    theme: "dark",
    artwork: false,
    patternView: false,
    follow: true,
    stripDots: false,
    reducedMotion: false,
    visualizer: "off",
    showChannelStrip: true
  }
};
var clamp = (v, min, max) => Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : min;
function normaliseSettings(input) {
  const d = DEFAULT_SETTINGS;
  return {
    schemaVersion: 1,
    transport: {
      volume: clamp(input.transport?.volume ?? d.transport.volume, 0, 100),
      panSeparation: clamp(input.transport?.panSeparation ?? d.transport.panSeparation, 0, 100),
      sampleRate: input.transport?.sampleRate ?? d.transport.sampleRate,
      interpolation: input.transport?.interpolation ?? d.transport.interpolation,
      numVoices: clamp(input.transport?.numVoices ?? d.transport.numVoices, 4, 64),
      tempoFactor: Math.min(
        4,
        Math.max(0.25, input.transport?.tempoFactor ?? d.transport.tempoFactor)
      )
    },
    mixer: { ...d.mixer, ...input.mixer },
    sid: {
      ...d.sid,
      ...input.sid,
      volume: clamp(input.sid?.volume ?? d.sid.volume, 0, 255)
    },
    playback: { ...d.playback, ...input.playback },
    view: { ...d.view, ...input.view }
  };
}

// ../../packages/out-android/src/parity.ts
var PARITY = {
  play: { command: "play", screen: "Player" },
  pause: { command: "pause", screen: "Player" },
  stop: { command: "stop", screen: "Player" },
  seek: { command: "seek", screen: "Player" },
  volume: { setting: "transport.volume", screen: "Player" },
  pansep: { setting: "transport.panSeparation", screen: "Settings/Audio" },
  follow: { setting: "view.follow", screen: "Settings/Appearance" },
  patternview: { setting: "view.patternView", screen: "Settings/Appearance" },
  stripdots: { setting: "view.stripDots", screen: "Settings/Appearance" },
  thememode: { setting: "view.theme", screen: "Settings/Appearance" },
  "mixer-mode": { setting: "mixer.mode", screen: "Settings/Module" },
  "mixer-layout": { setting: "mixer.layout", screen: "Settings/Module" },
  "mixer-amigafilter": { setting: "mixer.amigaFilter", screen: "Settings/Module" },
  "sid-model": { setting: "sid.model", screen: "Settings/SID" },
  "sid-video": { setting: "sid.videoStandard", screen: "Settings/SID" },
  "sid-quality": { setting: "sid.quality", screen: "Settings/SID" },
  "sid-stereo": { setting: "sid.stereo", screen: "Settings/SID" },
  "sid-vol": { setting: "sid.volume", screen: "Settings/SID" },
  plclear: { command: "clearPlaylist", screen: "Library" },
  file: { command: "addFiles", screen: "Library" },
  filebtn: { command: "addFiles", screen: "Library" },
  fullscreen: { command: "systemFullscreen", screen: "System" }
};
export {
  DEFAULT_SETTINGS,
  PARITY,
  SCHEMA_VERSION,
  clamp,
  normaliseSettings
};
