import { Injectable } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { WorkAgendaBoard, WorkAgendaSnapshot, WorkNote } from './work-agenda.model';

interface WorkAgendaDb extends DBSchema {
  boards: { key: string; value: WorkAgendaBoard };
  notes: { key: string; value: WorkNote; indexes: { byProfile: string } };
}

/** Per-character storage for the work board; notes (with their attachments) live apart from the board. */
@Injectable({ providedIn: 'root' })
export class WorkAgendaRepository {
  private readonly db: Promise<IDBPDatabase<WorkAgendaDb>> = openDB<WorkAgendaDb>(
    'super-productivity-work-agenda',
    1,
    {
      upgrade: (db) => {
        db.createObjectStore('boards', { keyPath: 'profileId' });
        const notes = db.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('byProfile', 'profileId');
      },
    },
  );

  async load(profileId: string): Promise<WorkAgendaSnapshot> {
    const db = await this.db;
    const [board, notes] = await Promise.all([
      db.get('boards', profileId),
      db.getAllFromIndex('notes', 'byProfile', profileId),
    ]);
    return { board, notes };
  }

  exportProfile(profileId: string): Promise<WorkAgendaSnapshot> {
    return this.load(profileId);
  }

  async importProfile(snapshot: WorkAgendaSnapshot): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(['boards', 'notes'], 'readwrite');
    await Promise.all([
      ...(snapshot.board ? [tx.objectStore('boards').put(snapshot.board)] : []),
      ...snapshot.notes.map((note) => tx.objectStore('notes').put(note)),
    ]);
    await tx.done;
  }

  async putBoard(board: WorkAgendaBoard): Promise<void> {
    await (await this.db).put('boards', board);
  }

  async putNote(note: WorkNote): Promise<void> {
    await (await this.db).put('notes', note);
  }

  async deleteNote(id: string): Promise<void> {
    await (await this.db).delete('notes', id);
  }
}
