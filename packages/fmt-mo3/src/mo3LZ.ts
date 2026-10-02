// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: OpenMPT soundlib/Load_mo3.cpp (MO3FileReaderBuffer — the
// UNMO3-derived LZ decoder, BSD-licensed with permission from Laurent
// Clévy). Verified byte-exact against the C reference output.

let consumed = 8;
/** Bytes of the input consumed by the last depack (music chunk end). */
export function lastConsumed(): number {
  return consumed;
}

export function depackMO3Music(bytes: Uint8Array): Uint8Array {
  const buf = bytes;
  const version = buf[3]!;
  const musicSize = ((buf[4]! | (buf[5]! << 8) | (buf[6]! << 16) | (buf[7]! << 24)) >>> 0);
  let pos = version >= 5 ? 12 : 8;
  const out = new Uint8Array(musicSize);
  let outPos = 0;
  let data = 0, carry = 0, strLen = 0, strOffset = 0;
  void version;
  let broken = false;
  const readByte = () => (pos < buf.length ? buf[pos++] : null);

  const readCtrlBit = () => {
    data <<= 1;
    carry = data > 0xff ? 1 : 0;
    data &= 0xff;
    if (data === 0) {
      const nb = readByte();
      if (nb === null) return false;
      data = nb as number;
      data = (data << 1) + 1;
      carry = data > 0xff ? 1 : 0;
      data &= 0xff;
    }
    return true;
  };

  // First byte is always verbatim.
  if (musicSize === 0) { consumed = pos; return out; }
  {
    const b = readByte();
    if (b === null) { consumed = pos; return out; }
    out[outPos++] = b as number;
  }

  // In-progress string copy (C InternalReadContinue entry).
  if (strLen > 0) {
    let copyLen = Math.min(strLen, musicSize - outPos);
    const srcStart = outPos + strOffset;
    for (let i = 0; i < copyLen; i++) out[outPos + i] = out[srcStart + i]!;
    outPos += copyLen;
    strLen -= copyLen;
  }

  while (outPos < musicSize && !broken) {
    if (!readCtrlBit()) { broken = true; break; }
    if (!carry) {
      // literal
      const b = readByte();
      if (b === null) { broken = true; break; }
      out[outPos++] = b as number;
    } else {
      // compressed: decode length
      let lengthAdjust = 0;
      // DECODE_CTRL_BITS
      strLen++;
      let ok = true;
      do {
        if (!readCtrlBit()) { ok = false; break; }
        strLen = (strLen << 1) + carry; // lshift_signed: int32 shift
        if (!readCtrlBit()) { ok = false; break; }
      } while (carry);
      if (!ok) { broken = true; break; }
      strLen -= 3;
      if (strLen < 0) {
        strLen++;
      } else {
        const b = readByte();
        if (b === null) { broken = true; break; }
        strOffset = (strLen << 8) | (b as number);
        strLen = 0;
        strOffset = ~strOffset;
        if (strOffset < -1280) lengthAdjust++;
        lengthAdjust++;
        if (strOffset < -32000) lengthAdjust++;
      }
      if (strOffset >= 0 || -outPos > strOffset) { broken = true; break; }

      // read the next 2 bits as part of strLen
      if (!readCtrlBit()) { broken = true; break; }
      strLen = (strLen << 1) + carry;
      if (!readCtrlBit()) { broken = true; break; }
      strLen = (strLen << 1) + carry;
      if (strLen === 0) {
        strLen++;
        do {
          if (!readCtrlBit()) { ok = false; break; }
          strLen = (strLen << 1) + carry;
          if (!readCtrlBit()) { ok = false; break; }
        } while (carry);
        if (!ok) { broken = true; break; }
        strLen += 2;
      }
      strLen += lengthAdjust;

      if (strLen <= 0 || musicSize - outPos < strLen) { broken = true; break; }
      // Copy previous string (may overlap: strOffset = -1, strLen = 2
      // repeats the last character twice).
      let copyLen = Math.min(strLen, musicSize - outPos);
      const srcStart = outPos + strOffset;
      for (let i = 0; i < copyLen; i++) {
        out[outPos + i] = out[srcStart + i]!;
      }
      outPos += copyLen;
      strLen -= copyLen;
      if (strLen > 0 && outPos < musicSize) {
        // In-progress copy continues on the next read (C re-enters with
        // m_strLen > 0 and copies without new ctrl bits).
        let copyLen2 = Math.min(strLen, musicSize - outPos);
        const srcStart2 = outPos + strOffset;
        for (let i = 0; i < copyLen2; i++) out[outPos + i] = out[srcStart2 + i]!;
        outPos += copyLen2;
        strLen -= copyLen2;
      }
    }
  }
  consumed = pos;
  return out;
}


