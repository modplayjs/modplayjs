// CRC32 (stb_vorbis.c:1000-1026) — the Ogg CRC, polynomial 0x04c11db7.
const CRC32_POLY = 0x04c11db7;

const crcTable = new Uint32Array(256);
let crcInitialized = false;

export function crc32Init(): void {
  if (crcInitialized) return;
  for (let i = 0; i < 256; ++i) {
    let s = i << 24;
    for (let j = 0; j < 8; ++j) {
      s = (s << 1) ^ (s >= 0x80000000 ? CRC32_POLY : 0);
    }
    crcTable[i] = s >>> 0;
  }
  crcInitialized = true;
}

/** Running CRC update (C crc32_update in stb_vorbis.c seek section). */
export function crcUpdate(crc: number, byte: number): number {
  crc = ((crc << 8) ^ (crcTable[byte ^ (crc >>> 24)] ?? 0)) >>> 0;
  return crc;
}
