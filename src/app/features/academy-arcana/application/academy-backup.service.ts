import { Injectable } from '@angular/core';
import { AcademyBackup } from '../domain/academy.models';
import { AcademyRepository } from '../domain/academy.repository';

@Injectable()
export class AcademyBackupService {
  constructor(private readonly repository: AcademyRepository) {}

  async download(profileId: string, domains: string[] = []): Promise<void> {
    const backup = await this.repository.export(profileId, domains);
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `academia-arcana-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  async restore(file: File): Promise<void> {
    const backup = JSON.parse(await file.text()) as AcademyBackup;
    await this.repository.import(backup);
  }
}
