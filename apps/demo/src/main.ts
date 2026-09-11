// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// modplayjs demo — load + play/pause/stop, file info, instrument/sample lists,
// and a realtime pattern view with the active row highlighted.
// File input (MOD/S3M/XM/IT) → loadModule → softmixer → out-webaudio.
// Pause freezes the render loop + suspends the AudioContext; player state
// (order/row/voices) is preserved and Play/Resume continues from the same spot.

import { CorePlayer, StateError } from '@modplayjs/core';
import workletUrl from './worklet-url';
import { plugin as modPlugin } from '@modplayjs/fmt-mod';
import { plugin as s3mPlugin } from '@modplayjs/fmt-s3m';
import { plugin as xmPlugin } from '@modplayjs/fmt-xm';
import { plugin as itPlugin } from '@modplayjs/fmt-it';
import { createPaulaPlugin } from '@modplayjs/dsp-paula';
import { createSoftMixerPlugin } from '@modplayjs/dsp-softmixer';
import { WebAudioOutput } from '@modplayjs/out-webaudio';
import './style.css';

const fileInput = document.getElementById('file') as HTMLInputElement;
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

const core = new CorePlayer();
core.registries.registerFormat(modPlugin);
core.registries.registerFormat(s3mPlugin);
core.registries.registerFormat(xmPlugin);
core.registries.registerFormat(itPlugin);
core.registries.registerDsp(createPaulaPlugin());
core.registries.registerDsp(createSoftMixerPlugin());

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

panSep.addEventListener('input', () => {
  const v = Number(panSep.value);
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

// Seek: drag updates the label live; release jumps. Seeking repositions
// the player (ord + row); the pattern view snaps on the next frame().
let seeking = false;
let seekTarget = 0;
const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

function moduleDuration(): number {
  const mod = core.module;
  if (!mod) return 0;
  let total = 0;
  for (const seq of mod.sequences) total += seq.duration;
  return total;
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
  // Locate the order + row for the target time. ordInfo[].time is the
  // absolute replay time at the START of each order, so the ord is the
  // last one whose start ≤ target, and the row is the remaining offset
  // scaled by that order's row duration.
  const mod = core.module;
  let ord = 0;
  let row = 0;
  if (mod) {
    for (let o = mod.len - 1; o >= 0; o--) {
      const t = core.ordInfo?.[o]?.time ?? 0;
      if (targetMs >= t) {
        ord = o;
        const rows = mod.patterns[mod.xxo[o] ?? 0]?.rows ?? 64;
        const ordDur = (core.ordInfo?.[o + 1]?.time ?? dur) - t;
        row = ordDur > 0
          ? Math.min(rows - 1, Math.floor(((targetMs - t) / ordDur) * rows))
          : 0;
        break;
      }
    }
  }
  core.setPosition(ord, row);
  // Latch: the reposition lands on the audio thread's next frame; until
  // playState catches up, frame() must not overwrite the slider.
  seekLatchUntil = performance.now() + 400;
  timeCur.textContent = fmtTime(targetMs);
  seeking = false;
  if (!playing && !paused && loaded) void startPlayback(false);
});

// end-of-track: reset the transport buttons (the output stops itself and
// fires onEnded after the final ring drains)
output.onEnded = () => {
  playing = false;
  paused = false;
  stopBtn.disabled = true;
  pauseBtn.disabled = true;
  pauseBtn.textContent = 'Pause';
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
  const rows: [string, string][] = [
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
    ['master vol', mod.mvol + ' / ' + mod.mvolbase],
  ];
  infoEl.textContent = '';
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5';
  for (const [label, value] of rows) {
    const l = document.createElement('span');
    l.className = 'opacity-60';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'font-medium truncate';
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

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (playing || paused) {
      output.stop();
      playing = false;
      paused = false;
    }
    core.loadModule(bytes);
    const mod = core.module;
    if (!mod) throw new StateError('module did not load');
    // A/B against XMPlay: everything through softmixer (libxmp-parity mixer).
    core.setDsp('softmixer');
    loaded = true;
    playBtn.disabled = false;
    playBtn.textContent = 'Play';
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    setAuditionButtons(false);
    seek.disabled = false;
    seek.value = '0';
    timeCur.textContent = '0:00';
    timeRem.textContent = '-' + fmtTime(moduleDuration());
    curPattern = -1;
    curRow = -1;
    renderInfo();
    renderOrders();
    renderInstruments();
    renderSamples();
    renderChannelStrip();
    buildPatternView(0);
    show(
      'loaded | format: ' + mod.format.toUpperCase() + ' | ' + core.dsp().name +
      ' | channels: ' + mod.chn + ' | patterns: ' + mod.pat +
      ' | tracker: ' + mod.tracker,
    );
  } catch (err) {
    loaded = false;
    playBtn.disabled = true;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    seek.disabled = true;
    const msg = err instanceof Error ? err.message : String(err);
    show(`unsupported or corrupt file: ${msg}`);
  }
});

/** Start (or restart) playback: device-rate match, smix reservation,
 * player start, and audio output. Shared by the Play button and the
 * instrument/sample audition buttons. With muteSong (audition
 * auto-start) all song channels are silenced so only the auditioned
 * instrument/sample sounds — jam mode. */
let jamMode = false;
async function startPlayback(muteSong: boolean): Promise<void> {
  const deviceRate = await output.deviceSampleRate();
  core.setSampleRate(deviceRate);
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
      timeCur.textContent = fmtTime(cur);
      timeRem.textContent = '-' + fmtTime(dur - cur);
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

