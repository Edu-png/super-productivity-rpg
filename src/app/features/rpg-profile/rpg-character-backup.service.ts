import { inject, Injectable } from '@angular/core';
import { RpgProfileService } from './rpg-profile.service';
import { RpgProfileState } from './rpg-profile.model';
import { AcademyIdbRepository } from '../academy-arcana/persistence/academy-idb.repository';
import { AcademyBackup } from '../academy-arcana/domain/academy.models';
import {
  ArcaneLibraryRepository,
  LibraryCloudSnapshot,
} from '../arcane-library/persistence/arcane-library.repository';
import {
  GameLibraryRepository,
  GameLibraryCloudSnapshot,
} from '../game-library/persistence/game-library.repository';
import { TaskHabitService } from '../habit-tracker/task-habit.service';
import { TaskHabitState } from '../habit-tracker/task-habit.model';
import { IS_ELECTRON } from '../../app.constants';
import { getBackupTimestamp } from '../../../../electron/shared-with-frontend/get-backup-timestamp';
import { LS } from '../../core/persistence/storage-keys.const';

export interface RpgCharacterBackup {
  format: 'rpg-character-backup';
  version: 1;
  exportedAt: number;
  characterId: string;
  characterName: string;
  domains: {
    rpgProfile: RpgProfileState;
    academyArcana: AcademyBackup;
    arcaneLibrary: LibraryCloudSnapshot;
    gameLibrary?: GameLibraryCloudSnapshot;
    habitTracker: TaskHabitState;
  };
}

// Bundles every domain keyed by a character's own id (RPG profile itself,
// Academy Arcana studies, Arcane Library reading, Game Library sessions, and
// the habits assigned to that character) into one downloadable file, and
// restores the same bundle back - one character at a time, same as the
// upload flow. Every domain here already upserts by id/profileId without
// touching other characters' data, so importing never wipes anything else.
@Injectable({ providedIn: 'root' })
export class RpgCharacterBackupService {
  private readonly profile = inject(RpgProfileService);
  private readonly academyRepo = inject(AcademyIdbRepository);
  private readonly libraryRepo = inject(ArcaneLibraryRepository);
  private readonly gameLibraryRepo = inject(GameLibraryRepository);
  private readonly habitTracker = inject(TaskHabitService);

  async exportCharacter(characterId: string): Promise<RpgCharacterBackup> {
    const character = this.profile.characters().find((item) => item.id === characterId);
    if (!character) throw new Error('Personagem não encontrado.');
    const [academyArcana, arcaneLibrary, gameLibrary] = await Promise.all([
      this.academyRepo.export(characterId),
      this.libraryRepo.exportProfile(characterId),
      this.gameLibraryRepo.exportProfile(characterId),
    ]);
    const habitTracker = this.habitTracker.exportForCharacter(characterId);
    return {
      format: 'rpg-character-backup',
      version: 1,
      exportedAt: Date.now(),
      characterId,
      characterName: character.displayName,
      domains: {
        rpgProfile: character,
        academyArcana,
        arcaneLibrary,
        gameLibrary,
        habitTracker,
      },
    };
  }

  async downloadCharacter(characterId: string): Promise<void> {
    const backup = await this.exportCharacter(characterId);
    const slug = backup.characterName
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `personagem-${slug || 'backup'}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  async importCharacter(file: File): Promise<void> {
    const backup = JSON.parse(await file.text()) as RpgCharacterBackup;
    if (backup.format !== 'rpg-character-backup' || backup.version !== 1) {
      throw new Error('Arquivo de backup de personagem inválido ou incompatível.');
    }
    this.profile.importCharacterState(backup.domains.rpgProfile);
    await Promise.all([
      this.academyRepo.import(backup.domains.academyArcana),
      this.libraryRepo.importProfile(backup.domains.arcaneLibrary),
      ...(backup.domains.gameLibrary
        ? [this.gameLibraryRepo.importProfile(backup.domains.gameLibrary)]
        : []),
    ]);
    this.habitTracker.importForCharacter(backup.domains.habitTracker);
  }

  // Once-per-calendar-day local backup of every character's full bundle
  // (same shape as the manual per-character download above), written via
  // Electron to a small rotating ring of files (see RPG_BACKUP_DIR in
  // electron/backup.ts) so a repeat of the startup-race character loss can
  // always be recovered from at most a day's worth of progress, without
  // requiring the user to remember to click "Baixar backup" themselves.
  // Desktop-only: there is no local filesystem to write to on web/mobile.
  async runDailyBackupIfNeeded(): Promise<void> {
    if (!IS_ELECTRON) return;
    const todayKey = this._todayKey();
    if (localStorage.getItem(LS.RPG_AUTO_BACKUP_LAST_DATE) === todayKey) return;
    // Never back up before the real roster has loaded - see the startup-race
    // character-loss incident this feature exists to guard against.
    await this._waitForHydration();
    try {
      await this.backupAllCharactersNow();
      localStorage.setItem(LS.RPG_AUTO_BACKUP_LAST_DATE, todayKey);
    } catch {
      // Leave the flag unset so the next app start retries instead of
      // silently skipping a whole day because of a transient write error.
    }
  }

  private _waitForHydration(): Promise<void> {
    if (this.profile.hydrated()) return Promise.resolve();
    return new Promise((resolve) => {
      const check = (): void => {
        if (this.profile.hydrated()) {
          resolve();
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }

  async backupAllCharactersNow(): Promise<void> {
    const characters = this.profile.characters();
    const backups = await Promise.all(
      characters.map((character) => this.exportCharacter(character.id)),
    );
    await window.ea.rpgBackup({
      fileName: `${getBackupTimestamp()}_rpg-characters.json`,
      data: {
        format: 'rpg-all-characters-backup',
        version: 1,
        exportedAt: Date.now(),
        characters: backups,
      },
      extraDir: this.extraBackupDir() ?? undefined,
    });
  }

  // Path (e.g. a local Google Drive/OneDrive sync folder) the daily backup
  // also writes an independent copy to, so its own desktop sync client
  // uploads it automatically - no Google API integration involved.
  extraBackupDir(): string | null {
    return localStorage.getItem(LS.RPG_AUTO_BACKUP_EXTRA_DIR);
  }

  async chooseExtraBackupDir(): Promise<{ ok: boolean; message: string }> {
    if (!IS_ELECTRON) {
      return { ok: false, message: 'Disponível só na versão desktop.' };
    }
    const picked = await window.ea.rpgBackupPickFolder();
    if (!picked) {
      return { ok: false, message: 'Nenhuma pasta selecionada.' };
    }
    localStorage.setItem(LS.RPG_AUTO_BACKUP_EXTRA_DIR, picked);
    return { ok: true, message: `Backup também será salvo em: ${picked}` };
  }

  clearExtraBackupDir(): void {
    localStorage.removeItem(LS.RPG_AUTO_BACKUP_EXTRA_DIR);
  }

  private _todayKey(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
