// T3 QA FAILURE case: a ModuleData literal MISSING required fields —
// must produce tsc errors naming the missing members.
import type { ModuleData } from '@modplayjs/core';

const ev = { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
const track = { rows: 4, event: [ev, ev, ev, ev] };
const pat = { rows: 4, tracks: [track, track] };

const badModule: ModuleData = {
  title: 'bad',
  format: 'mod',
  comment: '',
  chn: 4,
  pat: 1,
  len: 1,
  xxo: [0],
  channels: [{ pan: 0x80, vol: 64, flg: 0 }],
  patterns: [pat],
  instruments: [],
  samples: [],
  num_sequences: 1,
  sequences: [{ ord: 0, entry_point: 0, duration: 1, time: 0, speed: 6, bpm: 125, gvl: -1, start_row: 0 }],
  // missing: restart, speed, bpm, volbase, gvolbase, gvol, quirks, flowMode,
  // readEventType, periodType, defpan, time_factor, rrate, c4rate, tracker
};

export { badModule };