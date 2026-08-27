// Tracker detection helpers. Verbatim port of reference/libxmp/src/
// loaders/mod_load.c:55-436 (non-CORE_PLAYER): TRACKER_* enum, mod_magic
// table, tracker_is_vblank, flip_word_bytes, validate_pattern, is_st_ins,
// and get_tracker_id.

/** TRACKER_* ids (mod_load.c:55-73). */
export const TrackerId = {
  PROTRACKER: 0,
  NOISETRACKER: 1,
  SOUNDTRACKER: 2,
  FASTTRACKER: 3,
  FASTTRACKER2: 4,
  OCTALYSER: 5,
  TAKETRACKER: 6,
  DIGITALTRACKER: 7,
  FLEXTRAX: 8,
  MODSGRAVE: 9,
  SCREAMTRACKER3: 10,
  OPENMPT: 11,
  SOFTWAREVISIONS: 12,
  UNKNOWN_CONV: 95,
  CONVERTEDST: 96,
  CONVERTED: 97,
  CLONE: 98,
  UNKNOWN: 99,
  PROBABLY_NOISETRACKER: 20,
} as const;
export type TrackerIdValue = (typeof TrackerId)[keyof typeof TrackerId];

/** struct mod_magic (mod_load.c:47-52) + table :75-93. */
export interface ModMagic {
  magic: string;
  flag: number;
  id: number;
  ch: number;
}

export const MOD_MAGIC: readonly ModMagic[] = [
  { magic: 'M.K.', flag: 0, id: TrackerId.PROTRACKER, ch: 4 },
  { magic: 'M!K!', flag: 1, id: TrackerId.PROTRACKER, ch: 4 },
  { magic: 'M&K!', flag: 1, id: TrackerId.NOISETRACKER, ch: 4 },
  { magic: 'N.T.', flag: 1, id: TrackerId.NOISETRACKER, ch: 4 },
  { magic: '6CHN', flag: 0, id: TrackerId.FASTTRACKER, ch: 6 },
  { magic: '8CHN', flag: 0, id: TrackerId.FASTTRACKER, ch: 8 },
  { magic: 'CD61', flag: 1, id: TrackerId.OCTALYSER, ch: 6 }, /* Atari STe/Falcon */
  { magic: 'CD81', flag: 1, id: TrackerId.OCTALYSER, ch: 8 }, /* Atari STe/Falcon */
  { magic: 'TDZ1', flag: 1, id: TrackerId.TAKETRACKER, ch: 1 }, /* TakeTracker 1ch */
  { magic: 'TDZ2', flag: 1, id: TrackerId.TAKETRACKER, ch: 2 }, /* TakeTracker 2ch */
  { magic: 'TDZ3', flag: 1, id: TrackerId.TAKETRACKER, ch: 3 }, /* TakeTracker 3ch */
  { magic: 'TDZ4', flag: 1, id: TrackerId.TAKETRACKER, ch: 4 }, /* see XModule SaveTracker.c */
  { magic: 'FA04', flag: 1, id: TrackerId.DIGITALTRACKER, ch: 4 }, /* Atari Falcon */
  { magic: 'FA06', flag: 1, id: TrackerId.DIGITALTRACKER, ch: 6 }, /* Atari Falcon */
  { magic: 'FA08', flag: 1, id: TrackerId.DIGITALTRACKER, ch: 8 }, /* Atari Falcon */
  { magic: '.M.K', flag: 1, id: TrackerId.SOFTWAREVISIONS, ch: 4 }, /* Software Visions DMF */
  { magic: 'LARD', flag: 1, id: TrackerId.UNKNOWN, ch: 4 }, /* in judgement_day_gvine.mod */
  { magic: 'NSMS', flag: 1, id: TrackerId.UNKNOWN, ch: 4 }, /* in Kingdom.mod */
];

/**
 * tracker_is_vblank (mod_load.c:95-104): non-zero when the tracker ONLY
 * supports VBlank timing. Use only when the tracker is known for sure.
 */
export function trackerIsVblank(id: number): number {
  switch (id) {
    case TrackerId.NOISETRACKER:
    case TrackerId.SOUNDTRACKER:
      return 1;
    default:
      return 0;
  }
}

/** flip_word_bytes (mod_load.c:130-140). */
export function flipWordBytes(buf: Uint8Array, bytes: number): void {
  for (let i = 0; i + 1 < bytes; i += 2) {
    const t = buf[i]!;
    buf[i] = buf[i + 1]!;
    buf[i + 1] = t;
  }
}

/** validate_pattern (mod_load.c:142-158). */
export function validatePattern(buf: Uint8Array): number {
  for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 4; j++) {
      const d = (i * 4 + j) * 4;
      if ((buf[d]! >> 4) > 1) {
        return -1;
      }
    }
  }
  return 0;
}

/** is_st_ins (mod_load.c:291-303): "st-" digits ":" instrument names. */
export function isStIns(s: string): boolean {
  if (s.length < 6) return false;
  const c0 = s.charCodeAt(0), c1 = s.charCodeAt(1), c2 = s.charCodeAt(2),
    c3 = s.charCodeAt(3), c4 = s.charCodeAt(4), c5 = s.charCodeAt(5);
  if (c0 !== 0x73 /* s */ && c0 !== 0x53 /* S */) return false;
  if (c1 !== 0x74 /* t */ && c1 !== 0x54 /* T */) return false;
  if (c2 !== 0x2d /* - */ || c5 !== 0x3a /* : */) return false;
  if (c3 < 0x30 || c3 > 0x39 || c4 < 0x30 || c4 > 0x39) return false;
  return true;
}

/** Header view passed to get_tracker_id (struct mod_header subset). */
export interface ModHeaderIns {
  name: string;
  /** Sample length in 16-bit words. */
  size: number;
  finetune: number;
  volume: number;
  /** Loop start in 16-bit words. */
  loop_start: number;
  /** Loop length in 16-bit words. */
  loop_size: number;
}

export interface ModHeaderView {
  name: string;
  ins: ModHeaderIns[];
  len: number;
  restart: number;
  order: Uint8Array;
}

/**
 * get_tracker_id (mod_load.c:305-436). Returns the refined tracker id.
 * `id` is the magic-table id; modPat/modChn read from the module being
 * built; `rst` is mutated in place (C writes mod->rst).
 */
export function getTrackerId(
  m: { rst: number },
  mh: ModHeaderView,
  modPat: number,
  modChn: number,
  idIn: number,
): number {
  let id = idIn;
  let has_loop_0 = 0;
  let has_vol_in_empty_ins = 0;

  /* Check if has instruments with loop size 0 */
  for (let i = 0; i < 31; i++) {
    if (mh.ins[i]!.loop_size === 0) {
      has_loop_0 = 1;
      break;
    }
  }

  /* Check if has instruments with size 0 and volume > 0 */
  for (let i = 0; i < 31; i++) {
    if (mh.ins[i]!.size === 0 && mh.ins[i]!.volume > 0) {
      has_vol_in_empty_ins = 1;
      break;
    }
  }

  /*
   * Test Protracker-like files
   */
  if (mh.restart === modPat) {
    if (modChn === 4) {
      id = TrackerId.SOUNDTRACKER;
    } else {
      id = TrackerId.UNKNOWN;
    }
  } else if (mh.restart === 0x78) {
    if (modChn === 4) {
      /* Can't trust this for Noisetracker, MOD.Data City Remix
       * has Protracker effects and Noisetracker restart byte */
      id = TrackerId.PROBABLY_NOISETRACKER;
    } else {
      id = TrackerId.UNKNOWN;
    }
    return id;
  } else if (mh.restart < 0x7f) {
    if (modChn === 4 && !has_vol_in_empty_ins) {
      id = TrackerId.NOISETRACKER;
    } else {
      id = TrackerId.UNKNOWN; /* ? */
    }
    m.rst = mh.restart;
  } else if (mh.restart === 0x7f) {
    if (modChn === 4) {
      if (has_loop_0) {
        id = TrackerId.CLONE;
      }
    } else {
      id = TrackerId.SCREAMTRACKER3;
    }
    return id;
  } else if (mh.restart > 0x7f) {
    id = TrackerId.UNKNOWN; /* ? */
    return id;
  }

  if (!has_loop_0) { /* All loops are size 2 or greater */
    for (let i = 0; i < 31; i++) {
      if (mh.ins[i]!.size === 1 && mh.ins[i]!.volume === 0) {
        return TrackerId.CONVERTED;
      }
    }

    let i = 0;
    for (; i < 31; i++) {
      if (isStIns(mh.ins[i]!.name)) break;
    }
    if (i === 31) { /* No st- instruments */
      for (i = 0; i < 31; i++) {
        if (mh.ins[i]!.size !== 0 || mh.ins[i]!.loop_size !== 1) {
          continue;
        }

        switch (modChn) {
          case 4:
            if (has_vol_in_empty_ins) {
              id = TrackerId.OPENMPT;
            } else {
              id = TrackerId.NOISETRACKER;
              /* or Octalyser */
            }
            break;
          case 6:
          case 8:
            id = TrackerId.OCTALYSER;
            break;
          default:
            id = TrackerId.UNKNOWN;
        }
        return id;
      }

      /* ...and no empty... */
      if (modChn === 4) {
        id = TrackerId.PROTRACKER;
      } else if (modChn === 6 || modChn === 8) {
        /* FastTracker 1.01? */
        id = TrackerId.FASTTRACKER;
      } else {
        id = TrackerId.UNKNOWN;
      }
    }
  } else { /* Has loops with size 0 */
    let i = 15;
    for (; i < 31; i++) {
      /* Is the name or size set? */
      if (mh.ins[i]!.name.charCodeAt(0) !== 0 || mh.ins[i]!.size > 0) break;
    }
    if (i === 31 && isStIns(mh.ins[14]!.name)) {
      return TrackerId.CONVERTEDST;
    }

    /* Assume that Fast Tracker modules won't have ST- instruments */
    for (i = 0; i < 31; i++) {
      if (isStIns(mh.ins[i]!.name)) break;
    }
    if (i < 31) {
      return TrackerId.UNKNOWN_CONV;
    }

    if (modChn === 4 || modChn === 6 || modChn === 8) {
      return TrackerId.FASTTRACKER;
    }

    id = TrackerId.UNKNOWN; /* ?! */
  }

  return id;
}
