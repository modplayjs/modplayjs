// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// @modplayjs/fmt-mo3 — Un4seen MO3 container (XM/IT/S3M/MOD/MTM inner).

export { mo3Test, mo3Load, plugin } from './mo3.js';
// Shared MP3 decoder used by @modplayjs/stream-audio.
export { mp3decInit, mp3decDecodeFrame, type Mp3Dec, type Mp3FrameInfo } from './minimp3.js';
