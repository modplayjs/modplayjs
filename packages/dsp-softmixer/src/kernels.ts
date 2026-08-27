// Resampling kernels for the softmixer, mirroring libxmp mix_all.c
// NEAREST/LINEAR/SPLINE macros (:40-88) and UPDATE_POS (mix_all.c:94-98,
// SMIX_SHIFT=16 mixer.h:9-10).
//
// libxmp works on fixed-point 16.16 positions; these kernels accept a float
// `pos` and return the interpolated value in Q16-scale units like the C
// kernels (8-bit samples are shifted <<8 so both resolutions share ramps).

import {
  cubic_spline_lut0,
  cubic_spline_lut1,
  cubic_spline_lut2,
  cubic_spline_lut3,
} from './lut';

export const SMIX_SHIFT = 16;
export const SMIX_MASK = 0xffff;

/** mixer.h:6 — C4_PERIOD = 428.0 */
export const C4_PERIOD = 428.0;

/** Kernels read one sample ahead/behind — caller must guarantee padding. */
export type KernelName = 'nearest' | 'linear' | 'spline';

/**
 * NEAREST_8BIT/16BIT (mix_all.c:40-46): truncate frac.
 * Returns Q16-scaled value for 8-bit input parity is handled by callers
 * normalizing to float −1..1, so this returns plain floats (normalized model).
 */
export function nearest(data: Float32Array, pos: number): number {
  return data[Math.trunc(pos)] ?? 0;
}

/** LINEAR_* (mix_all.c:48-58): l1 + (frac>>1)*dt >> (SMIX_SHIFT-1). */
export function linear(data: Float32Array, pos: number): number {
  const i = Math.floor(pos);
  const frac = pos - i;
  const s1 = data[i] ?? 0;
  const s2 = data[i + 1] ?? 0;
  return s1 + (s2 - s1) * frac;
}

/* The following lut settings are PRECOMPUTED (mix_all.c:60-88). */
const SPLINE_QUANTBITS = 14;
const SPLINE_SHIFT = SPLINE_QUANTBITS;
const SPLINE_FRACBITS = 10;
const SPLINE_FRACSHIFT = (SMIX_SHIFT - SPLINE_FRACBITS) - 2;

/** SPLINE_8BIT/16BIT (:74-88): 4-point precomputed cubic spline. */
export function spline(data: Float32Array, pos: number): number {
  // In libxmp frac is the 16-bit fractional part of pos; recover it.
  const fIdx = Math.round((pos - Math.floor(pos)) * (1 << SMIX_SHIFT)) >> SPLINE_FRACSHIFT;
  const f = (fIdx & (((1 << (SMIX_SHIFT - SPLINE_FRACSHIFT)) - 1) & ~3)) >> 2;
  const i = Math.floor(pos);
  // Normalize LUT output back to float domain: LUT sums to 1<<SPLINE_SHIFT.
  return (
    cubic_spline_lut0[f]! * (data[i - 1] ?? 0) +
    cubic_spline_lut1[f]! * (data[i] ?? 0) +
    cubic_spline_lut2[f]! * (data[i + 1] ?? 0) +
    cubic_spline_lut3[f]! * (data[i + 2] ?? 0)
  ) / (1 << SPLINE_SHIFT);
}

export const KERNELS: Record<KernelName, (data: Float32Array, pos: number) => number> = {
  nearest,
  linear,
  spline,
};

/**
 * Convert a floating rate into libxmp's fixed-point step
 * (mix_fn receives step_dir * (1 << SMIX_SHIFT), mixer.c:704).
 */
export function toFixedStep(stepFloat: number): number {
  return stepFloat * (1 << SMIX_SHIFT);
}
