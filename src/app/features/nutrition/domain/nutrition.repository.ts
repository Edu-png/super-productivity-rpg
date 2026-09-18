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
} from './nutrition.models';

export abstract class NutritionRepository {
  abstract getSettings(profileId: string): Promise<NutritionSettings>;
  abstract putSettings(settings: NutritionSettings): Promise<void>;

  abstract listMealTemplates(profileId: string): Promise<MealTemplate[]>;
  abstract putMealTemplate(template: MealTemplate): Promise<void>;

  abstract getDayByDate(
    profileId: string,
    date: string,
  ): Promise<NutritionDay | undefined>;
  abstract listDays(profileId: string, from: string, to: string): Promise<NutritionDay[]>;
  abstract putDay(day: NutritionDay): Promise<void>;

  abstract getDayDetail(dayId: string): Promise<NutritionDayDetail | null>;
  abstract listDayDetails(dayIds: string[]): Promise<Record<string, NutritionDayDetail>>;

  abstract putMealLog(log: MealLog): Promise<void>;
  abstract putExtraCalorie(entry: ExtraCalorieEntry): Promise<void>;
  abstract deleteExtraCalorie(id: string): Promise<void>;
  abstract putExerciseLog(entry: ExerciseLogEntry): Promise<void>;
  abstract deleteExerciseLog(id: string): Promise<void>;
  abstract putWaterLog(entry: WaterLogEntry): Promise<void>;
  abstract deleteWaterLog(id: string): Promise<void>;

  abstract export(profileId: string): Promise<NutritionBackup>;
  abstract import(backup: NutritionBackup): Promise<void>;
}
