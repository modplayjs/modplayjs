// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// modplayjs studio — in-browser tracker module creator.
// Builds ModuleData in memory, plays through loadModuleData + the same
// core/audio stack as the player page, with a per-note-part inspector.

import { CorePlayer, StateError, XMP_KEY_OFF, keyInstruments, type ModuleData, type Event, type RawSample, type SubInstrument } from '@modplayjs/core';
import { plugin as itPlugin } from '@modplayjs/fmt-it';
import { plugin as modPlugin } from '@modplayjs/fmt-mod';
import { plugin as xmPlugin } from '@modplayjs/fmt-xm';
import { plugin as s3mPlugin } from '@modplayjs/fmt-s3m';
import type { Instrument } from '@modplayjs/core';
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
const ssave = document.getElementById('ssave') as HTMLButtonElement;
const sload = document.getElementById('sload') as HTMLInputElement;
const importMod = document.getElementById('importmod') as HTMLInputElement;
const importDo = document.getElementById('importdo') as HTMLButtonElement;
const importInfo = document.getElementById('importinfo') as HTMLDivElement;
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

function emptyInstrument(name: string): Instrument {
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
      selChn = Math.floor((idx - 1) / 4);
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

/** The event being edited is applied straight into ModuleData. */
const undoStack: { pat: number; chn: number; row: number; ev: Event }[] = [];

function mutateSelected(mut: (e: Event) => void): void {
  if (selRow < 0 || selChn < 0 || !module) return;
  const tr = module.patterns[curPattern]!.tracks[selChn]!;
  const before = tr.event[selRow] ?? { ...EMPTY };
  undoStack.push({ pat: curPattern, chn: selChn, row: selRow, ev: { ...before } });
  if (undoStack.length > 200) undoStack.shift();
  const e = { ...before };
  mut(e);
  tr.event[selRow] = e;
  renderPattern();
  renderInspector();
}

function undo(): void {
  const last = undoStack.pop();
  if (!last || !module) return;
  const tr = module.patterns[last.pat]!.tracks[last.chn]!;
  tr.event[last.row] = last.ev;
  renderPattern();
  renderInspector();
}

const FX_NAMES: Record<number, string> = {
  0x1: 'portamento up', 0x2: 'portamento down', 0x3: 'tone portamento',
  0x4: 'vibrato', 0x5: 'tone porta + vol slide', 0x6: 'vibrato + vol slide',
  0x8: 'set pan', 0x9: 'sample offset', 0xa: 'volume slide',
  0xb: 'pattern jump', 0xc: 'set volume', 0xd: 'pattern break',
  0xe: 'extended (S-effect)', 0xf: 'set speed/tempo',
};

function renderInspector(): void {
  if (selRow < 0 || selChn < 0 || !module) {
    inspBody.textContent = 'select a cell in the pattern editor';
    cellInfo.textContent = '';
    return;
  }
  const e = cellAt(selRow, selChn);
  const partName = ['note', 'instrument', 'volume', 'effect'][selPart]!;
  cellInfo.textContent = `row ${selRow} · chn ${selChn + 1} · editing: ${partName}`;
  inspBody.textContent = '';

  // -- note part: octave picker
  const noteRow = document.createElement('div');
  noteRow.className = 'flex items-center gap-2 flex-wrap';
  const noteLabel = document.createElement('span');
  noteLabel.className = 'w-20 opacity-70';
  noteLabel.textContent = 'note';
  noteRow.appendChild(noteLabel);
  const cur = e.note > 0 && e.note < 129 ? e.note - 1 : -1;
  for (let oct = 2; oct <= 6; oct++) {
    const grp = document.createElement('span');
    grp.className = 'flex gap-0.5';
    for (let n = 0; n < 12; n++) {
      const key = document.createElement('button');
      const noteNum = oct * 12 + n;
      key.className = 'btn btn-xs h-6 min-h-6 px-1 ' +
        (cur === noteNum ? 'btn-primary' : 'btn-ghost');
      key.textContent = NOTE_NAMES[n]!.replace('-', '');
      key.addEventListener('click', () => {
        mutateSelected((ev) => { ev.note = noteNum + 1; if (!ev.ins) ev.ins = 1; });
        audition(0, noteNum);
      });
      grp.appendChild(key);
    }
    noteRow.appendChild(grp);
  }
  const offBtn = document.createElement('button');
  offBtn.className = 'btn btn-xs ' + (e.note === 0 ? 'btn-primary' : 'btn-ghost');
  offBtn.textContent = 'off';
  offBtn.addEventListener('click', () => mutateSelected((ev) => { ev.note = 0; }));
  noteRow.appendChild(offBtn);
  inspBody.appendChild(noteRow);

  // -- instrument part
  const insRow = document.createElement('div');
  insRow.className = 'flex items-center gap-2';
  const insLabel = document.createElement('span');
  insLabel.className = 'w-20 opacity-70';
  insLabel.textContent = 'instrument';
  insRow.appendChild(insLabel);
  const insSel = document.createElement('select');
  insSel.className = 'select select-bordered select-xs';
  for (let i = 0; i < module.ins; i++) {
    const opt = document.createElement('option');
    opt.value = String(i + 1);
    opt.textContent = fmt2(i + 1) + ' ' + (module.instruments[i]?.name ?? '');
    if (e.ins === i + 1) opt.selected = true;
    insSel.appendChild(opt);
  }
  insSel.addEventListener('change', () => {
    const v = Number(insSel.value);
    mutateSelected((ev) => { ev.ins = v; });
    audition(0, Math.max(0, cur));
  });
  insRow.appendChild(insSel);
  inspBody.appendChild(insRow);

  // -- volume part
  const volRow = document.createElement('div');
  volRow.className = 'flex items-center gap-2';
  const volLabel = document.createElement('span');
  volLabel.className = 'w-20 opacity-70';
  volLabel.textContent = 'volume';
  volRow.appendChild(volLabel);
  const volRange = document.createElement('input');
  volRange.type = 'range';
  volRange.min = '0'; volRange.max = '64';
  volRange.value = String(e.vol ? e.vol - 1 : 0);
  volRange.className = 'range range-xs grow';
  volRange.addEventListener('input', () => {
    const v = Number(volRange.value);
    mutateSelected((ev) => { ev.vol = v ? v + 1 : 0; });
  });
  volRow.appendChild(volRange);
  inspBody.appendChild(volRow);

  // -- effect part
  const fxRow = document.createElement('div');
  fxRow.className = 'flex items-center gap-2';
  const fxLabel = document.createElement('span');
  fxLabel.className = 'w-20 opacity-70';
  fxLabel.textContent = 'effect';
  fxRow.appendChild(fxLabel);
  const fxSel = document.createElement('select');
  fxSel.className = 'select select-bordered select-xs w-40';
  const none = document.createElement('option');
  none.value = '0'; none.textContent = '— none —';
  fxSel.appendChild(none);
  for (const [k, desc] of Object.entries(FX_NAMES)) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = (k === '14' ? 'S' : String.fromCharCode(64 + Number(k))) + ' — ' + desc;
    if (e.fxt === Number(k)) o.selected = true;
    fxSel.appendChild(o);
  }
  fxSel.addEventListener('change', () => {
    const v = Number(fxSel.value);
    mutateSelected((ev) => { ev.fxt = v; if (!v) ev.fxp = 0; });
  });
  fxRow.appendChild(fxSel);
  const fxParam = document.createElement('input');
  fxParam.className = 'input input-bordered input-xs w-16 font-mono';
  fxParam.placeholder = '00';
  fxParam.value = e.fxp ? e.fxp.toString(16).toUpperCase().padStart(2, '0') : '';
  fxParam.addEventListener('input', () => {
    const v = parseInt(fxParam.value, 16);
    if (Number.isNaN(v)) return;
    mutateSelected((ev) => { ev.fxp = Math.min(255, v); if (!ev.fxt) ev.fxt = 0x0f; });
  });
  fxRow.appendChild(fxParam);
  const fxDesc = document.createElement('span');
  fxDesc.className = 'text-xs opacity-60';
  fxDesc.textContent = e.fxt && FX_NAMES[e.fxt] ? FX_NAMES[e.fxt]! : '';
  fxRow.appendChild(fxDesc);
  inspBody.appendChild(fxRow);
}

/** Audition helper: inject a note on a smix channel (requires playing). */
function audition(ins: number, note: number): void {
  if (playing) core.playNote(ins, note, 64);
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

// live tempo/speed apply while playing
sspeed.addEventListener('input', () => {
  if (playing) core.setSpeed(Math.max(1, Math.min(31, Number(sspeed.value) || 6)));
});
sbpm.addEventListener('input', () => {
  if (playing) core.setTempo(Math.max(32, Math.min(255, Number(sbpm.value) || 125)));
});
stitle.addEventListener('input', () => {
  if (module) module.title = stitle.value;
});

ssave.addEventListener('click', () => {
  if (!module) return;
  const payload = {
    module,
    samples: module.samples.map((sm) => Array.from(sm.data)),
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (module.title || 'untitled') + '.modplayjs.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

sload.addEventListener('change', async () => {
  const f = sload.files?.[0];
  if (!f) return;
  try {
    const payload = JSON.parse(await f.text()) as {
      module: ModuleData; samples: number[][];
    };
    payload.module.samples = payload.samples.map((arr, i) => ({
      name: 'sample ' + (i + 1), data: new Uint8Array(arr),
      length: arr.length, loopStart: 0, loopEnd: 0,
      sustainStart: 0, sustainEnd: 0, finetune: 0, volume: 64,
      flags: 1, c5spd: 22050,
    }));
    module = payload.module;
    curPattern = 0; selRow = selChn = -1;
    core.loadModuleData(module);
    core.setDsp('softmixer');
    renderPattern(); renderOrder(); renderInsPane(); renderInspector();
    splay.disabled = false;
    ssave.disabled = false;
    show('project loaded: ' + module.title);
  } catch (err) {
    show('load failed: ' + (err instanceof Error ? err.message : String(err)));
  }
});

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
    ssave.disabled = false;
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
prowIns.addEventListener('click', () => {
  if (!module || selRow < 0) return;
  const pat = module.patterns[curPattern]!;
  for (const tr of pat.tracks) {
    tr.event.splice(selRow, 0, { ...EMPTY });
    tr.rows++;
    if (tr.event.length > tr.rows) tr.event.pop();
  }
  pat.rows++;
  renderPattern();
});
prowDel.addEventListener('click', () => {
  if (!module || selRow < 0 || module.patterns[curPattern]!.rows <= 1) return;
  const pat = module.patterns[curPattern]!;
  for (const tr of pat.tracks) {
    tr.event.splice(selRow, 1);
    tr.rows--;
  }
  pat.rows--;
  selRow = Math.min(selRow, pat.rows - 1);
  renderPattern();
  renderInspector();
});
paClear.addEventListener('click', () => {
  if (!module || selRow < 0) return;
  mutateSelected((ev) => {
    ev.note = 0; ev.ins = 0; ev.vol = 0; ev.fxt = 0; ev.fxp = 0; ev.f2t = 0; ev.f2p = 0;
  });
});

let importSrc: Uint8Array | null = null;
let importParsed: ModuleData | null = null;

importMod.addEventListener('change', async () => {
  const f = importMod.files?.[0];
  if (!f) return;
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const probe = new CorePlayer();
    probe.registries.registerFormat(itPlugin);
    probe.registries.registerFormat(modPlugin);
    probe.registries.registerFormat(xmPlugin);
    probe.registries.registerFormat(s3mPlugin);
    probe.loadModule(bytes);
    const parsed: ModuleData = probe.module!;
    importSrc = bytes;
    importDo.disabled = false;
    importInfo.textContent =
      `${parsed.title} [${parsed.format.toUpperCase()}] — ` +
      `${parsed.ins} instruments, ${parsed.samples.length} samples ready to import`;
  } catch (err) {
    importParsed = null;
    importDo.disabled = true;
    importInfo.textContent = 'could not parse: ' + (err instanceof Error ? err.message : String(err));
  }
});

importDo.addEventListener('click', () => {
  const src = importParsed;
  const srcBytes = importSrc;
  if (!module || !src || !srcBytes) return;
  // Parse fresh in a scratch core so its sample store holds exactly this
  // module's samples in order — we copy the decoded float data from there.
  const probe = new CorePlayer();
  probe.registries.registerFormat(itPlugin);
  probe.registries.registerFormat(modPlugin);
  probe.registries.registerFormat(xmPlugin);
  probe.registries.registerFormat(s3mPlugin);
  probe.loadModule(srcBytes);

  const base = module.samples.length;
  // 1. samples: copy RawSample entries (byte data preserved)
  for (const raw of src.samples) module.samples.push({ ...raw });
  // 2. register the byte data with the store so voices resolve by sid
  for (const raw of src.samples) core.samples.add(raw);
  // 3. instruments: deep-ish copy with remapped sids (base + sub.sid)
  for (let i = 0; i < src.ins; i++) {
    const s2 = src.instruments[i]!;
    const ins = emptyInstrument(`${module.ins + 1} ${s2.name || 'imported'}`);
    ins.volume = s2.volume;
    ins.nsm = s2.nsm;
    ins.rls = s2.rls;
    ins.map = [...s2.map];
    ins.mapXpo = [...s2.mapXpo];
    ins.sub = s2.sub.map((sub) => ({ ...sub, sid: base + sub.sid }));
    ins.aei = JSON.parse(JSON.stringify(s2.aei));
    ins.pei = JSON.parse(JSON.stringify(s2.pei));
    ins.fei = JSON.parse(JSON.stringify(s2.fei));
    module.instruments.push(ins);
    module.ins++;
  }
  keyInstruments(module.instruments);
  renderInsPane();
  importInfo.textContent = `imported ${src.ins} instruments / ${src.samples.length} samples`;
  importDo.disabled = true;
  importMod.value = '';
});

genPrev.addEventListener('click', () => {
  if (!module || !playing) {
    show('preview: press play first (audition needs the engine running)');
    return;
  }
  const raw = generateSample();
  module.samples.push(raw);
  const id = core.samples.add(raw);
  // find or create an instrument that owns it, then audition
  let insIdx = -1;
  for (let j = 0; j < module.ins; j++) {
    const ins = module.instruments[j]!;
    if (ins.nsm > 0 && ins.sub.some((sub) => sub.sid === id)) { insIdx = j; break; }
  }
  if (insIdx < 0) {
    // reuse the first instrument: remap its first sub to the new sample
    const ins = module.instruments[0]!;
    if (ins.nsm === 0) {
      ins.nsm = 1;
      ins.sub[0] = { vol: 64, gvl: 64, pan: -1, xpo: 0, fin: 0, sid: id, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0, rvv: 0, vwf: 0, vde: 0, vra: 0, vsw: 0 } as SubInstrument;
      ins.map = Array(121).fill(0);
    } else {
      ins.sub[0]!.sid = id;
    }
    insIdx = 0;
  }
  core.playNote(insIdx, 60, 64);
  show(`previewing ${raw.name} (sample id ${id})`);
});
genAdd.addEventListener('click', () => {
  if (!module) return;
  const raw = generateSample();
  module.samples.push(raw);
  core.samples.add(raw); // store id == mod.samples.length - 1
  // attach to instrument 1 (first) if it has no samples yet
  const ins = module.instruments[0]!;
  if (ins.nsm === 0) {
    ins.nsm = 1;
    ins.sub[0] = { vol: 64, gvl: 64, pan: -1, xpo: 0, fin: 0, sid: module.samples.length - 1, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0, rvv: 0, vwf: 0, vde: 0, vra: 0, vsw: 0 };
    ins.map = Array(121).fill(0);
  }
  renderInsPane();
  show(`sample ${module.samples.length} added (${raw.name})`);
});
void generateSample;
genNext.addEventListener('click', () => {
  if (!module || module.samples.length === 0) return;
  const sid = module.samples.length - 1;
  const ins = emptyInstrument(`inst ${module.ins + 1} (${module.samples[sid]!.name})`);
  ins.nsm = 1;
  ins.sub[0] = { vol: 64, gvl: 64, pan: -1, xpo: 0, fin: 0, sid, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0, rvv: 0, vwf: 0, vde: 0, vra: 0, vsw: 0 };
  ins.map = Array(121).fill(0);
  module.instruments.push(ins);
  module.ins++;
  keyInstruments(module.instruments);
  renderInsPane();
  show(`${ins.name} created for sample ${sid + 1}`);
});

// -- tracker keyboard entry -------------------------------------------------

const KEY_NOTES: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20,
  y: 21, '7': 22, u: 23, i: 24,
};

document.addEventListener('keydown', (ev) => {
  if (selRow < 0 || selChn < 0) return;
  if ((ev.target as HTMLElement).tagName === 'INPUT' ||
      (ev.target as HTMLElement).tagName === 'SELECT') return;
  const cur = cellAt(selRow, selChn);
  const k = ev.key;
  if (k === 'ArrowUp' || k === 'ArrowDown') {
    ev.preventDefault();
    selRow = Math.max(0, Math.min(module!.patterns[curPattern]!.rows - 1,
      selRow + (k === 'ArrowDown' ? 1 : -1)));
    renderPattern();
    renderInspector();
  } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
    ev.preventDefault();
    const total = module!.chn * 4;
    selPart = (selPart + (k === 'ArrowRight' ? 1 : total - 1)) % total;
    selChn = Math.floor(selPart / 4) % module!.chn;
    renderPattern();
    renderInspector();
  } else if (k === ' ') {
    // note-off
    ev.preventDefault();
    mutateSelected((e) => { e.note = XMP_KEY_OFF; });
  } else if (k === 'Backspace') {
    ev.preventDefault();
    mutateSelected((e) => {
      if (selPart === 0) e.note = 0;
      else if (selPart === 1) e.ins = 0;
      else if (selPart === 2) e.vol = 0;
      else { e.fxt = 0; e.fxp = 0; }
    });
  } else if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === 'z') {
    ev.preventDefault();
    undo();
  } else if (selPart === 0 && KEY_NOTES[k.toLowerCase()] !== undefined && !ev.ctrlKey && !ev.metaKey) {
    ev.preventDefault();
    const octave = Math.floor((cur.note > 0 ? cur.note - 1 : 60) / 12);
    const noteNum = octave * 12 + KEY_NOTES[k.toLowerCase()]!;
    mutateSelected((e) => { e.note = noteNum + 1; if (!e.ins) e.ins = 1; });
    audition(0, noteNum);
    // advance to next row (tracker convention)
    selRow = Math.min(module!.patterns[curPattern]!.rows - 1, selRow + 1);
    renderPattern();
    renderInspector();
  }
});

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
