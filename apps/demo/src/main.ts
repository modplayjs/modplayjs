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
const insEl = document.getElementById('inslist') as HTMLPreElement;
const smpEl = document.getElementById('samplist') as HTMLPreElement;
const patBody = document.getElementById('patbody') as HTMLDivElement;
const patHead = document.getElementById('pathead') as HTMLDivElement;
const patNumEl = document.getElementById('patnum') as HTMLSpanElement;

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
  const l: string[] = [];
  for (let i = 0; i < mod.instruments.length; i++) {
    const name = displayName(mod.instruments[i]?.name ?? '');
    // blank lines preserved: the name string is used verbatim inside <pre>
    l.push(fmtPad(i + 1, 2) + ' ' + (name || ' '));
  }
  insEl.textContent = l.join('\n');
}

function renderSamples(): void {
  const mod = core.module;
  if (!mod) return;
  const l: string[] = [];
  for (let id = 0; id < core.samples.size; id++) {
    const s = core.samples.get(id);
    const name = displayName(s.name || ' ');
    const loop = s.loopEnd > s.loopStart ? ' L' : '  ';
    const len = fmtPad(s.length, 6);
    l.push(fmtPad(id + 1, 2) + ' ' + len + loop + ' ' + name);
  }
  smpEl.textContent = l.join('\n');
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
    if (followChk.checked) {
      // Keep the active row visible: only scroll when it leaves the view
      // (block:'nearest'), so manual scrolling isn't fought every frame.
      el.scrollIntoView({ block: 'nearest' });
    }
  }
  // Keep the current order entry visible in the order list panel.
  if (followChk.checked) {
    const cur = ordEl.querySelector('.cur');
    if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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

    curPattern = -1;
    curRow = -1;
    renderInfo();
    renderOrders();
    renderInstruments();
    renderSamples();
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

playBtn.addEventListener('click', async () => {
  if (!loaded) return;
  if (paused) {
    // resume in place — the player state is intact
    await output.resume();
    paused = false;
    pauseBtn.textContent = 'Pause';
    show('resumed');
    return;
  }
  if (playing) return;
  try {
    const deviceRate = await output.deviceSampleRate();
    core.setSampleRate(deviceRate);
    core.startPlayer();
    await output.start(core, workletUrl); // click handler = user gesture
    playing = true;
    paused = false;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    show(
      'playing | DSP: ' + core.dsp().name + ' | ' +
      output.transportMode + ' | rate: ' +
      output.audioContextSampleRate + ' Hz',
    );
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
});

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
