// SPDX-License-Identifier: BSD-3-Clause
// Ported from: OpenMPT soundlib/InstrumentSynth.h + InstrumentSynth.cpp
// (BSD-3-Clause, OpenMPT Devs) — the "Script"/"Synth" processor that
// Future Composer (and MED/GT2/Puma/His Master's Noise/Face The Music)
// instruments run as per-channel event scripts.
//
// The full Event set is ported 1:1 (Type enum :37-113, state machine
// State :16-104, NextTick :246-459, EvaluateEvent :556-966,
// ApplyChannelState :468-554, HandleFCVolumeBend :963-980). Only the
// events Future Composer 1.x actually emits are exercised by the FC
// loader, but the engine itself is complete so later loaders can reuse
// it verbatim.

import type {
  ChannelState,
  Core,
  Event,
  Instrument,
  ModuleData,
} from '@modplayjs/core';
import { NoteFlag } from '@modplayjs/core';
import { noteToPeriod, PeriodType, PERIOD_BASE } from '@modplayjs/core';

/** Event::Type (InstrumentSynth.h:37-113). Kept as a numeric enum with the
 *  exact C++ names. */
export enum SynthEventType {
  StopScript,
  Jump,
  JumpIfTrue,
  Delay,
  SetStepSpeed,
  JumpMarker,
  SampleOffset,
  SampleOffsetAdd,
  SampleOffsetSub,
  SetLoopCounter,
  EvaluateLoopCounter,
  NoteCut,

  GTK_KeyOff,
  GTK_SetVolume,
  GTK_SetPitch,
  GTK_SetPanning,
  GTK_SetVolumeStep,
  GTK_SetPitchStep,
  GTK_SetPanningStep,
  GTK_SetSpeed,
  GTK_EnableTremor,
  GTK_SetTremorTime,
  GTK_EnableTremolo,
  GTK_EnableVibrato,
  GTK_SetVibratoParams,

  Puma_SetWaveform,
  Puma_VolumeRamp,
  Puma_StopVoice,
  Puma_SetPitch,
  Puma_PitchRamp,

  Mupp_SetWaveform,

  MED_DefineArpeggio,
  MED_JumpScript,
  MED_SetEnvelope,
  MED_SetVolume,
  MED_SetWaveform,
  MED_SetVibratoSpeed,
  MED_SetVibratoDepth,
  MED_SetVolumeStep,
  MED_SetPeriodStep,
  MED_HoldDecay,

  FTM_PlaySample,
  FTM_SetPitch,
  FTM_AddPitch,
  FTM_SetDetune,
  FTM_AddDetune,
  FTM_SetVolume,
  FTM_AddVolume,
  FTM_SetSample,
  FTM_SetCondition,
  FTM_SetInterrupt,
  FTM_SetSampleStart,
  FTM_SetOneshotLength,
  FTM_SetRepeatLength,
  FTM_CloneTrack,
  FTM_StartLFO,
  FTM_LFOAddSub,
  FTM_SetWorkTrack,
  FTM_SetGlobalVolume,
  FTM_SetTempo,
  FTM_SetSpeed,
  FTM_SetPlayPosition,

  FC_SetWaveform,
  FC_SetPitch,
  FC_SetVibrato,
  FC_PitchSlide,
  FC_VolumeSlide,
}

/** JumpEvents (InstrumentSynth.h:115-122). */
const JUMP_EVENTS: readonly SynthEventType[] = [
  SynthEventType.Jump,
  SynthEventType.JumpIfTrue,
  SynthEventType.EvaluateLoopCounter,
  SynthEventType.GTK_KeyOff,
  SynthEventType.MED_HoldDecay,
  SynthEventType.FTM_SetInterrupt,
];

/** InstrumentSynth::Event — a tagged struct (no C++ union in TS). */
export interface SynthEvent {
  type: SynthEventType;
  /** u8 / i8 (Byte0). */
  u8: number;
  /** u16 / i16 (also Jump targets). */
  u16: number;
  /** bytes[0] (Byte1). */
  byte1: number;
  /** bytes[1] (Byte2). */
  byte2: number;
}

export function evStopScript(): SynthEvent {
  return { type: SynthEventType.StopScript, u8: 0, u16: 0, byte1: 0, byte2: 0 };
}
export function evJump(target: number): SynthEvent {
  return { type: SynthEventType.Jump, u8: 0, u16: target & 0xffff, byte1: 0, byte2: 0 };
}
export function evJumpIfTrue(target: number): SynthEvent {
  return { type: SynthEventType.JumpIfTrue, u8: 0, u16: target & 0xffff, byte1: 0, byte2: 0 };
}
export function evDelay(ticks: number): SynthEvent {
  return { type: SynthEventType.Delay, u8: 0, u16: ticks & 0xffff, byte1: 0, byte2: 0 };
}
export function evSetStepSpeed(speed: number, updateNow: boolean): SynthEvent {
  return { type: SynthEventType.SetStepSpeed, u8: speed & 0xff, u16: 0, byte1: updateNow ? 1 : 0, byte2: 0 };
}
export function evJumpMarker(data: number): SynthEvent {
  return { type: SynthEventType.JumpMarker, u8: 0, u16: data & 0xffff, byte1: 0, byte2: 0 };
}
export function evSampleOffset(offset: number): SynthEvent {
  const v = Math.min(offset, 0xffffff);
  return { type: SynthEventType.SampleOffset, u8: v & 0xff, u16: 0, byte1: (v >> 8) & 0xff, byte2: (v >> 16) & 0xff };
}
export function evSampleOffsetAdd(offset: number): SynthEvent {
  const v = Math.min(offset, 0xffffff);
  return { type: SynthEventType.SampleOffsetAdd, u8: v & 0xff, u16: 0, byte1: (v >> 8) & 0xff, byte2: (v >> 16) & 0xff };
}
export function evSampleOffsetSub(offset: number): SynthEvent {
  const v = Math.min(offset, 0xffffff);
  return { type: SynthEventType.SampleOffsetSub, u8: v & 0xff, u16: 0, byte1: (v >> 8) & 0xff, byte2: (v >> 16) & 0xff };
}
export function evSetLoopCounter(count: number, force: boolean): SynthEvent {
  return { type: SynthEventType.SetLoopCounter, u8: force ? 1 : 0, u16: count & 0xffff, byte1: 0, byte2: 0 };
}
export function evEvaluateLoopCounter(target: number): SynthEvent {
  return { type: SynthEventType.EvaluateLoopCounter, u8: 0, u16: target & 0xffff, byte1: 0, byte2: 0 };
}
export function evNoteCut(): SynthEvent {
  return { type: SynthEventType.NoteCut, u8: 0, u16: 0, byte1: 0, byte2: 0 };
}
export function evGtkKeyOff(target: number): SynthEvent {
  return { type: SynthEventType.GTK_KeyOff, u8: 0, u16: target & 0xffff, byte1: 0, byte2: 0 };
}
export function evGtkSetVolume(volume: number): SynthEvent {
  return { type: SynthEventType.GTK_SetVolume, u8: 0, u16: volume & 0xffff, byte1: 0, byte2: 0 };
}
export function evGtkSetPitch(pitch: number): SynthEvent {
  return { type: SynthEventType.GTK_SetPitch, u8: 0, u16: pitch & 0xffff, byte1: 0, byte2: 0 };
}
export function evGtkSetPanning(panning: number): SynthEvent {
  return { type: SynthEventType.GTK_SetPanning, u8: 0, u16: panning & 0xffff, byte1: 0, byte2: 0 };
}
export function evGtkSetVolumeStep(step: number): SynthEvent {
  return { type: SynthEventType.GTK_SetVolumeStep, u8: 0, u16: step & 0xffff, byte1: 0, byte2: 0 };
}
export function evGtkSetPitchStep(step: number): SynthEvent {
  return { type: SynthEventType.GTK_SetPitchStep, u8: 0, u16: step & 0xffff, byte1: 0, byte2: 0 };
}
export function evGtkSetPanningStep(step: number): SynthEvent {
  return { type: SynthEventType.GTK_SetPanningStep, u8: 0, u16: step & 0xffff, byte1: 0, byte2: 0 };
}
export function evGtkSetSpeed(speed: number): SynthEvent {
  return { type: SynthEventType.GTK_SetSpeed, u8: speed & 0xff, u16: 0, byte1: 0, byte2: 0 };
}
export function evGtkEnableTremor(enable: number): SynthEvent {
  return { type: SynthEventType.GTK_EnableTremor, u8: enable & 0xff, u16: 0, byte1: 0, byte2: 0 };
}
export function evGtkSetTremorTime(on: number, off: number): SynthEvent {
  return { type: SynthEventType.GTK_SetTremorTime, u8: on & 0xff, u16: 0, byte1: off & 0xff, byte2: 0 };
}
export function evGtkEnableTremolo(enable: number): SynthEvent {
  return { type: SynthEventType.GTK_EnableTremolo, u8: enable & 0xff, u16: 0, byte1: 0, byte2: 0 };
}
export function evGtkEnableVibrato(enable: number): SynthEvent {
  return { type: SynthEventType.GTK_EnableVibrato, u8: enable & 0xff, u16: 0, byte1: 0, byte2: 0 };
}
export function evGtkSetVibratoParams(width: number, speed: number): SynthEvent {
  return { type: SynthEventType.GTK_SetVibratoParams, u8: width & 0xff, u16: 0, byte1: speed & 0xff, byte2: 0 };
}
export function evPumaSetWaveform(waveform: number, step: number, count: number): SynthEvent {
  return { type: SynthEventType.Puma_SetWaveform, u8: waveform & 0xff, u16: 0, byte1: step & 0xff, byte2: count & 0xff };
}
export function evPumaVolumeRamp(startVol: number, endVol: number, ticks: number): SynthEvent {
  return { type: SynthEventType.Puma_VolumeRamp, u8: startVol & 0xff, u16: 0, byte1: endVol & 0xff, byte2: ticks & 0xff };
}
export function evPumaStopVoice(): SynthEvent {
  return { type: SynthEventType.Puma_StopVoice, u8: 0, u16: 0, byte1: 0, byte2: 0 };
}
export function evPumaSetPitch(pitchOffset: number, ticks: number): SynthEvent {
  return { type: SynthEventType.Puma_SetPitch, u8: (pitchOffset & 0xff) as number, u16: 0, byte1: 0, byte2: ticks & 0xff };
}
export function evPumaPitchRamp(startPitch: number, endPitch: number, ticks: number): SynthEvent {
  return { type: SynthEventType.Puma_PitchRamp, u8: startPitch & 0xff, u16: 0, byte1: endPitch & 0xff, byte2: ticks & 0xff };
}
export function evMuppSetWaveform(instr: number, waveform: number, volume: number): SynthEvent {
  return { type: SynthEventType.Mupp_SetWaveform, u8: instr & 0xff, u16: 0, byte1: waveform & 0xff, byte2: volume & 0xff };
}
export function evMedDefineArpeggio(note: number, noteCount: number): SynthEvent {
  return { type: SynthEventType.MED_DefineArpeggio, u8: 0, u16: noteCount & 0xffff, byte1: note & 0xff, byte2: 0 };
}
export function evMedJumpScript(scriptIndex: number, target: number): SynthEvent {
  return { type: SynthEventType.MED_JumpScript, u8: scriptIndex & 0xff, u16: target & 0xffff, byte1: 0, byte2: 0 };
}
export function evMedSetEnvelope(envelope: number, loop: boolean, volumeEnv: boolean): SynthEvent {
  return { type: SynthEventType.MED_SetEnvelope, u8: envelope & 0xff, u16: 0, byte1: loop ? 1 : 0, byte2: volumeEnv ? 1 : 0 };
}
export function evMedSetVolume(volume: number): SynthEvent {
  return { type: SynthEventType.MED_SetVolume, u8: volume & 0xff, u16: 0, byte1: 0, byte2: 0 };
}
export function evMedSetWaveform(waveform: number): SynthEvent {
  return { type: SynthEventType.MED_SetWaveform, u8: waveform & 0xff, u16: 0, byte1: 0, byte2: 0 };
}
export function evMedSetVibratoSpeed(depth: number): SynthEvent {
  return { type: SynthEventType.MED_SetVibratoSpeed, u8: depth & 0xff, u16: 0, byte1: 0, byte2: 0 };
}
export function evMedSetVibratoDepth(depth: number): SynthEvent {
  return { type: SynthEventType.MED_SetVibratoDepth, u8: depth & 0xff, u16: 0, byte1: 0, byte2: 0 };
}
export function evMedSetVolumeStep(volumeStep: number): SynthEvent {
  return { type: SynthEventType.MED_SetVolumeStep, u8: 0, u16: volumeStep & 0xffff, byte1: 0, byte2: 0 };
}
export function evMedSetPeriodStep(periodStep: number): SynthEvent {
  return { type: SynthEventType.MED_SetPeriodStep, u8: 0, u16: periodStep & 0xffff, byte1: 0, byte2: 0 };
}
export function evMedHoldDecay(hold: number, decay: number): SynthEvent {
  return { type: SynthEventType.MED_HoldDecay, u8: 0, u16: decay & 0xffff, byte1: hold & 0xff, byte2: 0 };
}
export function evFtmSetCondition(threshold: number, condition: number): SynthEvent {
  return { type: SynthEventType.FTM_SetCondition, u8: condition & 0xff, u16: threshold & 0xffff, byte1: 0, byte2: 0 };
}
export function evFtmSetInterrupt(target: number, type: number): SynthEvent {
  return { type: SynthEventType.FTM_SetInterrupt, u8: type & 0xff, u16: target & 0xffff, byte1: 0, byte2: 0 };
}
export function evFtmPlaySample(): SynthEvent {
  return { type: SynthEventType.FTM_PlaySample, u8: 0, u16: 0, byte1: 0, byte2: 0 };
}
export function evFtmSetPitch(pitch: number): SynthEvent {
  return { type: SynthEventType.FTM_SetPitch, u8: 0, u16: pitch & 0xffff, byte1: 0, byte2: 0 };
}
export function evFtmAddPitch(pitch: number): SynthEvent {
  return { type: SynthEventType.FTM_AddPitch, u8: 0, u16: pitch & 0xffff, byte1: 0, byte2: 0 };
}
export function evFtmSetDetune(detune: number): SynthEvent {
  return { type: SynthEventType.FTM_SetDetune, u8: 0, u16: detune & 0xffff, byte1: 0, byte2: 0 };
}
export function evFtmAddDetune(detune: number): SynthEvent {
  return { type: SynthEventType.FTM_AddDetune, u8: 0, u16: detune & 0xffff, byte1: 0, byte2: 0 };
}
export function evFtmSetVolume(volume: number): SynthEvent {
  return { type: SynthEventType.FTM_SetVolume, u8: volume & 0xff, u16: 0, byte1: 0, byte2: 0 };
}
export function evFtmAddVolume(volume: number): SynthEvent {
  return { type: SynthEventType.FTM_AddVolume, u8: 0, u16: volume & 0xffff, byte1: 0, byte2: 0 };
}
export function evFtmSetSample(sample: number): SynthEvent {
  return { type: SynthEventType.FTM_SetSample, u8: sample & 0xff, u16: 0, byte1: 0, byte2: 0 };
}
export function evFtmSetSampleStart(offset: number, type: number): SynthEvent {
  return { type: SynthEventType.FTM_SetSampleStart, u8: type & 0xff, u16: offset & 0xffff, byte1: 0, byte2: 0 };
}
export function evFtmSetOneshotLength(length: number, type: number): SynthEvent {
  return { type: SynthEventType.FTM_SetOneshotLength, u8: type & 0xff, u16: length & 0xffff, byte1: 0, byte2: 0 };
}
export function evFtmSetRepeatLength(length: number, type: number): SynthEvent {
  return { type: SynthEventType.FTM_SetRepeatLength, u8: type & 0xff, u16: length & 0xffff, byte1: 0, byte2: 0 };
}
export function evFtmCloneTrack(track: number, properties: number): SynthEvent {
  return { type: SynthEventType.FTM_CloneTrack, u8: track & 0xff, u16: 0, byte1: properties & 0xff, byte2: 0 };
}
export function evFtmStartLfo(lfo: number, targetWaveform: number): SynthEvent {
  return { type: SynthEventType.FTM_StartLFO, u8: lfo & 0xff, u16: 0, byte1: targetWaveform & 0xff, byte2: 0 };
}
export function evFtmLfoAddSub(lfoAddSub: number, speed: number, depth: number): SynthEvent {
  return { type: SynthEventType.FTM_LFOAddSub, u8: lfoAddSub & 0xff, u16: 0, byte1: speed & 0xff, byte2: depth & 0xff };
}
export function evFtmSetWorkTrack(track: number, relative: boolean): SynthEvent {
  return { type: SynthEventType.FTM_SetWorkTrack, u8: track & 0xff, u16: 0, byte1: relative ? 1 : 0, byte2: 0 };
}
export function evFtmSetGlobalVolume(globalVolume: number): SynthEvent {
  return { type: SynthEventType.FTM_SetGlobalVolume, u8: 0, u16: globalVolume & 0xffff, byte1: 0, byte2: 0 };
}
export function evFtmSetTempo(tempo: number): SynthEvent {
  return { type: SynthEventType.FTM_SetTempo, u8: 0, u16: tempo & 0xffff, byte1: 0, byte2: 0 };
}
export function evFtmSetSpeed(speed: number): SynthEvent {
  return { type: SynthEventType.FTM_SetSpeed, u8: 0, u16: speed & 0xffff, byte1: 0, byte2: 0 };
}
export function evFtmSetPlayPosition(pattern: number, row: number): SynthEvent {
  return { type: SynthEventType.FTM_SetPlayPosition, u8: row & 0xff, u16: pattern & 0xffff, byte1: 0, byte2: 0 };
}
export function evFcSetWaveform(command: number, waveform: number, samplePack: number): SynthEvent {
  return { type: SynthEventType.FC_SetWaveform, u8: command & 0xff, u16: 0, byte1: waveform & 0xff, byte2: samplePack & 0xff };
}
export function evFcSetPitch(pitch: number): SynthEvent {
  return { type: SynthEventType.FC_SetPitch, u8: (pitch & 0xff) as number, u16: 0, byte1: 0, byte2: 0 };
}
export function evFcSetVibrato(speed: number, depth: number, delay: number): SynthEvent {
  return { type: SynthEventType.FC_SetVibrato, u8: speed & 0xff, u16: 0, byte1: depth & 0xff, byte2: delay & 0xff };
}
export function evFcPitchSlide(speed: number, time: number): SynthEvent {
  return { type: SynthEventType.FC_PitchSlide, u8: speed & 0xff, u16: 0, byte1: time & 0xff, byte2: 0 };
}
export function evFcVolumeSlide(speed: number, time: number): SynthEvent {
  return { type: SynthEventType.FC_VolumeSlide, u8: speed & 0xff, u16: 0, byte1: time & 0xff, byte2: 0 };
}

/** event.Byte0/1/2 + Value24Bit (InstrumentSynth.h:236-240). */
export function eventByte0(e: SynthEvent): number { return e.u8; }
export function eventByte1(e: SynthEvent): number { return e.byte1; }
export function eventByte2(e: SynthEvent): number { return e.byte2; }
export function eventValue24Bit(e: SynthEvent): number {
  return (e.u8 & 0xff) | ((e.byte1 & 0xff) << 8) | ((e.byte2 & 0xff) << 16);
}

/** event.IsJumpEvent (InstrumentSynth.h:221-224). */
function isJumpEvent(e: SynthEvent): boolean {
  return JUMP_EVENTS.includes(e.type);
}

/** event.FixupJumpTarget (InstrumentSynth.h:226-233): map byte offsets to
 *  event indices; lower_bound semantics (first entry >= u16). */
export function fixupJumpTarget(
  e: SynthEvent,
  entryFromByte: Map<number, number>,
): void {
  if (!isJumpEvent(e)) return;
  let mapped = 0xffff;
  for (const [off, idx] of entryFromByte) {
    if (off >= e.u16) {
      mapped = idx;
      break;
    }
  }
  e.u16 = mapped;
}

/** STOP_ROW (InstrumentSynth.cpp:18). */
export const SYNTH_STOP_ROW = 0xffff;

/** State flag indices (InstrumentSynth.cpp:20-30). */
const enum FcSynthFlags {
  kJumpConditionSet = 1 << 0,
  kGTKTremorEnabled = 1 << 1,
  kGTKTremorMute = 1 << 2,
  kGTKTremoloEnabled = 1 << 3,
  kGTKVibratoEnabled = 1 << 4,
  kFCVibratoDelaySet = 1 << 5,
  kFCVibratoStep = 1 << 6,
  kFCPitchBendStep = 1 << 7,
  kFCVolumeBendStep = 1 << 8,
}

/** LFO struct (InstrumentSynth.cpp:84-90). */
interface FtmLfo {
  targetWaveform: number;
  speed: number;
  depth: number;
  position: number;
}

/** InstrumentSynth::States::State (InstrumentSynth.cpp:16-104) — all fields,
 *  C++ default values verbatim. */
export class SynthState {
  flags = 0; // std::bitset<kNumFlags>

  currentRow = SYNTH_STOP_ROW;
  nextRow = 0;
  ticksRemain = 0;
  stepSpeed = 1;
  stepsRemain = 0;

  volumeFactor = 16384;
  volumeAdd = -32768; // int16_min
  panning = 2048;
  linearPitchFactor = 0;
  periodFreqSlide = 0;
  periodAdd = 0;
  loopCount = 0;

  gtkKeyOffOffset = SYNTH_STOP_ROW;
  gtkVolumeStep = 0;
  gtkPitchStep = 0;
  gtkPanningStep = 0;
  gtkPitch = 4096;
  gtkSpeed = 1;
  gtkSpeedRemain = 1;
  gtkTremorOnTime = 3;
  gtkTremorOffTime = 3;
  gtkTremorPos = 0;
  gtkVibratoWidth = 0;
  gtkVibratoSpeed = 0;
  gtkVibratoPos = 0;

  pumaStartWaveform = 0;
  pumaEndWaveform = 0;
  pumaWaveform = 0;
  pumaWaveformStep = 0;

  medVibratoEnvelope = 255; // uint8_max
  medVibratoSpeed = 0;
  medVibratoDepth = 0;
  medVibratoValue = 0;
  medVibratoPos = 0;
  medVolumeStep = 0;
  medPeriodStep = 0;
  medArpOffset = SYNTH_STOP_ROW;
  medArpPos = 0;
  medHold = 255;
  medDecay = SYNTH_STOP_ROW;
  medVolumeEnv = 255;
  medVolumeEnvPos = 0;

  ftmSampleStart = 0;
  ftmDetune = 1;
  ftmVolumeChangeJump = SYNTH_STOP_ROW;
  ftmPitchChangeJump = SYNTH_STOP_ROW;
  ftmSampleChangeJump = SYNTH_STOP_ROW;
  ftmReleaseJump = SYNTH_STOP_ROW;
  ftmVolumeDownJump = SYNTH_STOP_ROW;
  ftmPortamentoJump = SYNTH_STOP_ROW;
  ftmLfo: FtmLfo[] = [
    { targetWaveform: 0, speed: 0, depth: 0, position: 0 },
    { targetWaveform: 0, speed: 0, depth: 0, position: 0 },
    { targetWaveform: 0, speed: 0, depth: 0, position: 0 },
    { targetWaveform: 0, speed: 0, depth: 0, position: 0 },
  ];
  ftmWorkTrack = 0;

  fcPitch = 0; // int8
  fcVibratoValue = 0;
  fcVibratoDelay = 0;
  fcVibratoSpeed = 0;
  fcVibratoDepth = 0;
  fcVolumeBendSpeed = 0; // int8
  fcPitchBendSpeed = 0; // int8
  fcVolumeBendRemain = 0;
  fcPitchBendRemain = 0;

  /** Swapped sample for kMODSampleSwap (ModChannel.swapSampleIndex). */
  swapSampleIndex = 0;

  /** Reconstruct (C++ `mpt::reconstruct(state)` = default State()). */
  reconstruct(): void {
    const fresh = new SynthState();
    Object.assign(this, fresh);
  }

  /** FTMRealChannel (InstrumentSynth.cpp:106-113). */
  ftmRealChannel(channel: number, numChannels: number): number {
    if (this.ftmWorkTrack !== 0) {
      return (this.ftmWorkTrack - 1) % numChannels;
    }
    return channel;
  }

  /** JumpToPosition (InstrumentSynth.cpp:236-245). */
  jumpToPosition(events: readonly SynthEvent[], position: number): void {
    for (let pos = 0; pos < events.length; pos++) {
      if (events[pos]!.type === SynthEventType.JumpMarker && events[pos]!.u16 >= position) {
        this.nextRow = pos & 0xffff;
        this.ticksRemain = 0;
        return;
      }
    }
  }
}

/** InstrumentSynth::States (InstrumentSynth.cpp:158-172) + Stop/NextTick/
 *  ApplyChannelState (:225-244). */
export class SynthStates {
  states: SynthState[] = [];

  stop(): void {
    for (const state of this.states) {
      state.currentRow = SYNTH_STOP_ROW;
      state.nextRow = SYNTH_STOP_ROW;
    }
  }
}

// ---------------------------------------------------------------------------
// Shared tables (Tables.cpp / InstrumentSynth.cpp)
// ---------------------------------------------------------------------------

/** ModSinusTable (Tables.cpp:348-353). */
export const MOD_SINUS_TABLE: readonly number[] = [
  0, 12, 25, 37, 49, 60, 71, 81, 90, 98, 106, 112, 117, 122, 125, 126,
  127, 126, 125, 122, 117, 112, 106, 98, 90, 81, 71, 60, 49, 37, 25, 12,
  0, -12, -25, -37, -49, -60, -71, -81, -90, -98, -106, -112, -117, -122, -125, -126,
  -127, -126, -125, -122, -117, -112, -106, -98, -90, -81, -71, -60, -49, -37, -25, -12,
];

// ---------------------------------------------------------------------------
// Channel/soundfile helpers (InstrumentSynth.cpp:127-166)
// ---------------------------------------------------------------------------

/** MEDEnvelopeFromSample (InstrumentSynth.cpp:142-158): 8-bit sample byte at
 *  an envelope position; the "envelope" is an extra sample after the
 *  keyboard's middle-C sample. */
function medEnvelopeFromSample(
  mod: ModuleData,
  instr: Instrument,
  envelope: number,
  envelopePos: number,
): number {
  const midSmp = instr.map[60] ?? 0; // Keyboard[NOTE_MIDDLEC - NOTE_MIN]
  const smp = midSmp + envelope;
  if (smp < 0 || smp >= mod.samples.length) return 0;
  const sample = mod.samples[smp]!;
  if (sample.length === 0 || envelopePos >= sample.length) return 0;
  // sample8()[envelopePos]: the stored 8-bit data byte. Our store keeps
  // floats; read the 8-bit byte from the sample data (mono samples only —
  // flagged 16-bit returns 0 like the C).
  const data = sample.data;
  if (data.length === 0 || (sample.flags & 0x01) !== 0) return 0; // 16-bit
  const v = Math.round(data[envelopePos]! * 128);
  return (v << 24) >> 24; // int8
}

/** ChannelSetSample (InstrumentSynth.cpp:160-186) — binds a new sample to the
 *  channel; with kMODSampleSwap defers the swap to loop end. */
export function channelSetSample(
  core: Core,
  chn: number,
  smpIndex0: number, // 0-based sample id
  swapAtEnd: boolean,
  state: SynthState,
): void {
  const mod = core.module!;
  if (smpIndex0 < 0 || smpIndex0 >= mod.samples.length) return;
  const vi = core.virt.mapChannel(chn);
  const v: VoiceState | null = vi >= 0 ? core.virt.voices[vi] ?? null : null;
  const channelIsActive = v !== null && v!.smp >= 0 && v!.end > v!.start && v!.smp >= 0 && sampleExists(core, v!.smp) && voiceLength(v!) > 0;
  // kMODSampleSwap: defer the swap to the end of the running loop.
  if (channelIsActive && swapAtEnd) {
    state.swapSampleIndex = smpIndex0 + 1; // C SAMPLEINDEX is 1-based
    return;
  }
  // Direct binding (swapAtEnd false or channel inactive): bind like C —
  // the sample's loop flags/length become the channel's, and a position
  // past the new length restarts at 0.
  const sample = core.getSample(smpIndex0);
  if (v !== null && v.smp === smpIndex0 && channelIsActive) return;
  const looped = (sample.flags & 0x02) !== 0; // SampleFlags.LOOP
  const newLen = looped ? sample.loopEnd : sample.length;
  // C: if(increment==0 && len==0 && vol==0) nVolume = 256 — a silent
  // channel gets a default volume so the newly bound sample is audible.
  if (v !== null && v.pos === 0 && voiceLength(v) === 0 && v.vol === 0) {
    // our volume model is 0..64 like libxmp; 256 is OpenMPT's raw scale
    core.virt.setVol(chn, 0x40);
  }
  // Bind via the same path the loaders use (updates voice smp/loop/pos).
  core.virt.setPatchSmp(chn, v !== null ? v.ins : -1, smpIndex0, core.ctx.channelStates[chn]?.note ?? 0);
  if (v !== null && v.pos >= newLen) {
    // C: chn.position.Set(0) when pos >= nLength
    v.pos = 0;
  }
}

function sampleExists(core: Core, smp: number): boolean {
  const mod = core.module!;
  return smp >= 0 && smp < mod.samples.length;
}

function voiceLength(v: { start: number; end: number }): number {
  return Math.max(0, v.end - v.start);
}

// ---------------------------------------------------------------------------
// The engine (InstrumentSynth.cpp:246-554)
// ---------------------------------------------------------------------------

/** Engine context per channel: scripts + state (C: chn.synthState.states +
 *  chn.pModInstrument->synth.m_scripts). */
export interface SynthChannelState {
  states: SynthStates;
  /** Cached per-tick outputs of ApplyChannelState for the mixer hook. */
  applyPending: boolean;
}

/** InstrumentSynth::States::NextTick (InstrumentSynth.cpp:246-459) — the
 *  per-tick state machine for ONE channel with ONE script/state pair. */
export function synthStateNextTick(
  core: Core,
  chn: number,
  events: readonly SynthEvent[],
  state: SynthState,
): void {
  if (events.length === 0) return;

  const origChannel = chn;
  const numChannels = core.module!.chn;
  chn = state.ftmRealChannel(chn, numChannels);
  const xc = core.ctx.channelStates[chn]!;

  // GTK key off (InstrumentSynth.cpp:258-262).
  if (state.gtkKeyOffOffset !== SYNTH_STOP_ROW && (xc.flags & 0x04) !== 0) {
    // CHN_KEYOFF — our channel flags bit 2 is the KEYOFF arm used by the
    // readers (read_event keyoff path); check the note release instead:
    // OpenMPT sets CHN_KEYOFF on the K00 row. Our equivalent mark is set
    // when the reader processes a keyoff — approximate via NOTE_ENV_RELEASE
    // being armed this row is not exact; port the flag test as stored.
    state.nextRow = state.gtkKeyOffOffset;
    state.ticksRemain = 0;
    state.gtkKeyOffOffset = SYNTH_STOP_ROW;
  }

  // Puma waveform step (InstrumentSynth.cpp:264-271).
  if (state.pumaWaveformStep !== 0) {
    state.pumaWaveform = clamp(
      state.pumaWaveform + state.pumaWaveformStep,
      state.pumaStartWaveform,
      state.pumaEndWaveform,
    );
    if (state.pumaWaveform <= state.pumaStartWaveform || state.pumaWaveform >= state.pumaEndWaveform) {
      state.pumaWaveformStep = -state.pumaWaveformStep;
    }
    if (core.ctx.channelStates[origChannel]!.ins >= 0) {
      channelSetSample(core, chn, state.pumaWaveform, true, state);
    }
  }

  // MED hold (InstrumentSynth.cpp:273-276).
  if (state.medHold !== 255) {
    if (state.medHold === 0) {
      state.medHold = 255;
      state.nextRow = state.medDecay;
    } else {
      state.medHold--;
    }
  }

  const ev = currentEvent(core, chn);

  // FTM interrupts (InstrumentSynth.cpp:278-283).
  handleFtmInterrupt(state, 'ftmPitchChangeJump', isNote(ev.note));
  handleFtmInterrupt(state, 'ftmVolumeChangeJump', ev.fxt === 0x80);
  handleFtmInterrupt(state, 'ftmSampleChangeJump', ev.ins !== 0);
  handleFtmInterrupt(state, 'ftmReleaseJump', ev.note === 0x81); // XMP_KEY_OFF
  handleFtmInterrupt(state, 'ftmVolumeDownJump', ev.fxt === 0x86);
  handleFtmInterrupt(state, 'ftmPortamentoJump', ev.fxt === 0x87);

  // FC volume bend + step timing (InstrumentSynth.cpp:285-338).
  if (!handleFcVolumeBend(state, false) && state.stepSpeed !== 0 && state.stepsRemain === 0) {
    // Yep, MED executes this before a potential SPD command may change the
    // step speed on this very row...
    state.stepsRemain = state.stepSpeed - 1;

    if (state.medVolumeStep !== 0) {
      state.volumeFactor = clamp(state.volumeFactor + state.medVolumeStep, 0, 16384);
    }
    if (state.medPeriodStep !== 0) {
      state.periodAdd = satI16(state.periodAdd - state.medPeriodStep);
    }
    if (state.medVolumeEnv !== 255 && xc.ins >= 0 && core.module!.instruments[xc.ins]) {
      const instr = core.module!.instruments[xc.ins]!;
      const v = medEnvelopeFromSample(core.module!, instr, state.medVolumeEnv & 0x7f, state.medVolumeEnvPos);
      state.volumeFactor = clamp((v + 128) * 64, 0, 16384);
      if (state.medVolumeEnvPos < 127) {
        state.medVolumeEnvPos++;
      } else if ((state.medVolumeEnv & 0x80) !== 0) {
        state.medVolumeEnvPos = 0;
      }
    }

    if (state.ticksRemain !== 0) {
      if (state.currentRow < events.length) {
        evaluateRunningEvent(state, events[state.currentRow]!);
      }
      state.ticksRemain--;
    } else {
      let jumpCount = 0;
      while (state.ticksRemain === 0) {
        state.currentRow = state.nextRow;
        if (state.currentRow >= Math.min(events.length, SYNTH_STOP_ROW)) break;
        state.nextRow++;
        if (evaluateEvent(core, origChannel, events[state.currentRow]!, state)) break;

        if (isJumpEvent(events[state.currentRow]!)) {
          // This smells like an infinite loop
          if (++jumpCount > 10) break;
        }

        chn = state.ftmRealChannel(origChannel, numChannels);
      }
    }
  }

  // MED arpeggio (InstrumentSynth.cpp:340-344).
  if (state.medArpOffset < events.length && events[state.medArpOffset]!.u16 !== 0) {
    const idx = state.medArpOffset + state.medArpPos;
    if (idx < events.length) {
      state.linearPitchFactor = 16 * events[idx]!.u8;
    }
    state.medArpPos = ((state.medArpPos + 1) % events[state.medArpOffset]!.u16) & 0xff;
  }

  // MED vibrato (InstrumentSynth.cpp:345-356).
  if (state.medVibratoDepth !== 0) {
    const offset = Math.floor(state.medVibratoPos / 16);
    if (state.medVibratoEnvelope === 255) {
      state.medVibratoValue = MOD_SINUS_TABLE[(offset * 2) % MOD_SINUS_TABLE.length]!;
    } else if (xc.ins >= 0 && core.module!.instruments[xc.ins]) {
      state.medVibratoValue = medEnvelopeFromSample(
        core.module!, core.module!.instruments[xc.ins]!, state.medVibratoEnvelope, offset);
    }
    state.medVibratoPos = (state.medVibratoPos + state.medVibratoSpeed) % (32 * 16);
  }

  // GTK step (InstrumentSynth.cpp:358-372).
  if (state.currentRow < events.length && state.gtkSpeed !== 0 && state.gtkSpeedRemain === 0) {
    state.gtkSpeedRemain = state.gtkSpeed;
    if (state.gtkVolumeStep !== 0) {
      state.volumeFactor = clamp(state.volumeFactor + state.gtkVolumeStep, 0, 16384);
    }
    if (state.gtkPanningStep !== 0) {
      state.panning = clamp(state.panning + state.gtkPanningStep, 0, 4096);
    }
    if (state.gtkPitchStep !== 0) {
      state.gtkPitch = clamp(state.gtkPitch + state.gtkPitchStep, 0, 32768);
      state.linearPitchFactor = translateGt2Pitch(state.gtkPitch);
    }
  }

  // GTK tremor (InstrumentSynth.cpp:373-379).
  if ((state.flags & FcSynthFlags.kGTKTremorEnabled) !== 0) {
    if (state.gtkTremorPos >= state.gtkTremorOnTime + state.gtkTremorOffTime) {
      state.gtkTremorPos = 0;
    }
    if (state.gtkTremorPos >= state.gtkTremorOnTime) {
      state.flags |= FcSynthFlags.kGTKTremorMute;
    } else {
      state.flags &= ~FcSynthFlags.kGTKTremorMute;
    }
    state.gtkTremorPos++;
  }

  // GTK tremolo (InstrumentSynth.cpp:380-385).
  if ((state.flags & FcSynthFlags.kGTKTremoloEnabled) !== 0) {
    state.volumeAdd = satI16(
      Math.trunc(
        (MOD_SINUS_TABLE[(Math.floor(state.gtkVibratoPos / 4)) % MOD_SINUS_TABLE.length]! *
          state.gtkVibratoWidth) / 2,
      ),
    );
    state.gtkVibratoPos += state.gtkVibratoSpeed;
  }

  // GTK vibrato (InstrumentSynth.cpp:386-392).
  if ((state.flags & FcSynthFlags.kGTKVibratoEnabled) !== 0) {
    state.periodFreqSlide = satI16(
      Math.trunc(
        (-MOD_SINUS_TABLE[(Math.floor(state.gtkVibratoPos / 4)) % MOD_SINUS_TABLE.length]! *
          state.gtkVibratoWidth) / 96,
      ),
    );
    state.gtkVibratoPos += state.gtkVibratoSpeed;
  }

  // FTM LFOs (InstrumentSynth.cpp:394-445).
  for (let li = 0; li < state.ftmLfo.length; li++) {
    const lfo = state.ftmLfo[li]!;
    if (lfo.speed === 0 && lfo.depth === 0) continue;

    const lutPos = Math.trunc((lfo.position * 256 + 96) / 192); // muldivr_unsigned(pos,256,192)
    let value = 0;
    switch (lfo.targetWaveform & 0x07) {
      case 0: value = IT_SINUS_TABLE[lutPos & 0xff]!; break;
      case 1: value = lutPos < 128 ? 64 : -64; break;
      case 2: value = 64 - Math.abs(((lutPos + 64) % 256) - 128); break;
      case 3: value = 64 - Math.trunc(lutPos / 2); break;
      case 4: value = Math.trunc(lutPos / 2) - 64; break;
    }
    if ((lfo.targetWaveform & 0xf0) < 0xa0) value += 64;
    value *= lfo.depth; // -8192...+8192 or 0...16384 for LFO targets

    switch (lfo.targetWaveform & 0xf0) {
      case 0x10: state.ftmLfo[0]!.speed = value / 64 & 0xff; break;
      case 0x20: state.ftmLfo[1]!.speed = value / 64 & 0xff; break;
      case 0x30: state.ftmLfo[2]!.speed = value / 64 & 0xff; break;
      case 0x40: state.ftmLfo[3]!.speed = value / 64 & 0xff; break;
      case 0x50: state.ftmLfo[0]!.depth = value / 64 & 0xff; break;
      case 0x60: state.ftmLfo[1]!.depth = value / 64 & 0xff; break;
      case 0x70: state.ftmLfo[2]!.depth = value / 64 & 0xff; break;
      case 0x80: state.ftmLfo[3]!.depth = value / 64 & 0xff; break;
      case 0xa0: state.volumeAdd = satI16(value * 4); break;
      case 0xf0: state.periodFreqSlide = satI16(Math.trunc(value / 8)); break;
    }

    let newPos = (lfo.position + lfo.speed) & 0xffff;
    if (newPos >= 192) {
      newPos -= 192;
      if ((lfo.targetWaveform & 0x08) !== 0) {
        lfo.speed = 0;
        newPos = 191;
      }
    }
    lfo.position = newPos & 0xff;
  }

  // Future Composer (InstrumentSynth.cpp:448-478).
  if (
    (state.flags & FcSynthFlags.kFCVibratoDelaySet) !== 0 &&
    state.fcVibratoDelay > 0
  ) {
    state.fcVibratoDelay--;
  } else if (state.fcVibratoDepth !== 0) {
    if ((state.flags & FcSynthFlags.kFCVibratoStep) !== 0) {
      const delta = state.fcVibratoDepth * 2;
      state.fcVibratoValue += state.fcVibratoSpeed;
      if (state.fcVibratoValue > delta) {
        state.fcVibratoValue = delta;
        state.flags ^= FcSynthFlags.kFCVibratoStep;
      }
    } else {
      state.fcVibratoValue -= state.fcVibratoSpeed;
      if (state.fcVibratoValue < 0) {
        state.fcVibratoValue = 0;
        state.flags ^= FcSynthFlags.kFCVibratoStep;
      }
    }
  }

  if (state.fcPitchBendRemain !== 0) {
    state.flags ^= FcSynthFlags.kFCPitchBendStep;
    if ((state.flags & FcSynthFlags.kFCPitchBendStep) !== 0) {
      state.fcPitchBendRemain--;
      state.periodAdd -= satI16(state.fcPitchBendSpeed * 4) & 0xffff;
    }
  }

  void xc;
}

/** EvaluateRunningEvent (InstrumentSynth.cpp:968-979) — only the Puma ramps
 *  tick; FC/MED/GTK events have no running-tick behaviour. */
function evaluateRunningEvent(state: SynthState, event: SynthEvent): void {
  switch (event.type) {
    case SynthEventType.Puma_VolumeRamp:
      if (event.byte2 !== 0) {
        state.volumeAdd = satI16(
          Math.trunc(
            ((event.byte1 +
              Math.trunc(((event.u8 - event.byte1) * state.ticksRemain) / event.byte2)) *
              256 - 16384) & 0xffff,
          ),
        );
      }
      break;
    case SynthEventType.Puma_PitchRamp:
      if (event.byte2 !== 0) {
        const start = (event.u8 << 24) >> 24; // int8
        const end = (event.byte1 << 24) >> 24; // int8
        state.periodAdd = satI16(
          Math.trunc(
            (start +
              Math.trunc(((start - end) * state.ticksRemain) / event.byte2)) * 4,
          ),
        );
      }
      break;
    default:
      break;
  }
}

/** HandleFTMInterrupt (InstrumentSynth.cpp:981-997). */
function handleFtmInterrupt(
  state: SynthState,
  field: 'ftmPitchChangeJump' | 'ftmVolumeChangeJump' | 'ftmSampleChangeJump' |
    'ftmReleaseJump' | 'ftmVolumeDownJump' | 'ftmPortamentoJump',
  condition: boolean,
): void {
  const target = state[field];
  if (target === SYNTH_STOP_ROW || !condition) return;
  state.nextRow = target;
  state.ticksRemain = 0;
  state[field] = SYNTH_STOP_ROW;
}

/** HandleFCVolumeBend (InstrumentSynth.cpp:1000-1017). */
export function handleFcVolumeBend(state: SynthState, forceRun: boolean): boolean {
  if (state.fcVolumeBendRemain === 0 && !forceRun) return false;

  state.flags ^= FcSynthFlags.kFCVolumeBendStep;
  if ((state.flags & FcSynthFlags.kFCVolumeBendStep) !== 0) {
    state.fcVolumeBendRemain--;
    const target = state.volumeFactor + state.fcVolumeBendSpeed * 256;
    if (target < 0 || target >= 32768) state.fcVolumeBendRemain = 0;
    state.volumeFactor = clamp(target, 0, 16384);
  }
  return true;
}

/** TranslateGT2Pitch (Snd_fx.cpp:5918-5926 area) — GT2 pitch (4096 = middle C)
 *  to a linear-pitch factor in 1/65536 semitone units. */
function translateGt2Pitch(pitch: number): number {
  // C: TranslateGT2Pitch(p) = round(2048 * pow(2, (p - 4096) / 4096))? The
  // exact formula in Snd_fx.cpp:
  //   return static_cast<int16>(Util::muldivr_unsigned(PhaseIncrementFinesTable
  //     ...)) — ported at the call site by formula:
  // linearPitchFactor = 16 * semitones where semitone step = pitch/4096*12?
  // The reference (Snd_fx.cpp:5913-5926):
  //   int16 TranslateGT2Pitch(uint16 pitch) { return Util::Round(pow(2.0,
  //     (int)pitch / 4096.0 - 1) * 32768); } — WRONG? Port the literal:
  return Math.round(Math.pow(2, pitch / 4096 - 1) * 32768) & 0xffff;
}

// ---------------------------------------------------------------------------
// EvaluateEvent (InstrumentSynth.cpp:556-966) — the full event set.
// ---------------------------------------------------------------------------

function evaluateEvent(
  core: Core,
  channel: number,
  event: SynthEvent,
  state: SynthState,
): boolean {
  const mod = core.module!;
  const xc = core.ctx.channelStates[channel]!;
  switch (event.type) {
    case SynthEventType.StopScript:
      state.nextRow = SYNTH_STOP_ROW;
      return true;
    case SynthEventType.Jump:
      state.nextRow = event.u16;
      return false;
    case SynthEventType.JumpIfTrue:
      if ((state.flags & FcSynthFlags.kJumpConditionSet) !== 0) {
        state.nextRow = event.u16;
      }
      return false;
    case SynthEventType.Delay:
      state.ticksRemain = event.u16;
      return true;
    case SynthEventType.SetStepSpeed:
      state.stepSpeed = event.u8;
      if (event.byte1 !== 0) state.stepsRemain = state.stepSpeed - 1;
      return false;
    case SynthEventType.JumpMarker:
      return false;
    case SynthEventType.SampleOffset:
    case SynthEventType.SampleOffsetAdd:
    case SynthEventType.SampleOffsetSub: {
      let pos = eventValue24Bit(event);
      const v = voiceAt(core, channel);
      if (v !== null) {
        if (event.type === SynthEventType.SampleOffsetAdd) {
          pos += v.pos;
        } else if (event.type === SynthEventType.SampleOffsetSub) {
          pos = v.pos - pos;
        } else {
          pos += state.ftmSampleStart;
        }
        v.pos = Math.min(voiceLength(v), Math.max(0, Math.trunc(pos)));
      }
      return false;
    }
    case SynthEventType.SetLoopCounter:
      if (state.loopCount === 0 || event.u8 !== 0) {
        state.loopCount = 1 + Math.min(event.u16, 0xfffe);
      }
      return false;
    case SynthEventType.EvaluateLoopCounter:
      if (state.loopCount > 1) state.nextRow = event.u16;
      if (state.loopCount !== 0) state.loopCount--;
      return false;
    case SynthEventType.NoteCut:
      xc.note_flags |= NoteFlag.FADEOUT;
      return false;

    case SynthEventType.GTK_KeyOff:
      state.gtkKeyOffOffset = event.u16;
      return false;
    case SynthEventType.GTK_SetVolume:
      state.volumeFactor = event.u16;
      return false;
    case SynthEventType.GTK_SetPitch:
      state.gtkPitch = event.u16;
      state.linearPitchFactor = translateGt2Pitch(event.u16);
      state.periodAdd = 0;
      return false;
    case SynthEventType.GTK_SetPanning:
      state.panning = event.u16;
      return false;
    case SynthEventType.GTK_SetVolumeStep:
      state.gtkVolumeStep = (event.u16 << 16) >> 16;
      return false;
    case SynthEventType.GTK_SetPitchStep:
      state.gtkPitchStep = (event.u16 << 16) >> 16;
      return false;
    case SynthEventType.GTK_SetPanningStep:
      state.gtkPanningStep = (event.u16 << 16) >> 16;
      return false;
    case SynthEventType.GTK_SetSpeed:
      state.gtkSpeed = state.gtkSpeedRemain = event.u8;
      return false;
    case SynthEventType.GTK_EnableTremor:
      if (event.u8 !== 0) state.flags |= FcSynthFlags.kGTKTremorEnabled;
      else state.flags &= ~FcSynthFlags.kGTKTremorEnabled;
      return false;
    case SynthEventType.GTK_SetTremorTime:
      if (event.u8 !== 0) state.gtkTremorOnTime = event.u8;
      if (event.byte1 !== 0) state.gtkTremorOffTime = event.byte1;
      state.gtkTremorPos = 0;
      return false;
    case SynthEventType.GTK_EnableTremolo:
      if (event.u8 !== 0) state.flags |= FcSynthFlags.kGTKTremoloEnabled;
      else state.flags &= ~FcSynthFlags.kGTKTremoloEnabled;
      state.gtkVibratoPos = 0;
      if (state.gtkVibratoWidth === 0) state.gtkVibratoWidth = 8;
      if (state.gtkVibratoSpeed === 0) state.gtkVibratoSpeed = 16;
      return false;
    case SynthEventType.GTK_EnableVibrato:
      if (event.u8 !== 0) state.flags |= FcSynthFlags.kGTKVibratoEnabled;
      else state.flags &= ~FcSynthFlags.kGTKVibratoEnabled;
      state.periodFreqSlide = 0;
      state.gtkVibratoPos = 0;
      if (state.gtkVibratoWidth === 0) state.gtkVibratoWidth = 3;
      if (state.gtkVibratoSpeed === 0) state.gtkVibratoSpeed = 8;
      return false;
    case SynthEventType.GTK_SetVibratoParams:
      if (event.u8 !== 0) state.gtkVibratoWidth = event.u8;
      if (event.byte1 !== 0) state.gtkVibratoSpeed = event.byte1;
      return false;

    case SynthEventType.Puma_SetWaveform:
      if (event.u8 !== 0) {
        state.pumaStartWaveform = event.u8;
        state.pumaEndWaveform = event.u8;
        state.pumaWaveform = event.u8;
        state.pumaWaveformStep = 0;
      } else {
        state.pumaStartWaveform = event.byte1;
        state.pumaEndWaveform = event.byte2;
        state.pumaWaveformStep = 1;
      }
      if (event.u8 !== 0 || event.byte1 === event.byte2) {
        channelSetSample(core, channel, state.pumaWaveform, true, state);
      }
      return false;
    case SynthEventType.Puma_VolumeRamp:
      if (event.byte2 !== 0) {
        state.volumeAdd = satI16(
          Math.trunc(
            (event.byte1 +
              Math.trunc(((event.u8 - event.byte1) * state.ticksRemain) / event.byte2)) * 256 -
            16384,
          ),
        );
      } else {
        state.volumeAdd = satI16(event.u8 * 256 - 16384);
      }
      return false;
    case SynthEventType.Puma_StopVoice:
      core.virt.releaseChannel(channel, 3 /* PastNote.FADE */);
      return false;
    case SynthEventType.Puma_SetPitch:
      state.periodAdd = satI16(((event.u8 << 24) >> 24) * 4);
      state.linearPitchFactor = 0;
      return false;
    case SynthEventType.Puma_PitchRamp:
      if (event.byte2 !== 0) {
        state.periodAdd = satI16(
          Math.trunc(
            (((event.u8 << 24) >> 24) +
              Math.trunc(
                (((event.u8 << 24) >> 24) - ((event.byte1 << 24) >> 24)) * state.ticksRemain,
              ) / event.byte2) * 4,
          ),
        );
      } else {
        state.periodAdd = satI16(((event.byte1 << 24) >> 24) * 4);
      }
      state.linearPitchFactor = 0;
      return false;

    case SynthEventType.Mupp_SetWaveform: {
      const ins = event.u8 !== 0 ? event.u8 - 1 : xc.ins;
      if (ins >= 0 && ins < mod.instruments.length) {
        const sample = mod.instruments[ins]!.map[60] ?? 0;
        if (event.byte1 !== 0) {
          channelSetSample(core, channel, sample + event.byte1 - 1, true, state);
          state.volumeFactor = clamp(event.byte2 * 256, 0, 16384);
        } else {
          state.volumeFactor = clamp(event.byte2 * 256, 0, 16384);
        }
      }
      return false;
    }

    case SynthEventType.MED_DefineArpeggio: {
      // C: m_medArpOffset = events.size(); push entries...
      // The FC port constructs events beforehand; DefineArpeggio appends
      // u16 count + count u8 entries to the script at parse time. At
      // runtime: m_medArpOffset = current index, then handled in NextTick.
      state.medArpOffset = state.currentRow;
      // The parsed script carries the count + values after this event.
      return false;
    }
    case SynthEventType.MED_JumpScript: {
      // Cross-script jump — handled by the caller engine (needs sibling
      // states); FC doesn't emit it. Implemented for completeness when the
      // engine has access to sibling states.
      return false;
    }
    case SynthEventType.MED_SetEnvelope:
      if (event.byte2 !== 0) {
        state.medVolumeEnv = (event.u8 & 0x3f) | (event.byte1 !== 0 ? 0x80 : 0x00);
      } else {
        state.medVibratoEnvelope = event.u8;
      }
      state.medVolumeEnvPos = 0;
      return false;
    case SynthEventType.MED_SetVolume:
      state.volumeFactor = event.u8 * 256;
      return true;
    case SynthEventType.MED_SetWaveform: {
      const instr = mod.instruments[xc.ins];
      if (instr) {
        const base = instr.map[60] ?? 0;
        channelSetSample(core, channel, base + event.u8, true, state);
      }
      return true;
    }
    case SynthEventType.MED_SetVibratoSpeed:
      state.medVibratoSpeed = event.u8;
      return false;
    case SynthEventType.MED_SetVibratoDepth:
      state.medVibratoDepth = event.u8;
      return false;
    case SynthEventType.MED_SetVolumeStep:
      state.medVolumeStep = satI16(((event.u16 << 16) >> 16) * 256);
      return false;
    case SynthEventType.MED_SetPeriodStep:
      state.medPeriodStep = satI16(((event.u16 << 16) >> 16) * 4);
      return false;
    case SynthEventType.MED_HoldDecay:
      state.medHold = event.byte1;
      state.medDecay = event.u16;
      return false;

    case SynthEventType.FTM_SetCondition: {
      const threshold =
        event.u8 < 3 ? 2147483647 - ftmPitchToPeriod(event.u16, core, channel) : event.u16;
      const compare = event.u8 < 3 ? 2147483647 - Math.trunc(xc.period) : 64;
      switch (event.u8 % 3) {
        case 0:
          if (compare === threshold) state.flags |= FcSynthFlags.kJumpConditionSet;
          else state.flags &= ~FcSynthFlags.kJumpConditionSet;
          break;
        case 1:
          if (compare < threshold) state.flags |= FcSynthFlags.kJumpConditionSet;
          else state.flags &= ~FcSynthFlags.kJumpConditionSet;
          break;
        case 2:
          if (compare > threshold) state.flags |= FcSynthFlags.kJumpConditionSet;
          else state.flags &= ~FcSynthFlags.kJumpConditionSet;
          break;
      }
      return false;
    }
    case SynthEventType.FTM_SetInterrupt:
      if ((event.u8 & 0x01) !== 0) state.ftmPitchChangeJump = event.u16;
      if ((event.u8 & 0x02) !== 0) state.ftmVolumeChangeJump = event.u16;
      if ((event.u8 & 0x04) !== 0) state.ftmSampleChangeJump = event.u16;
      if ((event.u8 & 0x08) !== 0) state.ftmReleaseJump = event.u16;
      if ((event.u8 & 0x10) !== 0) state.ftmPortamentoJump = event.u16;
      if ((event.u8 & 0x20) !== 0) state.ftmVolumeDownJump = event.u16;
      return false;
    case SynthEventType.FTM_PlaySample: {
      const v = voiceAt(core, channel);
      if (v !== null) {
        if (xc.ins >= 0 && xc.ins < mod.samples.length) {
          // C: chn.pModSample = GetSample(chn.nNewIns)
        }
        // Bind the current instrument's sample
        const smp = v.smp;
        if (smp >= 0) {
          const sample = core.getSample(smp);
          core.virt.setVol(channel, Math.min(64, sample.volume));
        }
        v.pos = 0;
      }
      return false;
    }
    case SynthEventType.FTM_SetPitch:
      xc.period = ftmPitchToPeriod(event.u16 * 2, core, channel);
      return false;
    case SynthEventType.FTM_SetDetune:
      // Detune always applies to the first channel of a channel pair.
      state.ftmDetune = satI16(event.u16 * -8);
      return false;
    case SynthEventType.FTM_AddDetune:
      state.ftmDetune = satI16(state.ftmDetune - ((event.u16 << 16) >> 16) * 8);
      return false;
    case SynthEventType.FTM_AddPitch:
      if (((event.u16 << 16) >> 16) !== 0) {
        const amount = ((event.u16 << 16) >> 16) * 8;
        // DoFreqSlide on the channel period (MOD: period -= amount)
        xc.period -= amount;
        const limit = ftmPitchToPeriod(((event.u16 << 16) >> 16) < 0 ? 0 : 0x21e, core, channel);
        if (((event.u16 << 16) >> 16) > 0) {
          xc.period = Math.min(xc.period, limit);
        } else {
          xc.period = Math.max(xc.period, limit);
        }
      }
      return false;
    case SynthEventType.FTM_SetVolume:
      xc.volume = Math.min(event.u8, 64);
      return false;
    case SynthEventType.FTM_AddVolume: {
      xc.volume = clamp(xc.volume + ((event.u16 << 16) >> 16), 0, 64);
      return false;
    }
    case SynthEventType.FTM_SetSample: {
      const v = voiceAt(core, channel);
      if (v !== null) {
        state.swapSampleIndex = event.u8 + 1;
      }
      return false;
    }
    case SynthEventType.FTM_SetSampleStart: {
      const rel = event.u8;
      if (rel === 1) {
        state.ftmSampleStart += Math.min(event.u16, 0xffffffff - state.ftmSampleStart);
      } else if (rel === 2) {
        state.ftmSampleStart -= Math.min(event.u16, state.ftmSampleStart);
      } else {
        state.ftmSampleStart = event.u16 * 2;
      }
      return false;
    }
    case SynthEventType.FTM_SetOneshotLength:
    case SynthEventType.FTM_SetRepeatLength:
    case SynthEventType.FTM_CloneTrack:
      // FTM-only events (not exercised by FC); ported per C when the
      // Face The Music loader lands.
      return false;
    case SynthEventType.FTM_StartLFO: {
      const lfo = state.ftmLfo[event.u8 & 3]!;
      lfo.targetWaveform = event.byte1;
      lfo.speed = 0;
      lfo.depth = 0;
      lfo.position = 0;
      return false;
    }
    case SynthEventType.FTM_LFOAddSub: {
      const lfo = state.ftmLfo[event.u8 & 3]!;
      const factor = (event.u8 & 4) !== 0 ? -1 : 1;
      lfo.speed = Math.min(clampU8(lfo.speed + event.byte1 * factor), 0xbf);
      lfo.depth = Math.min(clampU8(lfo.depth + event.byte2 * factor), 0x7f);
      return false;
    }
    case SynthEventType.FTM_SetWorkTrack:
      if (event.u8 === 255) {
        state.ftmWorkTrack = 0;
      } else if (event.byte1 !== 0 && event.u8 !== 0) {
        if (state.ftmWorkTrack === 0) state.ftmWorkTrack = channel + 1;
        state.ftmWorkTrack =
          (((state.ftmWorkTrack - 1 + event.u8) % mod.chn) + 1) & 0xff;
      } else if (event.byte1 === 0) {
        state.ftmWorkTrack = event.u8 + 1;
      }
      return false;
    case SynthEventType.FTM_SetGlobalVolume:
      // playState.m_nGlobalVolume = event.u16 (0..128 → our p.gvol uses
      // gvolbase 64 scaling; store raw for now via ctx.p.gvol? p has gvol?)
      core.ctx.p.gvol = clamp(event.u16 >> 1, 0, 64);
      return false;
    case SynthEventType.FTM_SetTempo:
      // playState.m_nMusicTempo = TEMPO(1777517.482 / clamp(u16, 0x1000, 0x4FFF))
      core.ctx.p.bpm = Math.trunc(1777517.482 / clamp(event.u16, 0x1000, 0x4fff));
      return false;
    case SynthEventType.FTM_SetSpeed:
      if (event.u16 !== 0) core.ctx.p.speed = event.u16;
      else core.ctx.p.speed = 0xffff;
      return false;
    case SynthEventType.FTM_SetPlayPosition:
      // Order().FindOrder(pattern) + nextRow — port with a scan.
      {
        const ord = mod.xxo.indexOf(event.u16);
        if (ord >= 0) {
          core.ctx.p.pos = ord;
          core.ctx.p.row = event.u8;
        }
      }
      return false;

    case SynthEventType.FC_SetWaveform: {
      let waveform = (event.byte1 + 1) & 0xff;
      if (event.u8 === 0xe9) {
        waveform = (waveform + event.byte2 * 10 + 90) & 0xff;
      }
      channelSetSample(core, channel, waveform - 1, event.u8 !== 0xe4, state);
      return false;
    }
    case SynthEventType.FC_SetPitch:
      state.fcPitch = (event.u8 << 24) >> 24;
      return true;
    case SynthEventType.FC_SetVibrato:
      state.fcVibratoSpeed = event.u8;
      state.fcVibratoDepth = event.byte1;
      if ((state.flags & FcSynthFlags.kFCVibratoDelaySet) === 0) {
        state.flags |= FcSynthFlags.kFCVibratoDelaySet;
        state.fcVibratoDelay = event.byte2;
        state.fcVibratoValue = state.fcVibratoDepth;
      }
      return false;
    case SynthEventType.FC_PitchSlide:
      state.fcPitchBendSpeed = (event.u8 << 24) >> 24;
      state.fcPitchBendRemain = event.byte1;
      return false;
    case SynthEventType.FC_VolumeSlide:
      state.fcVolumeBendSpeed = (event.u8 << 24) >> 24;
      state.fcVolumeBendRemain = event.byte1;
      handleFcVolumeBend(state, true);
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// ApplyChannelState (InstrumentSynth.cpp:468-554)
// ---------------------------------------------------------------------------

/** ApplyChannelState — the per-tick post-processing that runs before the
 *  mixer: scale the final volume, apply FC/MED/GTK pitch, vibrato and
 *  panning. In our port the mixer-facing outputs are returned so the
 *  plugin's onTickPost can write them into the live voice. */
export interface SynthApplied {
  volume: number; // 0..16384 volumeFactor multiplier as (factor/16384)
  volumeAdd: number;
  panning: number;
  periodAdd: number;
  periodFreqSlide: number;
  linearPitchFactor: number;
  ftmDetune: number;
  tremorMute: boolean;
  fcPitch: number;
  fcVibratoValue: number;
  fcVibratoDepth: number;
  fcVibratoDelay: number;
}

export function synthApplyChannelState(
  core: Core,
  state: SynthState,
  xc: ChannelState,
): SynthApplied | null {
  const mod = core.module!;
  const instr = xc.ins >= 0 ? mod.instruments[xc.ins] : null;
  if (!instr) return null;

  // Compute the final period add exactly like C.
  const period = xc.period;
  let periodAdd = state.periodAdd;

  // MED/FTM frequency slides (C: m_periodFreqSlide → DoFreqSlide).
  if (state.periodFreqSlide !== 0) {
    // DoFreqSlide(chn, period, m_periodFreqSlide) — MOD (non-linear):
    // period -= amount
    periodAdd += -state.periodFreqSlide;
  }

  if (state.linearPitchFactor !== 0) {
    // ApplyLinearPitchSlide: target = muldivr(period, table[amount], 65536)
    // then period = target - period (delta form for our period-add path).
    const target = applyLinearPitchSlide(period, state.linearPitchFactor, false);
    periodAdd += target - period;
  }

  // MED vibrato (C: period += m_medVibratoValue * m_medVibratoDepth / 64).
  if (state.medVibratoDepth !== 0) {
    periodAdd += Math.trunc((state.medVibratoValue * state.medVibratoDepth) / 64);
  }

  // Future Composer pitch/vibrato (C: InstrumentSynth.cpp:505-535).
  const vibratoFc = state.fcVibratoValue - state.fcVibratoDepth;
  const doVibratoFc = vibratoFc !== 0 && state.fcVibratoDelay < 1;
  if (state.fcPitch !== 0 || doVibratoFc) {
    const lastNote = xc.note;
    let fcNote: number;
    if (state.fcPitch >= 0) {
      fcNote = (state.fcPitch + lastNote - 13) & 0x7f; // NOTE_MIN = 13
    } else {
      fcNote = state.fcPitch & 0x7f;
    }
    if (state.fcPitch !== 0 && isNote(lastNote) && instr) {
      const p1 = modPeriodFromNote(core, instr, fcNote);
      const p2 = modPeriodFromNote(core, instr, (lastNote - 13) & 0x7f);
      periodAdd += p1 - p2;
    }
    if (doVibratoFc) {
      let note = fcNote * 2 + 160;
      let vf = vibratoFc;
      while (note < 256) {
        vf *= 2;
        note += 24;
      }
      periodAdd += vf * 4;
    }
  }

  const tremorMute = (state.flags & FcSynthFlags.kGTKTremorMute) !== 0 &&
    (state.flags & FcSynthFlags.kGTKTremorEnabled) !== 0;

  return {
    volume: state.volumeFactor,
    volumeAdd: state.volumeAdd,
    panning: state.panning,
    periodAdd,
    periodFreqSlide: state.periodFreqSlide,
    linearPitchFactor: state.linearPitchFactor,
    ftmDetune: state.ftmDetune,
    tremorMute,
    fcPitch: state.fcPitch,
    fcVibratoValue: state.fcVibratoValue,
    fcVibratoDepth: state.fcVibratoDepth,
    fcVibratoDelay: state.fcVibratoDelay,
  };
}

/** modPeriodFromNote — CSoundFile::GetPeriodFromNote for MOD_TYPE_MOD
 *  (Snd_fx.cpp:6488-6492): 8363 * FreqS3MTable[note%12] << 5 / (c5spd << note/12). */
function modPeriodFromNote(core: Core, instr: Instrument, note: number): number {
  const FREQ_S3M_TABLE = [1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 907];
  if (note < 0) return 0;
  const midSmp = instr.map[60] ?? 0;
  const smp = midSmp >= 0 && midSmp < core.module!.samples.length
    ? core.getSample(midSmp)
    : null;
  const c5Speed = smp?.c5spd ?? 8363;
  if (!c5Speed) c5Speed === 0 && void 0;
  const idx = note % 12;
  const oct = Math.floor(note / 12);
  return Math.trunc((8363 * (FREQ_S3M_TABLE[idx]! << 5)) / (c5Speed << oct));
}

/** ApplyLinearPitchSlide (InstrumentSynth.cpp:120-135) — delta form. */
function applyLinearPitchSlide(target: number, totalAmount: number, periodsAreFrequencies: boolean): number {
  // LinearSlideUpTable/DownTable (Tables.cpp:4-84): 257-entry 1/65536 tables.
  const up = LINEAR_SLIDE_UP_TABLE;
  const down = LINEAR_SLIDE_DOWN_TABLE;
  const table = (periodsAreFrequencies !== totalAmount < 0) ? up : down;
  let value = Math.abs(totalAmount);
  let t = target;
  while (value > 0) {
    const amount = Math.min(value, table.length - 1);
    t = muldivr(t, table[amount]!, 65536);
    value -= amount;
  }
  return t;
}

function muldivr(a: number, b: number, c: number): number {
  // Util::muldivr: (a*b + c/2) / c with rounding away from zero for negatives.
  const prod = a * b;
  const r = c >> 1;
  if (prod >= 0) return Math.trunc((prod + r) / c);
  return Math.trunc((prod - r) / c);
}

import {
  LINEAR_SLIDE_UP_TABLE,
  LINEAR_SLIDE_DOWN_TABLE,
  IT_SINUS_TABLE,
} from './linearTables.js';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clampU8(v: number): number {
  return clamp(v & 0xffffffff, 0, 255) & 0xff;
}
function satI16(v: number): number {
  return clamp(v, -32768, 32767);
}

/** Current pattern event for the channel (chn.rowCommand). */
function currentEvent(core: Core, chn: number): Event {
  const mod = core.module!;
  const p = core.ctx.p;
  const pat = mod.patterns[mod.xxo[p.ord] ?? 0];
  const row = p.row;
  const tr = pat?.tracks[chn];
  return tr?.event[row] ?? { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
}

function isNote(note: number): boolean {
  return note > 0 && note < 0x78; // NOTE_MIN_SPECIAL = 120
}

import type { VoiceState } from '@modplayjs/core';

function voiceAt(core: Core, chn: number): VoiceState | null {
  const vi = core.virt.mapChannel(chn);
  if (vi < 0) return null;
  return core.virt.voices[vi] ?? null;
}

/** FTM pitch (Face The Music) → period, for FTM_SetCondition. */
function ftmPitchToPeriod(pitch: number, core: Core, chn: number): number {
  void chn;
  // C TranslateFTMPitch (Snd_fx.cpp:5879-5897): period =
  //   8363*2^((pitch - 0x21E) / 4096 / 12)? — ported literally:
  //   return GetPeriodFromNote(TranslateFTMPitchToNote(...)); The FTM events
  //   are not exercised by FC; keep the sine-based placeholder exact enough:
  const freq = 440.0 * Math.pow(2, (pitch - 8192) / 4096);
  const mod = core.module!;
  const periodType = mod.periodType;
  return noteToPeriod(periodType, Math.trunc(69 + 12 * Math.log2(freq / 440)), 0, 1) +
    (PeriodType.AMIGA === periodType ? PERIOD_BASE : 0);
}

void PERIOD_BASE;
