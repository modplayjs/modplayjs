// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// @modplayjs/fmt-fc — Future Composer 1.0-1.4 (SMOD/FC14).

export { fcTest, fcLoad, plugin, fcEffect, setModEventReader } from './fc.js';
export {
  SynthState,
  SynthStates,
  SynthEventType,
  synthStateNextTick,
  handleFcVolumeBend,
  channelSetSample,
  evStopScript, evJump, evJumpIfTrue, evDelay, evSetStepSpeed, evJumpMarker,
  evSampleOffset, evSampleOffsetAdd, evSampleOffsetSub, evSetLoopCounter,
  evEvaluateLoopCounter, evNoteCut,
  evGtkKeyOff, evGtkSetVolume, evGtkSetPitch, evGtkSetPanning,
  evGtkSetVolumeStep, evGtkSetPitchStep, evGtkSetPanningStep, evGtkSetSpeed,
  evGtkEnableTremor, evGtkSetTremorTime, evGtkEnableTremolo, evGtkEnableVibrato,
  evGtkSetVibratoParams,
  evPumaSetWaveform, evPumaVolumeRamp, evPumaStopVoice, evPumaSetPitch,
  evPumaPitchRamp,
  evMuppSetWaveform,
  evMedDefineArpeggio, evMedJumpScript, evMedSetEnvelope, evMedSetVolume,
  evMedSetWaveform, evMedSetVibratoSpeed, evMedSetVibratoDepth,
  evMedSetVolumeStep, evMedSetPeriodStep, evMedHoldDecay,
  evFtmSetCondition, evFtmSetInterrupt, evFtmPlaySample, evFtmSetPitch,
  evFtmAddPitch, evFtmSetDetune, evFtmAddDetune, evFtmSetVolume,
  evFtmAddVolume, evFtmSetSample, evFtmSetSampleStart, evFtmSetOneshotLength,
  evFtmSetRepeatLength, evFtmCloneTrack, evFtmStartLfo, evFtmLfoAddSub,
  evFtmSetWorkTrack, evFtmSetGlobalVolume, evFtmSetTempo, evFtmSetSpeed,
  evFtmSetPlayPosition,
  evFcSetWaveform, evFcSetPitch, evFcSetVibrato, evFcPitchSlide, evFcVolumeSlide,
  eventByte0, eventByte1, eventByte2, eventValue24Bit, fixupJumpTarget,
  SYNTH_STOP_ROW,
  type SynthEvent,
} from './synth.js';
