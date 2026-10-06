// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// @modplayjs/fmt-sid — Commodore 64 SID music (PSID/RSID).
//
// Pristine 1:1 TypeScript port of libcRSID 1.58 (c) Hermit (Mihaly Horvath),
// license: WTF — "do what the frick you want with this code, but it would be
// nice mentioning me as the original author."
//
// Package structure mirrors the C file tree:
//   config.ts         ← Config.h
//   c64types.ts       ← C64.h (structs, constants, memory-bank encoding)
//   instance.ts       ← libcRSID.c globals (cRSID + cRSID_C64) + SIDheader
//   combiwaves.ts     ← C64/SID_CombiWaves.h
//   filtercurves.ts   ← C64/SID_FilterCurves.h
//   sincwindow.ts     ← C64/SincWindow.h
//   mem.ts            ← C64/MEM.c
//   cpu.ts            ← C64/CPU.c
//   cia.ts            ← C64/CIA.c
//   vic.ts            ← C64/VIC.c
//   sid.ts            ← C64/SID.c
//   sidadsr.ts        ← C64/SID_ADSR.c
//   sidoscwaves.ts    ← C64/SID_OscWaves.c
//   sidoutputs.ts     ← C64/SID_Outputs.c
//   sidrouting.ts     ← C64/C64_SIDrouting.c
//   psiddigi.ts       ← C64_SIDrouting.c:377-427 ($D4xx digi)
//   c64.ts            ← C64/C64.c
//   host.ts           ← host/host.h
//   loader.ts         ← host/file.c processSIDfileData + libcRSID.c API +
//                       host/audio.c generateSample

export { cRSID_sidTest, cRSID_sidLoad, plugin, sidDsp, sidStartTune } from './sidplugin.js';
export { cRSID_init, cRSID_initSIDtune, cRSID_generateSample, cRSID_processSIDfileData, cRSID_playSIDtune, cRSID_pauseSIDtune, cRSID_close } from './loader.js';
export { cRSID, cRSID_C64 } from './instance.js';
export { getSidSettings, applySidSettings, applySidSettingsLive, type SidSettings, type SidModel, type SidStereo } from './settings.js';
export { loadSidSongLengths, applySongLengthsFor, getSidSubtuneDuration, parseSongLength, isSidSongLengthDbLoaded } from './songlengths.js';
