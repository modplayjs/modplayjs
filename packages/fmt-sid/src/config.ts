// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/Config.h (c) Hermit (Mihaly Horvath),
// license: WTFPL-style ("do what the frick you want", mention the author).
//
// Main configuration of the cRSID library. C uses 'weak' #defines so the
// build can override them (Config.mk / makefiles); here they are plain
// exported consts (the TS port has no build-time overrides).

/** Gets refined to float at init, so that cycles per sample is integer. */
export const CRSID_OVERSAMPLING_RATIO = 5;

/** bits — quantization resolution of table-values. */
export const CRSID_FILTERTABLE_RESOLUTION = 12;

/** bits — quantization resolution of oversampled filter-table values. */
export const CRSID_OVERSAMPLING_FILTERTABLE_RESOLUTION = 13;

/** Number of Sinc-window sine-periods (min. 4) for the Nyquist-filter.
 *  (Should be an even number; the bigger, the more demanding the
 *  convolution is on CPU.) */
export const CRSID_RESAMPLER_SINCWINDOW_PERIODS = 6;

/** sample-entries in a Sinc-period (max. 256). */
export const CRSID_RESAMPLER_SINCPERIOD_SAMPLES = 256;

/** value of Sinc-window's data in the middle (max. 16384). */
export const CRSID_RESAMPLER_SINCWINDOW_MAGNITUDE = 2048;
