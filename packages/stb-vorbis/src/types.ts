// SPDX-License-Identifier: BSD-3-Clause
// Ported from: OpenMPT's bundled stb_vorbis (reference/openmpt/include/
// stb_vorbis/stb_vorbis.c, public domain by Sean Barrett et al.).
// Memory-source pull-API subset: no stdio, no push mode, no seeking.

export const MAX_BLOCKSIZE_LOG = 13;
export const MAX_BLOCKSIZE = 1 << MAX_BLOCKSIZE_LOG;
export const FAST_HUFFMAN_TABLE_SIZE = 1 << 10; // STB_VORBIS_FAST_HUFFMAN_LENGTH = 10
export const FAST_HUFFMAN_TABLE_MASK = FAST_HUFFMAN_TABLE_SIZE - 1;
export const STB_VORBIS_FAST_HUFFMAN_LENGTH = 10;
export const NO_CODE = 255;

export const VORBIS = {
  no_error: 0,
  need_more_data: 1,
  invalid_stream_structure_version: 2,
  invalid_first_page: 4,
  invalid_stream: 11,
  missing_capture_pattern: 30,
  unexpected_eof: 10,
  continued_packet_flag_invalid: 9,
  invalid_setup: 20,
  outofmem: 14,
  feature_not_supported: 26,
  too_many_channels: 31,
};

export interface Codebook {
  dimensions: number;
  entries: number;
  codewordLengths: Uint8Array | null;
  minimumValue: number;
  deltaValue: number;
  valueBits: number;
  lookupType: number;
  sequenceP: number;
  sparse: number;
  lookupValues: number;
  multiplicands: Float32Array | null;
  codewords: Uint32Array | null;
  fastHuffman: Int32Array;
  sortedCodewords: Uint32Array | null;
  sortedValues: Int32Array | null;
  sortedEntries: number;
}

export interface Floor0 {
  order: number; rate: number; barkMapSize: number;
  amplitudeBits: number; amplitudeOffset: number;
  numberOfBooks: number; bookList: number[];
}

export interface Floor1 {
  partitions: number;
  partitionClassList: number[];
  classDimensions: number[];
  classSubclasses: number[];
  classMasterbooks: number[];
  subclassBooks: number[][];
  Xlist: number[];
  sortedOrder: number[];
  neighbors: number[][];
  floor1Multiplier: number;
  rangebits: number;
  values: number;
}

export interface Residue {
  begin: number; end: number; partSize: number;
  classifications: number; classbook: number;
  classdata: Uint8Array[] | null;
  residueBooks: Int16Array[] | null;
}

export interface MappingChannel { magnitude: number; angle: number; mux: number; }

export interface Mapping {
  couplingSteps: number;
  chan: MappingChannel[];
  submaps: number;
  submapFloor: number[];
  submapResidue: number[];
}

export interface Mode {
  blockflag: number; mapping: number;
  windowtype: number; transformtype: number;
}

export interface Vorb {
  // input
  stream: Uint8Array;
  streamStart: number;
  streamEnd: number;
  streamPos: number;
  streamLen: number;
  eof: boolean;
  error: number;

  // header info
  sampleRate: number;
  channels: number;
  blocksize: number[];
  blocksize0: number;
  blocksize1: number;
  codebookCount: number;
  codebooks: Codebook[];
  floorCount: number;
  floorTypes: number[];
  floor0Config: Floor0[];
  floor1Config: Floor1[];
  residueCount: number;
  residueTypes: number[];
  residueConfig: Residue[];
  mappingCount: number;
  mapping: Mapping[];
  modeCount: number;
  modeConfig: Mode[];

  // decode buffers
  channelBuffers: Float32Array[];
  outputs: Float32Array[];
  previousWindow: Float32Array[];
  previousLength: number;
  finalY: Int16Array[];

  currentLoc: number;
  currentLocValid: boolean;

  // blocksize precomputed
  A: Float32Array[];
  B: Float32Array[];
  C: Float32Array[];
  window: Float32Array[];
  bitReverse: Uint16Array[];

  // page/packet state
  firstDecode: boolean;
  nextSeg: number;
  lastSeg: boolean;
  lastSegWhich: number;
  acc: number;
  validBits: number;
  packetBytes: number;
  endSegWithKnownLoc: number;
  knownLocForPacket: number;
  discardSamplesDeferred: number;
  samplesOutput: number;

  lastPage: number;
  segmentCount: number;
  segments: Uint8Array;
  pageFlag: number;
  bytesInSeg: number;

  channelBufferStart: number;
  channelBufferEnd: number;

  firstAudioPageOffset: number;
}
