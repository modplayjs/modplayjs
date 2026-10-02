// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/st_load.c (st_test :62-249, st_load
// :251-517), the Ultimate Soundtracker / D.O.C Soundtracker family
// (15 instruments, no magic).

import type { Core, FormatPlugin, LoadCtx, ModuleData } from '@modplayjs/core';
import type { Event, RawSample } from '@modplayjs/core';
import { C4_PAL_RATE, PeriodType, Quirk, ReadEventType, SampleFlags } from '@modplayjs/core';
import { LSN, MSN, ParseError } from '@modplayjs/core';
import type { Nna, Dct } from '@modplayjs/core';
import { readEvent as readEventDispatch, decodeEvent, TrackerId } from '@modplayjs/fmt-mod';
import type { Instrument } from '@modplayjs/core';

/** musanx.mod contains 22 period and instrument errors (st_load.c:40). */
const ST_MAX_PATTERN_ERRORS = 22;
/** Worst known truncation is u2.mod with 7% (st_load.c:43). */
const ST_TRUNCATION_LIMIT = 93;

/** ST period table (st_load.c:46-54) incl. the off-by-one values. */
const PERIOD = [
	856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
	428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
	214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
	// Off-by-one period values found in blueberry.mod, snd.mod,
	// quite a lot.mod, sweet dreams.mod, and bar----fringdus.mod
	763, 679, 641, 571, 539, 509, 429, 340, 321, 300, 286, 270,
	227, 191, 162,
	-1,
];

/** st_expected_size (st_load.c:56-60). */
function stExpectedSize(smpSize: number, pat: number): number {
	return 600 + smpSize + 1024 * pat;
}

/** libxmp_test_name (common.c:274-296) with TEST_NAME_* flags. */
function testName(s: Uint8Array, n: number, flags: number): boolean {
	const IGNORE_AFTER_0 = 0x0001;
	const IGNORE_AFTER_CR = 0x0002;
	for (let i = 0; i < n && i < s.length; i++) {
		const c = s[i]!;
		if (c === 0 && (flags & IGNORE_AFTER_0) !== 0) break;
		if (c === 0x0d && (flags & IGNORE_AFTER_CR) !== 0) break;
		if (c > 0x7f) return false;
		// ACS_Team2.mod has a backspace in instrument name
		// Numerous ST modules from Music Channel BBS have char 14.
		if (c > 0 && c < 32 && c !== 0x08 && c !== 0x0e) return false;
	}
	return true;
}

interface StIns {
	name: Uint8Array;
	size: number;
	finetune: number;
	volume: number;
	loop_start: number;
	loop_size: number;
}

interface StHeader {
	name: Uint8Array;
	ins: StIns[];
	len: number;
	restart: number;
	order: Uint8Array;
}

/** Read the 600-byte ST header. */
function readHeader(bytes: Uint8Array): StHeader {
	const name = bytes.slice(0, 20);
	// The Super Ski 2 modules have unusual "SONG\x13\x88" names.
	if (name[5] === 0x88) {
		name[5] = 0x58; // 'X'
		if (name[4] === 0x13) name[4] = 0x58; // 'X'
	}
	const ins: StIns[] = [];
	for (let i = 0; i < 15; i++) {
		const pos = 20 + i * 30;
		ins.push({
			name: bytes.slice(pos, pos + 22),
			size: (bytes[pos + 22]! << 8) | bytes[pos + 23]!,
			finetune: bytes[pos + 24]!,
			volume: bytes[pos + 25]!,
			loop_start: (bytes[pos + 26]! << 8) | bytes[pos + 27]!,
			loop_size: (bytes[pos + 28]! << 8) | bytes[pos + 29]!,
		});
	}
	return {
		name,
		ins,
		len: bytes[470]!,
		restart: bytes[471]!,
		order: bytes.slice(472, 600),
	};
}

/** st_test (st_load.c:62-249). */
export function stTest(bytes: Uint8Array): boolean {
	const size = bytes.length;
	if (size < 600) return false;

	let smpSize = 0;
	const mh = readHeader(bytes);

	const TEST_NAME_IGNORE_AFTER_CR = 0x0002;
	let testFlags = TEST_NAME_IGNORE_AFTER_CR;

	if (!testName(mh.name, 20, testFlags)) return false;

	for (let i = 0; i < 15; i++) {
		const ins = mh.ins[i]!;
		smpSize += 2 * ins.size;

		// pennylane.mod and heymusic-sssexremix.mod have unusual
		// values after the \0.
		if (i === 0) {
			const n = ins.name;
			const eq = (arr: number[]): boolean => {
				if (n.length < arr.length) return false;
				for (let k = 0; k < arr.length; k++) {
					if (n[k] !== arr[k]) return false;
				}
				return true;
			};
			if (
				eq([0x66, 0x75, 0x6e, 0x62, 0x61, 0x73, 0x73, 0x00, 0x0d]) || // "funbass\0\r"
				eq([0x73, 0x74, 0x2d, 0x36, 0x39, 0x3a, 0x62, 0x61, 0x73, 0x65, 0x6c, 0x69, 0x6e, 0x65, 0x00, 0x52, 0x00, 0x00, 0xa5]) // "st-69:baseline\0R\0\0\xA5"
			) {
				testFlags |= 0x0001; // TEST_NAME_IGNORE_AFTER_0
			}
		}

		// Crepequs.mod has random values in first byte
		ins.name[0] = 0x58; // 'X'

		if (!testName(ins.name, 22, testFlags)) return false;

		if (ins.volume > 0x40) return false;
		if ((ins.finetune & 0xf0) !== 0) return false;
		if (ins.size > 0x8000) return false;
		// This test is always false, disable it
		// if ((loop_start >> 1) > 0x8000) return -1;
		if (ins.loop_size > 0x8000) return false;
		// This test fails in atmosfer.mod, disable it
		// if (loop_size > 1 && loop_size > size) return -1;

		// Bad rip of fin-nv1.mod has this unused instrument.
		if (ins.size === 0 && ins.loop_start === 4462 && ins.loop_size === 2078) {
			continue;
		}

		if ((ins.loop_start >> 1) > ins.size) return false;
		if (ins.size !== 0 && (ins.loop_start >> 1) === ins.size) return false;
		if (ins.size === 0 && ins.loop_start > 0) return false;
	}

	if (smpSize < 8) return false;

	// Pattern count from the order table.
	let pat = 0;
	let patShort = 0;
	for (let i = 0; i < 128; i++) {
		const x = mh.order[i]!;
		if (x > 0x7f) return false;
		if (x > pat) {
			pat = x;
			if (i < mh.len) patShort = x;
		}
	}
	pat++;
	patShort++;

	if (pat > 0x7f || mh.len === 0 || mh.len > 0x80) return false;

	// ST pattern-list quirk (razor-1911.mod, Operation Wolf, Bad Dudes).
	if (size < stExpectedSize(smpSize, pat) && size === stExpectedSize(smpSize, patShort)) {
		pat = patShort;
	}

	// Pattern data sanity (st_load.c:208-249): sample numbers > 15 and
	// periods outside the ST table count as errors.
	let patternErrors = 0;
	let ins0 = 0;
	for (let i = 0; i < pat; i++) {
		const base = 600 + i * 1024;
		if (base + 1024 > size) return false; // hio_read short → not ST
		for (let j = 0; j < 64 * 4; j++) {
			const off = base + j * 4;
			const s = (bytes[off]! & 0xf0) | MSN(bytes[off + 2]!);
			if (s > 15) {
				if (++patternErrors > ST_MAX_PATTERN_ERRORS) return false;
			}
			if (s > ins0) ins0 = s;

			const p = 256 * LSN(bytes[off]!) + bytes[off + 1]!;
			if (p === 0) continue;
			let k = 0;
			for (; PERIOD[k]! >= 0; k++) {
				if (p === PERIOD[k]) break;
			}
			if (PERIOD[k]! < 0) {
				if (++patternErrors > ST_MAX_PATTERN_ERRORS) return false;
			}
		}
	}

	// Check if file was cut before any unused samples (st_load.c:250-266).
	if (size < stExpectedSize(smpSize, pat)) {
		let ss = 0;
		for (let i = 0; i < 15 && i < ins0; i++) {
			ss += 2 * mh.ins[i]!.size;
		}
		const limit = Math.trunc((stExpectedSize(ss, pat) * ST_TRUNCATION_LIMIT) / 100);
		if (size < limit) return false;
	}

	return true;
}

/** Zeroed envelope (libxmp_init_instrument calloc semantics). */
function zeroEnvelope(): Instrument['aei'] {
	return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}

function zeroInstrument(name: string, sub: Instrument['sub']): Instrument {
	return {
		name,
		volume: 0x40,
		nsm: 0,
		rls: 0,
		map: new Array<number>(121).fill(0),
		mapXpo: new Array<number>(121).fill(0),
		sub,
		aei: zeroEnvelope(),
		fei: zeroEnvelope(),
		pei: zeroEnvelope(),
	};
}

function copyAdjustName(r: Uint8Array, n: number): string {
	let s = '';
	for (let i = 0; i < n && i < r.length; i++) {
		const c = r[i]!;
		if (c === 0) break;
		s += c > 127 || c < 0x20 || c === 0x7f ? '.' : String.fromCharCode(c);
	}
	return s;
}

/** st_load (st_load.c:251-517). */
export function stLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {	const size = bytes.length;
	const fail = (msg: string): never => {
		throw new ParseError(msg);
	};

	const mh = readHeader(bytes);

	let ust = 1;
	let smpSize = 0;
	for (let i = 0; i < 15; i++) {
		smpSize += 2 * mh.ins[i]!.size;
	}

	const len = mh.len!;
	let rst = mh.restart!;

	// UST: The byte at module offset 471 is BPM, not the song restart.
	// The default for UST modules is 0x78 = 120 BPM = 48 Hz.
	if (rst < 0x40) ust = 0;

	const xxo = Array.from(mh.order);

	let pat = 0;
	let patShort = 0;
	for (let i = 0; i < 128; i++) {
		if (xxo[i]! > pat) {
			pat = xxo[i]!;
			if (i < len) patShort = pat;
		}
	}
	pat++;
	patShort++;

	// ST pattern-list quirk.
	if (size < stExpectedSize(smpSize, pat) && size === stExpectedSize(smpSize, patShort)) {
		pat = patShort;
	}

	// UST heuristics (st_load.c:328-355).
	for (let i = 0; i < 15; i++) {
		const ins = mh.ins[i]!;
		if (ins.finetune !== 0) ust = 0;
		if (ins.size > 0x1387 || ins.loop_start > 9999 || ins.loop_size > 0x1387) ust = 0;
	}

	// Instruments (st_load.c:357-397): ST loop points are BYTE offsets from
	// the sample start — xxs->len = 2*size - loop_start, lps = 0.
	const instruments: Instrument[] = [];
	const rawSamples: RawSample[] = [];
	for (let i = 0; i < 15; i++) {
		const ins = mh.ins[i]!;
		const xlen = 2 * ins.size - ins.loop_start;
		const lps = 0;
		const lpe = lps + 2 * ins.loop_size;
		const xflg = ins.loop_size > 1 ? SampleFlags.LOOP : 0;
		const fin = (((ins.finetune << 4) & 0xff) << 24) >> 24; // (int8)((uint8)finetune << 4)

		const sub = {
			vol: ins.volume,
			gvl: 0x40, // no QUIRK_INSVOL: load_epilogue sets gvl = volbase
			pan: -1, // XMP_INST_NO_DEFAULT_PAN
			xpo: 0,
			fin,
			vwf: 0,
			vde: 0,
			vra: 0,
			vsw: 0,
			sid: i,
			rvv: 0,
			nna: 0 as Nna,
			dct: 0 as Dct,
			dca: 0 as Nna,
			ifc: 0,
			ifr: 0,
		};
		const iname = copyAdjustName(ins.name, 22);
		const xxi = zeroInstrument(iname, [sub]);
		if (xlen > 0) xxi.nsm = 1;
		instruments.push(xxi);

		rawSamples.push({
			name: '', // st_load never writes xxs->name
			data: new Uint8Array(0),
			length: xlen,
			loopStart: lps,
			loopEnd: lpe,
			sustainStart: 0,
			sustainEnd: 0,
			finetune: fin,
			volume: ins.volume,
			flags: xflg,
			c5spd: C4_PAL_RATE,
		});
	}

	// Patterns (st_load.c:402-433): decode + tracker detection in one pass.
	const chn = 4;
	const patlen = 64 * 4 * chn;
	const patterns = [];
	let fxused = 0;
	const events: Event[][][] = []; // [pat][row][chn]
	for (let i = 0; i < pat; i++) {
		const base = 600 + i * 1024;
		if (base + 1024 > size) fail('ST: read error at pattern');
		const patEvents: Event[][] = [];
		const tracks = [];
		for (let k = 0; k < chn; k++) tracks.push({ rows: 64, event: [] as Event[] });
		for (let j = 0; j < 64 * 4; j++) {
			const row = Math.floor(j / 4);
			const c = j % 4;
			const ev: Event = {
				note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0,
			};
			decodeEvent(ev, bytes, base + j * 4, TrackerId.PROTRACKER);
			if (ev.fxt) fxused |= 1 << ev.fxt;
			else if (ev.fxp) fxused |= 1;

			// UST: Only effects 1 (arpeggio) and 2 (pitchbend) are available.
			if (ev.fxt && ev.fxt !== 1 && ev.fxt !== 2) ust = 0;

			// Karsten Obarski's sleepwalk uses arpeggio 30 and 40.
			if (ev.fxt === 1) {
				if (ev.fxp === 0x00) ust = 0;
			}
			if (ev.fxt === 2) {
				// bend up and down at same time?
				if ((ev.fxp & 0x0f) !== 0 && (ev.fxp & 0xf0) !== 0) ust = 0;
			}

			while (patEvents.length <= row) patEvents.push([]);
			patEvents[row]![c] = ev;
			tracks[c]!.event[row] = ev;
		}
		patterns.push({ rows: 64, tracks });
		events.push(patEvents);
	}

	// Tracker type (st_load.c:435-447).
	let modtype: string;
	if ((fxused & ~0x0006) !== 0) ust = 0;
	if (ust !== 0) {
		modtype = 'Ultimate Soundtracker';
	} else if ((fxused & ~0xd007) === 0) {
		modtype = 'Soundtracker IX'; // or MasterSoundtracker?
	} else if ((fxused & ~0xf807) === 0) {
		modtype = 'D.O.C Soundtracker 2.0';
	} else {
		modtype = 'unknown tracker 15 instrument';
	}

	// UST conversions (st_load.c:482-511).
	let bpm = 125;
	if (ust !== 0) {
		// Fix restart & bpm.
		bpm = rst;
		rst = 0;
		// Fix effects (arpeggio and pitchbending).
		for (let i = 0; i < pat; i++) {
			for (let j = 0; j < 64 * 4; j++) {
				const row = Math.floor(j / 4);
				const c = j % 4;
				const ev = events[i]![row]![c]!;
				if (ev.fxt === 1) ev.fxt = 0;
				else if (ev.fxt === 2 && (ev.fxp & 0xf0) === 0) ev.fxt = 1;
				else if (ev.fxt === 2 && (ev.fxp & 0x0f) === 0) ev.fxp >>= 4;
			}
		}
	} else {
		if (rst >= len) rst = 0;
	}

	// Samples (st_load.c:513-517): skip the transient pre-loop part
	// (hio_seek(loop_start, SEEK_CUR)), then libxmp_load_sample.
	let filePos = 600 + pat * patlen;
	for (let i = 0; i < 15; i++) {
		const raw = rawSamples[i]!;
		if (raw.length === 0) {
			ctx.addSample(raw);
			continue;
		}
		// Skip transient part of sample (st_load.c:528-543).
		filePos += mh.ins[i]!.loop_start;
		const remaining = Math.max(0, size - filePos);
		const take = Math.min(raw.length, remaining);
		raw.data = bytes.subarray(filePos, filePos + take);
		filePos += raw.length; // hio_read advances by requested count
		ctx.addSample(raw);
	}

	// Channel defaults (load_helpers.c:334-339): pan LRLR, vol 0x40, flg 0.
	const channels = [];
	for (let i = 0; i < chn; i++) {
		const pan = Math.floor((i + 1) / 2) % 2 * 0xff;
		channels.push({ pan: Math.min(255, Math.max(0, 0x80 + (pan - 0x80))), vol: 0x40, flg: 0 });
	}

	const mod: ModuleData = {
		title: copyAdjustName(mh.name, 20),
		format: 'mod',
		comment: '',
		chn,
		pat,
		ins: 15,
		len,
		restart: rst,
		xxo,
		channels,
		patterns,
		instruments,
		samples: rawSamples,
		num_sequences: 0,
		sequences: [],
		speed: 6,
		bpm,
		volbase: 0x40,
		gvolbase: 0x40,
		gvol: 0x40,
		quirks: Quirk.NOBPM,
		flowMode: 0,
		readEventType: ReadEventType.MOD,
		periodType: PeriodType.MODRNG,
		defpan: 0x80,
		time_factor: 10,
		rrate: 250,
		c4rate: C4_PAL_RATE,
		compare_vblank: false,
		tracker: modtype,
	};

	void ctx.sampleRate;
	void ctx.outputRate;
	return mod;
}

/** ST format plugin (libxmp loaders/st_load.c + read_event MOD family). */
export const plugin: FormatPlugin = {
  name: 'st',
  test: stTest,
  load: stLoad,
  readEvent(core: Core, chn: number, row: number): void {
    readEventDispatch(core, chn, row);
  },
};
