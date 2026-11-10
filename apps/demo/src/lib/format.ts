// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.

/** Display helpers shared by the player and the studio. */
export const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

/** Fixed-width right-aligned number, tracker style. */
export const fmtPad = (n: number, w: number): string => String(n).padStart(w, ' ');

/** Two-digit zero-padded number. */
export const fmt2 = (v: number): string => String(v).padStart(2, '0');

export const fmtBytes = (n: number): string => {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KiB';
  return (n / (1024 * 1024)).toFixed(1) + ' MiB';
};

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

/** Note number (1-based, libxmp scale) → `C-4` / `...`. */
export function noteStr(note: number): string {
  if (note <= 0 || note > 120) return '...';
  const n = note - 1;
  return NOTE_NAMES[n % 12] + String(Math.floor(n / 12));
}

/** Effect letter + parameter, the same table the file uses. */
export function fxStr(fxt: number, fxp: number): string {
  if (!fxt && !fxp) return '...';
  const letters = '0123456789ABCDEFHIJKLMNOPQRSTUVWXWZ';
  const c = fxt < letters.length ? letters[fxt] : '?';
  return c + fxp.toString(16).padStart(2, '0').toUpperCase();
}

/** Trackers pad names with trailing dots ('....'); the view can hide them. */
export function displayName(name: string, stripDots: boolean): string {
  return stripDots ? name.replace(/\.+$/, '') : name;
}
