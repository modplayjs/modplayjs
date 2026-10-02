// SPDX-License-Identifier: BSD-3-Clause
// Ported from stb_vorbis.c — inverse MDCT (the fast bit-reverse variant)
// plus twiddle/window/bitreverse setup.

export function computeTwiddleFactors(n: number, A: Float32Array, B: Float32Array, C: Float32Array): void {
  const n4 = n >> 2, n8 = n >> 3;
  for (let k = 0, k2 = 0; k < n4; ++k, k2 += 2) {
    A[k2] = Math.cos((4 * k * Math.PI) / n);
    A[k2 + 1] = -Math.sin((4 * k * Math.PI) / n);
    B[k2] = Math.cos((((k2 + 1) * Math.PI) / n / 2)) * 0.5;
    B[k2 + 1] = Math.sin((((k2 + 1) * Math.PI) / n / 2)) * 0.5;
  }
  for (let k = 0, k2 = 0; k < n8; ++k, k2 += 2) {
    C[k2] = Math.cos((2 * (k2 + 1) * Math.PI) / n);
    C[k2 + 1] = -Math.sin((2 * (k2 + 1) * Math.PI) / n);
  }
}

export function computeWindow(n: number, window: Float32Array): void {
  const n2 = n >> 1;
  for (let i = 0; i < n2; ++i) {
    window[i] = Math.sin(0.5 * Math.PI * Math.sin(((i + 0.5) / n2) * 0.5 * Math.PI) ** 2);
  }
}

export function computeBitReverse(n: number, rev: Uint16Array): void {
  const ld = ilog(n) - 1;
  const n8 = n >> 3;
  for (let i = 0; i < n8; ++i) {
    rev[i] = ((bitReverseLocal(i) >>> (32 - ld + 3)) << 2) & 0xffff;
  }
}

function bitReverseLocal(n: number): number {
  n = ((n & 0xaaaaaaaa) >>> 1) | ((n & 0x55555555) << 1);
  n = ((n & 0xcccccccc) >>> 2) | ((n & 0x33333333) << 2);
  n = ((n & 0xf0f0f0f0) >>> 4) | ((n & 0x0f0f0f0f) << 4);
  n = ((n & 0xff00ff00) >>> 8) | ((n & 0x00ff00ff) << 8);
  return (n >>> 16 | n << 16) >>> 0;
}

function ilog(n: number): number {
  const log2_4 = [0, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4];
  if (n < 0) return 0;
  if (n < (1 << 14)) {
    if (n < (1 << 4)) return log2_4[n]!;
    else if (n < (1 << 9)) return 5 + log2_4[n >> 5]!;
    else return 10 + log2_4[n >> 10]!;
  } else if (n < (1 << 24)) {
    if (n < (1 << 19)) return 15 + log2_4[n >> 15]!;
    else return 20 + log2_4[n >> 20]!;
  } else if (n < (1 << 29)) return 25 + log2_4[n >> 25]!;
  else return 30 + log2_4[n >>> 30]!;
}

// imdct_step3_iter0_loop (stb_vorbis.c:2417-2460)
function imdctStep3Iter0Loop(n: number, e: Float32Array, base: number, iOff: number, kOff: number, A: Float32Array): void {
  let aOff = 0;
  let eOff = base + iOff;
  let e2Off = eOff + kOff;
  for (let i = n >> 2; i > 0; --i) {
    // 4 unrolled pairs
    for (let q = 0; q < 4; ++q) {
      const d0 = eOff - 2 * q;
      const d2 = e2Off - 2 * q;
      const k00e = e[d0]! - e[d2]!;
      const k01e = e[d0 - 1]! - e[d2 - 1]!;
      e[d0] = e[d0]! + e[d2]!;
      e[d0 - 1] = e[d0 - 1]! + e[d2 - 1]!;
      e[d2] = k00e * A[aOff]! - k01e * A[aOff + 1]!;
      e[d2 - 1] = k01e * A[aOff]! + k00e * A[aOff + 1]!;
      aOff += 8;
    }
    eOff -= 8;
    e2Off -= 8;
  }
}

// imdct_step3_inner_r_loop (stb_vorbis.c:2462-2510)
function imdctStep3InnerRLoop(lim: number, e: Float32Array, base: number, d0Off: number, kOff: number, A: Float32Array, k1: number): void {
  let aOff = 0;
  let e0Off = base + d0Off;
  let e2Off = e0Off + kOff;
  for (let i = lim >> 2; i > 0; --i) {
    for (let q = 0; q < 4; ++q) {
      const d0 = e0Off - 2 * q;
      const d2 = e2Off - 2 * q;
      const k00e = e[d0]! - e[d2]!;
      const k01e = e[d0 - 1]! - e[d2 - 1]!;
      e[d0] = e[d0]! + e[d2]!;
      e[d0 - 1] = e[d0 - 1]! + e[d2 - 1]!;
      e[d2] = k00e * A[aOff]! - k01e * A[aOff + 1]!;
      e[d2 - 1] = k01e * A[aOff]! + k00e * A[aOff + 1]!;
      aOff += k1;
    }
    e0Off -= 8;
    e2Off -= 8;
  }
}

// imdct_step3_inner_s_loop (stb_vorbis.c:2512-2594)
function imdctStep3InnerSLoop(n: number, e: Float32Array, base: number, iOff: number, kOff: number, A: Float32Array, aOff0: number, k0: number): void {
  const A0 = A[0]!, A1 = A[1]!;
  const A2 = A[aOff0]!, A3 = A[aOff0 + 1]!;
  const A4 = A[aOff0 * 2]!, A5 = A[aOff0 * 2 + 1]!;
  const A6 = A[aOff0 * 3]!, A7 = A[aOff0 * 3 + 1]!;
  let e0Off = base + iOff;
  let e2Off = e0Off + kOff;
  for (let i = n; i > 0; --i) {
    for (let q = 0; q < 4; ++q) {
      const d0 = e0Off - 2 * q;
      const d2 = e2Off - 2 * q;
      const k00 = e[d0]! - e[d2]!;
      const k11 = e[d0 - 1]! - e[d2 - 1]!;
      e[d0] = e[d0]! + e[d2]!;
      e[d0 - 1] = e[d0 - 1]! + e[d2 - 1]!;
      e[d2] = k00 * [A0, A2, A4, A6][q]! - k11 * [A1, A3, A5, A7][q]!;
      e[d2 - 1] = k11 * [A0, A2, A4, A6][q]! + k00 * [A1, A3, A5, A7][q]!;
    }
    e0Off -= 8;
    e2Off -= 8;
  }
  void k0;
}

// imdct_step3_inner_s_loop_ld654 (stb_vorbis.c:2595-2637)
function imdctStep3InnerSLoopLd654(n: number, e: Float32Array, base: number, iOff: number, A: Float32Array, baseN: number): void {
  const aOff = baseN >> 3;
  const A2 = A[aOff]!;
  let z = base + iOff;
  const baseZ = z - 16 * n;
  const iter54 = (z: number): void => {
    // C iter_54(float *z): z[0..-7] are e[zo], e[zo-1], ..., e[zo-7]
    const k00 = e[z - 0]! - e[z - 4]!;
    const y0 = e[z - 0]! + e[z - 4]!;
    const y2 = e[z - 2]! + e[z - 6]!;
    const k22 = e[z - 2]! - e[z - 6]!;

    e[z - 0] = y0 + y2;
    e[z - 2] = y0 - y2;

    const k33 = e[z - 3]! - e[z - 7]!;
    e[z - 4] = k00 + k33;
    e[z - 6] = k00 - k33;

    const k11 = e[z - 1]! - e[z - 5]!;
    const y1 = e[z - 1]! + e[z - 5]!;
    const y3 = e[z - 3]! + e[z - 7]!;

    e[z - 1] = y1 + y3;
    e[z - 3] = y1 - y3;
    e[z - 5] = k11 - k22;
    e[z - 7] = k11 + k22;
  };

  while (z > baseZ) {
    const zo = z - base;
    let k00 = e[zo - 0]! - e[zo - 8]!;
    let k11 = e[zo - 1]! - e[zo - 9]!;
    let l00 = e[zo - 2]! - e[zo - 10]!;
    let l11 = e[zo - 3]! - e[zo - 11]!;
    e[zo - 0] = e[zo - 0]! + e[zo - 8]!;
    e[zo - 1] = e[zo - 1]! + e[zo - 9]!;
    e[zo - 2] = e[zo - 2]! + e[zo - 10]!;
    e[zo - 3] = e[zo - 3]! + e[zo - 11]!;
    e[zo - 8] = k00;
    e[zo - 9] = k11;
    e[zo - 10] = (l00 + l11) * A2;
    e[zo - 11] = (l11 - l00) * A2;

    k00 = e[zo - 4]! - e[zo - 12]!;
    k11 = e[zo - 5]! - e[zo - 13]!;
    l00 = e[zo - 6]! - e[zo - 14]!;
    l11 = e[zo - 7]! - e[zo - 15]!;
    e[zo - 4] = e[zo - 4]! + e[zo - 12]!;
    e[zo - 5] = e[zo - 5]! + e[zo - 13]!;
    e[zo - 6] = e[zo - 6]! + e[zo - 14]!;
    e[zo - 7] = e[zo - 7]! + e[zo - 15]!;
    e[zo - 12] = k11;
    e[zo - 13] = -k00;
    e[zo - 14] = (l11 - l00) * A2;
    e[zo - 15] = (l00 + l11) * -A2;

    // iter_54(z); iter_54(z-8);
    iter54(zo);
    iter54(zo - 8);
    z -= 16;
  }
}

export { imdctStep3Iter0Loop, imdctStep3InnerRLoop, imdctStep3InnerSLoop, imdctStep3InnerSLoopLd654 };
