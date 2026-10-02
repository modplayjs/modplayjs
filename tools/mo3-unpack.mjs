// tools/mo3-unpack.mjs — Node test port of OpenMPT's MO3 music-chunk LZ
// depacker (Load_mo3.cpp MO3FileReaderBuffer::InternalReadContinue) to
// inspect the inner module + sample compression types of the pack's MO3s.
import { readFileSync, writeFileSync } from 'node:fs';

export function depackMO3(buf) {
  const version = buf[3];
  const musicSize = buf.readUInt32LE(4);
  let pos = version >= 5 ? 12 : 8;
  const out = new Uint8Array(musicSize);
  let outPos = 0;
  let data = 0, carry = 0, strLen = 0, strOffset = 0;
  let broken = false;
  const readByte = () => (pos < buf.length ? buf[pos++] : null);

  const readCtrlBit = () => {
    data <<= 1;
    carry = data > 0xff ? 1 : 0;
    data &= 0xff;
    if (data === 0) {
      const nb = readByte();
      if (nb === null) return false;
      data = nb;
      data = (data << 1) + 1;
      carry = data > 0xff ? 1 : 0;
      data &= 0xff;
    }
    return true;
  };

  // First byte is always verbatim.
  if (musicSize === 0) return out;
  {
    const b = readByte();
    if (b === null) return out;
    out[outPos++] = b;
  }

  // In-progress string copy (C InternalReadContinue entry).
  if (strLen > 0) {
    let copyLen = Math.min(strLen, musicSize - outPos);
    const srcStart = outPos + strOffset;
    for (let i = 0; i < copyLen; i++) out[outPos + i] = out[srcStart + i];
    outPos += copyLen;
    strLen -= copyLen;
  }

  while (outPos < musicSize && !broken) {
    if (!readCtrlBit()) { broken = true; break; }
    if (!carry) {
      // literal
      const b = readByte();
      if (b === null) { broken = true; break; }
      out[outPos++] = b;
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
        strOffset = (strLen << 8) | b;
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
        out[outPos + i] = out[srcStart + i];
      }
      outPos += copyLen;
      strLen -= copyLen;
      if (strLen > 0 && outPos < musicSize) {
        // In-progress copy continues on the next read (C re-enters with
        // m_strLen > 0 and copies without new ctrl bits).
        let copyLen2 = Math.min(strLen, musicSize - outPos);
        const srcStart2 = outPos + strOffset;
        for (let i = 0; i < copyLen2; i++) out[outPos + i] = out[srcStart2 + i];
        outPos += copyLen2;
        strLen -= copyLen2;
      }
    }
  }
  return out;
}

if (import.meta.main) {
  for (const f of process.argv.slice(2)) {
    const buf = readFileSync(f);
    try {
      const inner = depackMO3(buf);
      const ext = inner[0] === 0x49 && inner[1] === 0x4d && inner[2] === 0x50 && inner[3] === 0x4d ? 'it'
        : inner[17] === 0x1a && String.fromCharCode(...inner.slice(0, 15)) === 'Extended Module:' ? 'xm'
        : inner[0] === 0x53 && inner[1] === 0x43 && inner[2] === 0x52 && inner[3] === 0x4d ? 's3m'
        : 'unknown';
      console.log(f, '→', inner.length, 'bytes, inner format:', ext);
      if (process.argv.includes('--write')) {
        writeFileSync(f.replace(/\.mo3$/i, '') + '.unpacked.' + ext, inner);
      }
    } catch (e) {
      console.log(f, 'FAILED:', e.message);
    }
  }
}
