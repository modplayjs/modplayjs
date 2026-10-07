// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Playback-settings surface for the cRSID engine — the C player's CLI
// options (-sid6581/-sid8580, -mono/-stereo/-narrow, -sidhq/-sidlight,
// -resamplehq/-resamplight, -volume) mapped onto the ported globals.
//
// Timing semantics (from the C source):
//  - MainVolume, HighQualitySID, HighQualityResampler, Stereo are read
//    through the per-sample shadow sync (host/audio.c generateSample) —
//    they apply LIVE on the next sample.
//  - SelectedSIDmodel and the video standard are consumed only by
//    cRSID_setC64()/cRSID_setSIDmodels() during init — changing them
//    requires a tune re-init (sidStartTune with overrides).


import { cRSID, cRSID_C64 } from './instance.js';

/** Chip model (0 = header default, 6581/8580 = forced). */
export type SidModel = 0 | 6581 | 8580;
/** Output mode: mono / full stereo / narrow stereo (2SID+ tunes only). */
export type SidStereo = 0 | 1 | 3;

/** All settable engine options. */
export interface SidSettings {
  /** master volume 0..255 (C: -volume). Live. */
  volume: number;
  /** cycle-based oversampled waveform emulation (C: -sidhq/-sidlight). Live. */
  highQualitySID: boolean;
  /** Sinc FIR resampler instead of the Chebyshev+averaging decimator
   *  (C: -resamplehq/-resamplight). Only used when highQualitySID. Live. */
  highQualityResampler: boolean;
  /** channel mode for 2SID/3SID/4SID tunes (C: -mono/-stereo/-narrow). Live. */
  stereo: SidStereo;
  /** force a chip model (C: -sid6581/-sid8580); 0 = follow the header.
   *  Init-time: applied on the next sidStartTune. */
  model: SidModel;
  /** force the video standard 0=NTSC 1=PAL; undefined = follow the header.
   *  Init-time: applied on the next sidStartTune. */
  videoStandard?: 0 | 1;
}

/** Read the current settings back (live values included). */
export function getSidSettings(): SidSettings {
  return {
    volume: cRSID.MainVolume,
    highQualitySID: cRSID.HighQualitySID !== 0,
    highQualityResampler: cRSID.HighQualityResampler !== 0,
    stereo: cRSID.Stereo as SidStereo,
    model: cRSID.SelectedSIDmodel as SidModel,
    videoStandard: undefined, // not tracked post-init; re-init reads cRSID.VideoStandard
  };
}

/** Apply the live settings (everything except model/videoStandard). */
export function applySidSettingsLive(s: Pick<SidSettings, 'volume' | 'highQualitySID' | 'highQualityResampler' | 'stereo'>): void {
  cRSID.MainVolume = Math.max(0, Math.min(255, Math.round(s.volume)));
  cRSID.HighQualitySID = s.highQualitySID ? 1 : 0;
  cRSID.HighQualityResampler = s.highQualitySID && s.highQualityResampler ? 1 : 0;
  cRSID.Stereo = s.stereo;
  // shadow update happens per-sample inside generateSample (loader.ts),
  // matching the C host-thread sync — no action needed here.
  void cRSID_C64;
}

/** Stored init-time overrides (cRSID_init resets the globals, so they are
 *  re-applied inside sidStartTune after cRSID_init). */
const sidInitOverrides: { model: SidModel; videoStandard?: 0 | 1 } = { model: 0 };

/** Set the init-time overrides consumed by cRSID_setC64 (model forces the
 *  chip selection in cRSID_setSIDmodels; ForcedVideoStandard overrides the
 *  header video standard after its decode). Applied on the next
 *  sidStartTune. */
export function setSidInitOverrides(model: SidModel, videoStandard?: 0 | 1): void {
  sidInitOverrides.model = model;
  sidInitOverrides.videoStandard = videoStandard;
}

/** Internal: re-apply the stored overrides after cRSID_init (which resets
 *  the globals). Called by sidStartTune. */
export function sidApplyInitOverrides(): void {
  cRSID.SelectedSIDmodel = sidInitOverrides.model;
  cRSID.ForcedVideoStandard = sidInitOverrides.videoStandard;
}

/** Apply everything: live fields immediately, init-time fields on the
 *  next sidStartTune call. */
export function applySidSettings(s: SidSettings): void {
  applySidSettingsLive(s);
  setSidInitOverrides(s.model, s.videoStandard);
}

/** Number of SID chips the loaded tune uses (1..4). The channel-mode
 *  setting (mono/stereo/narrow) only routes differently when > 1. */
export function getSidChipCount(): number {
  return cRSID_C64.SIDchipCount;
}
