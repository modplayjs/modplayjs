// ../../packages/fmt-fc/src/fc.ts
import {
  C4_PAL_RATE,
  EMPTY_EVENT,
  FX_BREAK,
  FX_SPEED,
  FX_FC_AUTO_PORTA,
  FX_FC_TONEPORTA_DURATION,
  FX_FC_MED_SYNTH_JUMP,
  ParseError,
  PeriodType,
  Quirk,
  ReadEventType,
  SampleFlags
} from "@modplayjs/core";

// ../../packages/fmt-fc/src/synth.ts
import { NoteFlag } from "@modplayjs/core";

// ../../packages/fmt-fc/src/linearTables.ts
var IT_SINUS_TABLE = [
  0,
  2,
  3,
  5,
  6,
  8,
  9,
  11,
  12,
  14,
  16,
  17,
  19,
  20,
  22,
  23,
  24,
  26,
  27,
  29,
  30,
  32,
  33,
  34,
  36,
  37,
  38,
  39,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  54,
  55,
  56,
  56,
  57,
  58,
  59,
  59,
  60,
  60,
  61,
  61,
  62,
  62,
  62,
  63,
  63,
  63,
  64,
  64,
  64,
  64,
  64,
  64,
  64,
  64,
  64,
  64,
  64,
  63,
  63,
  63,
  62,
  62,
  62,
  61,
  61,
  60,
  60,
  59,
  59,
  58,
  57,
  56,
  56,
  55,
  54,
  53,
  52,
  51,
  50,
  49,
  48,
  47,
  46,
  45,
  44,
  43,
  42,
  41,
  39,
  38,
  37,
  36,
  34,
  33,
  32,
  30,
  29,
  27,
  26,
  24,
  23,
  22,
  20,
  19,
  17,
  16,
  14,
  12,
  11,
  9,
  8,
  6,
  5,
  3,
  2,
  0,
  -2,
  -3,
  -5,
  -6,
  -8,
  -9,
  -11,
  -12,
  -14,
  -16,
  -17,
  -19,
  -20,
  -22,
  -23,
  -24,
  -26,
  -27,
  -29,
  -30,
  -32,
  -33,
  -34,
  -36,
  -37,
  -38,
  -39,
  -41,
  -42,
  -43,
  -44,
  -45,
  -46,
  -47,
  -48,
  -49,
  -50,
  -51,
  -52,
  -53,
  -54,
  -55,
  -56,
  -56,
  -57,
  -58,
  -59,
  -59,
  -60,
  -60,
  -61,
  -61,
  -62,
  -62,
  -62,
  -63,
  -63,
  -63,
  -64,
  -64,
  -64,
  -64,
  -64,
  -64,
  -64,
  -64,
  -64,
  -64,
  -64,
  -63,
  -63,
  -63,
  -62,
  -62,
  -62,
  -61,
  -61,
  -60,
  -60,
  -59,
  -59,
  -58,
  -57,
  -56,
  -56,
  -55,
  -54,
  -53,
  -52,
  -51,
  -50,
  -49,
  -48,
  -47,
  -46,
  -45,
  -44,
  -43,
  -42,
  -41,
  -39,
  -38,
  -37,
  -36,
  -34,
  -33,
  -32,
  -30,
  -29,
  -27,
  -26,
  -24,
  -23,
  -22,
  -20,
  -19,
  -17,
  -16,
  -14,
  -12,
  -11,
  -9,
  -8,
  -6,
  -5,
  -3,
  -2
];

// ../../packages/fmt-fc/src/synth.ts
var SynthEventType = /* @__PURE__ */ ((SynthEventType2) => {
  SynthEventType2[SynthEventType2["StopScript"] = 0] = "StopScript";
  SynthEventType2[SynthEventType2["Jump"] = 1] = "Jump";
  SynthEventType2[SynthEventType2["JumpIfTrue"] = 2] = "JumpIfTrue";
  SynthEventType2[SynthEventType2["Delay"] = 3] = "Delay";
  SynthEventType2[SynthEventType2["SetStepSpeed"] = 4] = "SetStepSpeed";
  SynthEventType2[SynthEventType2["JumpMarker"] = 5] = "JumpMarker";
  SynthEventType2[SynthEventType2["SampleOffset"] = 6] = "SampleOffset";
  SynthEventType2[SynthEventType2["SampleOffsetAdd"] = 7] = "SampleOffsetAdd";
  SynthEventType2[SynthEventType2["SampleOffsetSub"] = 8] = "SampleOffsetSub";
  SynthEventType2[SynthEventType2["SetLoopCounter"] = 9] = "SetLoopCounter";
  SynthEventType2[SynthEventType2["EvaluateLoopCounter"] = 10] = "EvaluateLoopCounter";
  SynthEventType2[SynthEventType2["NoteCut"] = 11] = "NoteCut";
  SynthEventType2[SynthEventType2["GTK_KeyOff"] = 12] = "GTK_KeyOff";
  SynthEventType2[SynthEventType2["GTK_SetVolume"] = 13] = "GTK_SetVolume";
  SynthEventType2[SynthEventType2["GTK_SetPitch"] = 14] = "GTK_SetPitch";
  SynthEventType2[SynthEventType2["GTK_SetPanning"] = 15] = "GTK_SetPanning";
  SynthEventType2[SynthEventType2["GTK_SetVolumeStep"] = 16] = "GTK_SetVolumeStep";
  SynthEventType2[SynthEventType2["GTK_SetPitchStep"] = 17] = "GTK_SetPitchStep";
  SynthEventType2[SynthEventType2["GTK_SetPanningStep"] = 18] = "GTK_SetPanningStep";
  SynthEventType2[SynthEventType2["GTK_SetSpeed"] = 19] = "GTK_SetSpeed";
  SynthEventType2[SynthEventType2["GTK_EnableTremor"] = 20] = "GTK_EnableTremor";
  SynthEventType2[SynthEventType2["GTK_SetTremorTime"] = 21] = "GTK_SetTremorTime";
  SynthEventType2[SynthEventType2["GTK_EnableTremolo"] = 22] = "GTK_EnableTremolo";
  SynthEventType2[SynthEventType2["GTK_EnableVibrato"] = 23] = "GTK_EnableVibrato";
  SynthEventType2[SynthEventType2["GTK_SetVibratoParams"] = 24] = "GTK_SetVibratoParams";
  SynthEventType2[SynthEventType2["Puma_SetWaveform"] = 25] = "Puma_SetWaveform";
  SynthEventType2[SynthEventType2["Puma_VolumeRamp"] = 26] = "Puma_VolumeRamp";
  SynthEventType2[SynthEventType2["Puma_StopVoice"] = 27] = "Puma_StopVoice";
  SynthEventType2[SynthEventType2["Puma_SetPitch"] = 28] = "Puma_SetPitch";
  SynthEventType2[SynthEventType2["Puma_PitchRamp"] = 29] = "Puma_PitchRamp";
  SynthEventType2[SynthEventType2["Mupp_SetWaveform"] = 30] = "Mupp_SetWaveform";
  SynthEventType2[SynthEventType2["MED_DefineArpeggio"] = 31] = "MED_DefineArpeggio";
  SynthEventType2[SynthEventType2["MED_JumpScript"] = 32] = "MED_JumpScript";
  SynthEventType2[SynthEventType2["MED_SetEnvelope"] = 33] = "MED_SetEnvelope";
  SynthEventType2[SynthEventType2["MED_SetVolume"] = 34] = "MED_SetVolume";
  SynthEventType2[SynthEventType2["MED_SetWaveform"] = 35] = "MED_SetWaveform";
  SynthEventType2[SynthEventType2["MED_SetVibratoSpeed"] = 36] = "MED_SetVibratoSpeed";
  SynthEventType2[SynthEventType2["MED_SetVibratoDepth"] = 37] = "MED_SetVibratoDepth";
  SynthEventType2[SynthEventType2["MED_SetVolumeStep"] = 38] = "MED_SetVolumeStep";
  SynthEventType2[SynthEventType2["MED_SetPeriodStep"] = 39] = "MED_SetPeriodStep";
  SynthEventType2[SynthEventType2["MED_HoldDecay"] = 40] = "MED_HoldDecay";
  SynthEventType2[SynthEventType2["FTM_PlaySample"] = 41] = "FTM_PlaySample";
  SynthEventType2[SynthEventType2["FTM_SetPitch"] = 42] = "FTM_SetPitch";
  SynthEventType2[SynthEventType2["FTM_AddPitch"] = 43] = "FTM_AddPitch";
  SynthEventType2[SynthEventType2["FTM_SetDetune"] = 44] = "FTM_SetDetune";
  SynthEventType2[SynthEventType2["FTM_AddDetune"] = 45] = "FTM_AddDetune";
  SynthEventType2[SynthEventType2["FTM_SetVolume"] = 46] = "FTM_SetVolume";
  SynthEventType2[SynthEventType2["FTM_AddVolume"] = 47] = "FTM_AddVolume";
  SynthEventType2[SynthEventType2["FTM_SetSample"] = 48] = "FTM_SetSample";
  SynthEventType2[SynthEventType2["FTM_SetCondition"] = 49] = "FTM_SetCondition";
  SynthEventType2[SynthEventType2["FTM_SetInterrupt"] = 50] = "FTM_SetInterrupt";
  SynthEventType2[SynthEventType2["FTM_SetSampleStart"] = 51] = "FTM_SetSampleStart";
  SynthEventType2[SynthEventType2["FTM_SetOneshotLength"] = 52] = "FTM_SetOneshotLength";
  SynthEventType2[SynthEventType2["FTM_SetRepeatLength"] = 53] = "FTM_SetRepeatLength";
  SynthEventType2[SynthEventType2["FTM_CloneTrack"] = 54] = "FTM_CloneTrack";
  SynthEventType2[SynthEventType2["FTM_StartLFO"] = 55] = "FTM_StartLFO";
  SynthEventType2[SynthEventType2["FTM_LFOAddSub"] = 56] = "FTM_LFOAddSub";
  SynthEventType2[SynthEventType2["FTM_SetWorkTrack"] = 57] = "FTM_SetWorkTrack";
  SynthEventType2[SynthEventType2["FTM_SetGlobalVolume"] = 58] = "FTM_SetGlobalVolume";
  SynthEventType2[SynthEventType2["FTM_SetTempo"] = 59] = "FTM_SetTempo";
  SynthEventType2[SynthEventType2["FTM_SetSpeed"] = 60] = "FTM_SetSpeed";
  SynthEventType2[SynthEventType2["FTM_SetPlayPosition"] = 61] = "FTM_SetPlayPosition";
  SynthEventType2[SynthEventType2["FC_SetWaveform"] = 62] = "FC_SetWaveform";
  SynthEventType2[SynthEventType2["FC_SetPitch"] = 63] = "FC_SetPitch";
  SynthEventType2[SynthEventType2["FC_SetVibrato"] = 64] = "FC_SetVibrato";
  SynthEventType2[SynthEventType2["FC_PitchSlide"] = 65] = "FC_PitchSlide";
  SynthEventType2[SynthEventType2["FC_VolumeSlide"] = 66] = "FC_VolumeSlide";
  return SynthEventType2;
})(SynthEventType || {});
var JUMP_EVENTS = [
  1 /* Jump */,
  2 /* JumpIfTrue */,
  10 /* EvaluateLoopCounter */,
  12 /* GTK_KeyOff */,
  40 /* MED_HoldDecay */,
  50 /* FTM_SetInterrupt */
];
function evStopScript() {
  return { type: 0 /* StopScript */, u8: 0, u16: 0, byte1: 0, byte2: 0 };
}
function evJump(target) {
  return { type: 1 /* Jump */, u8: 0, u16: target & 65535, byte1: 0, byte2: 0 };
}
function evJumpIfTrue(target) {
  return { type: 2 /* JumpIfTrue */, u8: 0, u16: target & 65535, byte1: 0, byte2: 0 };
}
function evDelay(ticks) {
  return { type: 3 /* Delay */, u8: 0, u16: ticks & 65535, byte1: 0, byte2: 0 };
}
function evSetStepSpeed(speed, updateNow) {
  return { type: 4 /* SetStepSpeed */, u8: speed & 255, u16: 0, byte1: updateNow ? 1 : 0, byte2: 0 };
}
function evJumpMarker(data) {
  return { type: 5 /* JumpMarker */, u8: 0, u16: data & 65535, byte1: 0, byte2: 0 };
}
function evSampleOffset(offset) {
  const v = Math.min(offset, 16777215);
  return { type: 6 /* SampleOffset */, u8: v & 255, u16: 0, byte1: v >> 8 & 255, byte2: v >> 16 & 255 };
}
function evSampleOffsetAdd(offset) {
  const v = Math.min(offset, 16777215);
  return { type: 7 /* SampleOffsetAdd */, u8: v & 255, u16: 0, byte1: v >> 8 & 255, byte2: v >> 16 & 255 };
}
function evSampleOffsetSub(offset) {
  const v = Math.min(offset, 16777215);
  return { type: 8 /* SampleOffsetSub */, u8: v & 255, u16: 0, byte1: v >> 8 & 255, byte2: v >> 16 & 255 };
}
function evSetLoopCounter(count, force) {
  return { type: 9 /* SetLoopCounter */, u8: force ? 1 : 0, u16: count & 65535, byte1: 0, byte2: 0 };
}
function evEvaluateLoopCounter(target) {
  return { type: 10 /* EvaluateLoopCounter */, u8: 0, u16: target & 65535, byte1: 0, byte2: 0 };
}
function evNoteCut() {
  return { type: 11 /* NoteCut */, u8: 0, u16: 0, byte1: 0, byte2: 0 };
}
function evGtkKeyOff(target) {
  return { type: 12 /* GTK_KeyOff */, u8: 0, u16: target & 65535, byte1: 0, byte2: 0 };
}
function evGtkSetVolume(volume) {
  return { type: 13 /* GTK_SetVolume */, u8: 0, u16: volume & 65535, byte1: 0, byte2: 0 };
}
function evGtkSetPitch(pitch) {
  return { type: 14 /* GTK_SetPitch */, u8: 0, u16: pitch & 65535, byte1: 0, byte2: 0 };
}
function evGtkSetPanning(panning) {
  return { type: 15 /* GTK_SetPanning */, u8: 0, u16: panning & 65535, byte1: 0, byte2: 0 };
}
function evGtkSetVolumeStep(step) {
  return { type: 16 /* GTK_SetVolumeStep */, u8: 0, u16: step & 65535, byte1: 0, byte2: 0 };
}
function evGtkSetPitchStep(step) {
  return { type: 17 /* GTK_SetPitchStep */, u8: 0, u16: step & 65535, byte1: 0, byte2: 0 };
}
function evGtkSetPanningStep(step) {
  return { type: 18 /* GTK_SetPanningStep */, u8: 0, u16: step & 65535, byte1: 0, byte2: 0 };
}
function evGtkSetSpeed(speed) {
  return { type: 19 /* GTK_SetSpeed */, u8: speed & 255, u16: 0, byte1: 0, byte2: 0 };
}
function evGtkEnableTremor(enable) {
  return { type: 20 /* GTK_EnableTremor */, u8: enable & 255, u16: 0, byte1: 0, byte2: 0 };
}
function evGtkSetTremorTime(on, off) {
  return { type: 21 /* GTK_SetTremorTime */, u8: on & 255, u16: 0, byte1: off & 255, byte2: 0 };
}
function evGtkEnableTremolo(enable) {
  return { type: 22 /* GTK_EnableTremolo */, u8: enable & 255, u16: 0, byte1: 0, byte2: 0 };
}
function evGtkEnableVibrato(enable) {
  return { type: 23 /* GTK_EnableVibrato */, u8: enable & 255, u16: 0, byte1: 0, byte2: 0 };
}
function evGtkSetVibratoParams(width, speed) {
  return { type: 24 /* GTK_SetVibratoParams */, u8: width & 255, u16: 0, byte1: speed & 255, byte2: 0 };
}
function evPumaSetWaveform(waveform, step, count) {
  return { type: 25 /* Puma_SetWaveform */, u8: waveform & 255, u16: 0, byte1: step & 255, byte2: count & 255 };
}
function evPumaVolumeRamp(startVol, endVol, ticks) {
  return { type: 26 /* Puma_VolumeRamp */, u8: startVol & 255, u16: 0, byte1: endVol & 255, byte2: ticks & 255 };
}
function evPumaStopVoice() {
  return { type: 27 /* Puma_StopVoice */, u8: 0, u16: 0, byte1: 0, byte2: 0 };
}
function evPumaSetPitch(pitchOffset, ticks) {
  return { type: 28 /* Puma_SetPitch */, u8: pitchOffset & 255, u16: 0, byte1: 0, byte2: ticks & 255 };
}
function evPumaPitchRamp(startPitch, endPitch, ticks) {
  return { type: 29 /* Puma_PitchRamp */, u8: startPitch & 255, u16: 0, byte1: endPitch & 255, byte2: ticks & 255 };
}
function evMuppSetWaveform(instr, waveform, volume) {
  return { type: 30 /* Mupp_SetWaveform */, u8: instr & 255, u16: 0, byte1: waveform & 255, byte2: volume & 255 };
}
function evMedDefineArpeggio(note, noteCount) {
  return { type: 31 /* MED_DefineArpeggio */, u8: 0, u16: noteCount & 65535, byte1: note & 255, byte2: 0 };
}
function evMedJumpScript(scriptIndex, target) {
  return { type: 32 /* MED_JumpScript */, u8: scriptIndex & 255, u16: target & 65535, byte1: 0, byte2: 0 };
}
function evMedSetEnvelope(envelope, loop, volumeEnv) {
  return { type: 33 /* MED_SetEnvelope */, u8: envelope & 255, u16: 0, byte1: loop ? 1 : 0, byte2: volumeEnv ? 1 : 0 };
}
function evMedSetVolume(volume) {
  return { type: 34 /* MED_SetVolume */, u8: volume & 255, u16: 0, byte1: 0, byte2: 0 };
}
function evMedSetWaveform(waveform) {
  return { type: 35 /* MED_SetWaveform */, u8: waveform & 255, u16: 0, byte1: 0, byte2: 0 };
}
function evMedSetVibratoSpeed(depth) {
  return { type: 36 /* MED_SetVibratoSpeed */, u8: depth & 255, u16: 0, byte1: 0, byte2: 0 };
}
function evMedSetVibratoDepth(depth) {
  return { type: 37 /* MED_SetVibratoDepth */, u8: depth & 255, u16: 0, byte1: 0, byte2: 0 };
}
function evMedSetVolumeStep(volumeStep) {
  return { type: 38 /* MED_SetVolumeStep */, u8: 0, u16: volumeStep & 65535, byte1: 0, byte2: 0 };
}
function evMedSetPeriodStep(periodStep) {
  return { type: 39 /* MED_SetPeriodStep */, u8: 0, u16: periodStep & 65535, byte1: 0, byte2: 0 };
}
function evMedHoldDecay(hold, decay) {
  return { type: 40 /* MED_HoldDecay */, u8: 0, u16: decay & 65535, byte1: hold & 255, byte2: 0 };
}
function evFtmSetCondition(threshold, condition) {
  return { type: 49 /* FTM_SetCondition */, u8: condition & 255, u16: threshold & 65535, byte1: 0, byte2: 0 };
}
function evFtmSetInterrupt(target, type) {
  return { type: 50 /* FTM_SetInterrupt */, u8: type & 255, u16: target & 65535, byte1: 0, byte2: 0 };
}
function evFtmPlaySample() {
  return { type: 41 /* FTM_PlaySample */, u8: 0, u16: 0, byte1: 0, byte2: 0 };
}
function evFtmSetPitch(pitch) {
  return { type: 42 /* FTM_SetPitch */, u8: 0, u16: pitch & 65535, byte1: 0, byte2: 0 };
}
function evFtmAddPitch(pitch) {
  return { type: 43 /* FTM_AddPitch */, u8: 0, u16: pitch & 65535, byte1: 0, byte2: 0 };
}
function evFtmSetDetune(detune) {
  return { type: 44 /* FTM_SetDetune */, u8: 0, u16: detune & 65535, byte1: 0, byte2: 0 };
}
function evFtmAddDetune(detune) {
  return { type: 45 /* FTM_AddDetune */, u8: 0, u16: detune & 65535, byte1: 0, byte2: 0 };
}
function evFtmSetVolume(volume) {
  return { type: 46 /* FTM_SetVolume */, u8: volume & 255, u16: 0, byte1: 0, byte2: 0 };
}
function evFtmAddVolume(volume) {
  return { type: 47 /* FTM_AddVolume */, u8: 0, u16: volume & 65535, byte1: 0, byte2: 0 };
}
function evFtmSetSample(sample) {
  return { type: 48 /* FTM_SetSample */, u8: sample & 255, u16: 0, byte1: 0, byte2: 0 };
}
function evFtmSetSampleStart(offset, type) {
  return { type: 51 /* FTM_SetSampleStart */, u8: type & 255, u16: offset & 65535, byte1: 0, byte2: 0 };
}
function evFtmSetOneshotLength(length, type) {
  return { type: 52 /* FTM_SetOneshotLength */, u8: type & 255, u16: length & 65535, byte1: 0, byte2: 0 };
}
function evFtmSetRepeatLength(length, type) {
  return { type: 53 /* FTM_SetRepeatLength */, u8: type & 255, u16: length & 65535, byte1: 0, byte2: 0 };
}
function evFtmCloneTrack(track, properties) {
  return { type: 54 /* FTM_CloneTrack */, u8: track & 255, u16: 0, byte1: properties & 255, byte2: 0 };
}
function evFtmStartLfo(lfo, targetWaveform) {
  return { type: 55 /* FTM_StartLFO */, u8: lfo & 255, u16: 0, byte1: targetWaveform & 255, byte2: 0 };
}
function evFtmLfoAddSub(lfoAddSub, speed, depth) {
  return { type: 56 /* FTM_LFOAddSub */, u8: lfoAddSub & 255, u16: 0, byte1: speed & 255, byte2: depth & 255 };
}
function evFtmSetWorkTrack(track, relative) {
  return { type: 57 /* FTM_SetWorkTrack */, u8: track & 255, u16: 0, byte1: relative ? 1 : 0, byte2: 0 };
}
function evFtmSetGlobalVolume(globalVolume) {
  return { type: 58 /* FTM_SetGlobalVolume */, u8: 0, u16: globalVolume & 65535, byte1: 0, byte2: 0 };
}
function evFtmSetTempo(tempo) {
  return { type: 59 /* FTM_SetTempo */, u8: 0, u16: tempo & 65535, byte1: 0, byte2: 0 };
}
function evFtmSetSpeed(speed) {
  return { type: 60 /* FTM_SetSpeed */, u8: 0, u16: speed & 65535, byte1: 0, byte2: 0 };
}
function evFtmSetPlayPosition(pattern, row) {
  return { type: 61 /* FTM_SetPlayPosition */, u8: row & 255, u16: pattern & 65535, byte1: 0, byte2: 0 };
}
function evFcSetWaveform(command, waveform, samplePack) {
  return { type: 62 /* FC_SetWaveform */, u8: command & 255, u16: 0, byte1: waveform & 255, byte2: samplePack & 255 };
}
function evFcSetPitch(pitch) {
  return { type: 63 /* FC_SetPitch */, u8: pitch & 255, u16: 0, byte1: 0, byte2: 0 };
}
function evFcSetVibrato(speed, depth, delay) {
  return { type: 64 /* FC_SetVibrato */, u8: speed & 255, u16: 0, byte1: depth & 255, byte2: delay & 255 };
}
function evFcPitchSlide(speed, time) {
  return { type: 65 /* FC_PitchSlide */, u8: speed & 255, u16: 0, byte1: time & 255, byte2: 0 };
}
function evFcVolumeSlide(speed, time) {
  return { type: 66 /* FC_VolumeSlide */, u8: speed & 255, u16: 0, byte1: time & 255, byte2: 0 };
}
function eventByte0(e) {
  return e.u8;
}
function eventByte1(e) {
  return e.byte1;
}
function eventByte2(e) {
  return e.byte2;
}
function eventValue24Bit(e) {
  return e.u8 & 255 | (e.byte1 & 255) << 8 | (e.byte2 & 255) << 16;
}
function isJumpEvent(e) {
  return JUMP_EVENTS.includes(e.type);
}
function fixupJumpTarget(e, entryFromByte) {
  if (!isJumpEvent(e)) return;
  let mapped = 65535;
  for (const [off, idx] of entryFromByte) {
    if (off >= e.u16) {
      mapped = idx;
      break;
    }
  }
  e.u16 = mapped;
}
var SYNTH_STOP_ROW = 65535;
var SynthState = class _SynthState {
  flags = 0;
  // std::bitset<kNumFlags>
  currentRow = SYNTH_STOP_ROW;
  nextRow = 0;
  ticksRemain = 0;
  stepSpeed = 1;
  stepsRemain = 0;
  volumeFactor = 16384;
  volumeAdd = -32768;
  // int16_min
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
  medVibratoEnvelope = 255;
  // uint8_max
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
  ftmLfo = [
    { targetWaveform: 0, speed: 0, depth: 0, position: 0 },
    { targetWaveform: 0, speed: 0, depth: 0, position: 0 },
    { targetWaveform: 0, speed: 0, depth: 0, position: 0 },
    { targetWaveform: 0, speed: 0, depth: 0, position: 0 }
  ];
  ftmWorkTrack = 0;
  fcPitch = 0;
  // int8
  fcVibratoValue = 0;
  fcVibratoDelay = 0;
  fcVibratoSpeed = 0;
  fcVibratoDepth = 0;
  fcVolumeBendSpeed = 0;
  // int8
  fcPitchBendSpeed = 0;
  // int8
  fcVolumeBendRemain = 0;
  fcPitchBendRemain = 0;
  /** Swapped sample for kMODSampleSwap (ModChannel.swapSampleIndex). */
  swapSampleIndex = 0;
  /** Reconstruct (C++ `mpt::reconstruct(state)` = default State()). */
  reconstruct() {
    const fresh = new _SynthState();
    Object.assign(this, fresh);
  }
  /** FTMRealChannel (InstrumentSynth.cpp:106-113). */
  ftmRealChannel(channel, numChannels) {
    if (this.ftmWorkTrack !== 0) {
      return (this.ftmWorkTrack - 1) % numChannels;
    }
    return channel;
  }
  /** JumpToPosition (InstrumentSynth.cpp:236-245). */
  jumpToPosition(events, position) {
    for (let pos = 0; pos < events.length; pos++) {
      if (events[pos].type === 5 /* JumpMarker */ && events[pos].u16 >= position) {
        this.nextRow = pos & 65535;
        this.ticksRemain = 0;
        return;
      }
    }
  }
};
var SynthStates = class {
  states = [];
  stop() {
    for (const state of this.states) {
      state.currentRow = SYNTH_STOP_ROW;
      state.nextRow = SYNTH_STOP_ROW;
    }
  }
};
var MOD_SINUS_TABLE = [
  0,
  12,
  25,
  37,
  49,
  60,
  71,
  81,
  90,
  98,
  106,
  112,
  117,
  122,
  125,
  126,
  127,
  126,
  125,
  122,
  117,
  112,
  106,
  98,
  90,
  81,
  71,
  60,
  49,
  37,
  25,
  12,
  0,
  -12,
  -25,
  -37,
  -49,
  -60,
  -71,
  -81,
  -90,
  -98,
  -106,
  -112,
  -117,
  -122,
  -125,
  -126,
  -127,
  -126,
  -125,
  -122,
  -117,
  -112,
  -106,
  -98,
  -90,
  -81,
  -71,
  -60,
  -49,
  -37,
  -25,
  -12
];
function medEnvelopeFromSample(mod, instr, envelope, envelopePos) {
  const midSmp = instr.map[60] ?? 0;
  const smp = midSmp + envelope;
  if (smp < 0 || smp >= mod.samples.length) return 0;
  const sample = mod.samples[smp];
  if (sample.length === 0 || envelopePos >= sample.length) return 0;
  const data = sample.data;
  if (data.length === 0 || (sample.flags & 1) !== 0) return 0;
  const v = Math.round(data[envelopePos] * 128);
  return v << 24 >> 24;
}
function channelSetSample(core, chn, smpIndex0, swapAtEnd, state) {
  const mod = core.module;
  if (smpIndex0 < 0 || smpIndex0 >= mod.samples.length) return;
  const vi = core.virt.mapChannel(chn);
  const v = vi >= 0 ? core.virt.voices[vi] ?? null : null;
  const channelIsActive = v !== null && v.smp >= 0 && sampleExists(core, v.smp) && voiceLength(v) > 0;
  if (channelIsActive && swapAtEnd) {
    core.virt.queuePatch(chn, v !== null ? v.ins : -1, smpIndex0, 0);
    state.swapSampleIndex = smpIndex0 + 1;
    return;
  }
  const sample = core.getSample(smpIndex0);
  if (v !== null && v.smp === smpIndex0 && channelIsActive) return;
  const looped = (sample.flags & 2) !== 0;
  const newLen = looped ? sample.loopEnd : sample.length;
  if (v !== null && v.pos === 0 && voiceLength(v) === 0 && v.vol === 0) {
    core.virt.setVol(chn, 64);
  }
  core.virt.setPatchSmp(chn, v !== null ? v.ins : -1, smpIndex0, core.ctx.channelStates[chn]?.note ?? 0);
  if (v !== null && v.pos >= newLen) {
    v.pos = 0;
  }
}
function sampleExists(core, smp) {
  const mod = core.module;
  return smp >= 0 && smp < mod.samples.length;
}
function voiceLength(v) {
  return Math.max(0, v.end - v.start);
}
function synthStateNextTick(core, chn, events, state) {
  if (events.length === 0) return;
  const origChannel = chn;
  const numChannels = core.module.chn;
  chn = state.ftmRealChannel(chn, numChannels);
  const xc = core.ctx.channelStates[chn];
  if (state.gtkKeyOffOffset !== SYNTH_STOP_ROW && (xc.flags & 4) !== 0) {
    state.nextRow = state.gtkKeyOffOffset;
    state.ticksRemain = 0;
    state.gtkKeyOffOffset = SYNTH_STOP_ROW;
  }
  if (state.pumaWaveformStep !== 0) {
    state.pumaWaveform = clamp(
      state.pumaWaveform + state.pumaWaveformStep,
      state.pumaStartWaveform,
      state.pumaEndWaveform
    );
    if (state.pumaWaveform <= state.pumaStartWaveform || state.pumaWaveform >= state.pumaEndWaveform) {
      state.pumaWaveformStep = -state.pumaWaveformStep;
    }
    if (core.ctx.channelStates[origChannel].ins >= 0) {
      channelSetSample(core, chn, state.pumaWaveform, true, state);
    }
  }
  if (state.medHold !== 255) {
    if (state.medHold === 0) {
      state.medHold = 255;
      state.nextRow = state.medDecay;
    } else {
      state.medHold--;
    }
  }
  const ev = currentEvent(core, chn);
  handleFtmInterrupt(state, "ftmPitchChangeJump", isNote(ev.note));
  handleFtmInterrupt(state, "ftmVolumeChangeJump", ev.fxt === 128);
  handleFtmInterrupt(state, "ftmSampleChangeJump", ev.ins !== 0);
  handleFtmInterrupt(state, "ftmReleaseJump", ev.note === 129);
  handleFtmInterrupt(state, "ftmVolumeDownJump", ev.fxt === 134);
  handleFtmInterrupt(state, "ftmPortamentoJump", ev.fxt === 135);
  const stepsWasZero = state.stepsRemain === 0;
  if (state.stepsRemain !== 0) state.stepsRemain--;
  if (!handleFcVolumeBend(state, false) && state.stepSpeed !== 0 && stepsWasZero) {
    state.stepsRemain = state.stepSpeed - 1;
    if (state.medVolumeStep !== 0) {
      state.volumeFactor = clamp(state.volumeFactor + state.medVolumeStep, 0, 16384);
    }
    if (state.medPeriodStep !== 0) {
      state.periodAdd = satI16(state.periodAdd - state.medPeriodStep);
    }
    if (state.medVolumeEnv !== 255 && xc.ins >= 0 && core.module.instruments[xc.ins]) {
      const instr = core.module.instruments[xc.ins];
      const v = medEnvelopeFromSample(core.module, instr, state.medVolumeEnv & 127, state.medVolumeEnvPos);
      state.volumeFactor = clamp((v + 128) * 64, 0, 16384);
      if (state.medVolumeEnvPos < 127) {
        state.medVolumeEnvPos++;
      } else if ((state.medVolumeEnv & 128) !== 0) {
        state.medVolumeEnvPos = 0;
      }
    }
    if (state.ticksRemain !== 0) {
      if (state.currentRow < events.length) {
        evaluateRunningEvent(state, events[state.currentRow]);
      }
      state.ticksRemain--;
    } else {
      let jumpCount = 0;
      while (state.ticksRemain === 0) {
        state.currentRow = state.nextRow;
        if (state.currentRow >= Math.min(events.length, SYNTH_STOP_ROW)) break;
        state.nextRow++;
        if (evaluateEvent(core, origChannel, events[state.currentRow], state)) break;
        if (isJumpEvent(events[state.currentRow])) {
          if (++jumpCount > 10) break;
        }
        chn = state.ftmRealChannel(origChannel, numChannels);
      }
    }
  }
  if (state.medArpOffset < events.length && events[state.medArpOffset].u16 !== 0) {
    const idx = state.medArpOffset + state.medArpPos;
    if (idx < events.length) {
      state.linearPitchFactor = 16 * events[idx].u8;
    }
    state.medArpPos = (state.medArpPos + 1) % events[state.medArpOffset].u16 & 255;
  }
  if (state.medVibratoDepth !== 0) {
    const offset = Math.floor(state.medVibratoPos / 16);
    if (state.medVibratoEnvelope === 255) {
      state.medVibratoValue = MOD_SINUS_TABLE[offset * 2 % MOD_SINUS_TABLE.length];
    } else if (xc.ins >= 0 && core.module.instruments[xc.ins]) {
      state.medVibratoValue = medEnvelopeFromSample(
        core.module,
        core.module.instruments[xc.ins],
        state.medVibratoEnvelope,
        offset
      );
    }
    state.medVibratoPos = (state.medVibratoPos + state.medVibratoSpeed) % (32 * 16);
  }
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
  if ((state.flags & 2 /* kGTKTremorEnabled */) !== 0) {
    if (state.gtkTremorPos >= state.gtkTremorOnTime + state.gtkTremorOffTime) {
      state.gtkTremorPos = 0;
    }
    if (state.gtkTremorPos >= state.gtkTremorOnTime) {
      state.flags |= 4 /* kGTKTremorMute */;
    } else {
      state.flags &= ~4 /* kGTKTremorMute */;
    }
    state.gtkTremorPos++;
  }
  if ((state.flags & 8 /* kGTKTremoloEnabled */) !== 0) {
    state.volumeAdd = satI16(
      Math.trunc(
        MOD_SINUS_TABLE[Math.floor(state.gtkVibratoPos / 4) % MOD_SINUS_TABLE.length] * state.gtkVibratoWidth / 2
      )
    );
    state.gtkVibratoPos += state.gtkVibratoSpeed;
  }
  if ((state.flags & 16 /* kGTKVibratoEnabled */) !== 0) {
    state.periodFreqSlide = satI16(
      Math.trunc(
        -MOD_SINUS_TABLE[Math.floor(state.gtkVibratoPos / 4) % MOD_SINUS_TABLE.length] * state.gtkVibratoWidth / 96
      )
    );
    state.gtkVibratoPos += state.gtkVibratoSpeed;
  }
  for (let li = 0; li < state.ftmLfo.length; li++) {
    const lfo = state.ftmLfo[li];
    if (lfo.speed === 0 && lfo.depth === 0) continue;
    const lutPos = Math.trunc((lfo.position * 256 + 96) / 192);
    let value = 0;
    switch (lfo.targetWaveform & 7) {
      case 0:
        value = IT_SINUS_TABLE[lutPos & 255];
        break;
      case 1:
        value = lutPos < 128 ? 64 : -64;
        break;
      case 2:
        value = 64 - Math.abs((lutPos + 64) % 256 - 128);
        break;
      case 3:
        value = 64 - Math.trunc(lutPos / 2);
        break;
      case 4:
        value = Math.trunc(lutPos / 2) - 64;
        break;
    }
    if ((lfo.targetWaveform & 240) < 160) value += 64;
    value *= lfo.depth;
    switch (lfo.targetWaveform & 240) {
      case 16:
        state.ftmLfo[0].speed = value / 64 & 255;
        break;
      case 32:
        state.ftmLfo[1].speed = value / 64 & 255;
        break;
      case 48:
        state.ftmLfo[2].speed = value / 64 & 255;
        break;
      case 64:
        state.ftmLfo[3].speed = value / 64 & 255;
        break;
      case 80:
        state.ftmLfo[0].depth = value / 64 & 255;
        break;
      case 96:
        state.ftmLfo[1].depth = value / 64 & 255;
        break;
      case 112:
        state.ftmLfo[2].depth = value / 64 & 255;
        break;
      case 128:
        state.ftmLfo[3].depth = value / 64 & 255;
        break;
      case 160:
        state.volumeAdd = satI16(value * 4);
        break;
      case 240:
        state.periodFreqSlide = satI16(Math.trunc(value / 8));
        break;
    }
    let newPos = lfo.position + lfo.speed & 65535;
    if (newPos >= 192) {
      newPos -= 192;
      if ((lfo.targetWaveform & 8) !== 0) {
        lfo.speed = 0;
        newPos = 191;
      }
    }
    lfo.position = newPos & 255;
  }
  if ((state.flags & 32 /* kFCVibratoDelaySet */) !== 0 && state.fcVibratoDelay > 0) {
    state.fcVibratoDelay--;
  } else if (state.fcVibratoDepth !== 0) {
    if ((state.flags & 64 /* kFCVibratoStep */) !== 0) {
      const delta = state.fcVibratoDepth * 2;
      state.fcVibratoValue += state.fcVibratoSpeed;
      if (state.fcVibratoValue > delta) {
        state.fcVibratoValue = delta;
        state.flags ^= 64 /* kFCVibratoStep */;
      }
    } else {
      state.fcVibratoValue -= state.fcVibratoSpeed;
      if (state.fcVibratoValue < 0) {
        state.fcVibratoValue = 0;
        state.flags ^= 64 /* kFCVibratoStep */;
      }
    }
  }
  if (state.fcPitchBendRemain !== 0) {
    state.flags ^= 128 /* kFCPitchBendStep */;
    if ((state.flags & 128 /* kFCPitchBendStep */) !== 0) {
      state.fcPitchBendRemain--;
      state.periodAdd -= satI16(state.fcPitchBendSpeed * 4) & 65535;
    }
  }
  void xc;
}
function evaluateRunningEvent(state, event) {
  switch (event.type) {
    case 26 /* Puma_VolumeRamp */:
      if (event.byte2 !== 0) {
        state.volumeAdd = satI16(
          Math.trunc(
            (event.byte1 + Math.trunc((event.u8 - event.byte1) * state.ticksRemain / event.byte2)) * 256 - 16384 & 65535
          )
        );
      }
      break;
    case 29 /* Puma_PitchRamp */:
      if (event.byte2 !== 0) {
        const start = event.u8 << 24 >> 24;
        const end = event.byte1 << 24 >> 24;
        state.periodAdd = satI16(
          Math.trunc(
            (start + Math.trunc((start - end) * state.ticksRemain / event.byte2)) * 4
          )
        );
      }
      break;
    default:
      break;
  }
}
function handleFtmInterrupt(state, field, condition) {
  const target = state[field];
  if (target === SYNTH_STOP_ROW || !condition) return;
  state.nextRow = target;
  state.ticksRemain = 0;
  state[field] = SYNTH_STOP_ROW;
}
function handleFcVolumeBend(state, forceRun) {
  if (state.fcVolumeBendRemain === 0 && !forceRun) return false;
  state.flags ^= 256 /* kFCVolumeBendStep */;
  if ((state.flags & 256 /* kFCVolumeBendStep */) !== 0) {
    state.fcVolumeBendRemain--;
    const target = state.volumeFactor + state.fcVolumeBendSpeed * 256;
    if (target < 0 || target >= 32768) state.fcVolumeBendRemain = 0;
    state.volumeFactor = clamp(target, 0, 16384);
  }
  return true;
}
function translateGt2Pitch(pitch) {
  return Math.round(Math.pow(2, pitch / 4096 - 1) * 32768) & 65535;
}
var siblingStatesAccessors = [];
function setSiblingStatesAccessor(channel, fn) {
  siblingStatesAccessors[channel] = fn;
}
function getSiblingStates(channel) {
  return siblingStatesAccessors[channel]?.(channel) ?? null;
}
function evaluateEvent(core, channel, event, state) {
  const mod = core.module;
  const xc = core.ctx.channelStates[channel];
  switch (event.type) {
    case 0 /* StopScript */:
      state.nextRow = SYNTH_STOP_ROW;
      return true;
    case 1 /* Jump */:
      state.nextRow = event.u16;
      return false;
    case 2 /* JumpIfTrue */:
      if ((state.flags & 1 /* kJumpConditionSet */) !== 0) {
        state.nextRow = event.u16;
      }
      return false;
    case 3 /* Delay */:
      state.ticksRemain = event.u16;
      return true;
    case 4 /* SetStepSpeed */:
      state.stepSpeed = event.u8;
      if (event.byte1 !== 0) state.stepsRemain = state.stepSpeed - 1;
      return false;
    case 5 /* JumpMarker */:
      return false;
    case 6 /* SampleOffset */:
    case 7 /* SampleOffsetAdd */:
    case 8 /* SampleOffsetSub */: {
      let pos = eventValue24Bit(event);
      const v = voiceAt(core, channel);
      if (v !== null) {
        if (event.type === 7 /* SampleOffsetAdd */) {
          pos += v.pos;
        } else if (event.type === 8 /* SampleOffsetSub */) {
          pos = v.pos - pos;
        } else {
          pos += state.ftmSampleStart;
        }
        v.pos = Math.min(voiceLength(v), Math.max(0, Math.trunc(pos)));
      }
      return false;
    }
    case 9 /* SetLoopCounter */:
      if (state.loopCount === 0 || event.u8 !== 0) {
        state.loopCount = 1 + Math.min(event.u16, 65534);
      }
      return false;
    case 10 /* EvaluateLoopCounter */:
      if (state.loopCount > 1) state.nextRow = event.u16;
      if (state.loopCount !== 0) state.loopCount--;
      return false;
    case 11 /* NoteCut */:
      xc.note_flags |= NoteFlag.FADEOUT;
      return false;
    case 12 /* GTK_KeyOff */:
      state.gtkKeyOffOffset = event.u16;
      return false;
    case 13 /* GTK_SetVolume */:
      state.volumeFactor = event.u16;
      return false;
    case 14 /* GTK_SetPitch */:
      state.gtkPitch = event.u16;
      state.linearPitchFactor = translateGt2Pitch(event.u16);
      state.periodAdd = 0;
      return false;
    case 15 /* GTK_SetPanning */:
      state.panning = event.u16;
      return false;
    case 16 /* GTK_SetVolumeStep */:
      state.gtkVolumeStep = event.u16 << 16 >> 16;
      return false;
    case 17 /* GTK_SetPitchStep */:
      state.gtkPitchStep = event.u16 << 16 >> 16;
      return false;
    case 18 /* GTK_SetPanningStep */:
      state.gtkPanningStep = event.u16 << 16 >> 16;
      return false;
    case 19 /* GTK_SetSpeed */:
      state.gtkSpeed = state.gtkSpeedRemain = event.u8;
      return false;
    case 20 /* GTK_EnableTremor */:
      if (event.u8 !== 0) state.flags |= 2 /* kGTKTremorEnabled */;
      else state.flags &= ~2 /* kGTKTremorEnabled */;
      return false;
    case 21 /* GTK_SetTremorTime */:
      if (event.u8 !== 0) state.gtkTremorOnTime = event.u8;
      if (event.byte1 !== 0) state.gtkTremorOffTime = event.byte1;
      state.gtkTremorPos = 0;
      return false;
    case 22 /* GTK_EnableTremolo */:
      if (event.u8 !== 0) state.flags |= 8 /* kGTKTremoloEnabled */;
      else state.flags &= ~8 /* kGTKTremoloEnabled */;
      state.gtkVibratoPos = 0;
      if (state.gtkVibratoWidth === 0) state.gtkVibratoWidth = 8;
      if (state.gtkVibratoSpeed === 0) state.gtkVibratoSpeed = 16;
      return false;
    case 23 /* GTK_EnableVibrato */:
      if (event.u8 !== 0) state.flags |= 16 /* kGTKVibratoEnabled */;
      else state.flags &= ~16 /* kGTKVibratoEnabled */;
      state.periodFreqSlide = 0;
      state.gtkVibratoPos = 0;
      if (state.gtkVibratoWidth === 0) state.gtkVibratoWidth = 3;
      if (state.gtkVibratoSpeed === 0) state.gtkVibratoSpeed = 8;
      return false;
    case 24 /* GTK_SetVibratoParams */:
      if (event.u8 !== 0) state.gtkVibratoWidth = event.u8;
      if (event.byte1 !== 0) state.gtkVibratoSpeed = event.byte1;
      return false;
    case 25 /* Puma_SetWaveform */:
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
    case 26 /* Puma_VolumeRamp */:
      if (event.byte2 !== 0) {
        state.volumeAdd = satI16(
          Math.trunc(
            (event.byte1 + Math.trunc((event.u8 - event.byte1) * state.ticksRemain / event.byte2)) * 256 - 16384
          )
        );
      } else {
        state.volumeAdd = satI16(event.u8 * 256 - 16384);
      }
      return false;
    case 27 /* Puma_StopVoice */:
      core.virt.releaseChannel(
        channel,
        3
        /* PastNote.FADE */
      );
      return false;
    case 28 /* Puma_SetPitch */:
      state.periodAdd = satI16((event.u8 << 24 >> 24) * 4);
      state.linearPitchFactor = 0;
      return false;
    case 29 /* Puma_PitchRamp */:
      if (event.byte2 !== 0) {
        state.periodAdd = satI16(
          Math.trunc(
            ((event.u8 << 24 >> 24) + Math.trunc(
              ((event.u8 << 24 >> 24) - (event.byte1 << 24 >> 24)) * state.ticksRemain
            ) / event.byte2) * 4
          )
        );
      } else {
        state.periodAdd = satI16((event.byte1 << 24 >> 24) * 4);
      }
      state.linearPitchFactor = 0;
      return false;
    case 30 /* Mupp_SetWaveform */: {
      const ins = event.u8 !== 0 ? event.u8 - 1 : xc.ins;
      if (ins >= 0 && ins < mod.instruments.length) {
        const sample = mod.instruments[ins].map[60] ?? 0;
        if (event.byte1 !== 0) {
          channelSetSample(core, channel, sample + event.byte1 - 1, true, state);
          state.volumeFactor = clamp(event.byte2 * 256, 0, 16384);
        } else {
          state.volumeFactor = clamp(event.byte2 * 256, 0, 16384);
        }
      }
      return false;
    }
    case 31 /* MED_DefineArpeggio */: {
      state.medArpOffset = state.currentRow;
      return false;
    }
    case 32 /* MED_JumpScript */: {
      const sib = getSiblingStates(channel);
      if (sib?.scripts && event.u8 < sib.states.length && event.u8 < sib.scripts.length) {
        const targetState = sib.states[event.u8];
        const script = sib.scripts[event.u8];
        targetState.jumpToPosition(script, event.u16);
        targetState.stepsRemain = 0;
      }
      return false;
    }
    case 33 /* MED_SetEnvelope */:
      if (event.byte2 !== 0) {
        state.medVolumeEnv = event.u8 & 63 | (event.byte1 !== 0 ? 128 : 0);
      } else {
        state.medVibratoEnvelope = event.u8;
      }
      state.medVolumeEnvPos = 0;
      return false;
    case 34 /* MED_SetVolume */:
      state.volumeFactor = event.u8 * 256;
      return true;
    case 35 /* MED_SetWaveform */: {
      const instr = mod.instruments[xc.ins];
      if (instr) {
        const base = instr.map[60] ?? 0;
        channelSetSample(core, channel, base + event.u8, true, state);
      }
      return true;
    }
    case 36 /* MED_SetVibratoSpeed */:
      state.medVibratoSpeed = event.u8;
      return false;
    case 37 /* MED_SetVibratoDepth */:
      state.medVibratoDepth = event.u8;
      return false;
    case 38 /* MED_SetVolumeStep */:
      state.medVolumeStep = satI16((event.u16 << 16 >> 16) * 256);
      return false;
    case 39 /* MED_SetPeriodStep */:
      state.medPeriodStep = satI16((event.u16 << 16 >> 16) * 4);
      return false;
    case 40 /* MED_HoldDecay */:
      state.medHold = event.byte1;
      state.medDecay = event.u16;
      return false;
    case 49 /* FTM_SetCondition */: {
      const threshold = event.u8 < 3 ? 2147483647 - ftmPitchToPeriod(event.u16, core, channel) : event.u16;
      const compare = event.u8 < 3 ? 2147483647 - Math.trunc(xc.period) : 64;
      switch (event.u8 % 3) {
        case 0:
          if (compare === threshold) state.flags |= 1 /* kJumpConditionSet */;
          else state.flags &= ~1 /* kJumpConditionSet */;
          break;
        case 1:
          if (compare < threshold) state.flags |= 1 /* kJumpConditionSet */;
          else state.flags &= ~1 /* kJumpConditionSet */;
          break;
        case 2:
          if (compare > threshold) state.flags |= 1 /* kJumpConditionSet */;
          else state.flags &= ~1 /* kJumpConditionSet */;
          break;
      }
      return false;
    }
    case 50 /* FTM_SetInterrupt */:
      if ((event.u8 & 1) !== 0) state.ftmPitchChangeJump = event.u16;
      if ((event.u8 & 2) !== 0) state.ftmVolumeChangeJump = event.u16;
      if ((event.u8 & 4) !== 0) state.ftmSampleChangeJump = event.u16;
      if ((event.u8 & 8) !== 0) state.ftmReleaseJump = event.u16;
      if ((event.u8 & 16) !== 0) state.ftmPortamentoJump = event.u16;
      if ((event.u8 & 32) !== 0) state.ftmVolumeDownJump = event.u16;
      return false;
    case 41 /* FTM_PlaySample */: {
      const v = voiceAt(core, channel);
      if (v !== null) {
        if (xc.ins >= 0 && xc.ins < mod.samples.length) {
        }
        const smp = v.smp;
        if (smp >= 0) {
          const sample = core.getSample(smp);
          core.virt.setVol(channel, Math.min(64, sample.volume));
        }
        v.pos = 0;
      }
      return false;
    }
    case 42 /* FTM_SetPitch */:
      xc.period = ftmPitchToPeriod(event.u16 * 2, core, channel);
      return false;
    case 44 /* FTM_SetDetune */:
      {
        const sib = getSiblingStates(channel);
        const target = sib ? sib.states[channel & ~1] ?? state : state;
        target.ftmDetune = satI16(event.u16 * -8);
      }
      return false;
    case 45 /* FTM_AddDetune */:
      {
        const sib = getSiblingStates(channel);
        const target = sib ? sib.states[channel & ~1] ?? state : state;
        target.ftmDetune = satI16(target.ftmDetune - (event.u16 << 16 >> 16) * 8);
      }
      return false;
    case 43 /* FTM_AddPitch */:
      if (event.u16 << 16 >> 16 !== 0) {
        const amount = (event.u16 << 16 >> 16) * 8;
        xc.period -= amount;
        const limit = ftmPitchToPeriod(event.u16 << 16 >> 16 < 0 ? 0 : 542, core, channel);
        if (event.u16 << 16 >> 16 > 0) {
          xc.period = Math.min(xc.period, limit);
        } else {
          xc.period = Math.max(xc.period, limit);
        }
      }
      return false;
    case 46 /* FTM_SetVolume */:
      xc.volume = Math.min(event.u8, 64);
      return false;
    case 47 /* FTM_AddVolume */: {
      xc.volume = clamp(xc.volume + (event.u16 << 16 >> 16), 0, 64);
      return false;
    }
    case 48 /* FTM_SetSample */: {
      const v = voiceAt(core, channel);
      if (v !== null) {
        state.swapSampleIndex = event.u8 + 1;
      }
      return false;
    }
    case 51 /* FTM_SetSampleStart */: {
      const rel = event.u8;
      if (rel === 1) {
        state.ftmSampleStart += Math.min(event.u16, 4294967295 - state.ftmSampleStart);
      } else if (rel === 2) {
        state.ftmSampleStart -= Math.min(event.u16, state.ftmSampleStart);
      } else {
        state.ftmSampleStart = event.u16 * 2;
      }
      return false;
    }
    case 52 /* FTM_SetOneshotLength */:
      {
        const v = voiceAt(core, channel);
        const smp = v !== null && v.smp >= 0 ? core.getSample(v.smp) : null;
        if (smp && v !== null) {
          const loopLength = smp.loopEnd - smp.loopStart;
          let loopStart = event.u16 * 2;
          if (event.u8 === 1) loopStart += smp.loopStart;
          else if (event.u8 === 2) loopStart = smp.loopStart - loopStart;
          loopStart = clamp(loopStart, 0, smp.length);
          smp.loopStart = loopStart;
          smp.loopEnd = Math.min(smp.loopStart + loopLength, smp.length);
          const looped = smp.loopEnd > smp.loopStart;
          if (v.pos >= smp.loopEnd && looped) v.pos = smp.loopStart;
          if (looped) {
            v.start = smp.loopStart;
            v.end = smp.loopEnd;
          } else {
            v.end = smp.length;
          }
        }
      }
      return false;
    case 53 /* FTM_SetRepeatLength */:
      {
        const v = voiceAt(core, channel);
        const smp = v !== null && v.smp >= 0 ? core.getSample(v.smp) : null;
        if (smp && v !== null) {
          let loopEnd = smp.loopStart + event.u16 * 2;
          if (event.u8 === 1) loopEnd = smp.loopEnd + event.u16 * 2;
          else if (event.u8 === 2) loopEnd = smp.loopEnd - event.u16 * 2;
          loopEnd = clamp(loopEnd, smp.loopStart, smp.length);
          smp.loopEnd = loopEnd;
          const looped = smp.loopEnd > smp.loopStart;
          if (v.pos >= smp.loopEnd && looped) v.pos = smp.loopStart;
          if (looped) {
            v.start = smp.loopStart;
            v.end = smp.loopEnd;
          } else {
            v.end = smp.length;
          }
        }
      }
      return false;
    case 54 /* FTM_CloneTrack */:
      if (event.byte1 < core.module.chn) {
        const srcXc = core.ctx.channelStates[event.byte1];
        const srcVi = core.virt.mapChannel(event.byte1);
        const srcV = srcVi >= 0 ? core.virt.voices[srcVi] ?? null : null;
        if ((event.byte2 & (1 | 8)) !== 0) {
          xc.period = srcXc.period;
        }
        if ((event.byte2 & (2 | 8)) !== 0) {
          xc.volume = srcXc.volume;
        }
        if ((event.byte2 & (4 | 8)) !== 0 && srcV !== null) {
          const dstV = voiceAt(core, channel);
          if (dstV !== null) {
            dstV.ins = srcV.ins;
            dstV.smp = srcV.smp;
            dstV.pos = srcV.pos;
            dstV.start = srcV.start;
            dstV.end = srcV.end;
          }
        }
        if ((event.byte2 & 8) !== 0) {
          const dstFc = getSiblingStates(channel);
          const srcFc = getSiblingStates(event.byte1);
          if (dstFc && srcFc) {
            dstFc.fcPortaActive = srcFc.fcPortaActive;
            dstFc.fcPortaParam = srcFc.fcPortaParam;
            dstFc.fcPortaTick = srcFc.fcPortaTick;
            dstFc.portaDurationActive = srcFc.portaDurationActive;
            dstFc.portamentoSlide = srcFc.portamentoSlide;
            dstFc.swapSampleIndex = srcFc.swapSampleIndex;
          }
        }
      }
      return false;
    case 55 /* FTM_StartLFO */: {
      const lfo = state.ftmLfo[event.u8 & 3];
      lfo.targetWaveform = event.byte1;
      lfo.speed = 0;
      lfo.depth = 0;
      lfo.position = 0;
      return false;
    }
    case 56 /* FTM_LFOAddSub */: {
      const lfo = state.ftmLfo[event.u8 & 3];
      const factor = (event.u8 & 4) !== 0 ? -1 : 1;
      lfo.speed = Math.min(clampU8(lfo.speed + event.byte1 * factor), 191);
      lfo.depth = Math.min(clampU8(lfo.depth + event.byte2 * factor), 127);
      return false;
    }
    case 57 /* FTM_SetWorkTrack */:
      if (event.u8 === 255) {
        state.ftmWorkTrack = 0;
      } else if (event.byte1 !== 0 && event.u8 !== 0) {
        if (state.ftmWorkTrack === 0) state.ftmWorkTrack = channel + 1;
        state.ftmWorkTrack = (state.ftmWorkTrack - 1 + event.u8) % mod.chn + 1 & 255;
      } else if (event.byte1 === 0) {
        state.ftmWorkTrack = event.u8 + 1;
      }
      return false;
    case 58 /* FTM_SetGlobalVolume */:
      core.ctx.p.gvol = clamp(event.u16 >> 1, 0, 64);
      return false;
    case 59 /* FTM_SetTempo */:
      core.ctx.p.bpm = Math.trunc(1777517482e-3 / clamp(event.u16, 4096, 20479));
      return false;
    case 60 /* FTM_SetSpeed */:
      if (event.u16 !== 0) core.ctx.p.speed = event.u16;
      else core.ctx.p.speed = 65535;
      return false;
    case 61 /* FTM_SetPlayPosition */:
      {
        const ord = mod.xxo.indexOf(event.u16);
        if (ord >= 0) {
          core.ctx.p.pos = ord;
          core.ctx.p.row = event.u8;
        }
      }
      return false;
    case 62 /* FC_SetWaveform */: {
      let waveform = event.byte1 + 1 & 255;
      if (event.u8 === 233) {
        waveform = waveform + event.byte2 * 10 + 90 & 255;
      }
      channelSetSample(core, channel, waveform - 1, event.u8 !== 228, state);
      return false;
    }
    case 63 /* FC_SetPitch */:
      state.fcPitch = event.u8 << 24 >> 24;
      return true;
    case 64 /* FC_SetVibrato */:
      state.fcVibratoSpeed = event.u8;
      state.fcVibratoDepth = event.byte1;
      if ((state.flags & 32 /* kFCVibratoDelaySet */) === 0) {
        state.flags |= 32 /* kFCVibratoDelaySet */;
        state.fcVibratoDelay = event.byte2;
        state.fcVibratoValue = state.fcVibratoDepth;
      }
      return false;
    case 65 /* FC_PitchSlide */:
      state.fcPitchBendSpeed = event.u8 << 24 >> 24;
      state.fcPitchBendRemain = event.byte1;
      return false;
    case 66 /* FC_VolumeSlide */:
      state.fcVolumeBendSpeed = event.u8 << 24 >> 24;
      state.fcVolumeBendRemain = event.byte1;
      handleFcVolumeBend(state, true);
      return true;
  }
  return false;
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function clampU8(v) {
  return clamp(v & 4294967295, 0, 255) & 255;
}
function satI16(v) {
  return clamp(v, -32768, 32767);
}
function currentEvent(core, chn) {
  const mod = core.module;
  const p = core.ctx.p;
  const pat = mod.patterns[mod.xxo[p.ord] ?? 0];
  const row = p.row;
  const tr = pat?.tracks[chn];
  return tr?.event[row] ?? { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
}
function isNote(note) {
  return note > 0 && note < 120;
}
function voiceAt(core, chn) {
  const vi = core.virt.mapChannel(chn);
  if (vi < 0) return null;
  return core.virt.voices[vi] ?? null;
}
function ftmPitchToPeriod(pitch, _core, _chn) {
  void _core;
  void _chn;
  const FREQ_S3M = [1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 907];
  const note = 61 - 12 + Math.floor(pitch / 16);
  const idx = note % 12, oct = Math.floor(note / 12);
  const c5Speed = 8363;
  let period = Math.trunc(c5Speed * (FREQ_S3M[idx] << 5) / (c5Speed << oct));
  period -= pitch % 16 * 4;
  return period < 1 ? 1 : period;
}

// ../../packages/fmt-fc/src/fc.ts
var FC_MAX_SIZE = 524288;
function sequenceSizeOf(h) {
  if (h.sequenceSize > 0) return h.sequenceSize;
  const headerSize = h.isFc14 ? 180 : 100;
  if (h.patternsOffset > headerSize) return h.patternsOffset - headerSize;
  return 0;
}
function headerIsValid(h) {
  if (h.magic !== "SMOD" && h.magic !== "FC14") return false;
  const seqSize = sequenceSizeOf(h);
  if (seqSize % 13 > 1 || // Some files have a mysterious extra byte
  seqSize < 13 || seqSize > 256 * 13 || h.patternsSize % 64 !== 0 || h.patternsSize === 0 || h.patternsSize > 64 * 256 || h.patternsOffset > FC_MAX_SIZE || h.freqSequenceSize % 64 !== 0 || h.freqSequenceSize === 0 || h.freqSequenceSize > 64 * 256 || h.freqSequenceOffset > FC_MAX_SIZE || h.volSequenceSize % 64 !== 0 || h.volSequenceSize === 0 || h.volSequenceSize > 64 * 256 || h.volSequenceOffset > FC_MAX_SIZE || h.sampleDataOffset > FC_MAX_SIZE || h.waveTableOffset > FC_MAX_SIZE) {
    return false;
  }
  return true;
}
function readHeader(b) {
  if (b.length < 100) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const magic = String.fromCharCode(b[0], b[1], b[2], b[3]);
  if (magic !== "SMOD" && magic !== "FC14") return null;
  const h = {
    magic,
    sequenceSize: dv.getUint32(4, false),
    patternsOffset: dv.getUint32(8, false),
    patternsSize: dv.getUint32(12, false),
    freqSequenceOffset: dv.getUint32(16, false),
    freqSequenceSize: dv.getUint32(20, false),
    volSequenceOffset: dv.getUint32(24, false),
    volSequenceSize: dv.getUint32(28, false),
    sampleDataOffset: dv.getUint32(32, false),
    waveTableOffset: dv.getUint32(36, false),
    sampleInfo: [],
    isFc14: magic === "FC14"
  };
  for (let i = 0; i < 10; i++) {
    const off = 40 + i * 6;
    h.sampleInfo.push({
      length: dv.getUint16(off, false),
      loopStart: dv.getUint16(off + 2, false),
      loopLength: dv.getUint16(off + 4, false)
    });
  }
  if (!headerIsValid(h)) return null;
  return h;
}
function translateFcScript(events, script, isFc14, startSequence = 65535) {
  const isVolume = startSequence > 255;
  const volScriptSpeed = script[0] > 0 ? script[0] : 255;
  if (isVolume) {
    events.events.push(evSetStepSpeed(volScriptSpeed, true));
  }
  const sequencesToParse = [isVolume ? 0 : startSequence & 255];
  const parsedSequences = new Set(sequencesToParse);
  const entryFromByte = /* @__PURE__ */ new Map();
  events.events.push(evJumpMarker(0));
  while (sequencesToParse.length > 0) {
    const sequence = sequencesToParse.pop();
    const currentSequenceOffset = sequence * 64;
    if (isVolume) {
    }
    const maxScriptJumpPos = currentSequenceOffset + (isVolume ? 260 : 63) & 65535;
    let maxJump = 0;
    let nextByteIsPitch = false;
    let pos = currentSequenceOffset;
    if (isVolume) pos += 5;
    while (pos < script.length) {
      const scriptPos = pos & 65535;
      if (scriptPos <= maxScriptJumpPos) {
        entryFromByte.set(scriptPos, events.events.length);
      }
      const b = script[pos++];
      if (nextByteIsPitch) {
        events.events.push(evFcSetPitch(b << 24 >> 24));
        nextByteIsPitch = false;
        continue;
      }
      const volumeCommand = evMedSetVolume(Math.min(b & 127, 64));
      let handled = true;
      switch (b) {
        case 224: {
          let target = script[pos++] & 63;
          if (isVolume && target < 5) {
            target += 256;
          }
          target += currentSequenceOffset;
          if (!isVolume && target < script.length && (script[target] === 224 || script[target] === 225)) {
            events.events.push(evFcSetPitch(script[target] << 24 >> 24));
            target++;
            if (target < script.length && script[target - 1] === 224) {
              events.events.push(evFcSetPitch(script[target] << 24 >> 24));
              target++;
            }
          }
          maxJump = Math.max(maxJump, target);
          events.events.push(evJump(target & 65535));
          break;
        }
        case 225:
          events.events.push(evStopScript());
          break;
        case 226:
          if (!isVolume) {
            events.events.push(evMedJumpScript(1, 0));
            pos++;
            events.events.push(evFcSetWaveform(b, script[pos - 1], 0));
          } else {
            handled = false;
          }
          break;
        case 227:
          if (isVolume) {
            handled = false;
          } else {
            const speed = script[pos++];
            const depth = script[pos++];
            events.events.push(evFcSetVibrato(speed, depth, 0));
          }
          break;
        case 228:
          if (isVolume) {
            handled = false;
          } else {
            const waveform = script[pos++];
            events.events.push(evFcSetWaveform(b, waveform, 0));
          }
          break;
        case 231: {
          if (isVolume) {
            handled = false;
          } else {
            const sequence2 = script[pos++];
            events.events.push(evJump(sequence2 * 64 & 65535));
            if (!parsedSequences.has(sequence2)) {
              parsedSequences.add(sequence2);
              sequencesToParse.push(sequence2);
            }
          }
          break;
        }
        case 232: {
          const delay = script[pos++];
          if (isVolume && volScriptSpeed > 1) {
            events.events.push(evSetStepSpeed(1, true));
            events.events.push(evDelay(delay + volScriptSpeed - 2));
            events.events.push(evSetStepSpeed(volScriptSpeed, true));
          } else if (delay !== 0) {
            events.events.push(evDelay(delay - 1));
          }
          break;
        }
        case 233: {
          if (isVolume) {
            handled = false;
          } else if (isFc14) {
            const waveform = script[pos++];
            const subSample = script[pos++];
            events.events.push(evFcSetWaveform(b, subSample, waveform));
          } else {
            events.events.push(evFcSetPitch(b << 24 >> 24));
          }
          break;
        }
        case 234: {
          if (isFc14) {
            const speed = script[pos++];
            const time = script[pos++];
            if (isVolume) {
              events.events.push(evFcVolumeSlide(speed, time));
            } else {
              events.events.push(evFcPitchSlide(speed, time));
            }
            break;
          }
          handled = false;
          break;
        }
        default:
          handled = false;
          break;
      }
      if (!handled) {
        if (isVolume) {
          events.events.push(volumeCommand);
        } else {
          events.events.push(evFcSetPitch(b << 24 >> 24));
        }
      }
      if (!isVolume) {
        nextByteIsPitch = b >= 226 && b <= 228 || isFc14 && (b === 233 || b === 234);
      }
      if ((b === 224 || b === 225 || b === 231 && !isVolume) && (maxJump <= scriptPos || scriptPos >= maxScriptJumpPos)) {
        break;
      }
    }
  }
  for (const e of events.events) {
    fixupJumpTarget(e, entryFromByte);
  }
}
var FC_SAMPLE_LENGTHS = [
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  16,
  16,
  8,
  8,
  24
  // FC 1.4 imports the last sample with a length of 32 instead of 48
];
var FC_SAMPLE_DATA = (() => {
  const rows = [
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 3F 37 2F 27 1F 17 0F 07 FF 07 0F 17 1F 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 37 2F 27 1F 17 0F 07 FF 07 0F 17 1F 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 2F 27 1F 17 0F 07 FF 07 0F 17 1F 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 27 1F 17 0F 07 FF 07 0F 17 1F 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 1F 17 0F 07 FF 07 0F 17 1F 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 17 0F 07 FF 07 0F 17 1F 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 0F 07 FF 07 0F 17 1F 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 07 FF 07 0F 17 1F 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 FF 07 0F 17 1F 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 07 0F 17 1F 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 88 0F 17 1F 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 88 90 17 1F 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 88 90 98 1F 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 88 90 98 A0 27 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 88 90 98 A0 A8 2F 37",
    "C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 88 90 98 A0 A8 B0 37",
    "81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F",
    "81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F",
    "81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F",
    "81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F",
    "81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F",
    "80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 7F 7F",
    "80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 7F",
    "80 80 80 80 80 80 80 80 7F 7F 7F 7F 7F 7F 7F 7F",
    "80 80 80 80 80 80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "80 80 80 80 80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "80 80 80 80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "80 80 80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "80 80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F",
    "80 80 90 98 A0 A8 B0 B8 C0 C8 D0 D8 E0 E8 F0 F8 00 08 10 18 20 28 30 38 40 48 50 58 60 68 70 7F",
    "80 80 A0 B0 C0 D0 E0 F0 00 10 20 30 40 50 60 70",
    "45 45 79 7D 7A 77 70 66 61 58 53 4D 2C 20 18 12 04 DB D3 CD C6 BC B5 AE A8 A3 9D 99 93 8E 8B 8A",
    "45 45 79 7D 7A 77 70 66 5B 4B 43 37 2C 20 18 12 04 F8 E8 DB CF C6 BE B0 A8 A4 9E 9A 95 94 8D 83",
    "00 00 40 60 7F 60 40 20 00 E0 C0 A0 80 A0 C0 E0",
    "00 00 40 60 7F 60 40 20 00 E0 C0 A0 80 A0 C0 E0",
    "80 80 90 98 A0 A8 B0 B8 C0 C8 D0 D8 E0 E8 F0 F8 00 08 10 18 20 28 30 38 40 48 50 58 60 68 70 7F 80 80 A0 B0 C0 D0 E0 F0 00 10 20 30 40 50 60 70"
  ];
  const out = [];
  for (const row of rows) {
    for (const tok of row.split(" ")) {
      out.push(parseInt(tok, 16));
    }
  }
  return out;
})();
function sampleFromBuiltin(offset, length) {
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const v = FC_SAMPLE_DATA[offset + i] ?? 128;
    data[i] = v;
  }
  return data;
}
function fcTest(bytes) {
  return readHeader(bytes) !== null;
}
var NOTE_MIDDLEC = 61;
function convertSample(info, bytes, filePos, isFc14, raw) {
  let length = info.length * 2;
  if (isFc14 && length !== 0) length += 2;
  const loopStart = info.loopStart;
  const loopEnd = loopStart + info.loopLength * 2;
  const looped = info.loopLength > 1;
  const nextSampleStart = filePos.v + length;
  if (looped && loopEnd > length) {
    length = loopEnd;
  }
  raw.length = length;
  raw.loopStart = loopStart;
  raw.loopEnd = loopEnd;
  raw.flags = looped ? SampleFlags.LOOP : 0;
  raw.finetune = 0;
  raw.volume = 64;
  raw.c5spd = 8363;
  const take = Math.min(length, Math.max(0, bytes.length - filePos.v));
  const data = new Uint8Array(length);
  for (let i = 0; i < take; i++) {
    data[i] = bytes[filePos.v + i];
  }
  raw.data = data;
  filePos.v = nextSampleStart;
}
function fcLoad(bytes, ctx) {
  const header = readHeader(bytes);
  if (!header) throw new ParseError("FC: invalid header");
  const isFc14 = header.isFc14;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chnCount = 4;
  const numInstruments = Math.min(
    Math.trunc(header.volSequenceSize / 64) + 1,
    255
  );
  const waveTableLengths = new Uint8Array(80);
  let pos = 100;
  if (isFc14) {
    waveTableLengths.set(bytes.subarray(pos, pos + 80));
    pos += 80;
  }
  const numOrders = Math.trunc(sequenceSizeOf(header) / 13);
  const orderData = [];
  for (let ord = 0; ord < numOrders; ord++) {
    const off = pos + ord * 13;
    const entry = {
      pattern: [0, 0, 0, 0],
      noteTranspose: [0, 0, 0, 0],
      instrTranspose: [0, 0, 0, 0],
      speed: 0
    };
    for (let c = 0; c < 4; c++) {
      entry.pattern[c] = bytes[off + c * 3];
      entry.noteTranspose[c] = bytes[off + c * 3 + 1] << 24 >> 24;
      entry.instrTranspose[c] = bytes[off + c * 3 + 2] << 24 >> 24;
    }
    entry.speed = bytes[off + 12];
    orderData.push(entry);
  }
  pos += numOrders * 13;
  const patternData = [];
  {
    let p = header.patternsOffset;
    const count = header.patternsSize / 2;
    for (let i = 0; i < count; i++) {
      patternData.push([dv.getUint16(p + i * 2, false) >> 8, dv.getUint16(p + i * 2, false) & 255]);
    }
  }
  const patterns = [];
  const prevNote = [0, 0, 0, 0];
  for (let ord = 0; ord < numOrders; ord++) {
    const rows = 32;
    const tracks = [];
    for (let c = 0; c < chnCount; c++) {
      const ev = [];
      for (let r = 0; r < rows; r++) ev.push({ ...EMPTY_EVENT });
      tracks.push({ rows, event: ev });
    }
    patterns.push({ rows, tracks });
    let lastRow = rows;
    const order = orderData[ord];
    for (let c = 0; c < chnCount; c++) {
      const chnInfo = order;
      const patternOffset = chnInfo.pattern[c] * 32;
      if (patternOffset >= patternData.length) continue;
      const track = patterns[ord].tracks[c];
      for (let row = 0; row < rows; row++) {
        const p = patternData[patternOffset + row] ?? [0, 0];
        const m = track.event[row];
        if (p[0] === 73) {
          lastRow = Math.min(lastRow, row);
        }
        if (p[0] > 0 && p[0] !== 73) {
          prevNote[c] = p[0];
          m.note = 1 + (chnInfo.noteTranspose[c] + p[0] & 127);
          const instr = (p[1] & 63) + chnInfo.instrTranspose[c] + 1;
          m.ins = instr >= 1 && instr <= numInstruments ? instr : numInstruments;
        } else if (row === 0 && ord > 0 && orderData[ord - 1].noteTranspose[c] !== chnInfo.noteTranspose[c] && prevNote[c] > 0) {
          m.note = 1 + (chnInfo.noteTranspose[c] + prevNote[c] & 127);
          if ((p[1] & 192) !== 0) {
            m.f2t = 3;
            m.f2p = 9;
          } else {
            m.fxt = FX_FC_TONEPORTA_DURATION;
            m.fxp = 0;
          }
        }
        if ((p[1] & 192) !== 0) {
          m.f2t = FX_FC_AUTO_PORTA;
          m.f2p = 0;
        }
        if ((p[1] & 128) !== 0) {
          const data = row + 1 < 32 ? (patternData[patternOffset + row + 1] ?? [0, 0])[1] : 0;
          let param = data & 31;
          if (!isFc14) param *= 2;
          if (data > 31) param = -param;
          m.fxp = param & 255;
        }
      }
    }
    if (order.speed !== 0) {
      const m = patterns[ord].tracks[0].event[0];
      if (m.fxt === 0) {
        m.fxt = FX_SPEED;
        m.fxp = order.speed;
      }
    }
    if (lastRow < rows) {
      const row = Math.max(lastRow, 1) - 1;
      const m = patterns[ord].tracks[3].event[row];
      if (m.fxt === 0) {
        m.fxt = FX_BREAK;
        m.fxp = 0;
      }
    }
  }
  const freqSequences = new Uint8Array(64 * 256);
  {
    let p = header.freqSequenceOffset;
    const len = header.freqSequenceSize;
    for (let i = 0; i < len; i++) {
      freqSequences[i] = bytes[p + i] ?? 0;
    }
  }
  const volSequences = new Uint8Array(header.volSequenceSize + 8);
  {
    let p = header.volSequenceOffset;
    const len = header.volSequenceSize;
    for (let i = 0; i < len; i++) {
      volSequences[i] = bytes[p + i] ?? 0;
    }
  }
  const emptyInstr = [1, 0, 0, 0, 0, 0, 0, 225];
  for (let i = 0; i < 8; i++) {
    volSequences[header.volSequenceSize + i] = emptyInstr[i];
  }
  const instruments = [];
  const fcNoteMap = new Array(128).fill(0);
  for (let ins = 1; ins <= numInstruments; ins++) {
    const volSeqOff = (ins - 1) * 64;
    const volSeq = volSequences.subarray(volSeqOff, volSeqOff + 64);
    const freqSeqOff = (volSeq[1] ?? 0) * 64;
    const freqSeq = freqSequences.subarray(freqSeqOff, freqSeqOff + 64);
    let defaultSample = freqSeq[1] ?? 0;
    if (freqSeq[0] === 233) {
      defaultSample = 90 + defaultSample * 10 + (freqSeq[2] ?? 0);
    }
    const map = new Array(121).fill(255);
    const mapXpo = new Array(121).fill(0);
    for (let note = 0; note <= 127; note++) {
      let mapped;
      if (note < 48) mapped = note + NOTE_MIDDLEC - 24;
      else if (note < 60 || note >= 120) mapped = NOTE_MIDDLEC + 23;
      else mapped = note + NOTE_MIDDLEC - 36 - 60;
      fcNoteMap[note] = mapped;
      const key = note + 1;
      if (key >= 1 && key <= 120) {
        map[key - 1] = 0;
        mapXpo[key - 1] = 0;
      }
    }
    const freqEvents = { events: [] };
    const volEvents = { events: [] };
    freqEvents.events.push(evFcSetVibrato(volSeq[2] ?? 0, volSeq[3] ?? 0, volSeq[4] ?? 0));
    translateFcScript(freqEvents, freqSequences, isFc14, volSeq[1] ?? 0);
    translateFcScript(volEvents, volSequences, isFc14);
    const sub = {
      vol: 64,
      gvl: 64,
      pan: -1,
      xpo: 0,
      fin: 0,
      vwf: 0,
      vde: 0,
      vra: 0,
      vsw: 0,
      sid: defaultSample,
      // 0-based sample id (C: defaultSample + 1 - 1)
      rvv: 0,
      nna: 0,
      dct: 0,
      dca: 0,
      ifc: 0,
      ifr: 0
    };
    const instrument = {
      name: "",
      volume: 64,
      nsm: 1,
      rls: 0,
      map,
      mapXpo,
      sub: [sub],
      aei: zeroEnvelope(),
      pei: zeroEnvelope(),
      fei: zeroEnvelope()
    };
    instruments.push(instrument);
    fcScripts.set(instrument, [freqEvents.events, volEvents.events]);
  }
  const rawSamples = [];
  for (let i = 0; i < 190; i++) rawSamples.push(blankSample());
  const sampleFilePos = { v: header.sampleDataOffset };
  for (let smp = 0; smp < 10; smp++) {
    const info = header.sampleInfo[smp];
    if (info.length === 0) continue;
    if (isFc14 && bytes[sampleFilePos.v] === 83 && bytes[sampleFilePos.v + 1] === 83 && bytes[sampleFilePos.v + 2] === 77 && bytes[sampleFilePos.v + 3] === 80) {
      sampleFilePos.v += 4;
      const sampleHeaders = bytes.subarray(sampleFilePos.v, sampleFilePos.v + 160);
      sampleFilePos.v += 160;
      for (let subSmp = 0; subSmp < 10; subSmp++) {
        const hOff = subSmp * 16;
        const subInfo = {
          length: sampleHeaders[hOff + 4] << 8 | sampleHeaders[hOff + 5],
          loopStart: sampleHeaders[hOff + 6] << 8 | sampleHeaders[hOff + 7],
          loopLength: sampleHeaders[hOff + 8] << 8 | sampleHeaders[hOff + 9]
        };
        const raw = blankSample();
        convertSample(subInfo, bytes, sampleFilePos, true, raw);
        ctx.addSample(raw);
        rawSamples[91 + smp * 10 + subSmp - 1] = raw;
      }
    } else {
      const raw = rawSamples[smp];
      convertSample(info, bytes, sampleFilePos, isFc14, raw);
    }
  }
  const sampleLengths = isFc14 ? Array.from(waveTableLengths) : FC_SAMPLE_LENGTHS;
  let builtinOffset = 0;
  for (let smp = 0; smp < sampleLengths.length; smp++) {
    const len = sampleLengths[smp] * 2;
    const raw = rawSamples[10 + smp];
    raw.length = len;
    raw.loopStart = 0;
    raw.loopEnd = len;
    raw.flags = SampleFlags.LOOP;
    raw.data = isFc14 ? bytes.subarray(header.waveTableOffset + builtinOffset, header.waveTableOffset + builtinOffset + len) : sampleFromBuiltin(builtinOffset, len);
    if (isFc14) builtinOffset += len;
    else builtinOffset += len;
  }
  for (const raw of rawSamples) ctx.addSample(raw);
  const mod = {
    title: "",
    format: "mod",
    comment: "",
    chn: chnCount,
    pat: numOrders,
    ins: numInstruments,
    len: numOrders,
    restart: 0,
    xxo: Array.from({ length: numOrders }, (_, i) => i),
    channels: [],
    patterns,
    instruments,
    samples: rawSamples,
    num_sequences: 1,
    sequences: [
      {
        ord: 0,
        entry_point: 0,
        duration: 0,
        time: 0,
        speed: 3,
        bpm: 125,
        gvl: -1,
        start_row: 0
      }
    ],
    speed: 3,
    // Order().SetDefaultSpeed(3)
    bpm: 125,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks: Quirk.PROTRACK,
    flowMode: 0,
    readEventType: ReadEventType.MOD,
    periodType: PeriodType.AMIGA,
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate: C4_PAL_RATE,
    compare_vblank: false,
    tracker: isFc14 ? "Future Composer 1.4" : "Future Composer 1.0 - 1.3",
    extras: { kind: "fc", noteMap: fcNoteMap }
  };
  for (let i = 0; i < chnCount; i++) {
    const pan = Math.floor((i + 1) / 2) % 2 === 0 ? 32 : 224;
    mod.channels.push({
      pan: i % 2 === 0 ? 32 : 224,
      vol: 64,
      flg: 0
    });
    void pan;
  }
  void dv;
  return mod;
}
function zeroEnvelope() {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}
function blankSample() {
  return {
    name: "",
    data: new Uint8Array(0),
    length: 0,
    loopStart: 0,
    loopEnd: 0,
    sustainStart: 0,
    sustainEnd: 0,
    finetune: 0,
    volume: 64,
    flags: 0,
    c5spd: 8363
  };
}
var fcScripts = /* @__PURE__ */ new WeakMap();
var fcChannelState = [];
function getChannelExtras(core, chn) {
  void core;
  let st = fcChannelState[chn];
  if (!st) {
    st = {
      states: [],
      scripts: null,
      swapSampleIndex: 0,
      fcPortaTick: false,
      fcPortaActive: false,
      fcPortaParam: 0,
      portaDurationActive: false,
      portamentoSlide: 0,
      portaDestPeriod: 0
    };
    fcChannelState[chn] = st;
  }
  return st;
}
setSiblingStatesAccessor(0, (channel) => fcChannelState[channel] ?? null);
setSiblingStatesAccessor(1, (channel) => fcChannelState[channel] ?? null);
setSiblingStatesAccessor(2, (channel) => fcChannelState[channel] ?? null);
setSiblingStatesAccessor(3, (channel) => fcChannelState[channel] ?? null);
var fcEffect = {
  name: "fc-synth",
  onRow(core, chn, ev) {
    void core;
    const mod = core.module;
    if (mod.extras?.kind !== "fc") return;
    const st = getChannelExtras(core, chn);
    if (ev.fxt === FX_FC_AUTO_PORTA) {
      st.fcPortaActive = ev.fxp !== 0;
      st.fcPortaParam = ev.fxp;
    }
    if (ev.ins > 0 && ev.ins <= mod.instruments.length) {
      const instr = mod.instruments[ev.ins - 1];
      const scripts = fcScripts.get(instr);
      if (scripts) {
        st.scripts = scripts;
        st.states = scripts.map(() => new SynthState());
      }
    }
    if (ev.note > 0 && ev.note < 120) {
      for (const s of st.states) s.reconstruct();
    }
    if (st.portaDurationActive && ev.note > 0 && ev.fxt !== FX_FC_TONEPORTA_DURATION) {
      const xc0 = core.ctx.channelStates[chn];
      if (st.portaDestPeriod !== 0) xc0.period = st.portaDestPeriod;
      st.portaDurationActive = false;
      st.portaDestPeriod = 0;
    }
    if (ev.fxt === FX_FC_TONEPORTA_DURATION && ev.note > 0) {
      const xc = core.ctx.channelStates[chn];
      st.portaDurationActive = ev.fxp !== 0;
      if (ev.fxp === 0) {
        xc.period = notePeriod(core, ev.note);
        st.portamentoSlide = 0;
      } else {
        const speed = core.ctx.p.speed;
        const sourceNote = noteFromPeriod(core, xc.period);
        const num = Math.abs(ev.note - sourceNote) * 64;
        const den = speed * ev.fxp;
        st.portamentoSlide = den > 0 ? Math.trunc((num + den / 2) / den) : 0;
        st.portaDestPeriod = notePeriod(core, ev.note);
      }
    }
    if (ev.fxt === FX_FC_MED_SYNTH_JUMP) {
      if (st.scripts && st.scripts[1]) {
        const script = st.scripts[1];
        if (st.states.length < 2) st.states.push(new SynthState());
        const state = st.states[1];
        if (state.nextRow === 0 && script.length > 0 && script[0].type === 4 /* SetStepSpeed */) {
          state.nextRow = 0;
        }
        state.jumpToPosition(script, ev.fxp);
      }
    }
  },
  onTick(core, chn) {
    const mod = core.module;
    if (mod.extras?.kind !== "fc") return;
    const st = getChannelExtras(core, chn);
    if (!st.scripts) return;
    for (let i = 0; i < st.scripts.length; i++) {
      const script = st.scripts[i];
      let state = st.states[i];
      if (!state) {
        state = new SynthState();
        st.states[i] = state;
      }
      const xc = core.ctx.channelStates[chn];
      if (core.ctx.p.frame === 0 && xc.note !== 0 && (xc.note_flags & 1 << 6) !== 0) {
        state.reconstruct();
      }
      synthStateNextTick(core, chn, script, state);
    }
  },
  onTickPost(core, chn) {
    const mod = core.module;
    if (mod.extras?.kind !== "fc") return;
    const st = getChannelExtras(core, chn);
    if (!st.scripts) return;
    const xc = core.ctx.channelStates[chn];
    const instr = xc.ins >= 0 ? mod.instruments[xc.ins] : null;
    if (!instr) return;
    const vi = core.virt.mapChannel(chn);
    const v2 = vi >= 0 ? core.virt.voices[vi] ?? null : null;
    if (st.portaDurationActive && st.portaDestPeriod !== 0 && v2 !== null) {
      const dest = st.portaDestPeriod;
      const delta = st.portamentoSlide;
      if (v2.period < dest) {
        v2.period += delta;
        if (v2.period >= dest) {
          v2.period = dest;
          st.portaDestPeriod = 0;
        }
      } else if (v2.period > dest) {
        v2.period -= delta;
        if (v2.period <= dest) {
          v2.period = dest;
          st.portaDestPeriod = 0;
        }
      }
    }
    if (st.fcPortaActive) {
      st.fcPortaTick = !st.fcPortaTick;
      if (st.fcPortaTick) {
        const vi2 = core.virt.mapChannel(chn);
        const v = vi2 >= 0 ? core.virt.voices[vi2] ?? null : null;
        if (v !== null && v.period > 0) {
          const delta = st.fcPortaParam << 24 >> 24;
          v.period -= delta * 4;
        }
      }
    }
    for (let i = 0; i < st.scripts.length; i++) {
      const script = st.scripts[i];
      const state = st.states[i];
      if (!state) continue;
      const applied = applyState(core, chn, xc, instr, state);
      if (applied && i === 0) {
      }
      void script;
    }
    if (st.swapSampleIndex > 0) {
      const vi2 = core.virt.mapChannel(chn);
      const v = vi2 >= 0 ? core.virt.voices[vi2] ?? null : null;
      const stillActive = v !== null && v.smp >= 0 && voiceIsActive(v);
      const queued = v !== null && (v.flags & 32) !== 0;
      if (!stillActive && !queued) {
        const smp0 = st.swapSampleIndex - 1;
        if (smp0 >= 0 && smp0 < mod.samples.length) {
          core.virt.setPatchSmp(chn, xc.ins, smp0, xc.note);
        }
        st.swapSampleIndex = 0;
      } else if (stillActive && v !== null && v.smp === st.swapSampleIndex - 1) {
        st.swapSampleIndex = 0;
      }
    }
  }
};
function applyState(core, chn, xc, instr, state) {
  void instr;
  const vi = core.virt.mapChannel(chn);
  const v = vi >= 0 ? core.virt.voices[vi] ?? null : null;
  if (v !== null && v.smp >= 0) {
    if (state.volumeFactor !== 16384) {
      v.vol = Math.trunc(v.vol * state.volumeFactor / 16384);
    }
    if (state.volumeAdd !== -32768) {
      v.vol = clampVol(v.vol + state.volumeAdd / 4);
    }
    if ((state.flags & 1 << 1) !== 0 && (state.flags & 1 << 2) !== 0) {
      v.vol = 0;
    }
  }
  void state.panning;
  if (v !== null && v.period > 0) {
    let period = v.period;
    if (state.periodFreqSlide !== 0) {
      period -= state.periodFreqSlide;
    }
    period += state.periodAdd;
    if (state.linearPitchFactor !== 0) {
    }
    if (state.medVibratoDepth !== 0) {
      period += Math.trunc(state.medVibratoValue * state.medVibratoDepth / 64);
    }
    const noteMap = core.module.extras?.kind === "fc" ? core.module.extras.noteMap : null;
    const vibratoFc = state.fcVibratoValue - state.fcVibratoDepth;
    const doVibratoFc = vibratoFc !== 0 && state.fcVibratoDelay < 1;
    if ((state.fcPitch !== 0 || doVibratoFc) && noteMap) {
      const lastNote = xc.note;
      let fcNote;
      if (state.fcPitch >= 0) {
        fcNote = state.fcPitch + lastNote & 127;
      } else {
        fcNote = state.fcPitch & 127;
      }
      if (state.fcPitch !== 0 && lastNote >= 0 && lastNote <= 127) {
        const p1 = notePeriod(core, noteMap[fcNote] ?? 0);
        const p2 = notePeriod(core, noteMap[lastNote] ?? 0);
        period += p1 - p2;
      }
      if (doVibratoFc) {
        let note = fcNote * 2 + 160;
        let vf = vibratoFc;
        while (note < 256) {
          vf *= 2;
          note += 24;
        }
        period += vf * 4;
      }
    }
    if (period < 113 * 4) period = 113 * 4;
    else if (period > 3424 * 4) period = 3424 * 4;
    if (period < 1) period = 1;
    v.period = period;
  }
  return true;
}
function noteFromPeriod(core, period) {
  if (!period) return 0;
  let minNote = 1, maxNote = 120;
  while (minNote <= maxNote) {
    const mid = minNote + maxNote >> 1;
    const p = notePeriod(core, mid);
    if (p > period) minNote = mid + 1;
    else if (p < period) maxNote = mid - 1;
    else return mid;
  }
  return minNote + maxNote >> 1;
}
function notePeriod(core, openmptNote) {
  void core;
  const FREQ = [1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 907];
  const n = openmptNote - 1;
  if (n < 0) return 0;
  return Math.trunc(8363 * (FREQ[n % 12] << 5) / (8363 << Math.floor(n / 12)));
}
function clampVol(v) {
  return Math.max(0, Math.min(64, v));
}
var plugin = {
  name: "fc",
  test: fcTest,
  load: fcLoad,
  readEvent(core, chn, row) {
    const mod = core.module;
    void mod;
    void chn;
    void row;
    const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    if (e.ins !== 0) {
      const xc = core.ctx.channelStates[chn];
      xc.old_ins = e.ins;
    }
    modReadEvent(core, chn, row);
  }
};
var modReadEvent = () => {
  throw new ParseError("FC: fmt-mod reader not wired");
};
function setModEventReader(fn) {
  modReadEvent = fn;
}
function voiceIsActive(v) {
  return (v.flags & 64) === 0;
}
export {
  SYNTH_STOP_ROW,
  SynthEventType,
  SynthState,
  SynthStates,
  channelSetSample,
  evDelay,
  evEvaluateLoopCounter,
  evFcPitchSlide,
  evFcSetPitch,
  evFcSetVibrato,
  evFcSetWaveform,
  evFcVolumeSlide,
  evFtmAddDetune,
  evFtmAddPitch,
  evFtmAddVolume,
  evFtmCloneTrack,
  evFtmLfoAddSub,
  evFtmPlaySample,
  evFtmSetCondition,
  evFtmSetDetune,
  evFtmSetGlobalVolume,
  evFtmSetInterrupt,
  evFtmSetOneshotLength,
  evFtmSetPitch,
  evFtmSetPlayPosition,
  evFtmSetRepeatLength,
  evFtmSetSample,
  evFtmSetSampleStart,
  evFtmSetSpeed,
  evFtmSetTempo,
  evFtmSetVolume,
  evFtmSetWorkTrack,
  evFtmStartLfo,
  evGtkEnableTremolo,
  evGtkEnableTremor,
  evGtkEnableVibrato,
  evGtkKeyOff,
  evGtkSetPanning,
  evGtkSetPanningStep,
  evGtkSetPitch,
  evGtkSetPitchStep,
  evGtkSetSpeed,
  evGtkSetTremorTime,
  evGtkSetVibratoParams,
  evGtkSetVolume,
  evGtkSetVolumeStep,
  evJump,
  evJumpIfTrue,
  evJumpMarker,
  evMedDefineArpeggio,
  evMedHoldDecay,
  evMedJumpScript,
  evMedSetEnvelope,
  evMedSetPeriodStep,
  evMedSetVibratoDepth,
  evMedSetVibratoSpeed,
  evMedSetVolume,
  evMedSetVolumeStep,
  evMedSetWaveform,
  evMuppSetWaveform,
  evNoteCut,
  evPumaPitchRamp,
  evPumaSetPitch,
  evPumaSetWaveform,
  evPumaStopVoice,
  evPumaVolumeRamp,
  evSampleOffset,
  evSampleOffsetAdd,
  evSampleOffsetSub,
  evSetLoopCounter,
  evSetStepSpeed,
  evStopScript,
  eventByte0,
  eventByte1,
  eventByte2,
  eventValue24Bit,
  fcEffect,
  fcLoad,
  fcTest,
  fixupJumpTarget,
  handleFcVolumeBend,
  plugin,
  setModEventReader,
  synthStateNextTick
};
