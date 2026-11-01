// Every interactive control in apps/demo/index.html maps to a setting or command.
// Keep this list in sync; tests fail on unmapped web controls.
export type ParityTarget = { setting?: string; command?: string; screen: string };

export const PARITY: Record<string, ParityTarget> = {
  play: { command: 'play', screen: 'Player' },
  pause: { command: 'pause', screen: 'Player' },
  stop: { command: 'stop', screen: 'Player' },
  seek: { command: 'seek', screen: 'Player' },
  volume: { setting: 'transport.volume', screen: 'Player' },
  pansep: { setting: 'transport.panSeparation', screen: 'Settings/Audio' },
  follow: { setting: 'view.follow', screen: 'Settings/Appearance' },
  patternview: { setting: 'view.patternView', screen: 'Settings/Appearance' },
  stripdots: { setting: 'view.stripDots', screen: 'Settings/Appearance' },
  thememode: { setting: 'view.theme', screen: 'Settings/Appearance' },
  'mixer-mode': { setting: 'mixer.mode', screen: 'Settings/Module' },
  'mixer-layout': { setting: 'mixer.layout', screen: 'Settings/Module' },
  'mixer-amigafilter': { setting: 'mixer.amigaFilter', screen: 'Settings/Module' },
  'sid-model': { setting: 'sid.model', screen: 'Settings/SID' },
  'sid-video': { setting: 'sid.videoStandard', screen: 'Settings/SID' },
  'sid-quality': { setting: 'sid.quality', screen: 'Settings/SID' },
  'sid-stereo': { setting: 'sid.stereo', screen: 'Settings/SID' },
  'sid-vol': { setting: 'sid.volume', screen: 'Settings/SID' },
  plclear: { command: 'clearPlaylist', screen: 'Library' },
  file: { command: 'addFiles', screen: 'Library' },
  filebtn: { command: 'addFiles', screen: 'Library' },
  fullscreen: { command: 'systemFullscreen', screen: 'System' },
};
