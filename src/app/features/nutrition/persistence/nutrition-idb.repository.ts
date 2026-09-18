import { Injectable } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import {
  ExerciseLogEntry,
  ExtraCalorieEntry,
  MealLog,
  MealTemplate,
  NutritionBackup,
  NutritionDay,
  NutritionDayDetail,
  NutritionSettings,
  WaterLogEntry,
} from '../domain/nutrition.models';
import { NutritionRepository } from '../domain/nutrition.repository';

interface NutritionDbSchema extends DBSchema {
  settings: { key: string; value: NutritionSettings };
  mealTemplates: {
    key: string;
    value: MealTemplate;
    indexes: { 'by-profile': string };
  };
  days: {
    key: string;
    value: NutritionDay;
    indexes: { 'by-profile-date': [string, string] };
  };
  mealLogs: { key: string; value: MealLog; indexes: { 'by-day': string } };
  extras: { key: string; value: ExtraCalorieEntry; indexes: { 'by-day': string } };
  exercises: { key: string; value: ExerciseLogEntry; indexes: { 'by-day': string } };
  waterLogs: { key: string; value: WaterLogEntry; indexes: { 'by-day': string } };
}

const DB_NAME = 'super-productivity-nutrition';
const DB_VERSION = 1;

@Injectable({ providedIn: 'root' })
export class NutritionIdbRepository extends NutritionRepository {
  private readonly db: Promise<IDBPDatabase<NutritionDbSchema>> =
    openDB<NutritionDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        database.createObjectStore('settings', { keyPath: 'id' });

        const templates = database.createObjectStore('mealTemplates', { keyPath: 'id' });
        templates.createIndex('by-profile', 'profileId');

        const days = database.createObjectStore('days', { keyPath: 'id' });
        days.createIndex('by-profile-date', ['profileId', 'date']);

        const mealLogs = database.createObjectStore('mealLogs', { keyPath: 'id' });
        mealLogs.createIndex('by-day', 'nutritionDayId');

        const extras = database.createObjectStore('extras', { keyPath: 'id' });
        extras.createIndex('by-day', 'nutritionDayId');

        const exercises = database.createObjectStore('exercises', { keyPath: 'id' });
        exercises.createIndex('by-day', 'nutritionDayId');

        const waterLogs = database.createObjectStore('waterLogs', { keyPath: 'id' });
        waterLogs.createIndex('by-day', 'nutritionDayId');
      },
    });

  async getSettings(profileId: string): Promise<NutritionSettings> {
    const id = `settings:${profileId}`;
    return (
      (await (await this.db).get('settings', id)) ?? {
        id,
        profileId,
        waterGoalMl: 3000,
        weightUnit: 'kg',
        dayTypes: [],
        weeklySchedule: {},
        updatedAt: Date.now(),
      }
    );
  }

  async putSettings(settings: NutritionSettings): Promise<void> {
    await (await this.db).put('settings', settings);
  }

  async listMealTemplates(profileId: string): Promise<MealTemplate[]> {
    const all = await (
      await this.db
    ).getAllFromIndex('mealTemplates', 'by-profile', IDBKeyRange.only(profileId));
    return all.filter((item) => !item.deletedAt).sort((a, b) => a.position - b.position);
  }

  async putMealTemplate(template: MealTemplate): Promise<void> {
    await (await this.db).put('mealTemplates', template);
  }

  async getDayByDate(profileId: string, date: string): Promise<NutritionDay | undefined> {
    const rows = await (
      await this.db
    ).getAllFromIndex('days', 'by-profile-date', IDBKeyRange.only([profileId, date]));
    return rows[0];
  }

  async listDays(profileId: string, from: string, to: string): Promise<NutritionDay[]> {
    return (await this.db).getAllFromIndex(
      'days',
      'by-profile-date',
      IDBKeyRange.bound([profileId, from], [profileId, to]),
    );
  }

  async putDay(day: NutritionDay): Promise<void> {
    await (await this.db).put('days', day);
  }

  async getDayDetail(dayId: string): Promise<NutritionDayDetail | null> {
    const db = await this.db;
    const day = await db.get('days', dayId);
    if (!day) return null;
    const [meals, extras, exercises, waterLogs] = await Promise.all([
      db.getAllFromIndex('mealLogs', 'by-day', IDBKeyRange.only(dayId)),
      db.getAllFromIndex('extras', 'by-day', IDBKeyRange.only(dayId)),
      db.getAllFromIndex('exercises', 'by-day', IDBKeyRange.only(dayId)),
      db.getAllFromIndex('waterLogs', 'by-day', IDBKeyRange.only(dayId)),
    ]);
    meals.sort((a, b) => a.position - b.position);
    return { day, meals, extras, exercises, waterLogs };
  }

  async listDayDetails(dayIds: string[]): Promise<Record<string, NutritionDayDetail>> {
    const result: Record<string, NutritionDayDetail> = {};
    await Promise.all(
      dayIds.map(async (id) => {
        const detail = await this.getDayDetail(id);
        if (detail) result[id] = detail;
      }),
    );
    return result;
  }

  async putMealLog(log: MealLog): Promise<void> {
    await (await this.db).put('mealLogs', log);
  }

  async putExtraCalorie(entry: ExtraCalorieEntry): Promise<void> {
    await (await this.db).put('extras', entry);
  }

  async deleteExtraCalorie(id: string): Promise<void> {
    await (await this.db).delete('extras', id);
  }

  async putExerciseLog(entry: ExerciseLogEntry): Promise<void> {
    await (await this.db).put('exercises', entry);
  }

  async deleteExerciseLog(id: string): Promise<void> {
    await (await this.db).delete('exercises', id);
  }

  async putWaterLog(entry: WaterLogEntry): Promise<void> {
    await (await this.db).put('waterLogs', entry);
  }

  async deleteWaterLog(id: string): Promise<void> {
    await (await this.db).delete('waterLogs', id);
  }

  async export(profileId: string): Promise<NutritionBackup> {
    const db = await this.db;
    const days = await this.listDays(profileId, '0000-00-00', '9999-99-99');
    const dayIds = days.map((day) => day.id);
    const [settings, mealTemplates] = await Promise.all([
      this.getSettings(profileId),
      this.listMealTemplates(profileId),
    ]);
    const allMealLogs = await db.getAll('mealLogs');
    const allExtras = await db.getAll('extras');
    const allExercises = await db.getAll('exercises');
    const allWaterLogs = await db.getAll('waterLogs');
    const dayIdSet = new Set(dayIds);
    return {
      format: 'nutrition-vitality',
      version: 1,
      exportedAt: Date.now(),
      domains: {
        settings: [settings],
        mealTemplates,
        days,
        mealLogs: allMealLogs.filter((item) => dayIdSet.has(item.nutritionDayId)),
        extras: allExtras.filter((item) => dayIdSet.has(item.nutritionDayId)),
        exercises: allExercises.filter((item) => dayIdSet.has(item.nutritionDayId)),
        waterLogs: allWaterLogs.filter((item) => dayIdSet.has(item.nutritionDayId)),
      },
    };
  }

  async import(backup: NutritionBackup): Promise<void> {
    if (backup.format !== 'nutrition-vitality' || backup.version !== 1) {
      throw new Error('Backup de Alimentação incompatível.');
    }
    const db = await this.db;
    await Promise.all([
      ...(backup.domains.settings ?? []).map((item) => db.put('settings', item)),
      ...(backup.domains.mealTemplates ?? []).map((item) =>
        db.put('mealTemplates', item),
      ),
      ...(backup.domains.days ?? []).map((item) => db.put('days', item)),
      ...(backup.domains.mealLogs ?? []).map((item) => db.put('mealLogs', item)),
      ...(backup.domains.extras ?? []).map((item) => db.put('extras', item)),
      ...(backup.domains.exercises ?? []).map((item) => db.put('exercises', item)),
      ...(backup.domains.waterLogs ?? []).map((item) => db.put('waterLogs', item)),
    ]);
  }
}
