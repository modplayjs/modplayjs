// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// modplayjs demo — load + play/pause/stop, file info, instrument/sample lists,
// and a realtime pattern view with the active row highlighted.
// File input (MOD/S3M/XM/IT) → loadModule → softmixer → out-webaudio.
// Pause freezes the render loop + suspends the AudioContext; player state
// (order/row/voices) is preserved and Play/Resume continues from the same spot.

import { CorePlayer, StateError, type Core } from '@modplayjs/core';
import workletUrl from './worklet-url';
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
import { plugin as medPlugin, mmd3Plugin, med2Plugin, med3Plugin, med4Plugin } from '@modplayjs/fmt-med';
import { plugin as stPlugin } from '@modplayjs/fmt-st';
import { plugin as mo3Plugin } from '@modplayjs/fmt-mo3';
import { plugin as sidPlugin, sidDsp, sidStartTune, applySidSettingsLive, loadSidSongLengths, isSidSongLengthDbLoaded, getSidChipCount, sidSeek, getSidPlayTimeSeconds, type SidSettings } from '@modplayjs/fmt-sid';
import { plugin as fcPlugin, fcEffect, setModEventReader } from '@modplayjs/fmt-fc';
import { createStreamedSource, detectStreamedFormat, type StreamedSource, type StreamedFormat } from '@modplayjs/stream-audio';
import { pwPlugin } from '@modplayjs/fmt-prowizard';
import { createPaulaPlugin } from '@modplayjs/dsp-paula';
import { createSoftMixerPlugin, type SoftMixer } from '@modplayjs/dsp-softmixer';
import { WebAudioOutput } from '@modplayjs/out-webaudio';
import { PlaylistStore, type PlaylistTrack } from './playlist-store';
import { registerPwa } from './pwa';
import './style.css';

const fileInput = document.getElementById('file') as HTMLInputElement;
const fileBtn = document.getElementById('filebtn') as HTMLButtonElement;
const fullscreenBtn = document.getElementById('fullscreen') as HTMLButtonElement;
const fsEnterIcon = document.getElementById('fs-enter-icon') as unknown as SVGElement;
const fsExitIcon = document.getElementById('fs-exit-icon') as unknown as SVGElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const pauseBtn = document.getElementById('pause') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const followChk = document.getElementById('follow') as HTMLInputElement;
const stripDotsChk = document.getElementById('stripdots') as HTMLInputElement;
const panSep = document.getElementById('pansep') as HTMLInputElement;
const status = document.getElementById('status') as HTMLPreElement;
const panSepV = document.getElementById('pansepv') as HTMLSpanElement;
const seek = document.getElementById('seek') as HTMLInputElement;
const timeCur = document.getElementById('timecur') as HTMLSpanElement;
const timeRem = document.getElementById('timerem') as HTMLSpanElement;
const volume = document.getElementById('volume') as HTMLInputElement;
const volumeV = document.getElementById('volumev') as HTMLSpanElement;
const infoEl = document.getElementById('info') as HTMLElement;
const msgEl = document.getElementById('message') as HTMLPreElement;
const msgSection = document.getElementById('messagesection') as HTMLElement;
// SID settings panel (visible only when a .sid is loaded)
const sidSection = document.getElementById('sidsection') as HTMLElement;
const sidModelSel = document.getElementById('sid-model') as HTMLSelectElement;
const sidVideoSel = document.getElementById('sid-video') as HTMLSelectElement;
const sidQualitySel = document.getElementById('sid-quality') as HTMLSelectElement;
const sidStereoSel = document.getElementById('sid-stereo') as HTMLSelectElement;
const sidVolRange = document.getElementById('sid-vol') as HTMLInputElement;
// Mixer settings panel (visible for tracker modules)
const mixerSection = document.getElementById('mixersection') as HTMLElement;
const mixerModeSel = document.getElementById('mixer-mode') as HTMLSelectElement;
const mixerLayoutSel = document.getElementById('mixer-layout') as HTMLSelectElement;
const mixerFilterSel = document.getElementById('mixer-amigafilter') as HTMLSelectElement;
const ordEl = document.getElementById('ordlist') as HTMLDivElement;
const insEl = document.getElementById('inslist') as HTMLDivElement;
const smpEl = document.getElementById('samplist') as HTMLDivElement;
const patBody = document.getElementById('patbody') as HTMLDivElement;
const patRows = document.getElementById('patrows') as HTMLDivElement;
const patHead = document.getElementById('pathead') as HTMLDivElement;
const patNumEl = document.getElementById('patnum') as HTMLSpanElement;
const chanStrip = document.getElementById('chanstrip') as HTMLDivElement;
const themeMode = document.getElementById('thememode') as HTMLInputElement;
const buildHashEl = document.getElementById('buildhash') as HTMLSpanElement;
const patternViewChk = document.getElementById('patternview') as HTMLInputElement;
const patternCol = document.getElementById('patterncol') as HTMLElement;
const appGrid = document.getElementById('appgrid') as HTMLElement;
const plList = document.getElementById('pllist') as HTMLDivElement;
const plEmpty = document.getElementById('plempty') as HTMLDivElement;
const plSize = document.getElementById('plsize') as HTMLSpanElement;
const plClear = document.getElementById('plclear') as HTMLButtonElement;
const plCard = document.getElementById('playlistcard') as HTMLElement;

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
const mixerInstance = createSoftMixerPlugin() as SoftMixer;
core.registries.registerDsp(mixerInstance);
core.registries.registerDsp(sidDsp);

buildHashEl.textContent = __GIT_HASH__;

const output = new WebAudioOutput();

// light/dark theme: persisted, applied to <html data-theme>.
const THEME_KEY = 'modplayjs-theme';
const applyTheme = (dark: boolean): void => {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
};
themeMode.addEventListener('change', () => {
  applyTheme(themeMode.checked);
  localStorage.setItem(THEME_KEY, themeMode.checked ? 'dark' : 'light');
});
// restore persisted theme before first paint of the pattern view
{
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light') {
    themeMode.checked = false;
    applyTheme(false);
  } else {
    applyTheme(true);
  }
}

// pattern view: OFF by default. Hidden column + collapsed 2-col grid;
// the frame() loop skips pattern work entirely while disabled.
// NOTE: runs during module eval — must not touch load-state (`loaded`,
// declared further down) or it would throw TDZ and kill every listener.
const PATVIEW_KEY = 'modplayjs-patternview';
function applyPatternView(on: boolean): void {
  patternCol.hidden = !on;
  appGrid.classList.toggle('lg:grid-cols-2', !on);
  appGrid.classList.toggle('lg:grid-cols-[1fr_2fr_1fr]', on);
}
patternViewChk.addEventListener('change', () => {
  localStorage.setItem(PATVIEW_KEY, patternViewChk.checked ? '1' : '0');
  applyPatternView(patternViewChk.checked);
});
{
  const savedPat = localStorage.getItem(PATVIEW_KEY);
  if (savedPat === '1') {
    patternViewChk.checked = true;
    applyPatternView(true);
  }
}

panSep.addEventListener('input', () => {
  const v = Number(panSep.value);
  // libxmp XMP_PLAYER_MIX contract (control.c:445-449): -100..100 percent
  // of the pan offset, DEFAULT_MIX = 100 (common.h:144) = full normal
  // separation. The old ×2 mapping made everything ≥ 50 clamp identically
  // (finalpan offsets beyond ±128 hit the 0/255 clamp) — "50 sounded like
  // 100". 1:1 mapping with default 100 = libxmp parity.
  core.setPanSeparation(v);
  panSepV.textContent = String(v);
});

volume.addEventListener('input', () => {
  const v = Number(volume.value);
  core.setVolume(v);
  volumeV.textContent = String(v);
});
core.setVolume(Number(volume.value));
volumeV.textContent = volume.value;
// default pan 100 = DEFAULT_MIX (libxmp parity, full normal separation) —
// applied up front, not just on the first input event
core.setPanSeparation(Number(panSep.value));
panSepV.textContent = panSep.value;

// Seek: drag updates the label live; release jumps. Seeking repositions
// the player (ord + row); the pattern view snaps on the next frame().
let seeking = false;
let seekTarget = 0;
const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

function moduleDuration(): number {
  if (streamed) return streamed.duration;
  const mod = core.module;
  if (!mod) return 0;
  if (mod.endless) return 0; // endless engine (SID): no declared length
  let total = 0;
  for (const seq of mod.sequences) total += seq.duration;
  return total;
}

/** Info panel for streamed-audio tracks (no module data). */
function renderInfoStreamed(src: StreamedSource, fmt: StreamedFormat): void {
  const current = playlist.tracks.find((t) => t.id === currentTrackId);
  const rows: [string, string][] = [
    ['file', current?.name ?? '—'],
    ['title', current?.name?.replace(/\.[^.]+$/, '') ?? ''],
    ['format', fmt.toUpperCase() + ' (streamed)'],
    ['channels', String(src.channels)],
    ['sample rate', src.sampleRate + ' Hz'],
    ['duration', fmtTime(src.duration)],
  ];
  infoEl.textContent = '';
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5';
  for (const [label, value] of rows) {
    const l = document.createElement('span');
    l.className = 'opacity-60';
    l.textContent = label;
    const v = document.createElement('span');
    v.textContent = value;
    grid.append(l, v);
  }
  infoEl.append(grid);
}

seek.addEventListener('input', () => {
  seeking = true;
  const pct = Number(seek.value);
  seekTarget = (pct / 1000) * moduleDuration();
  seek.style.setProperty('--fill', (pct / 10).toFixed(1) + '%');
  timeCur.textContent = fmtTime(seekTarget);
});

seek.addEventListener('change', () => {
  const dur = moduleDuration();
  const targetMs = (Number(seek.value) / 1000) * dur;
  // Seek the engine: core.seekTime is xmp_seek_time + the play-through
  // refinement (control.c:242-341) — coarse order pick from the scan
  // times, then frames are played (and discarded) until current_time
  // crosses the target, so mid-order tempo changes land correctly.
  // SID: seek the ENGINE (fast-forward through the machine emulation —
  // backwards seeks restart the tune). The stub module has no meaningful
  // ord/row mapping.
  if (core.module?.format === 'sid') {
    sidSeek(targetMs / 1000);
  } else {
    core.seekTime(targetMs);
  }
  seekLatchUntil = performance.now() + 400;
  timeCur.textContent = fmtTime(targetMs);
  seeking = false;
  if (!playing && !paused && loaded) void startPlayback(false);
});

// end-of-track: reset the transport buttons (the output stops itself and
// fires onEnded after the final ring drains); advance the playlist.
output.onEnded = () => {
  playing = false;
  paused = false;
  stopBtn.disabled = true;
  pauseBtn.disabled = true;
  pauseBtn.textContent = 'Pause';
  // auto-advance: play the next entry (wraps around). A programmatic
  // stop() cancels the pending drain timer in out-webaudio, so this only
  // fires on a genuine natural end.
  const next = nextTrack();
  if (next && !jamMode) {
    void playTrack(next);
    return;
  }
  setPwaAudioBusy(false);
  show('end of track');
};

let loaded = false;
let playing = false;
let paused = false;

// pattern view state
let viewRows = 0;
let viewTracks = 0;
let curPattern = -1;
let curRow = -1;
const rowEls: HTMLDivElement[] = [];
// Pattern row pitch in px: --row-h 1.35em × 0.78rem font ≈ 17px (style.css).
const ROW_PX = 17;

const NOTE_NAMES = [
  'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-',
];
function noteStr(note: number): string {
  if (note <= 0 || note > 120) return '...';
  const n = note - 1;
  return NOTE_NAMES[n % 12] + String(Math.floor(n / 12));
}
function fxStr(fxt: number, fxp: number): string {
  if (!fxt && !fxp) return '...';
  const letters = '0123456789ABCDEFHIJKLMNOPQRSTUVWXWZ';
  const c = fxt < letters.length ? letters[fxt] : '?';
  return c + fxp.toString(16).padStart(2, '0').toUpperCase();
}

function show(msg: string): void {
  status.textContent = msg;
}

if (typeof window !== 'undefined' && !window.isSecureContext) {
  show(
    'WARNING: this page is not in a secure context (HTTPS or localhost). ' +
      'AudioWorklet is unavailable — open via http://localhost:<port> instead.',
  );
}

// ---------------------------------------------------------------- file info --

function fmtPad(n: number, w: number): string {
  return String(n).padStart(w, ' ');
}

function renderInfo(): void {
  const mod = core.module;
  if (!mod) return;
  // One info per row: a two-column grid of label → value.
  const current = playlist.tracks.find((t) => t.id === currentTrackId);
  const rows: [string, string][] = [
    ['file', current?.name ?? '—'],
    ['title', mod.title || '(untitled)'],
    ['format', mod.format.toUpperCase()],
    ['tracker', mod.tracker],
    ['speed', String(mod.speed)],
    ['bpm', String(mod.bpm)],
    ['channels', String(mod.chn)],
    ['orders', String(mod.len)],
    ['patterns', String(mod.pat)],
    ['instruments', String(mod.ins)],
    ['samples', String(core.samples.size)],
    ['restart', String(mod.restart)],
    ['global vol', mod.gvol + ' / ' + mod.gvolbase],
    ...(mod.mvol !== undefined
      ? [['master vol', mod.mvol + ' / ' + mod.mvolbase] as [string, string]]
      : []),
  ];
  infoEl.textContent = '';
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5';
  for (const [label, value] of rows) {
    const l = document.createElement('span');
    l.className = 'opacity-60';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'font-medium break-all';
    v.textContent = value;
    v.title = value;
    grid.appendChild(l);
    grid.appendChild(v);
  }
  infoEl.appendChild(grid);

  // The tracker message (IT "message:", XM/Modplug comments) gets its own
  // box — it can be long and deserves independent scrolling.
  if (mod.comment && mod.comment.trim()) {
    msgSection.hidden = false;
    msgEl.textContent = mod.comment.replace(/\r/g, '');
  } else {
    msgSection.hidden = true;
    msgEl.textContent = '';
  }
}

function renderOrders(): void {
  const mod = core.module;
  if (!mod) return;
  const parts: string[] = [];
  for (let i = 0; i < mod.len; i++) {
    parts.push(
      '<span class="' + (i === curPattern ? 'cur' : '') + '">' +
      fmtPad(i, 2) + ':' + fmtPad(mod.xxo[i] ?? 0, 2) + '</span>',
    );
  }
  ordEl.innerHTML = parts.join(' ');
}

function renderInstruments(): void {
  const mod = core.module;
  if (!mod) return;
  insEl.textContent = '';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < mod.instruments.length; i++) {
    const name = displayName(mod.instruments[i]?.name ?? '');
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 font-mono text-xs leading-6';
    const btn = document.createElement('button');
    btn.className = 'btn btn-xs btn-ghost btn-circle';
    btn.textContent = '▶';
    btn.title = 'audition instrument ' + (i + 1);
    btn.setAttribute('aria-label', 'play instrument ' + (i + 1));
    btn.disabled = !loaded;
    btn.addEventListener('click', async () => {
      if (paused) {
        await output.resume();
        paused = false;
        pauseBtn.textContent = 'Pause';
      } else if (!playing) {
        await startPlayback(true);
      }
      core.playNote(i, 60, 64);
    });
    const label = document.createElement('span');
    label.textContent = fmtPad(i + 1, 2) + ' ' + (name || ' ');
    row.append(btn, label);
    frag.appendChild(row);
  }
  insEl.appendChild(frag);
}

function renderSamples(): void {
  const mod = core.module;
  if (!mod) return;
  smpEl.textContent = '';
  const frag = document.createDocumentFragment();
  for (let id = 0; id < core.samples.size; id++) {
    const s = core.samples.get(id);
    const name = displayName(s.name || ' ');
    const loop = s.loopEnd > s.loopStart ? ' L' : '  ';
    const len = fmtPad(s.length, 6);
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 font-mono text-xs leading-6';
    const btn = document.createElement('button');
    btn.className = 'btn btn-xs btn-ghost btn-circle';
    btn.textContent = '▶';
    btn.title = 'audition sample ' + (id + 1);
    btn.setAttribute('aria-label', 'play sample ' + (id + 1));
    // Map sample → an instrument that owns it (sub.sid == sample index);
    // the note is the first mapped key (C-4 == map row 48) so the right
    // sub-instrument plays.
    let mappedIns = -1;
    let mappedNote = 60;
    for (let j = 0; j < mod.instruments.length && mappedIns < 0; j++) {
      const ins = mod.instruments[j]!;
      for (let k = 0; k < ins.nsm; k++) {
        if (ins.sub[k]?.sid === id) {
          mappedIns = j;
          const keyRow = ins.map.indexOf(k);
          mappedNote = keyRow >= 0 ? keyRow : 60;
          break;
        }
      }
    }
    btn.disabled = !loaded || mappedIns < 0;
    btn.addEventListener('click', async () => {
      if (mappedIns < 0) return;
      if (paused) {
        await output.resume();
        paused = false;
        pauseBtn.textContent = 'Pause';
      } else if (!playing) {
        await startPlayback(true);
      }
      core.playNote(mappedIns, mappedNote, 64);
    });
    if (mappedIns < 0) btn.disabled = true;
    const label = document.createElement('span');
    label.textContent = fmtPad(id + 1, 2) + ' ' + len + loop + ' ' + (name || ' ');
    row.append(btn, label);
    frag.appendChild(row);
  }
  smpEl.appendChild(frag);
}

function renderChannelStrip(): void {
  const mod = core.module;
  if (!mod) return;
  const strip = chanStrip;
  strip.textContent = '';
  for (let c = 0; c < mod.chn; c++) {
    const b = document.createElement('button');
    const muted = core.getChannelMute(c);
    b.className = 'badge cursor-pointer select-none ' +
      (muted ? 'badge-error badge-outline' : 'badge-ghost');
    b.textContent = 'C' + (c + 1);
    b.title = muted ? 'unmute channel ' + (c + 1) : 'mute channel ' + (c + 1);
    b.setAttribute('aria-pressed', String(muted));
    b.setAttribute('aria-label', 'channel ' + (c + 1) + (muted ? ' muted' : ''));
    b.addEventListener('click', () => {
      core.setChannelMute(c, !core.getChannelMute(c));
      renderChannelStrip();
    });
    strip.appendChild(b);
  }
}

/** Trackers pad names with trailing dots ('....'); the toggle hides them. */
function displayName(name: string): string {
  return stripDotsChk.checked ? name.replace(/\.+$/, '') : name;
}

stripDotsChk.addEventListener('change', () => {
  if (!loaded) return;
  renderInstruments();
  renderSamples();
});

function buildPatternView(patternIdx: number): void {
  const mod = core.module;
  if (!mod) return;
  const pi = mod.xxo[patternIdx] ?? patternIdx;
  const pat = mod.patterns[pi];
  if (!pat) return;

  viewRows = pat.rows;
  viewTracks = mod.chn;

  patNumEl.textContent = '#' + patternIdx + ' (pattern ' + pi + ')';
  // 4 cells per track (note/ins/vol/fx) — consumed by the CSS grid template.
  patHead.style.setProperty('--cols', String(viewTracks));
  patBody.style.setProperty('--cols', String(viewTracks));
  patRows.style.setProperty('--cols', String(viewTracks));

  let head = '<span class="cell cell-row"></span>';
  for (let c = 0; c < viewTracks; c++) {
    head += '<span class="cell marker">C' + fmtPad(c + 1, 2) + '</span>';
  }
  patHead.innerHTML = head;

  patRows.innerHTML = '';
  rowEls.length = 0;
  const frag = document.createDocumentFragment();
  for (let r = 0; r < viewRows; r++) {
    const row = document.createElement('div');
    row.className = 'prow';
    row.dataset.row = String(r);
    let html = '<span class="cell cell-row">' + fmtPad(r, 3) + '</span>';
    for (let c = 0; c < viewTracks; c++) {
      const e = pat.tracks[c]?.event?.[r];
      const note = e && e.note ? noteStr(e.note) : '...';
      const ins = e && e.ins ? fmtPad(e.ins, 2) : '..';
      const vol = e && e.vol ? fmtPad(Math.min(e.vol, 99), 2) : '..';
      const fxc = e && (e.fxt || e.fxp) ? fxStr(e.fxt, e.fxp) : '...';
      html +=
        '<span class="cell cell-note">' + note + '</span>' +
        '<span class="cell cell-ins">' + ins + '</span>' +
        '<span class="cell cell-vol">' + vol + '</span>' +
        '<span class="cell cell-fx">' + fxc + '</span>';
    }
    row.innerHTML = html;
    frag.appendChild(row);
    rowEls.push(row);
  }
  patRows.appendChild(frag);
  curRow = -1;
  // Anchor the scroll immediately after the rebuild: the active row lands
  // ~1/3 from the top so the upcoming rows stay visible. Without this the
  // container starts at scrollTop 0 and visually 'chases' the row down
  // one keepInView step at a time.
  patBody.scrollTop = 0;
}

function updatePatternHighlight(): void {
  if (!patternViewChk.checked) return; // pattern view disabled: skip all pattern work
  const ps = core.playState;
  const ord = ps.ord;
  const row = ps.row;

  if (ord !== curPattern) {
    curPattern = ord;
    buildPatternView(ord);
    renderOrders();
  }
  if (row !== curRow && row < rowEls.length) {
    if (curRow >= 0 && curRow < rowEls.length) rowEls[curRow]!.classList.remove('active');
    curRow = row;
    const el = rowEls[curRow]!;
    el.classList.add('active');
    if (followChk.checked) {
      glideScrollTo(
        Math.max(0, Math.min(
          (curRow + 0.5) * ROW_PX - patBody.clientHeight / 2,
          patBody.scrollHeight - patBody.clientHeight,
        )),
      );
    }
  }
  // Keep the current order entry visible in the order list panel.
  if (followChk.checked) {
    const cur = ordEl.querySelector('.cur');
    if (cur) keepInView(ordEl, cur as HTMLElement, true);
  }
}

/** Scroll glide state: rAF-interpolated approach to the centered anchor.
 * Native smooth scrollTo() restarts its easing on every row advance,
 * which reads as a twitch; interpolating the residual distance each
 * frame instead gives one continuous glide that never overshoots. */
let glideRaf = 0;
function glideScrollTo(target: number): void {
  cancelAnimationFrame(glideRaf);
  const step = (): void => {
    const residual = target - patBody.scrollTop;
    if (Math.abs(residual) <= 0.5) {
      patBody.scrollTop = target;
      glideRaf = 0;
      return;
    }
    // Exponential approach: 35% of the remaining distance per frame.
    patBody.scrollTop += residual * 0.35;
    glideRaf = requestAnimationFrame(step);
  };
  glideRaf = requestAnimationFrame(step);
}


/** Scroll `el` into view INSIDE `container` only — never the page.
 * scrollIntoView() scrolls every scrollable ancestor, which yanked the
 * whole page to the pattern card each row and made Stop unreachable. */
function keepInView(container: HTMLElement, el: HTMLElement, horizontal = false): void {
  const c = container.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  if (e.top < c.top) {
    container.scrollTop -= c.top - e.top;
  } else if (e.bottom > c.bottom) {
    container.scrollTop += e.bottom - c.bottom;
  }
  if (horizontal) {
    if (e.left < c.left) {
      container.scrollLeft -= c.left - e.left;
    } else if (e.right > c.right) {
      container.scrollLeft += e.right - c.right;
    }
  }
}

// ------------------------------------------------------------------ events --

// the styled 'add files' button opens the hidden multi-file input
fileBtn.addEventListener('click', () => fileInput.click());

// fullscreen toggle: hidden in the installed PWA (already fullscreen via
// manifest display), shown in the plain browser
function updateFullscreenUi(): void {
  const isStandalone =
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true; // iOS
  fullscreenBtn.classList.toggle('hidden', isStandalone);
  const active = !!document.fullscreenElement;
  fsEnterIcon.classList.toggle('hidden', active);
  fsExitIcon.classList.toggle('hidden', !active);
}
fullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => {});
});
document.addEventListener('fullscreenchange', updateFullscreenUi);
window.matchMedia('(display-mode: standalone)').addEventListener('change', updateFullscreenUi);
window.matchMedia('(display-mode: fullscreen)').addEventListener('change', updateFullscreenUi);
updateFullscreenUi();

fileInput.addEventListener('change', async () => {
  const files = [...(fileInput.files ?? [])];
  fileInput.value = '';
  await addFiles(files);
});

/** Add files to the playlist (dedupe in the store), report skips. The
 * first entry ever added is auto-selected: loaded into the player and
 * ready for Play — but never auto-started. */
async function addFiles(files: File[]): Promise<void> {
  if (files.length === 0) return;
  const skipped = await playlist.add(files);
  renderPlaylist();
  if (currentTrackId === null && playlist.tracks.length > 0) {
    await selectTrack(playlist.tracks[0]!);
  }
  if (skipped > 0) showThrottled(`playlist: added ${files.length - skipped}, skipped ${skipped} duplicate(s)`);
  else showThrottled(`playlist: +${files.length}`);
}

// Streamed-audio state (WAV/MP3/OGG): decoded source + pull shim.
let streamed: StreamedSource | null = null;
// Raw bytes of the currently-loaded .sid (engine is started at play time).
let sidBytes: Uint8Array | null = null;
// HVSC Songlengths.md5 loader (lazy, once) — gives SID tunes their runtime.
let sidLengthsPromise: Promise<boolean> | null = null;
async function ensureSidLengths(): Promise<boolean> {
  if (isSidSongLengthDbLoaded()) return true;
  if (!sidLengthsPromise) {
    sidLengthsPromise = fetch('./Songlengths.md5')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => {
        loadSidSongLengths(t);
        return true;
      })
      .catch(() => {
        console.warn('Songlengths.md5 not available — SID runtimes unknown');
        return false;
      });
  }
  return sidLengthsPromise;
}
// Format of the currently loaded streamed track (WAV/MP3/OGG).
const streamedFormat2: { v: StreamedFormat | null } = { v: null };

/** Load a module from a playlist entry (or raw file) into the player.
 *  Files the tracker plugins don't recognize fall back to streamed
 *  audio (WAV/MP3/OGG) via @modplayjs/stream-audio. */
async function loadTrack(file: Blob): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (playing || paused) {
    output.stop();
    playing = false;
    paused = false;
  }
  const fmt2 = detectStreamedFormat(bytes, file instanceof File ? file.name : undefined);
  if (fmt2) {
    const src = createStreamedSource(bytes, fmt2, 48000);
    if (src) {
      streamed = src;
      streamedFormat2.v = fmt2;
      loaded = true;
      playBtn.disabled = false;
      playBtn.textContent = 'Play';
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
      setAuditionButtons(false);
      seek.disabled = false;
      seek.value = '0';
      timeCur.textContent = '0:00';
      timeRem.textContent = '-' + fmtTime(streamed.duration);
      curPattern = -1;
      curRow = -1;
      renderInfoStreamed(src, fmt2);
      show('loaded | format: ' + fmt2.toUpperCase() + ' (streamed) | ' +
        src.channels + 'ch | ' + src.sampleRate + ' Hz | ' + fmtTime(src.duration));
      return;
    }
  }
  // Load the HVSC Songlengths database BEFORE the loader runs — the .sid
  // loader consults it while building the module (tune duration).
  await ensureSidLengths();
  core.loadModule(bytes);
  const mod = core.module;
  if (!mod) throw new StateError('module did not load');
  // A/B against XMPlay: everything through softmixer (libxmp-parity mixer).
  // SID (.sid) drives its own sample-paced engine via the 'sid' DSP.
  if (mod.format === 'sid') {
    sidBytes = bytes;
    core.setDsp('sid');
    sidSection.hidden = false;
    // chip count is computed during engine init — enable the channel-mode
    // select only for multi-SID tunes (1-SID always plays mono)
    updateSidChannelUi();
  } else {
    sidBytes = null;
    sidSection.hidden = true;
    core.setDsp('softmixer');
    // mixer settings panel: the Paula engine + the A500 filter only make
    // sense for 4-channel Amiga MODs (the C A500 mixers are mono 8-bit
    // only; on other formats those voices skip, leaving silence). Keep
    // the selects enabled only there; the layout select is always valid.
    const isMod = mod.format === 'mod' && mod.chn === 4;
    mixerSection.hidden = !(mod.format === 'mod' || mod.format === 's3m' || mod.format === 'xm' || mod.format === 'it');
    mixerModeSel.disabled = !isMod;
    mixerFilterSel.disabled = !isMod;
    if (!isMod) {
      mixerModeSel.value = 'libxmp';
      mixerFilterSel.value = 'a500';
      applyMixerOptions();
    }
  }
  loaded = true;
  playBtn.disabled = false;
  playBtn.textContent = 'Play';
  pauseBtn.disabled = true;
  stopBtn.disabled = true;
  setAuditionButtons(false);
  seek.disabled = !!core.module?.endless; // endless engines (SID): no seek bar
  seek.value = '0';
  timeCur.textContent = '0:00';
  timeRem.textContent = core.module?.endless ? '∞' : '-' + fmtTime(moduleDuration());
  curPattern = -1;
  curRow = -1;
  renderInfo();
  renderOrders();
  renderInstruments();
  renderSamples();
  renderChannelStrip();
  // pattern view is user-visible: rebuild for the freshly loaded module
  if (patternViewChk.checked) buildPatternView(0);
  show(
    'loaded | format: ' + mod.format.toUpperCase() + ' | ' + core.dsp().name +
    ' | channels: ' + mod.chn + ' | patterns: ' + mod.pat +
    ' | tracker: ' + mod.tracker,
  );
}

// ----------------------------------------------------- SID settings panel --

/** Re-init the engine (model/video changes) and resume at the same play
 *  state: sidStartTune re-runs initSIDtune which restarts the tune. */
async function reinitSidEngine(): Promise<void> {
  if (!sidBytes) return;
  updateSidChannelUi();
  const wasPlaying = playing;
  if (playing || paused) output.stop();
  playing = false;
  paused = false;
  core.setSampleRate(await output.deviceSampleRate());
  if (wasPlaying || paused) {
    await startPlayback(false);
  } else {
    sidStartTune(sidBytes, await output.deviceSampleRate(), 1);
  }
}

function readSidSettings(): SidSettings {
  const q = sidQualitySel.value;
  const hq = q !== 'light';
  return {
    volume: Number(sidVolRange.value),
    highQualitySID: hq,
    highQualityResampler: q === 'sinc',
    stereo: Number(sidStereoSel.value) as 0 | 1 | 3,
    model: Number(sidModelSel.value) as 0 | 6581 | 8580,
    videoStandard: sidVideoSel.value === '' ? undefined : (Number(sidVideoSel.value) as 0 | 1),
  };
}

function updateSidChannelUi(): void {
  const multi = getSidChipCount() > 1;
  sidStereoSel.disabled = !multi;
  sidStereoSel.title = multi
    ? 'Channel mode for multi-SID tunes'
    : 'This tune uses a single SID chip — mono/stereo routing does not apply';
}

sidVolRange.addEventListener('input', () => {
  applySidSettingsLive(readSidSettings());
});
sidQualitySel.addEventListener('change', () => applySidSettingsLive(readSidSettings()));
sidStereoSel.addEventListener('change', () => applySidSettingsLive(readSidSettings()));
sidModelSel.addEventListener('change', () => void reinitSidEngine());
sidVideoSel.addEventListener('change', () => void reinitSidEngine());

// -- mixer settings: reconfigure the softmixer DSP in place. The mode
// switch only makes sense while stopped (voices carry Paula state), so a
// mode change restarts the tune through the same path as SID re-init.
const applyMixerOptions = (): void => {
  if (core.module?.format === 'sid') return;
  mixerInstance.configure({
    mode: mixerModeSel.value as 'libxmp' | 'paula',
    layout: mixerLayoutSel.value as 'panned' | 'lrlr' | 'lrrl',
    amigaFilter: mixerFilterSel.value as 'a500' | 'a500led',
  });
  // The lrlr/lrrl layouts hard-assign pan for chn < 4: the pan-separation
  // slider has no effect on those channels (it only modulates the module
  // pans, which the layout overrides). Disable the slider so it doesn't
  // look like it's doing something.
  panSep.disabled = mixerLayoutSel.value !== 'panned';
  panSepV.textContent = panSep.disabled ? 'fixed' : panSep.value;
};
mixerLayoutSel.addEventListener('change', () => applyMixerOptions());
mixerFilterSel.addEventListener('change', () => applyMixerOptions());
mixerModeSel.addEventListener('change', async () => {
  applyMixerOptions();
  // a mode switch swaps resamplers per voice — restart the tune for a
  // clean voice state (the DSP identity 'softmixer' is unchanged).
  if (loaded && (playing || paused)) {
    const pct = Number(seek.value);
    output.stop();
    playing = false;
    paused = false;
    await startPlayback(false);
    if (moduleDuration() > 0) {
      const targetMs = (pct / 1000) * moduleDuration();
      if (core.module?.format === 'sid') sidSeek(targetMs / 1000);
      else core.seekTime(targetMs);
    }
  }
});

// --------------------------------------------------------------- playlist --

const playlist = new PlaylistStore();

function fmtBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KiB';
  return (n / (1024 * 1024)).toFixed(1) + ' MiB';
}

function renderPlaylist(): void {
  plList.querySelectorAll('[data-track]').forEach((el) => el.remove());
  plEmpty.hidden = playlist.tracks.length > 0;
  let total = 0;
  const frag = document.createDocumentFragment();
  for (const t of playlist.tracks) {
    total += t.size;
    const row = document.createElement('div');
    row.dataset.track = String(t.id);
    row.className = 'flex items-center gap-2 rounded px-1.5 py-1 text-[0.72rem] cursor-pointer hover:bg-base-200 ' +
      (currentTrackId === t.id ? 'bg-primary/15 outline outline-1 outline-primary/40' : '');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(currentTrackId === t.id));
    row.title = t.name + ' — click to play';

    const fmt = document.createElement('span');
    fmt.className = 'badge badge-ghost badge-xs font-mono shrink-0 uppercase';
    fmt.textContent = t.format;
    const name = document.createElement('span');
    name.className = 'truncate grow min-w-0';
    name.textContent = t.name;
    const size = document.createElement('span');
    size.className = 'opacity-50 font-mono shrink-0';
    size.textContent = fmtBytes(t.size);
    const del = document.createElement('button');
    del.className = 'btn btn-ghost btn-xs px-1 shrink-0 opacity-60 hover:opacity-100';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'remove ' + t.name);
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      void playlist.remove(t.id).then(renderPlaylist);
    });

    row.append(fmt, name, size, del);
    row.addEventListener('click', () => {
      const t2 = t;
      // playing (or paused mid-track) → switch to it and keep going;
      // idle → just prepare, user presses Play
      if (playing || paused) void playTrack(t2);
      else void selectTrack(t2);
    });
    frag.appendChild(row);
  }
  plList.appendChild(frag);
  plSize.textContent =
    playlist.tracks.length > 0
      ? `${playlist.tracks.length} · ${fmtBytes(total)}` + (playlist.ephemeral ? ' · session' : '')
      : '';
  plClear.disabled = playlist.tracks.length === 0;
  // the file-information 'file' row shows the current selection
  if (loaded) renderInfo();
}

/** Currently loaded playlist entry (highlight + auto-advance). */
let currentTrackId: number | null = null;

/** Prepare a track: load into the player, mark it selected, do NOT start.
 * The Play button (or a selection while playing) starts audio. */
async function selectTrack(t: PlaylistTrack): Promise<void> {
  try {
    await loadTrack(t.blob);
    currentTrackId = t.id;
    renderPlaylist();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    show(`load failed: ${msg}`);
  }
}

/** Switch to a track and autoplay — used when the player is already
 * running (row click while playing, playlist auto-advance). */
async function playTrack(t: PlaylistTrack): Promise<void> {
  try {
    await loadTrack(t.blob);
    currentTrackId = t.id;
    renderPlaylist();
    await startPlayback(false);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    show(`play failed: ${msg}`);
  }
}

function nextTrack(): PlaylistTrack | null {
  const list = playlist.tracks;
  if (list.length === 0) return null;
  const idx = list.findIndex((t) => t.id === currentTrackId);
  // wrap around: end of list restarts from the top
  return list[(idx + 1) % list.length] ?? null;
}

// file picker & drag-and-drop both feed the playlist
plCard.addEventListener('dragover', (e) => {
  e.preventDefault();
  plCard.classList.add('border-primary');
});
plCard.addEventListener('dragleave', () => {
  plCard.classList.remove('border-primary');
});
plCard.addEventListener('drop', (e) => {
  e.preventDefault();
  plCard.classList.remove('border-primary');
  const files = [...e.dataTransfer?.files ?? []];
  if (files.length > 0) void addFiles(files);
});

plClear.addEventListener('click', () => {
  void playlist.clear().then(() => {
    currentTrackId = null;
    renderPlaylist();
  });
});

// init: restore persisted playlist before first render; prime the player
// with the first entry (marked + ready, no autoplay)
void playlist.init().then(async () => {
  renderPlaylist();
  if (playlist.tracks.length > 0) await selectTrack(playlist.tracks[0]!);
});

/** Start (or restart) playback: device-rate match, smix reservation,
 * player start, and audio output. Shared by the Play button and the
 * instrument/sample audition buttons. With muteSong (audition
 * auto-start) all song channels are silenced so only the auditioned
 * instrument/sample sounds — jam mode. */
let jamMode = false;

// PWA auto-update: suppress the page reload while audio is live; the
// 'modplayjs:playing' event tells the SW-registration module when it is
// safe to reload (no transport running).
registerPwa();
function setPwaAudioBusy(busy: boolean): void {
  document.dispatchEvent(new CustomEvent('modplayjs:playing', { detail: busy }));
}

async function startPlayback(muteSong: boolean): Promise<void> {
  const deviceRate = await output.deviceSampleRate();
  if (streamed) {
    // Streamed-audio path: the source shim exposes playBuffer() with the
    // same pull semantics as Core, so out-webaudio drives it unchanged.
    const src = streamed;
    const shim = {
      playBuffer(out: Float32Array, size: number, loop?: number): number {
        return src.playBuffer(out, size, loop);
      },
    };
    core.setSampleRate(deviceRate);
    await output.start(shim as unknown as Core, workletUrl);
    playing = true;
    paused = false;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    setPwaAudioBusy(true);
    show('playing | streamed | rate: ' + output.audioContextSampleRate + ' Hz');
    return;
  }
  core.setSampleRate(deviceRate);
  // SID: start the cRSID engine for this tune at the device rate before the
  // player spins (the 'sid' DSP pulls samples from it inside renderFrame).
  if (sidBytes && core.module?.format === 'sid') sidStartTune(sidBytes, deviceRate, 1);
  core.startSmix(4); // reserve channels for instrument/sample audition
  core.startPlayer();
  // startPlayer resets master_vol to 100 (parity with C's
  // xmp_start_player) — re-apply the user's slider values so volume and
  // pan survive a load/replay.
  core.setVolume(Number(volume.value));
  core.setPanSeparation(Number(panSep.value));
  await output.start(core, workletUrl); // click handler = user gesture
  jamMode = muteSong;
  const mod = core.module;
  if (mod) {
    for (let chn = 0; chn < mod.chn; chn++) {
      core.setChannelVol(chn, muteSong ? 0 : 100);
    }
  }
  playing = true;
  paused = false;
  pauseBtn.disabled = false;
  stopBtn.disabled = false;
  setPwaAudioBusy(true);
  show(
    (muteSong ? 'jam (song muted) | ' : 'playing | ') +
    'DSP: ' + core.dsp().name + ' | ' +
    output.transportMode + ' | rate: ' +
    output.audioContextSampleRate + ' Hz',
  );
}

playBtn.addEventListener('click', async () => {
  if (!loaded) return;
  if (paused) {
    // resume in place — the player state is intact
    await output.resume();
    paused = false;
    pauseBtn.textContent = 'Pause';
    // Leaving jam mode: restore song channel volumes.
    if (jamMode) {
      const mod = core.module;
      if (mod) for (let chn = 0; chn < mod.chn; chn++) core.setChannelVol(chn, 100);
      jamMode = false;
      show('playing');
    } else {
      show('resumed');
    }
    return;
  }
  if (playing) return;
  try {
    await startPlayback(false);
  } catch (err) {
    const msg = err instanceof StateError || err instanceof Error ? err.message : String(err);
    const secureHint =
      typeof window !== 'undefined' && !window.isSecureContext
        ? ' — serve the demo over HTTPS or http://localhost (AudioWorklet is unavailable on plain http://<ip>)'
        : '';
    show(`play failed: ${msg}${secureHint}`);
  }
});

pauseBtn.addEventListener('click', () => {
  if (!playing) return;
  if (!paused) {
    output.pause();
    paused = true;
    pauseBtn.textContent = 'Resume';
    show('paused | ord ' + core.playState.ord + ' row ' + core.playState.row);
  } else {
    void output.resume();
    paused = false;
    pauseBtn.textContent = 'Pause';
    show('playing');
  }
});

stopBtn.addEventListener('click', () => {
  if (!playing && !paused) return;
  output.stop();
  playing = false;
  paused = false;
  stopBtn.disabled = true;
  pauseBtn.disabled = true;
  playBtn.textContent = 'Play';
  pauseBtn.textContent = 'Pause';
  setPwaAudioBusy(false);
  show('stopped');
  jamMode = false;
});

function setAuditionButtons(disabled: boolean): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>(
    '#inslist button, #samplist button',
  )) {
    b.disabled = disabled;
  }
}

// ------------------------------------------------------- realtime pattern UI --

let lastStatus = '';
function showThrottled(msg: string): void {
  if (msg !== lastStatus) {
    lastStatus = msg;
    status.textContent = msg;
  }
}

let seekLatchUntil = 0;

function frame(): void {
  if (loaded && (playing || paused)) {
    updatePatternHighlight();
    const ps = core.playState;
    const dur = moduleDuration();
    const cur = seeking ? seekTarget : ps.timeMs;
    const latched = performance.now() < seekLatchUntil;
    if (!seeking && !latched) {
      if (dur > 0) {
        const pct = Math.min(1000, Math.round((cur / dur) * 1000));
        seek.value = String(pct);
        seek.style.setProperty('--fill', (pct / 10).toFixed(1) + '%');
      }
      const shown = core.module?.format === 'sid' ? getSidPlayTimeSeconds() * 1000 : cur;
      timeCur.textContent = fmtTime(shown);
      timeRem.textContent = dur > 0 ? '-' + fmtTime(Math.max(0, dur - shown)) : '∞';
    } else if (latched) {
      // Reposition pending: show the target while the audio thread catches up.
      timeCur.textContent = fmtTime(seekTarget);
      timeRem.textContent = '-' + fmtTime(dur - seekTarget);
    }
    if (playing && !paused) {
      showThrottled(
        'playing | ord ' + ps.ord + ' row ' + ps.row + ' | ' +
        ps.speed + '/' + ps.bpm + ' | rate: ' +
        output.audioContextSampleRate + ' Hz',
      );
    } else if (paused) {
      showThrottled('paused | ord ' + ps.ord + ' row ' + ps.row);
    }
  } else {
    showThrottled('');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

