// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// Playlist persistence — IndexedDB blob cache for the demo playlist.
// Files selected via the picker (multiple) or dropped on the page are
// stored as blobs keyed by an auto id; name+size is the dedupe key.
// Writes failing (private browsing, quota) degrade to in-memory mode:
// the playlist still works for the session, it just won't survive a
// reload.

export interface PlaylistTrack {
  id: number;
  name: string;
  format: string;
  size: number;
  blob: Blob;
}

const DB_NAME = 'modplayjs-demo';
const DB_VERSION = 1;
const STORE = 'tracks';

function openDb(): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE)) {
      db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  return promise;
}

/** Extension used as the format badge / dedupe fallback. */
export function trackFormat(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  return ext || '?';
}

export class PlaylistStore {
  private db: IDBDatabase | null = null;
  /** In-memory mirror; the source of truth for rendering. Order = addedAt. */
  tracks: PlaylistTrack[] = [];
  /** True when IndexedDB is unavailable — entries live for this session only. */
  ephemeral = false;

  async init(): Promise<void> {
    try {
      this.db = await openDb();
      this.tracks = await this.getAll();
    } catch {
      this.ephemeral = true;
      this.tracks = [];
    }
  }

  private async getAll(): Promise<PlaylistTrack[]> {
    const db = this.db;
    if (!db) return [];
    const { promise, resolve, reject } = Promise.withResolvers<PlaylistTrack[]>();
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result ?? []) as PlaylistTrack[];
      resolve(rows.sort((a, b) => a.id - b.id));
    };
    req.onerror = () => reject(req.error ?? new Error('indexedDB read failed'));
    return promise;
  }

  private async put(rec: Omit<PlaylistTrack, 'id'>): Promise<number> {
    const db = this.db;
    if (!db) return -(this.tracks.length + 1);
    const { promise, resolve, reject } = Promise.withResolvers<number>();
    const tx = db.transaction(STORE, 'readwrite');
    // NOTE: no inline id — with keyPath+autoIncrement the store must NOT
    // see an id property, or it uses it as the key (0 collides on add #2).
    const req = tx.objectStore(STORE).add(rec as PlaylistTrack);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error ?? new Error('indexedDB add failed'));
    return promise;
  }

  /**
   * Add files, skipping duplicates (same name+size, checked against the
   * existing list AND within the batch). Returns how many were skipped.
   */
  async add(files: File[]): Promise<number> {
    let skipped = 0;
    for (const file of files) {
      const dup = this.tracks.some(
        (t) => t.name === file.name && t.size === file.size,
      );
      if (dup) {
        skipped++;
        continue;
      }
      const rec = {
        name: file.name,
        format: trackFormat(file.name),
        size: file.size,
        blob: file,
      };
      const id = await this.put(rec);
      this.tracks.push({ ...rec, id });
    }
    return skipped;
  }

  async remove(id: number): Promise<void> {
    this.tracks = this.tracks.filter((t) => t.id !== id);
    if (this.db && id > 0) {
      const db = this.db;
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('indexedDB delete failed'));
      await promise;
    }
  }

  async clear(): Promise<void> {
    this.tracks = [];
    if (this.db) {
      const db = this.db;
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('indexedDB clear failed'));
      await promise;
    }
  }
}
