// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// Ported from: tools/refmath.h (the deterministic reference math layer of
// the MIDI parity oracle, project-original). Read tools/refmath.h first —
// this file is its 1:1 TS port; function names and structure follow the
// C source.
//
// Why this exists: tsf.h's transcendental macros call the platform libm,
// whose rounding differs between implementations (glibc vs V8 Math.*
// differ by up to 11 double ulps). Both the C oracle and this port pin
// the math layer to the same double-double implementation, built only
// from IEEE-754 binary64 +, -, *, / and exact power-of-two scaling —
// every primitive rounds identically on both sides, so results are
// bit-identical by construction. Accuracy is ~2^-100 relative
// internally, i.e. correctly rounded to double except at exact midpoints.
//
// The one structural difference from the C: rm_dd_scalbn uses an exact
// power-of-two table where the C calls ldexp (both are exact scalings).

// --- double-double primitives (rm_two_sum / rm_two_prod / dd ops) -------

interface RmDd {
  hi: number;
  lo: number;
}

function rm_dd_make(hi: number, lo: number): RmDd {
  return { hi, lo };
}
function rm_dd_neg(a: RmDd): RmDd {
  return rm_dd_make(-a.hi, -a.lo);
}

/** Knuth two-sum (error-free transform). */
function rm_two_sum(a: number, b: number): RmDd {
  const s = a + b;
  const bb = s - a;
  const e = a - (s - bb) + (b - bb);
  return rm_dd_make(s, e);
}

/** Dekker two-product (error-free transform, no FMA). */
function rm_two_prod(a: number, b: number): RmDd {
  const SPLIT = 134217729.0; // 2^27 + 1
  const ta = SPLIT * a,
    tb = SPLIT * b;
  const ahi = ta - (ta - a),
    alo = a - ahi;
  const bhi = tb - (tb - b),
    blo = b - bhi;
  const p = a * b;
  const e = (ahi * bhi - p + ahi * blo + alo * bhi) + alo * blo;
  return rm_dd_make(p, e);
}

function rm_dd_add(a: RmDd, b: RmDd): RmDd {
  const t = rm_two_sum(a.hi, b.hi);
  const e = t.lo + (a.lo + b.lo);
  return rm_two_sum(t.hi, e);
}

function rm_dd_mul(a: RmDd, b: RmDd): RmDd {
  const t = rm_two_prod(a.hi, b.hi);
  const e = t.lo + (a.hi * b.lo + a.lo * b.hi);
  return rm_two_sum(t.hi, e);
}

function rm_dd_div(a: RmDd, b: RmDd): RmDd {
  // Two refinement steps of q = a/b in double-double.
  const q1 = a.hi / b.hi;
  let r = rm_dd_add(a, rm_dd_neg(rm_dd_mul(rm_dd_make(q1, 0), b)));
  const q2 = r.hi / b.hi;
  let q = rm_dd_add(rm_dd_make(q1, 0), rm_dd_make(q2, 0));
  r = rm_dd_add(a, rm_dd_neg(rm_dd_mul(q, b)));
  const q3 = r.hi / b.hi;
  return rm_dd_add(q, rm_dd_make(q3, 0));
}

// Exact power-of-two scaling (C: ldexp, exact). Built from exact doublings.
const RM_POW2: number[] = [];
{
  let v = 1;
  for (let k = 0; k <= 1023; k++) {
    RM_POW2[k] = v;
    v *= 2;
  }
}
function rm_dd_scalbn(a: RmDd, k: number): RmDd {
  return rm_dd_make(rm_scalbn(a.hi, k), rm_scalbn(a.lo, k));
}
function rm_scalbn(x: number, k: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  if (k > 0) {
    while (k > 1023) {
      x *= RM_POW2[1023]!;
      k -= 1023;
    }
    return x * RM_POW2[k]!;
  }
  while (k < -1023) {
    x /= RM_POW2[1023]!;
    k += 1023;
  }
  return x / RM_POW2[-k]!;
}

/** Round to nearest, ties to even (C rm_rint). */
function rm_rint(x: number): number {
  const f = Math.floor(x),
    d = x - f;
  if (d > 0.5) return f + 1.0;
  if (d < 0.5) return f;
  return f - 2.0 * Math.floor(f / 2.0) === 0.0 ? f : f + 1.0;
}

// ln 2 = RM_LN2.hi + RM_LN2.lo (correctly rounded split)
const RM_LN2 = rm_dd_make(0.6931471805599453, 2.3190468138462996e-17);
// pi/2 = RM_PI_2.hi + RM_PI_2.lo
const RM_PI_2 = rm_dd_make(1.5707963267948966, 6.123233995736766e-17);

/** exp(x) in double-double. |r| <= ln2/2 after reduction. */
function rm_exp_dd(x: RmDd): RmDd {
  const k = rm_rint(x.hi / RM_LN2.hi);
  const r = rm_dd_add(x, rm_dd_mul(rm_dd_make(-k, 0), RM_LN2));
  let sum = rm_dd_make(1, 0),
    term = rm_dd_make(1, 0);
  for (let n = 1; n <= 25; n++) {
    term = rm_dd_div(rm_dd_mul(term, r), rm_dd_make(n, 0));
    sum = rm_dd_add(sum, term);
    if (n > 8 && term.hi < 2.465190328815662e-32 && term.hi > -2.465190328815662e-32) break;
  }
  return rm_dd_scalbn(sum, k);
}

/** log(x) in double-double, x > 0. */
function rm_log_dd(x: RmDd): RmDd {
  let m = x.hi;
  let e = 0;
  while (m >= 1.0) {
    m *= 0.5;
    e++;
  }
  while (m < 0.5) {
    m *= 2.0;
    e--;
  }
  const mx = rm_dd_scalbn(x, -e);
  // log(m) = 2*atanh((m-1)/(m+1))
  const z = rm_dd_div(rm_dd_add(mx, rm_dd_make(-1, 0)), rm_dd_add(mx, rm_dd_make(1, 0)));
  const z2 = rm_dd_mul(z, z);
  let term = z,
    sum = z;
  for (let n = 1; n <= 40; n++) {
    term = rm_dd_mul(term, z2);
    sum = rm_dd_add(sum, rm_dd_div(term, rm_dd_make(2.0 * n + 1.0, 0)));
    if (term.hi < 2.465190328815662e-32 && term.hi > -2.465190328815662e-32) break;
  }
  return rm_dd_add(rm_dd_mul(rm_dd_make(e, 0), RM_LN2), rm_dd_scalbn(sum, 1));
}

function rm_sin_dd(x: RmDd): RmDd {
  const x2 = rm_dd_mul(x, x);
  let term = x,
    sum = x;
  for (let n = 1; n <= 30; n++) {
    term = rm_dd_div(rm_dd_mul(term, x2), rm_dd_make((2.0 * n) * (2.0 * n + 1.0), 0));
    sum = n & 1 ? rm_dd_add(sum, rm_dd_neg(term)) : rm_dd_add(sum, term);
    if (n > 8 && term.hi < 2.465190328815662e-32 && term.hi > -2.465190328815662e-32) break;
  }
  return sum;
}

function rm_cos_dd(x: RmDd): RmDd {
  const x2 = rm_dd_mul(x, x);
  let term = rm_dd_make(1, 0),
    sum = rm_dd_make(1, 0);
  for (let n = 1; n <= 30; n++) {
    term = rm_dd_div(rm_dd_mul(term, x2), rm_dd_make((2.0 * n - 1.0) * (2.0 * n), 0));
    sum = n & 1 ? rm_dd_add(sum, rm_dd_neg(term)) : rm_dd_add(sum, term);
    if (n > 8 && term.hi < 2.465190328815662e-32 && term.hi > -2.465190328815662e-32) break;
  }
  return sum;
}

/** tan(x) in double-double (reduction mod pi/2). */
function rm_tan_dd(x: RmDd): RmDd {
  const n = rm_rint(x.hi / RM_PI_2.hi);
  const r = rm_dd_add(x, rm_dd_mul(rm_dd_make(-n, 0), RM_PI_2));
  const t = rm_dd_div(rm_sin_dd(r), rm_cos_dd(r));
  const q = n - 2.0 * Math.floor(n / 2.0);
  if (q === 0) return t;
  return rm_dd_div(rm_dd_make(1, 0), rm_dd_neg(t));
}

export function rm_exp(x: number): number {
  return rm_exp_dd(rm_dd_make(x, 0)).hi;
}
export function rm_log(x: number): number {
  return rm_log_dd(rm_dd_make(x, 0)).hi;
}
export function rm_tan(x: number): number {
  return rm_tan_dd(rm_dd_make(x, 0)).hi;
}
export function rm_log10(x: number): number {
  const l10 = rm_log_dd(rm_dd_make(10, 0));
  return rm_dd_div(rm_log_dd(rm_dd_make(x, 0)), l10).hi;
}

/** pow(x,y) = exp(y*log(x)) with the special cases tsf.h needs. */
export function rm_pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x === 1) return 1;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) {
    const yi = rm_rint(y);
    if (yi !== y) return NaN;
    const p = rm_exp_dd(rm_dd_mul(rm_dd_make(y, 0), rm_log_dd(rm_dd_make(-x, 0)))).hi;
    const parity = yi - 2.0 * Math.floor(yi / 2.0);
    return parity === 0 ? p : -p;
  }
  return rm_exp_dd(rm_dd_mul(rm_dd_make(y, 0), rm_log_dd(rm_dd_make(x, 0)))).hi;
}

export function rm_powf(x: number, y: number): number {
  return f32(rm_pow(x, y));
}
export function rm_expf(x: number): number {
  return f32(rm_exp(x));
}

const f32 = Math.fround;
