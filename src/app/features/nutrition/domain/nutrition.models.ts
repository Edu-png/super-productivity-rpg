export interface SyncMetadata {
  createdAt: number;
  updatedAt: number;
  revision: number;
  deletedAt: number | null;
}

export interface NutritionDayType {
  id: string;
  label: string;
  calorieGoal: number;
}

export interface NutritionSettings {
  id: string;
  profileId: string;
  waterGoalMl: number;
  weightUnit: 'kg' | 'lb';
  /** First entry is the fallback ("Padrão") day type. */
  dayTypes: NutritionDayType[];
  /** Weekday (0=domingo..6=sábado, matches Date.getDay()) -> dayType id. */
  weeklySchedule: Record<number, string>;
  updatedAt: number;
}

export interface MealTemplate {
  id: string;
  profileId: string;
  name: string;
  description: string;
  defaultCalories: number;
  defaultTime: string | null;
  foods: string[];
  position: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type FoodRating = 'great' | 'good' | 'okay' | 'bad';

export interface NutritionDay {
  id: string;
  profileId: string;
  /** Y-MM-DD, local date. */
  date: string;
  dayType: string;
  calorieGoal: number;
  waterGoalMl: number;
  weightKg: number | null;
  foodRating: FoodRating | null;
  notes: string;
  completedAt: number | null;
  // Denormalized totals, kept in sync by the service on every mutation to
  // the day's logs - lets history/progress charts read straight off
  // NutritionDay without fetching every day's full log detail.
  totalCaloriesConsumed: number;
  waterConsumedMl: number;
  exerciseCaloriesBurned: number;
  mealsCompletedCount: number;
  mealsPlannedCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface MealLog {
  id: string;
  nutritionDayId: string;
  mealTemplateId: string | null;
  /** Snapshot of the template at day-creation time - stays stable even if the
   * template is later renamed/edited/deactivated, per spec §23. */
  name: string;
  foods: string[];
  time: string | null;
  position: number;
  calories: number;
  completed: boolean;
  completedAt: number | null;
  editedFromTemplate: boolean;
}

export interface ExtraCalorieEntry {
  id: string;
  nutritionDayId: string;
  description: string;
  calories: number;
  time: number;
}

export type ExerciseType = 'run' | 'gym' | 'other';

export interface ExerciseLogEntry {
  id: string;
  nutritionDayId: string;
  type: ExerciseType;
  description: string;
  caloriesBurned: number;
  durationMinutes: number | null;
  time: number;
}

export interface WaterLogEntry {
  id: string;
  nutritionDayId: string;
  amountMl: number;
  createdAt: number;
}

export interface NutritionDayDetail {
  day: NutritionDay;
  meals: MealLog[];
  extras: ExtraCalorieEntry[];
  exercises: ExerciseLogEntry[];
  waterLogs: WaterLogEntry[];
}

export interface NutritionBackup {
  format: 'nutrition-vitality';
  version: 1;
  exportedAt: number;
  domains: Partial<{
    settings: NutritionSettings[];
    mealTemplates: MealTemplate[];
    days: NutritionDay[];
    mealLogs: MealLog[];
    extras: ExtraCalorieEntry[];
    exercises: ExerciseLogEntry[];
    waterLogs: WaterLogEntry[];
  }>;
}
