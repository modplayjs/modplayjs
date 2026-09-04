// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// modplayjs studio — in-browser tracker module creator.
// Builds ModuleData in memory, plays through loadModuleData + the same
// core/audio stack as the player page, with a per-note-part inspector.

import { CorePlayer, StateError, type ModuleData, type Event, type RawSample } from '@modplayjs/core';
import { plugin as itPlugin } from '@modplayjs/fmt-it';
import { createSoftMixerPlugin } from '@modplayjs/dsp-softmixer';
import { WebAudioOutput } from '@modplayjs/out-webaudio';
import './style.css';
import workletUrl from './worklet-url';



// -- core + audio (same stack as the player) --------------------------------

const core = new CorePlayer();
core.registries.registerFormat(itPlugin);
core.registries.registerDsp(createSoftMixerPlugin());
const output = new WebAudioOutput();

// -- element refs -----------------------------------------------------------

const stitle = document.getElementById('stitle') as HTMLInputElement;
const schn = document.getElementById('schn') as HTMLInputElement;
const sspeed = document.getElementById('sspeed') as HTMLInputElement;
const sbpm = document.getElementById('sbpm') as HTMLInputElement;
const screate = document.getElementById('screate') as HTMLButtonElement;
const splay = document.getElementById('splay') as HTMLButtonElement;
const sstop = document.getElementById('sstop') as HTMLButtonElement;
const sstatus = document.getElementById('sstatus') as HTMLPreElement;
const orderList = document.getElementById('orderlist') as HTMLDivElement;
const ordAdd = document.getElementById('ordadd') as HTMLButtonElement;
const ordDel = document.getElementById('orddel') as HTMLButtonElement;
const insPane = document.getElementById('inspane') as HTMLDivElement;
const genWave = document.getElementById('genwave') as HTMLSelectElement;
const genFreq = document.getElementById('genfreq') as HTMLInputElement;
const genMs = document.getElementById('genms') as HTMLInputElement;
const genLoop = document.getElementById('genloop') as HTMLInputElement;
const genPrev = document.getElementById('genprev') as HTMLButtonElement;
const genAdd = document.getElementById('genadd') as HTMLButtonElement;
const genNext = document.getElementById('gennext') as HTMLButtonElement;
const patNum = document.getElementById('patnum') as HTMLSpanElement;
const patHead = document.getElementById('pathead') as HTMLDivElement;
const patRows = document.getElementById('patrows') as HTMLDivElement;
const patBody = document.getElementById('patbody') as HTMLDivElement;
void patBody;
const prowIns = document.getElementById('prowins') as HTMLButtonElement;
const prowDel = document.getElementById('prowdel') as HTMLButtonElement;
const paClear = document.getElementById('paclear') as HTMLButtonElement;
const cellInfo = document.getElementById('cellinfo') as HTMLSpanElement;
const inspBody = document.getElementById('inspbody') as HTMLDivElement;
const buildHashEl = document.getElementById('buildhash') as HTMLSpanElement;
buildHashEl.textContent = __GIT_HASH__;
const fmt2 = (v: number): string => String(v).padStart(2, '0');

// -- studio state -----------------------------------------------------------

let module: ModuleData | null = null;
let playing = false;
let curPattern = 0;      // pattern index being edited
let selRow = -1;         // selected row
let selChn = -1;         // selected channel
let selPart = 0;         // 0 note, 1 ins, 2 vol, 3 fx
const rowEls: HTMLDivElement[] = [];

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
void NOTE_NAMES;
const EMPTY: Event = { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };

const show = (msg: string): void => { sstatus.textContent = msg; };

// -- module creation --------------------------------------------------------

function createEmptyModule(chn: number): ModuleData {
  const patterns = [{
    rows: 64,
    tracks: Array.from({ length: chn }, () => ({
      rows: 64,
      event: Array.from({ length: 64 }, () => ({ ...EMPTY })),
    })),
  }];
  return {
    title: stitle.value || 'untitled',
    format: 'it',
    tracker: 'modplayjs studio',
    comment: '',
    chn,
    pat: 1,
    ins: 1,
    len: 1,
    restart: 0,
    xxo: [0],
    channels: Array.from({ length: chn }, () => ({ pan: 0x80, vol: 0x40, flg: 0 })),
    patterns,
    instruments: [emptyInstrument('inst 1')],
    samples: [],
    num_sequences: 0,
    sequences: [],
    speed: Number(sspeed.value) || 6,
    bpm: Number(sbpm.value) || 125,
    volbase: 64,
    gvolbase: 128,
    gvol: 128,
    quirks: 0,
    flowMode: 0,
    readEventType: 3, // IT
    periodType: 1,    // linear
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate: 8363,
  };
}

function emptyEnvelope() {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}

function emptyInstrument(name: string) {
  return {
    name,
    volume: 0x40,
    nsm: 0,
    rls: 0,
    map: Array(121).fill(0),
    mapXpo: Array(121).fill(0),
    sub: [],
    aei: emptyEnvelope(),
    pei: emptyEnvelope(),
    fei: emptyEnvelope(),
    vwf: 0, vde: 0, vra: 0, vsw: 0,
    dca: 0, dct: 0, nna: 0,
  };
}

// -- sample generator -------------------------------------------------------

function generateSample(): RawSample {
  const wave = genWave.value;
  const freq = Math.max(20, Math.min(8000, Number(genFreq.value) || 440));
  const ms = Math.max(20, Math.min(4000, Number(genMs.value) || 500));
  const rate = 22050; // 8-bit source rate for audition
  const len = Math.floor((rate * ms) / 1000);
  const data = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const t = (i * freq) / rate;
    const ph = t - Math.floor(t);
    let v: number;
    switch (wave) {
      case 'square': v = ph < 0.5 ? 1 : -1; break;
      case 'saw': v = 2 * ph - 1; break;
      case 'triangle': v = 4 * Math.abs(ph - 0.5) - 1; break;
      case 'noise': v = Math.random() * 2 - 1; break;
      default: v = Math.sin(2 * Math.PI * ph);
    }
    // fade tail 10ms to avoid clicks
    const tailStart = len - rate / 100;
    const env = i >= tailStart ? (len - i) / (rate / 100) : 1;
    data[i] = 128 + Math.max(-1, Math.min(1, v * env)) * 100;
  }
  const loop = genLoop.checked;
  return {
    name: `${wave} ${freq}Hz`,
    data,
    length: len,
    loopStart: 0,
    loopEnd: loop ? len : 0,
    sustainStart: 0,
    sustainEnd: 0,
    finetune: 0,
    volume: 64,
    flags: loop ? 1 | 2 : 1, // LOOP | (BIDIR off) — LOOP bit only
    c5spd: 22050,
  };
}

// -- playback ---------------------------------------------------------------

async function startPlayback(): Promise<void> {
  if (!module) return;
  const deviceRate = await output.deviceSampleRate();
  core.setSampleRate(deviceRate);
  core.startSmix(4);
  core.startPlayer();
  await output.start(core, workletUrl);
  playing = true;
  splay.textContent = 'pause';
  sstop.disabled = false;
  enableEditor(true);
}

function togglePlay(): void {
  if (!module) return;
  if (!playing) {
    void startPlayback().catch((err) => {
      const msg = err instanceof StateError || err instanceof Error ? err.message : String(err);
      show(`play failed: ${msg}`);
    });
  } else {
    output.pause();
    playing = false;
    splay.textContent = 'resume';
  }
}

function stopPlayback(): void {
  output.stop();
  playing = false;
  splay.textContent = 'play';
  sstop.disabled = true;
  enableEditor(false);
}

// -- pattern editor ---------------------------------------------------------

const cellAt = (r: number, c: number): Event =>
  module!.patterns[curPattern]!.tracks[c]?.event[r] ?? EMPTY;

function renderPattern(): void {
  if (!module) return;
  const pat = module.patterns[curPattern]!;
  patNum.textContent = `#${curPattern}`;
  patHead.style.setProperty('--cols', String(module.chn));
  patRows.style.setProperty('--cols', String(module.chn));

  let head = '<span class="cell cell-row"></span>';
  for (let c = 0; c < module.chn; c++) {
    head += `<span class="cell marker">C${c + 1}</span>`;
  }
  patHead.innerHTML = head;

  patRows.innerHTML = '';
  rowEls.length = 0;
  const frag = document.createDocumentFragment();
  for (let r = 0; r < pat.rows; r++) {
    const row = document.createElement('div');
    row.className = 'prow';
    let html = '<span class="cell cell-row">' + String(r).padStart(3, '0') + '</span>';
    for (let c = 0; c < module.chn; c++) {
      const e = cellAt(r, c);
      const sel = selRow === r && selChn === c;
      const cls = sel ? 'cell selcell' : 'cell';
      const note = e.note > 0 && e.note < 129 ? (NOTE_NAMES[(e.note - 1) % 12] ?? '..') + Math.floor((e.note - 1) / 12) : '...';
      const ins = e.ins ? fmt2(e.ins) : '..';
      const vol = e.vol ? fmt2(Math.min(e.vol, 99)) : '..';
      const fxc = e.fxt || e.fxp ? (e.fxt < 32 ? '0123456789ABCDEFHIJKLMNOPQRSTUVWXWZ'[e.fxt] : '?') + e.fxp.toString(16).toUpperCase().padStart(2, '0') : '...';
      html +=
        `<span class="${cls} cell-note">${note}</span>` +
        `<span class="${cls} cell-ins">${ins}</span>` +
        `<span class="${cls} cell-vol">${vol}</span>` +
        `<span class="${cls} cell-fx">${fxc}</span>`;
    }
    row.innerHTML = html;
    // click target per track: attach dataset and one listener per row
    row.dataset.row = String(r);
    row.addEventListener('click', (ev) => {
      const cell = (ev.target as HTMLElement).closest('.cell');
      if (!cell) return;
      const cells = Array.from(row.children);
      const idx = cells.indexOf(cell as Element);
      if (idx <= 0) return; // gutter
      selRow = r;
      selChn = idx - 1;
      selPart = (idx - 1) % 4;
      renderPattern();
      renderInspector();
    });
    frag.appendChild(row);
    rowEls.push(row);
  }
  patRows.appendChild(frag);
  if (selRow >= pat.rows) selRow = -1;
}

function renderOrder(): void {
  if (!module) return;
  orderList.textContent = '';
  for (let i = 0; i < module.len; i++) {
    const b = document.createElement('button');
    b.className = 'badge cursor-pointer ' + (i === curPattern ? 'badge-primary' : 'badge-ghost');
    b.textContent = `${i}:${module.xxo[i]}`;
    b.addEventListener('click', () => {
      curPattern = i;
      selRow = selChn = -1;
      renderPattern();
      renderOrder();
    });
    orderList.appendChild(b);
  }
  ordAdd.disabled = module.len >= 256;
  ordDel.disabled = module.len <= 1;
}

function renderInsPane(): void {
  if (!module) return;
  insPane.textContent = '';
  for (let i = 0; i < module.ins; i++) {
    const ins = module.instruments[i]!;
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';
    const n = document.createElement('span');
    n.textContent = `${fmt2(i + 1)} ${ins.name} (${ins.nsm} sample${ins.nsm === 1 ? '' : 's'})`;
    row.appendChild(n);
    insPane.appendChild(row);
  }
  genAdd.disabled = !playing;
  genNext.disabled = !playing || module.samples.length === 0;
}

function renderInspector(): void {
  if (selRow < 0 || selChn < 0 || !module) {
    inspBody.textContent = 'select a cell in the pattern editor';
    cellInfo.textContent = '';
    return;
  }
  const e = cellAt(selRow, selChn);
  const partName = ['note', 'instrument', 'volume', 'effect'][selPart]!;
  cellInfo.textContent = `row ${selRow} · chn ${selChn + 1} · editing: ${partName}`;
  inspBody.textContent = JSON.stringify(e);
  // Phase 4 replaces this placeholder with per-part editors.
}

function enableEditor(on: boolean): void {
  prowIns.disabled = !on;
  prowDel.disabled = !on;
  paClear.disabled = !on;
  setAuditionButtons(on);
}

function setAuditionButtons(disabled: boolean): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#inspane button')) {
    b.disabled = disabled;
  }
  genPrev.disabled = disabled || !module || module.samples.length === 0;
}

// -- events -----------------------------------------------------------------

screate.addEventListener('click', () => {
  try {
    module = createEmptyModule(Math.max(2, Math.min(32, Number(schn.value) || 4)));
    curPattern = 0;
    selRow = selChn = -1;
    core.loadModuleData(module);
    core.setDsp('softmixer');
    core.setSampleRate(44100);
    renderPattern();
    renderOrder();
    renderInsPane();
    renderInspector();
    splay.disabled = false;
    show('module created — press play, then edit rows (edits apply live)');
  } catch (err) {
    show('create failed: ' + (err instanceof Error ? err.message : String(err)));
  }
});

splay.addEventListener('click', () => togglePlay());
sstop.addEventListener('click', () => stopPlayback());

ordAdd.addEventListener('click', () => {
  if (!module) return;
  module.xxo.push(module.pat - 1);
  module.len++;
  renderOrder();
});
ordDel.addEventListener('click', () => {
  if (!module || module.len <= 1) return;
  module.xxo.pop();
  module.len--;
  if (curPattern >= module.len) curPattern = module.len - 1;
  renderOrder();
  renderPattern();
});

// Phase 3: structural row ops + full editor keys land with tracker input.
prowIns.addEventListener('click', () => { /* Phase 3 */ });
prowDel.addEventListener('click', () => { /* Phase 3 */ });
paClear.addEventListener('click', () => { /* Phase 3 */ });

genPrev.addEventListener('click', () => {
  // preview the generated wave without attaching: quick synthesis into a
  // temp module sample is Phase 5; for now just report
  show('preview: attach the sample first (Phase 5 wires preview)');
});
genAdd.addEventListener('click', () => {
  // Phase 5: generateSample() → attach to instrument
});
void generateSample;
genNext.addEventListener('click', () => { /* Phase 5 */ });

// -- live pattern refresh while playing (edits apply live) ------------------

function frame(): void {
  if (module && playing) {
    const ps = core.playState;
    if (ps.ord !== curPattern) {
      curPattern = ps.ord;
      renderPattern();
      renderOrder();
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
