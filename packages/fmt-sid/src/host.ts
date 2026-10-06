// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/host/host.h — file-format constants.
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").
//
// The PC-only host facilities (file-IO, playlists, MD5 song-length database,
// audio backends) are intentionally not ported: the modplayjs host provides
// its own IO and buffer loop. cRSID_MD5_calculateSum is only used for the
// optional SongLengths database lookup (cRSID_getPlaylengths), which is a
// no-op when cRSID.SongLengths == NULL — the TS port keeps SongLengths NULL.

export const CRSID_FILEVERSION_WEBSID = 0x4e;
export const CRSID_SECONDS_PER_MINUTE = 60;
export const CRSID_FILESIZE_MAX = 100000;
