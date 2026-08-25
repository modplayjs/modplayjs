// T3 QA: a ModuleData literal for XM type-checks against the model.
import type { ModuleData } from '@modplayjs/core';
import {
  ReadEventType, PeriodType, FLOW_MODE_MPT_116, QUIRKS_FT2,
} from '@modplayjs/core';

const ev = { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
const track = { rows: 4, event: [ev, ev, ev, ev] };
const pat = { rows: 4, tracks: [track, track] };

const moduleData: ModuleData = {
  title: 'T3 QA module',
  format: 'xm',
  comment: '',
  chn: 2,
  pat: 1,
  len: 1,
  restart: 0,
  xxo: [0],
  channels: [
    { pan: 0x80, vol: 64, flg: 0 },
    { pan: 0x80, vol: 64, flg: 0 },
  ],
  patterns: [pat],
  instruments: [],
  samples: [],
  num_sequences: 1,
  sequences: [{ ord: 0, entry_point: 0, duration: 1, time: 0, speed: 6, bpm: 125, gvl: -1, start_row: 0 }],
  speed: 6,
  bpm: 125,
  volbase: 64,
  gvolbase: 128,
  gvol: 128,
  quirks: QUIRKS_FT2,
  flowMode: FLOW_MODE_MPT_116,
  readEventType: ReadEventType.FT2,
  periodType: PeriodType.AMIGA,
  defpan: 0x80,
  time_factor: 10,
  rrate: 250,
  c4rate: 8287,
  tracker: 'FastTracker II',
};

export { moduleData };