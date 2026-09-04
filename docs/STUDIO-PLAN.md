# modplayjs Tracker Studio — Implementation Plan

Goal: a second route in the demo app (`#/studio`) — an in-browser tracker
module **creator** with per-note-part live preview, built entirely on the
existing core (no new audio plumbing).

---

## Phase 0 — Core enabler: `loadModuleData` (~40 lines, core.ts)

`Core.loadModuleData(mod: ModuleData): void` — the in-memory twin of
`loadModule(bytes)`:

1. `this.samples.clear()`
2. Register the module's `RawSample[]` through `addSample` (store ids ==
   `mod.samples` indices — loaders add in order, so the mapping
   `instrument.sub[k].sid → mod.samples[i] → store id` stays 1:1)
3. `new Scanner().scan(mod)` + sequences/ordInfo/scanEnd — copy the tail of
   `loadModule` verbatim (scan → ordInfo → sequenceControl → sequences)
4. `keyInstruments(mod.instruments)`, `this._module = mod`,
   `_state = CoreState.LOADED`

Guard: state must be UNLOADED/LOADED (not PLAYING). Everything downstream
(pattern view, audition, mute, smix) works unchanged because it only
consumes `ModuleData`.

**Acceptance**: build a 2-channel/1-pattern/1-instrument module in JS,
`loadModuleData`, startPlayer, hear the pattern render.

---

## Phase 1 — Studio skeleton (`#/studio` route in apps/demo)

- Hash-router in `main.ts`: `#/` = player, `#/studio` = studio. Shared
  `style.css`, shared core/registration setup (extract `createCore()`).
- Static layout: 3-pane grid (song setup / pattern editor / bottom
  inspector), daisyUI cards, mobile stacks.

**Acceptance**: route renders, theme toggle works, back link to player.

---

## Phase 2 — Song setup pane

- Title, channels (2–32), speed (1–31), bpm (32–255), format preset
  (XM-style defaults: quirks, readEventType FT2, volbase 64, time_factor 10,
  rrate 250, c4rate 8363)
- Order list: add/remove/reorder pattern entries (max 256)
- New-module wizard: creates an empty `ModuleData` (1 empty pattern, N
  empty channels with pan 0x80, vol 0x40) → `loadModuleData`

**Acceptance**: create an empty module, play it (silence), status shows
playing state, pattern grid renders the empty pattern.

---

## Phase 3 — Pattern editor grid

- Reuse the demo's grid CSS (`.prow`/`.cell`, channel separators, sticky
  header) but rows are **editable**:
  - Click a cell → selects it (cell = row × channel × part)
  - Keyboard entry (tracker-style): letter keys type note names, digits
    type hex params, arrow keys move, Enter = next row same column
  - Parts per cell: note / instrument / volume / effect — 4 sub-columns
    per channel as in the demo view
  - Row insert/delete, pattern duplicate/clear
- State lives in the same `ModuleData.patterns` structure the player
  consumes; edits mutate it in place.

**Acceptance**: enter a melody on channel 1 with instrument 1, press Play,
hear it; the existing demo pattern view renders the same data.

---

## Phase 4 — Note inspector (the per-note-part live preview)

Displayed for the selected cell; four mini-editors:

1. **Note**: piano-key/octave widget (C0…B8) + off/fade markers
2. **Instrument**: dropdown of module instruments + ▶ audition
   (reuses `core.playNote` on a reserved smix channel)
3. **Volume**: slider 0–64 (or 0–128 per format) + ▶ preview blip
4. **Effect**: fx letter picker + 2-hex param, with a plain-language
   description table (per format) and out-of-range validation

Every change writes through to the cell in `ModuleData` and (optionally,
"audition on edit" toggle) triggers `playNote` so each part is previewed
in isolation.

**Acceptance**: select an empty cell → set C-5/ins 1/vol 40 via the
inspectors → the pattern cell displays `C-5 01 40 ...`; ▶ previews sound;
playing the song renders the note.

---

## Phase 5 — Instruments & samples pane

- Instrument list (add/remove/rename, per-instrument volume)
- Sample generator: waveform (sine/square/saw/triangle/noise/white),
  length (ms), loop points, volume → synthesized 8-bit `RawSample`
  (`data: Uint8Array`), `c5spd = 8363`, flags LOOP/BIDIR as set
- Waveform draw canvas (draw a custom cycle → normalize → sample)
- ▶ audition per sample (resolve owner instrument → playNote, the demo's
  existing mapping code)
- Attach sample → instrument: edit `sub[0].sid` + key map

**Acceptance**: generate a 440 Hz sine sample, attach to instrument 1,
enter a row with that instrument, hear it in the song and via audition.

---

## Phase 6 — Persistence & polish

- Save/load project as JSON (ModuleData + sample data base64) — download /
  file open
- Play-from-selected-row, loop-between-markers
- Undo stack (pattern cell edits + structural ops)
- Build-hash badge (shared with the player page)

## Phase 7 (later, out of scope for v1)

- Export to real `.xm`/`.it` files (format *writers*)
- Envelope editors (volume/pan/filter — `Envelope` is a plain interface)
- Multi-sequence editing

---

## Risks / notes

- The scanner needs sane `mod.len`/`xxo` before scan — the wizard fills
  them; guard `loadModuleData` against empty order tables (len=0 path
  exists in startPlayer).
- Sample store ids == mod.samples indices only if the studio registers
  samples in order and never deletes from the middle — deletion = mark
  unused, compact on export.
- FT2 vs IT effect semantics differ; v1 targets the XM preset only
  (readEventType FT2), so the inspector's fx table is single-format.
- Keyboard entry needs a keymap: reuse the demo's `noteStr` letter table.

## Order of work

Phase 0 → 1 → 2 → 3 → 4 → 5 → 6. Phase 0 unblocks everything; the editor
(3) and inspector (4) are the user-facing core; persistence (6) makes it
usable across sessions.
