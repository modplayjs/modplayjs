// SPDX-License-Identifier: BSD-3-Clause
// Ported from stb_vorbis.c — inverse_mdct (fast version, stb_vorbis.c:2638-3078).

import { type Vorb } from './types.js';
import { ilog } from './codebook.js';
import {
  imdctStep3Iter0Loop, imdctStep3InnerRLoop, imdctStep3InnerSLoop,
  imdctStep3InnerSLoopLd654,
} from './imdct.js';

export function inverseMdct(buffer: Float32Array, n: number, f: Vorb, blocktype: number): void {
  const n2 = n >> 1, n4 = n >> 2, n8 = n >> 3;
  const buf2 = new Float32Array(n2);
  const A = f.A[blocktype]!;

  // step 0 (merged copy+reflect)
  {
    let dOff = n2 - 2;
    let aaOff = 0;
    let eOff = 0;
    while (eOff < n2) {
      buf2[dOff + 1] = buffer[eOff]! * A[aaOff]! - buffer[eOff + 2]! * A[aaOff + 1]!;
      buf2[dOff] = buffer[eOff]! * A[aaOff + 1]! + buffer[eOff + 2]! * A[aaOff]!;
      dOff -= 2;
      aaOff += 2;
      eOff += 4;
    }
    eOff = n2 - 3;
    while (dOff >= 0) {
      buf2[dOff + 1] = (-buffer[eOff + 2]! * A[aaOff]! - -buffer[eOff]! * A[aaOff + 1]!);
      buf2[dOff] = (-buffer[eOff + 2]! * A[aaOff + 1]! + -buffer[eOff]! * A[aaOff]!);
      dOff -= 2;
      aaOff += 2;
      eOff -= 4;
    }
  }

  // step 2 (paper output w, now u=buffer)
  {
    let aaOff = n2 - 8;
    let e0Off = n4; // v = buf2
    let e1Off = 0;
    let d0Off = n4; // u = buffer
    let d1Off = 0;
    while (aaOff >= 0) {
      const v41_21 = buf2[e0Off + 1]! - buf2[e1Off + 1]!;
      const v40_20 = buf2[e0Off]! - buf2[e1Off]!;
      buffer[d0Off + 1] = buf2[e0Off + 1]! + buf2[e1Off + 1]!;
      buffer[d0Off] = buf2[e0Off]! + buf2[e1Off]!;
      buffer[d1Off + 1] = v41_21 * A[aaOff + 4]! - v40_20 * A[aaOff + 5]!;
      buffer[d1Off] = v40_20 * A[aaOff + 4]! + v41_21 * A[aaOff + 5]!;

      const v41_21b = buf2[e0Off + 3]! - buf2[e1Off + 3]!;
      const v40_20b = buf2[e0Off + 2]! - buf2[e1Off + 2]!;
      buffer[d0Off + 3] = buf2[e0Off + 3]! + buf2[e1Off + 3]!;
      buffer[d0Off + 2] = buf2[e0Off + 2]! + buf2[e1Off + 2]!;
      buffer[d1Off + 3] = v41_21b * A[aaOff]! - v40_20b * A[aaOff + 1]!;
      buffer[d1Off + 2] = v40_20b * A[aaOff]! + v41_21b * A[aaOff + 1]!;

      aaOff -= 8;
      d0Off += 4;
      d1Off += 4;
      e0Off += 4;
      e1Off += 4;
    }
  }


  // step 3
  const ld = ilog(n) - 1;

  imdctStep3Iter0Loop(n >> 4, buffer, 0, n2 - 1 - n4 * 0, -(n >> 3), A);
  imdctStep3Iter0Loop(n >> 4, buffer, 0, n2 - 1 - n4 * 1, -(n >> 3), A);

  imdctStep3InnerRLoop(n >> 5, buffer, 0, n2 - 1 - n8 * 0, -(n >> 4), A, 16);
  imdctStep3InnerRLoop(n >> 5, buffer, 0, n2 - 1 - n8 * 1, -(n >> 4), A, 16);
  imdctStep3InnerRLoop(n >> 5, buffer, 0, n2 - 1 - n8 * 2, -(n >> 4), A, 16);
  imdctStep3InnerRLoop(n >> 5, buffer, 0, n2 - 1 - n8 * 3, -(n >> 4), A, 16);

  let l = 2;
  for (; l < (ld - 3) >> 1; ++l) {
    const k0 = n >> (l + 2), k0_2 = k0 >> 1;
    const lim = 1 << (l + 1);
    for (let i = 0; i < lim; ++i) {
      imdctStep3InnerRLoop(n >> (l + 4), buffer, 0, n2 - 1 - k0 * i, -k0_2, A, 1 << (l + 3));
    }
  }

  for (; l < ld - 6; ++l) {
    const k0 = n >> (l + 2), k1 = 1 << (l + 3), k0_2 = k0 >> 1;
    const rlim = n >> (l + 6);
    const lim = 1 << (l + 1);
    let aOff = 0;
    let iOff = n2 - 1;
    for (let r = rlim; r > 0; --r) {
      // C: imdct_step3_inner_s_loop(lim, u, i_off, -k0_2, A0, k1, k0)
      imdctStep3InnerSLoop(lim, buffer, 0, iOff, -k0_2, A, aOff, k1, k0);
      aOff += k1 * 4;
      iOff -= 8;
    }
  }

  imdctStep3InnerSLoopLd654(n >> 5, buffer, 0, n2 - 1, A, n);

  // output is u (buffer)

  // step 4, 5, 6 — cannot be in-place because of step 5
  {
    const bitrev = f.bitReverse[blocktype]!;
    let d0Off = n4 - 4; // v = buf2
    let d1Off = n2 - 4;
    let bitrevOff = 0;
    while (d0Off >= 0) {
      let k4 = bitrev[bitrevOff]!;
      buf2[d1Off + 3] = buffer[k4]!;
      buf2[d1Off + 2] = buffer[k4 + 1]!;
      buf2[d0Off + 3] = buffer[k4 + 2]!;
      buf2[d0Off + 2] = buffer[k4 + 3]!;

      k4 = bitrev[bitrevOff + 1]!;
      buf2[d1Off + 1] = buffer[k4]!;
      buf2[d1Off] = buffer[k4 + 1]!;
      buf2[d0Off + 1] = buffer[k4 + 2]!;
      buf2[d0Off] = buffer[k4 + 3]!;

      d0Off -= 4;
      d1Off -= 4;
      bitrevOff += 2;
    }
  }


  // step 7 (in place on buf2)
  {
    let cOff = 0;
    let dOff = 0; // v = buf2
    let eOff = n2 - 4;
    while (dOff < eOff) {
      let a02 = buf2[dOff]! - buf2[eOff + 2]!;
      let a11 = buf2[dOff + 1]! + buf2[eOff + 3]!;

      let b0 = C(cOff + 1) * a02 + C(cOff) * a11;
      let b1 = C(cOff + 1) * a11 - C(cOff) * a02;

      const b2 = buf2[dOff]! + buf2[eOff + 2]!;
      const b3 = buf2[dOff + 1]! - buf2[eOff + 3]!;

      buf2[dOff] = b2 + b0;
      buf2[dOff + 1] = b3 + b1;
      buf2[eOff + 2] = b2 - b0;
      buf2[eOff + 3] = b1 - b3;

      a02 = buf2[dOff + 2]! - buf2[eOff]!;
      a11 = buf2[dOff + 3]! + buf2[eOff + 1]!;

      b0 = C(cOff + 3) * a02 + C(cOff + 2) * a11;
      b1 = C(cOff + 3) * a11 - C(cOff + 2) * a02;

      const b2b = buf2[dOff + 2]! + buf2[eOff]!;
      const b3b = buf2[dOff + 3]! - buf2[eOff + 1]!;

      buf2[dOff + 2] = b2b + b0;
      buf2[dOff + 3] = b3b + b1;
      buf2[eOff] = b2b - b0;
      buf2[eOff + 1] = b1 - b3b;

      cOff += 4;
      dOff += 4;
      eOff -= 4;
    }
    function C(i: number): number { return f.C[blocktype]![i]!; }
  }


  // step 8 + decode
  {
    let bOff = n2 - 8; // B
    let eOff = n2 - 8; // buf2
    let d0Off = 0; // buffer
    let d1Off = n2 - 4;
    let d2Off = n2;
    let d3Off = n - 4;
    while (eOff >= 0) {
      let p3 = buf2[eOff + 6]! * B(bOff + 7) - buf2[eOff + 7]! * B(bOff + 6);
      let p2 = -buf2[eOff + 6]! * B(bOff + 6) - buf2[eOff + 7]! * B(bOff + 7);

      buffer[d0Off] = p3;
      buffer[d1Off + 3] = -p3;
      buffer[d2Off] = p2;
      buffer[d3Off + 3] = p2;

      let p1 = buf2[eOff + 4]! * B(bOff + 5) - buf2[eOff + 5]! * B(bOff + 4);
      let p0 = -buf2[eOff + 4]! * B(bOff + 4) - buf2[eOff + 5]! * B(bOff + 5);

      buffer[d0Off + 1] = p1;
      buffer[d1Off + 2] = -p1;
      buffer[d2Off + 1] = p0;
      buffer[d3Off + 2] = p0;

      p3 = buf2[eOff + 2]! * B(bOff + 3) - buf2[eOff + 3]! * B(bOff + 2);
      p2 = -buf2[eOff + 2]! * B(bOff + 2) - buf2[eOff + 3]! * B(bOff + 3);

      buffer[d0Off + 2] = p3;
      buffer[d1Off + 1] = -p3;
      buffer[d2Off + 2] = p2;
      buffer[d3Off + 1] = p2;

      p1 = buf2[eOff]! * B(bOff + 1) - buf2[eOff + 1]! * B(bOff);
      p0 = -buf2[eOff]! * B(bOff) - buf2[eOff + 1]! * B(bOff + 1);

      buffer[d0Off + 3] = p1;
      buffer[d1Off] = -p1;
      buffer[d2Off + 3] = p0;
      buffer[d3Off] = p0;

      bOff -= 8;
      eOff -= 8;
      d0Off += 4;
      d2Off += 4;
      d1Off -= 4;
      d3Off -= 4;
    }
    function B(i: number): number { return f.B[blocktype]![i]!; }
  }
}
