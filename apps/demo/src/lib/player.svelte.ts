// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// Player state and transport. The class owns the engine glue and publishes
// exactly what the views need; it never touches the DOM itself.
import { StateError } from '@modplayjs/core';
import {
  sidSeek,
  sidStartTune,
  applySidSettingsLive,
  loadSidSongLengths,
  isSidSongLengthDbLoaded,
  getSidChipCount,
  getSidPlayTimeSeconds,
  type SidSettings,
} from '@modplayjs/fmt-sid';
import {
  createStreamedSource,
  detectStreamedFormat,
  type StreamedSource,
  type StreamedFormat,
} from '@modplayjs/stream-audio';
import { core, mixerInstance, output, playhead } from './engine';
import { displayName, fmtBytes, fmtPad, fmtTime } from './format';
import { PlaylistStore, type PlaylistTrack } from '../playlist-store';
import workletUrl from '../worklet-url';
import { registerPwa } from '../pwa';

export interface InfoRow {
  label: string;
  value: string;
}

export interface OrderItem {
  i: number;
  pat: number;
}

export interface InstrumentItem {
  i: number;
  name: string;
}

export interface SampleItem {
  i: number;
  label: string;
  /** Instrument index that owns the sample, -1 when nothing maps to it. */
  mappedIns: number;
  mappedNote: number;
}

export interface ChannelItem {
  i: number;
  muted: boolean;
}

export interface AudiblePosition {
  ord: number;
  row: number;
  progress: number;
}

const THEME_KEY = 'modplayjs-theme';
const PATVIEW_KEY = 'modplayjs-patternview';

export class Player {
  // -- transport ---------------------------------------------------------
  loaded = $state(false);
  playing = $state(false);
  paused = $state(false);
  status = $state('no file loaded');
  timeCurrent = $state('0:00');
  timeRemaining = $state('-0:00');
  seekPct = $state(0);
  seekDisabled = $state(true);
  volume = $state(100);
  panSep = $state(100);
  panSepDisabled = $state(false);

  // -- view options ------------------------------------------------------
  follow = $state(true);
  patternOn = $state(false);
  stripDots = $state(false);
  dark = $state(true);
  fullscreenHidden = $state(false);
  fullscreenActive = $state(false);

  // -- file information --------------------------------------------------
  infoRows: InfoRow[] = $state([]);
  message = $state('');

  // -- module panels -----------------------------------------------------
  orders: OrderItem[] = $state([]);
  currentOrder = $state(-1);
  instruments: InstrumentItem[] = $state([]);
  samples: SampleItem[] = $state([]);
  channels: ChannelItem[] = $state([]);

  // -- mixer / sid settings ---------------------------------------------
  mixerVisible = $state(false);
  mixerMode = $state('libxmp');
  mixerLayout = $state('panned');
  mixerFilter = $state('a500');
  mixerModeDisabled = $state(false);
  mixerFilterDisabled = $state(false);

  sidVisible = $state(false);
  sidModel = $state('0');
  sidVideo = $state('');
  sidQuality = $state('light');
  sidStereo = $state('0');
  sidStereoDisabled = $state(false);
  sidVolume = $state(255);

  // -- playlist ----------------------------------------------------------
  tracks: PlaylistTrack[] = $state([]);
  playlistEphemeral = $state(false);
  playlistSize = $state('');
  currentTrackId: number | null = $state(null);

  // -- pattern view ------------------------------------------------------
  /** Bumped whenever the module (or its pattern) changes. */
  patternVersion = $state(0);

  buildHash = typeof __GIT_HASH__ === 'string' ? __GIT_HASH__ : 'dev';

  private store = new PlaylistStore();
  private streamed: StreamedSource | null = null;
  private streamPlayedMs = 0;
  private sidBytes: Uint8Array | null = null;
  private sidLengthsPromise: Promise<boolean> | null = null;
  private jamMode = false;
  private seeking = false;
  private seekTarget = 0;
  private seekLatchUntil = 0;
  private lastStatus = '';
  private raf = 0;
  private positionHandler: ((position: AudiblePosition) => void) | null = null;
  private cleanup: (() => void)[] = [];
  private disposed = false;

  constructor() {
    output.onRender = (frames, c) => {
      // SID drives its own sample-paced engine and streamed audio has no
      // pattern/row state — only a module's playState is meaningful here.
      if (this.streamed || c.module?.format === 'sid') return;
      const ps = c.playState;
      playhead.setRate(c.sampleRate);
      playhead.mark(frames, ps);
    };
    output.onEnded = () => {
      this.playing = false;
      this.paused = false;
      // auto-advance: play the next entry (wraps around). A programmatic
      // stop() cancels the pending drain timer in out-webaudio, so this only
      // fires on a genuine natural end.
      const next = this.nextTrack();
      if (next && !this.jamMode) {
        void this.playTrack(next);
        return;
      }
      this.setPwaAudioBusy(false);
      this.show('end of track');
    };
  }

  // -- lifecycle ---------------------------------------------------------

  async init(): Promise<void> {
    registerPwa();
    this.restoreSettings();
    this.watchFullscreen();
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      this.show(
        'WARNING: this page is not in a secure context (HTTPS or localhost). ' +
          'AudioWorklet is unavailable — open via http://localhost:<port> instead.',
      );
    }
    await this.store.init();
    this.tracks = this.store.tracks;
    this.playlistEphemeral = this.store.ephemeral;
    this.refreshPlaylistMeta();
    if (this.tracks.length > 0) await this.selectTrack(this.tracks[0]!);
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const off of this.cleanup) off();
    this.cleanup = [];
  }

  onPosition(handler: (position: AudiblePosition) => void): () => void {
    this.positionHandler = handler;
    return () => {
      if (this.positionHandler === handler) this.positionHandler = null;
    };
  }

  // -- persisted settings ------------------------------------------------

  private restoreSettings(): void {
    const saved = localStorage.getItem(THEME_KEY);
    this.dark = saved !== 'light';
    document.documentElement.dataset.theme = this.dark ? 'dark' : 'light';
    this.patternOn = localStorage.getItem(PATVIEW_KEY) === '1';
  }

  setDark(value: boolean): void {
    this.dark = value;
    document.documentElement.dataset.theme = value ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, value ? 'dark' : 'light');
  }

  setPatternView(value: boolean): void {
    this.patternOn = value;
    localStorage.setItem(PATVIEW_KEY, value ? '1' : '0');
  }

  private watchFullscreen(): void {
    const update = (): void => {
      const standalone =
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true;
      this.fullscreenHidden = standalone;
      this.fullscreenActive = !!document.fullscreenElement;
    };
    const onChange = (): void => update();
    document.addEventListener('fullscreenchange', onChange);
    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener('change', onChange);
    const mediaFs = window.matchMedia('(display-mode: fullscreen)');
    mediaFs.addEventListener('change', onChange);
    this.cleanup.push(() => {
      document.removeEventListener('fullscreenchange', onChange);
      media.removeEventListener('change', onChange);
      mediaFs.removeEventListener('change', onChange);
    });
    update();
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }

  // -- transport ---------------------------------------------------------

  setVolume(value: number): void {
    this.volume = value;
    core.setVolume(value);
  }

  setPanSeparation(value: number): void {
    this.panSep = value;
    // libxmp XMP_PLAYER_MIX contract (control.c:445-449): -100..100 percent
    // of the pan offset, DEFAULT_MIX = 100 (common.h:144) = full normal
    // separation. 1:1 mapping with default 100 = libxmp parity.
    core.setPanSeparation(value);
  }

  async play(): Promise<void> {
    if (!this.loaded || this.playing) return;
    if (this.paused) {
      await output.resume();
      this.paused = false;
      // Leaving jam mode: restore song channel volumes.
      if (this.jamMode) {
        const mod = core.module;
        if (mod) for (let chn = 0; chn < mod.chn; chn++) core.setChannelVol(chn, 100);
        this.jamMode = false;
        this.show('playing');
      } else {
        this.show('resumed');
      }
      return;
    }
    try {
      await this.startPlayback(false);
    } catch (err) {
      const msg = err instanceof StateError || err instanceof Error ? err.message : String(err);
      const secureHint =
        typeof window !== 'undefined' && !window.isSecureContext
          ? ' — serve the demo over HTTPS or http://localhost (AudioWorklet is unavailable on plain http://<ip>)'
          : '';
      this.show(`play failed: ${msg}${secureHint}`);
    }
  }

  pause(): void {
    if (!this.playing) return;
    if (!this.paused) {
      output.pause();
      this.paused = true;
      this.show('paused | ord ' + core.playState.ord + ' row ' + core.playState.row);
    } else {
      void output.resume();
      this.paused = false;
      this.show('playing');
    }
  }

  stop(): void {
    if (!this.playing && !this.paused) return;
    output.stop();
    this.playing = false;
    this.paused = false;
    this.setPwaAudioBusy(false);
    this.show('stopped');
    this.jamMode = false;
  }

  /** Resume the transport from a pause, used by the audition buttons. */
  private async ensureRunning(): Promise<void> {
    if (this.paused) {
      await output.resume();
      this.paused = false;
    } else if (!this.playing) {
      await this.startPlayback(true);
    }
  }

  async auditionInstrument(index: number): Promise<void> {
    if (!this.loaded) return;
    await this.ensureRunning();
    core.playNote(index, 60, 64);
  }

  async auditionSample(sample: SampleItem): Promise<void> {
    if (!this.loaded || sample.mappedIns < 0) return;
    await this.ensureRunning();
    core.playNote(sample.mappedIns, sample.mappedNote, 64);
  }

  toggleChannel(index: number): void {
    core.setChannelMute(index, !core.getChannelMute(index));
    this.refreshChannels();
  }

  private setPwaAudioBusy(busy: boolean): void {
    document.dispatchEvent(new CustomEvent('modplayjs:playing', { detail: busy }));
  }

  private async startPlayback(muteSong: boolean): Promise<void> {
    const deviceRate = await output.deviceSampleRate();
    if (this.streamed) {
      // Streamed-audio path: the source shim exposes playBuffer() with the
      // same pull semantics as Core, so out-webaudio drives it unchanged.
      const src = this.streamed;
      this.streamPlayedMs = 0;
      const self = this;
      const shim = {
        playBuffer(out: Float32Array, size: number, loop?: number): number {
          const n = src.playBuffer(out, size, loop);
          self.streamPlayedMs += (n / 2 / deviceRate) * 1000;
          return n;
        },
      };
      core.setSampleRate(deviceRate);
      await output.start(shim as unknown as typeof core, workletUrl);
      this.playing = true;
      this.paused = false;
      this.setPwaAudioBusy(true);
      this.show('playing | streamed | rate: ' + output.audioContextSampleRate + ' Hz');
      return;
    }
    core.setSampleRate(deviceRate);
    // SID: start the cRSID engine for this tune at the device rate before the
    // player spins (the 'sid' DSP pulls samples from it inside renderFrame).
    if (this.sidBytes && core.module?.format === 'sid') sidStartTune(this.sidBytes, deviceRate, 1);
    core.startSmix(4); // reserve channels for instrument/sample audition
    core.startPlayer();
    // Fresh transport: no marks from a previous run belong to this one.
    playhead.setRate(deviceRate);
    playhead.reset();
    // startPlayer resets master_vol to 100 (parity with C's
    // xmp_start_player) — re-apply the user's slider values so volume and
    // pan survive a load/replay.
    core.setVolume(this.volume);
    core.setPanSeparation(this.panSep);
    await output.start(core, workletUrl); // click handler = user gesture
    this.jamMode = muteSong;
    const mod = core.module;
    if (mod) {
      for (let chn = 0; chn < mod.chn; chn++) core.setChannelVol(chn, muteSong ? 0 : 100);
    }
    this.playing = true;
    this.paused = false;
    this.setPwaAudioBusy(true);
    this.show(
      (muteSong ? 'jam (song muted) | ' : 'playing | ') +
        'DSP: ' +
        core.dsp().name +
        ' | ' +
        output.transportMode +
        ' | rate: ' +
        output.audioContextSampleRate +
        ' Hz',
    );
  }

  // -- seek --------------------------------------------------------------

  seekDrag(pct: number): void {
    this.seeking = true;
    this.seekPct = pct;
    this.seekTarget = (pct / 1000) * this.moduleDuration();
    this.timeCurrent = fmtTime(this.seekTarget);
  }

  seekCommit(pct: number): void {
    const dur = this.moduleDuration();
    const targetMs = (pct / 1000) * dur;
    this.seekPct = pct;
    // Streamed audio (WAV/MP3/OGG): the source decodes the whole file at the
    // load, so the seek = a byte offset into the decoded PCM. This must come
    // before the seek-while-stopped path below: that path calls
    // core.seekTime, which needs a loaded module and throws otherwise.
    if (this.streamed) {
      this.streamed.seek(targetMs);
      this.streamPlayedMs = targetMs;
      output.flush();
      this.seekLatchUntil = performance.now() + 400;
      this.timeCurrent = fmtTime(targetMs);
      this.seeking = false;
      return;
    }
    if (!this.playing && !this.paused && this.loaded) {
      // The fresh startPlayback has a clean ring primed with the audio from
      // the repositioned engine state - flushing it here would play ~1s and
      // go silent. No flush on this path.
      void (async () => {
        await this.startPlayback(false);
        if (core.module?.format === 'sid') sidSeek(targetMs / 1000);
        else core.seekTime(targetMs);
        // startPlayback already rendered a few frames from the OLD position;
        // drop those marks so the view does not replay them after the jump.
        playhead.reset();
      })();
      this.seekLatchUntil = performance.now() + 400;
      this.timeCurrent = fmtTime(targetMs);
      this.seeking = false;
      return;
    }
    if (core.module?.format === 'sid') sidSeek(targetMs / 1000);
    else core.seekTime(targetMs);
    // The output ring holds the pre-seek audio (up to ~0.7s). Flush it
    // BEFORE the repositioning: the renderAhead then fills the ring with the
    // seeked audio. A flush AFTER the seek would drop the freshly rendered
    // audio and go silent.
    output.flush();
    playhead.reset();
    this.seekLatchUntil = performance.now() + 400;
    this.timeCurrent = fmtTime(targetMs);
    this.seeking = false;
  }

  moduleDuration(): number {
    if (this.streamed) return this.streamed.durationMs;
    const mod = core.module;
    if (!mod) return 0;
    // No `endless` early return: a SID loops forever but its runtime is known
    // from the HVSC database the loader fills in, which is what a seekbar needs.
    let total = 0;
    for (const seq of mod.sequences) total += seq.duration;
    return total;
  }

  // -- files / playlist --------------------------------------------------

  async addFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    const skipped = await this.store.add(files);
    this.tracks = this.store.tracks;
    this.refreshPlaylistMeta();
    if (this.currentTrackId === null && this.tracks.length > 0) {
      await this.selectTrack(this.tracks[0]!);
    }
    if (skipped > 0) {
      this.showThrottled(
        `playlist: added ${files.length - skipped}, skipped ${skipped} duplicate(s)`,
      );
    } else {
      this.showThrottled(`playlist: +${files.length}`);
    }
  }

  async removeTrack(id: number): Promise<void> {
    await this.store.remove(id);
    this.tracks = this.store.tracks;
    if (this.currentTrackId === id) this.currentTrackId = null;
    this.refreshPlaylistMeta();
  }

  async clearPlaylist(): Promise<void> {
    await this.store.clear();
    this.tracks = this.store.tracks;
    this.currentTrackId = null;
    this.refreshPlaylistMeta();
  }

  private refreshPlaylistMeta(): void {
    let total = 0;
    for (const t of this.tracks) total += t.size;
    this.playlistSize =
      this.tracks.length > 0
        ? `${this.tracks.length} · ${fmtBytes(total)}` + (this.playlistEphemeral ? ' · session' : '')
        : '';
  }

  /** Prepare a track: load into the player, mark it selected, do NOT start. */
  async selectTrack(track: PlaylistTrack): Promise<void> {
    try {
      await this.loadTrack(track.blob);
      this.currentTrackId = track.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.show(`load failed: ${msg}`);
    }
  }

  /** Switch to a track and autoplay — used while the player is running. */
  async playTrack(track: PlaylistTrack): Promise<void> {
    try {
      await this.loadTrack(track.blob);
      this.currentTrackId = track.id;
      await this.startPlayback(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.show(`play failed: ${msg}`);
    }
  }

  nextTrack(): PlaylistTrack | null {
    const list = this.tracks;
    if (list.length === 0) return null;
    const idx = list.findIndex((t) => t.id === this.currentTrackId);
    // wrap around: end of list restarts from the top
    return list[(idx + 1) % list.length] ?? null;
  }

  // -- loading -----------------------------------------------------------

  private async loadTrack(file: Blob): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (this.playing || this.paused) {
      output.stop();
      this.playing = false;
      this.paused = false;
    }
    const streamedFmt = detectStreamedFormat(bytes, file instanceof File ? file.name : undefined);
    if (streamedFmt) {
      const src = createStreamedSource(bytes, streamedFmt, 48000);
      if (src) {
        // Drop the previous track's module state: the pattern view, the SID
        // panel, and the mixer panel belong to the old track.
        this.sidBytes = null;
        this.sidVisible = false;
        this.mixerVisible = false;
        this.setPatternView(false);
        this.streamed = src;
        this.loaded = true;
        this.seekDisabled = false;
        this.seekPct = 0;
        this.timeCurrent = '0:00';
        this.timeRemaining = '-' + fmtTime(src.durationMs);
        this.currentOrder = -1;
        this.patternVersion++;
        this.renderInfoStreamed(src, streamedFmt);
        this.show(
          'loaded | format: ' +
            streamedFmt.toUpperCase() +
            ' (streamed) | ' +
            src.channels +
            ' ch | ' +
            src.sampleRate +
            ' Hz | ' +
            fmtTime(src.durationMs),
        );
        return;
      }
    }
    // Load the HVSC Songlengths database BEFORE the loader runs — the .sid
    // loader consults it while building the module (tune runtime).
    const head = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
    if (head === 'PSID' || head === 'RSID') {
      await this.ensureSidLengths();
    }
    core.loadModule(bytes);
    const mod = core.module;
    if (!mod) throw new StateError('module did not load');
    // A/B against XMPlay: everything through softmixer (libxmp-parity mixer).
    // SID (.sid) drives its own sample-paced engine via the 'sid' DSP.
    if (mod.format === 'sid') {
      this.sidBytes = bytes;
      core.setDsp('sid');
      this.sidVisible = true;
      // chip count is computed during engine init — enable the channel-mode
      // select only for multi-SID tunes (1-SID always plays mono)
      this.updateSidChannelUi();
    } else {
      this.sidBytes = null;
      this.sidVisible = false;
      core.setDsp('softmixer');
      // mixer settings panel: the Paula engine + the A500 filter only make
      // sense for 4-channel Amiga MODs (the C A500 mixers are mono 8-bit
      // only; on other formats those voices skip, leaving silence).
      const isMod = mod.format === 'mod' && mod.chn === 4;
      this.mixerVisible =
        mod.format === 'mod' || mod.format === 's3m' || mod.format === 'xm' || mod.format === 'it';
      this.mixerModeDisabled = !isMod;
      this.mixerFilterDisabled = !isMod;
      if (!isMod) {
        this.mixerMode = 'libxmp';
        this.mixerFilter = 'a500';
        this.applyMixerOptions();
      }
    }
    this.streamed = null;
    this.loaded = true;
    this.seekDisabled = !!mod.endless;
    this.seekPct = 0;
    this.timeCurrent = '0:00';
    this.timeRemaining = mod.endless ? '∞' : '-' + fmtTime(this.moduleDuration());
    this.currentOrder = -1;
    this.patternVersion++;
    this.renderInfo();
    this.renderOrders();
    this.renderInstruments();
    this.renderSamples();
    this.refreshChannels();
    this.show(
      'loaded | format: ' +
        mod.format.toUpperCase() +
        ' | ' +
        core.dsp().name +
        ' | channels: ' +
        mod.chn +
        ' | patterns: ' +
        mod.pat +
        ' | tracker: ' +
        mod.tracker,
    );
  }

  private async ensureSidLengths(): Promise<boolean> {
    if (isSidSongLengthDbLoaded()) return true;
    if (!this.sidLengthsPromise) {
      this.sidLengthsPromise = fetch('./Songlengths.md5')
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
    return this.sidLengthsPromise;
  }

  // -- rendering into state ---------------------------------------------

  private renderInfo(): void {
    if (this.streamed) return; // the streamed panel is kept from loadTrack
    const mod = core.module;
    if (!mod) return;
    const current = this.tracks.find((t) => t.id === this.currentTrackId);
    this.infoRows = [
      { label: 'file', value: current?.name ?? '—' },
      { label: 'title', value: mod.title || '(untitled)' },
      { label: 'format', value: mod.format.toUpperCase() },
      { label: 'tracker', value: mod.tracker },
      { label: 'speed', value: String(mod.speed) },
      { label: 'bpm', value: String(mod.bpm) },
      { label: 'channels', value: String(mod.chn) },
      { label: 'orders', value: String(mod.len) },
      { label: 'patterns', value: String(mod.pat) },
      { label: 'instruments', value: String(mod.ins) },
      { label: 'samples', value: String(core.samples.size) },
      { label: 'restart', value: String(mod.restart) },
      { label: 'global vol', value: mod.gvol + ' / ' + mod.gvolbase },
      ...(mod.mvol !== undefined
        ? [{ label: 'master vol', value: mod.mvol + ' / ' + mod.mvolbase }]
        : []),
    ];
    this.message = mod.comment && mod.comment.trim() ? mod.comment.replace(/\r/g, '') : '';
  }

  private renderInfoStreamed(src: StreamedSource, fmt: StreamedFormat): void {
    const current = this.tracks.find((t) => t.id === this.currentTrackId);
    this.infoRows = [
      { label: 'file', value: current?.name ?? '—' },
      { label: 'title', value: current?.name?.replace(/\.[^.]+$/, '') ?? '' },
      { label: 'format', value: fmt.toUpperCase() + ' (streamed)' },
      { label: 'channels', value: String(src.channels) },
      { label: 'sample rate', value: src.sampleRate + ' Hz' },
      { label: 'duration', value: fmtTime(src.durationMs) },
    ];
    this.message = '';
  }

  private renderOrders(): void {
    const mod = core.module;
    if (!mod) return;
    const rows: OrderItem[] = [];
    for (let i = 0; i < mod.len; i++) rows.push({ i, pat: mod.xxo[i] ?? 0 });
    this.orders = rows;
  }

  private renderInstruments(): void {
    const mod = core.module;
    if (!mod) return;
    this.instruments = mod.instruments.map((ins, i) => ({
      i,
      name: displayName(ins?.name ?? '', this.stripDots),
    }));
  }

  private renderSamples(): void {
    const mod = core.module;
    if (!mod) return;
    const rows: SampleItem[] = [];
    for (let id = 0; id < core.samples.size; id++) {
      const s = core.samples.get(id);
      const loop = s.loopEnd > s.loopStart ? 'L' : ' ';
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
      rows.push({
        i: id,
        label:
          fmtPad(id + 1, 2) +
          ' ' +
          fmtPad(s.length, 6) +
          ' ' +
          loop +
          ' ' +
          (displayName(s.name || ' ', this.stripDots) || ' '),
        mappedIns,
        mappedNote,
      });
    }
    this.samples = rows;
  }

  private refreshChannels(): void {
    const mod = core.module;
    if (!mod) {
      this.channels = [];
      return;
    }
    const rows: ChannelItem[] = [];
    for (let c = 0; c < mod.chn; c++) rows.push({ i: c, muted: core.getChannelMute(c) });
    this.channels = rows;
  }

  setStripDots(value: boolean): void {
    this.stripDots = value;
    if (!this.loaded) return;
    this.renderInstruments();
    this.renderSamples();
  }

  // -- sid / mixer settings ---------------------------------------------

  private readSidSettings(): SidSettings {
    const q = this.sidQuality;
    const hq = q !== 'light';
    return {
      volume: this.sidVolume,
      highQualitySID: hq,
      highQualityResampler: q === 'sinc',
      stereo: Number(this.sidStereo) as 0 | 1 | 3,
      model: Number(this.sidModel) as 0 | 6581 | 8580,
      videoStandard: this.sidVideo === '' ? undefined : (Number(this.sidVideo) as 0 | 1),
    };
  }

  applySidLive(): void {
    applySidSettingsLive(this.readSidSettings());
  }

  private updateSidChannelUi(): void {
    const multi = getSidChipCount() > 1;
    this.sidStereoDisabled = !multi;
  }

  async reinitSidEngine(): Promise<void> {
    if (!this.sidBytes) return;
    this.updateSidChannelUi();
    const wasActive = this.playing || this.paused;
    if (wasActive) output.stop();
    this.playing = false;
    this.paused = false;
    core.setSampleRate(await output.deviceSampleRate());
    if (wasActive) {
      await this.startPlayback(false);
    } else {
      sidStartTune(this.sidBytes, await output.deviceSampleRate(), 1);
    }
  }

  applyMixerOptions(): void {
    if (core.module?.format === 'sid') return;
    mixerInstance.configure({
      mode: this.mixerMode as 'libxmp' | 'paula',
      layout: this.mixerLayout as 'panned' | 'lrlr' | 'lrrl',
      amigaFilter: this.mixerFilter as 'a500' | 'a500led',
    });
    // The lrlr/lrrl layouts hard-assign pan for chn < 4: the pan-separation
    // slider has no effect on those channels.
    this.panSepDisabled = this.mixerLayout !== 'panned';
  }

  async setMixerMode(mode: string): Promise<void> {
    this.mixerMode = mode;
    this.applyMixerOptions();
    // A mode switch swaps resamplers per voice — restart the tune for a clean
    // voice state (the DSP identity 'softmixer' is unchanged).
    if (this.loaded && (this.playing || this.paused)) {
      const pct = this.seekPct;
      output.stop();
      this.playing = false;
      this.paused = false;
      await this.startPlayback(false);
      if (this.moduleDuration() > 0) {
        const targetMs = (pct / 1000) * this.moduleDuration();
        if (core.module?.format === 'sid') sidSeek(targetMs / 1000);
        else core.seekTime(targetMs);
      }
    }
  }

  // -- status ------------------------------------------------------------

  show(msg: string): void {
    this.status = msg;
  }

  private showThrottled(msg: string): void {
    if (msg !== this.lastStatus) {
      this.lastStatus = msg;
      this.status = msg;
    }
  }

  // -- frame loop --------------------------------------------------------

  private frame = (): void => {
    if (this.disposed) return;
    if (this.loaded && (this.playing || this.paused)) {
      const ps = core.playState;
      // Playback clock: the renderer is ~0.7 s ahead of the speaker, so the
      // seek bar and the status line read the audible row too (null before
      // the first pull, and for SID/streamed audio).
      const ap = playhead.positionAt();
      const dur = this.moduleDuration();
      const cur = this.seeking
        ? this.seekTarget
        : this.streamed
          ? this.streamPlayedMs
          : ap
            ? ap.timeMs
            : ps.timeMs;
      const latched = performance.now() < this.seekLatchUntil;
      if (!this.seeking && !latched) {
        if (dur > 0) this.seekPct = Math.min(1000, Math.round((cur / dur) * 1000));
        const shown = core.module?.format === 'sid' ? getSidPlayTimeSeconds() * 1000 : cur;
        this.timeCurrent = fmtTime(shown);
        this.timeRemaining = dur > 0 ? '-' + fmtTime(Math.max(0, dur - shown)) : '∞';
      } else if (latched) {
        // Reposition pending: show the target while the audio thread catches up.
        this.timeCurrent = fmtTime(this.seekTarget);
        this.timeRemaining = '-' + fmtTime(dur - this.seekTarget);
      }
      const ord = ap ? ap.ord : ps.ord;
      const row = ap ? ap.row : ps.row;
      if (ord !== this.currentOrder) this.currentOrder = ord;
      this.positionHandler?.({
        ord,
        row,
        progress: ap ? ap.rowProgress : 0,
      });
      if (this.playing && !this.paused) {
        this.showThrottled(
          'playing | ord ' +
            ord +
            ' row ' +
            row +
            ' | ' +
            (ap ? ap.speed : ps.speed) +
            '/' +
            (ap ? ap.bpm : ps.bpm) +
            ' | rate: ' +
            output.audioContextSampleRate +
            ' Hz',
        );
      } else if (this.paused) {
        this.showThrottled('paused | ord ' + ord + ' row ' + row);
      }
    }
    // Idle: keep the last message (load result, end of track, stopped) rather
    // than blanking the status line the moment playback stops.
    this.raf = requestAnimationFrame(this.frame);
  };
}

/** The page uses one player; components import the instance. */
export const player = new Player();
