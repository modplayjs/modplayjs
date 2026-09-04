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
const panSepV = document.getElementById('pansepv') as HTMLSpanElement;
const status = document.getElementById('status') as HTMLPreElement;
const infoEl = document.getElementById('info') as HTMLPreElement;
const msgEl = document.getElementById('message') as HTMLPreElement;
const msgSection = document.getElementById('messagesection') as HTMLElement;
const ordEl = document.getElementById('ordlist') as HTMLDivElement;
const insEl = document.getElementById('inslist') as HTMLDivElement;
const smpEl = document.getElementById('samplist') as HTMLDivElement;
const patBody = document.getElementById('patbody') as HTMLDivElement;
const patHead = document.getElementById('pathead') as HTMLDivElement;
const patNumEl = document.getElementById('patnum') as HTMLSpanElement;
const chanStrip = document.getElementById('chanstrip') as HTMLDivElement;

const core = new CorePlayer();
core.registries.registerFormat(modPlugin);
core.registries.registerFormat(s3mPlugin);
core.registries.registerFormat(xmPlugin);
core.registries.registerFormat(itPlugin);
core.registries.registerDsp(createPaulaPlugin());
core.registries.registerDsp(createSoftMixerPlugin());

const output = new WebAudioOutput();

panSep.addEventListener('input', () => {
  const v = Number(panSep.value);
  core.setPanSeparation(v);
  panSepV.textContent = String(v);
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
  const l: string[] = [];
  l.push('title       ' + (mod.title || '(untitled)'));
  l.push('format      ' + mod.format.toUpperCase() + '   tracker: ' + mod.tracker);
  l.push(
    'speed/bpm   ' + mod.speed + ' / ' + mod.bpm +
    '   channels: ' + mod.chn + '   orders: ' + mod.len,
  );
  l.push(
    'patterns    ' + mod.pat + '   instruments: ' + mod.ins +
    '   samples: ' + core.samples.size,
  );
  l.push(
    'restart     ' + mod.restart + '   global vol: ' + mod.gvol + '/' + mod.gvolbase +
    '   master: ' + mod.mvol + '/' + mod.mvolbase,
  );
  infoEl.textContent = l.join('\n');

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
    btn.disabled = !playing;
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
    btn.disabled = !playing;
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

  let head = '<span class="cell cell-row"></span>';
  for (let c = 0; c < viewTracks; c++) {
    head += '<span class="cell marker">C' + fmtPad(c + 1, 2) + '</span>';
  }
  patHead.innerHTML = head;

  patBody.innerHTML = '';
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
  patBody.appendChild(frag);
  curRow = -1;
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
    if (followChk.checked) keepInView(patBody, el);
  }
  // Keep the current order entry visible in the order list panel.
  if (followChk.checked) {
    const cur = ordEl.querySelector('.cur');
    if (cur) keepInView(ordEl, cur as HTMLElement, true);
  }
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

function frame(): void {
  if (loaded && (playing || paused)) {
    updatePatternHighlight();
    const ps = core.playState;
    if (playing && !paused) {
      show(
        'playing | ord ' + ps.ord + ' row ' + ps.row + ' | ' +
        ps.speed + '/' + ps.bpm + ' | rate: ' + output.audioContextSampleRate + ' Hz',
      );
    } else if (paused) {
      show('paused | ord ' + ps.ord + ' row ' + ps.row);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
