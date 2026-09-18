import { computed, inject, Injectable, signal } from '@angular/core';
import { CloudDomainSyncService } from '../../../core/persistence/cloud-domain-sync.service';
import {
  ExerciseLogEntry,
  ExerciseType,
  ExtraCalorieEntry,
  FoodRating,
  MealLog,
  MealTemplate,
  NutritionDay,
  NutritionDayDetail,
  NutritionDayType,
  NutritionSettings,
  WaterLogEntry,
} from '../domain/nutrition.models';
import { NutritionRepository } from '../domain/nutrition.repository';
import { RpgProfileService } from '../../rpg-profile/rpg-profile.service';

const DAY_MS = 86_400_000;

const DEFAULT_DAY_TYPES: NutritionDayType[] = [
  { id: 'standard', label: 'Dia padrão', calorieGoal: 3500 },
  { id: 'run', label: 'Dia de corrida', calorieGoal: 3600 },
  { id: 'intense', label: 'Treino intenso', calorieGoal: 3700 },
  { id: 'longrun', label: 'Longão', calorieGoal: 3700 },
  { id: 'rest', label: 'Descanso', calorieGoal: 3400 },
];

// Weekday keys match Date.getDay() (0 = domingo). Just a sensible starting
// point - fully editable in Configurações afterwards.
const DEFAULT_WEEKLY_SCHEDULE: Record<number, string> = {
  0: 'longrun',
  1: 'standard',
  2: 'intense',
  3: 'standard',
  4: 'run',
  5: 'standard',
  6: 'standard',
};

const DEFAULT_MEAL_SEEDS: Array<{
  name: string;
  description: string;
  defaultCalories: number;
  defaultTime: string;
  foods: string[];
}> = [
  {
    name: 'Café da manhã',
    description: '',
    defaultCalories: 605,
    defaultTime: '07:00',
    foods: [
      '2 pães franceses (~100 g)',
      '30 g de doce de leite',
      '1 banana média (~100 g)',
      '250 ml de leite integral',
    ],
  },
  {
    name: 'Lanche da manhã',
    description: 'Varie a fruta: maçã, banana, uva, mamão, morango, kiwi etc.',
    defaultCalories: 555,
    defaultTime: '10:00',
    foods: [
      '2 fatias de pão de forma (~60 g)',
      '80 g de frango desfiado',
      '40 g de patê de atum',
      '1 fatia de queijo (~25 g)',
      '1 fatia de presunto (~20 g)',
      'Alface a gosto',
      '1 porção de fruta (~70-90 kcal)',
    ],
  },
  {
    name: 'Almoço',
    description:
      'Pode trocar ~200 g de arroz + parte da batata por 250-300 g de macarrão, 300-350 g de batata-doce ou 350-400 g de batata inglesa. No dia anterior ao longão, prefira arroz ou macarrão.',
    defaultCalories: 890,
    defaultTime: '12:30',
    foods: [
      '200 g de arroz cozido',
      '150 g de feijão cozido',
      '150 g de frango',
      '120 g de purê/batata',
      '80 g de salada crua',
      '100 g de legumes cozidos',
      '10 g de azeite',
    ],
  },
  {
    name: 'Café da tarde',
    description:
      'Se ficar muito volumoso, use 80 g de frango em vez de 100 g. Ótima opção em dias de corrida (tapioca + fruta).',
    defaultCalories: 675,
    defaultTime: '16:00',
    foods: [
      '60 g de goma de tapioca',
      '2 ovos',
      '100 g de frango desfiado',
      '25 g de queijo',
      '1 porção de banana ou outra fruta (~90 kcal)',
    ],
  },
  {
    name: 'Jantar / Ceia',
    description: 'Trocar o morango por 100 g de uva sobe para ~825 kcal.',
    defaultCalories: 785,
    defaultTime: '20:00',
    foods: [
      '250 g de iogurte natural integral',
      '40 g de cereal zero açúcar',
      '30 g de aveia',
      '15 g de chia',
      '15 g de semente de girassol',
      '30 g de granola',
      '1 kiwi (~70 g)',
      '100 g de morango',
    ],
  },
];

@Injectable()
export class NutritionService {
  private readonly repository = inject(NutritionRepository);
  private readonly cloud = inject(CloudDomainSyncService);
  private readonly rpg = inject(RpgProfileService);
  private cloudSaveTimer?: ReturnType<typeof setTimeout>;

  private readonly profileId = signal('');
  readonly settings = signal<NutritionSettings>({
    id: '',
    profileId: '',
    waterGoalMl: 3000,
    weightUnit: 'kg',
    dayTypes: DEFAULT_DAY_TYPES,
    weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
    updatedAt: 0,
  });
  readonly mealTemplates = signal<MealTemplate[]>([]);
  readonly todayDetail = signal<NutritionDayDetail | null>(null);
  // Which day the "Hoje" tab's quick-log actions currently target - defaults
  // to today, but can be pointed at a past day to backdate a log without
  // losing the tab's own dashboard (everything reads todayDetail, so backdating
  // just means todayDetail temporarily holds a non-today day's detail).
  readonly logDate = signal(this._todayKey());
  readonly today = this._todayKey();
  readonly recentDays = signal<NutritionDay[]>([]);
  readonly loading = signal(false);

  // ---- Derived values for "Hoje" (spec §22) ----
  readonly plannedCalories = computed(() =>
    (this.todayDetail()?.meals ?? []).reduce((sum, meal) => sum + meal.calories, 0),
  );
  readonly mealCaloriesConsumed = computed(() =>
    (this.todayDetail()?.meals ?? [])
      .filter((meal) => meal.completed)
      .reduce((sum, meal) => sum + meal.calories, 0),
  );
  readonly extraCaloriesConsumed = computed(() =>
    (this.todayDetail()?.extras ?? []).reduce((sum, entry) => sum + entry.calories, 0),
  );
  readonly totalCaloriesConsumed = computed(
    () => this.mealCaloriesConsumed() + this.extraCaloriesConsumed(),
  );
  readonly exerciseCalories = computed(() =>
    (this.todayDetail()?.exercises ?? []).reduce(
      (sum, entry) => sum + entry.caloriesBurned,
      0,
    ),
  );
  readonly remainingCalories = computed(
    () => (this.todayDetail()?.day.calorieGoal ?? 0) - this.totalCaloriesConsumed(),
  );
  readonly waterConsumed = computed(() =>
    (this.todayDetail()?.waterLogs ?? []).reduce((sum, entry) => sum + entry.amountMl, 0),
  );
  readonly mealAdherence = computed(() => {
    const meals = this.todayDetail()?.meals ?? [];
    if (!meals.length) return 0;
    return meals.filter((meal) => meal.completed).length / meals.length;
  });
  readonly energyBalance = computed(
    () => (this.todayDetail()?.day.calorieGoal ?? 0) - this.exerciseCalories(),
  );
  readonly weeklyAverageWeight = computed(() =>
    this._averageWeight(this.recentDays(), 7),
  );

  readonly nutritionStreak = computed(() => {
    const byDate = new Map(this.recentDays().map((day) => [day.date, day]));
    let streak = 0;
    const cursor = new Date();
    for (let i = 0; i < 400; i++) {
      const key = this._dateKey(cursor);
      const day = byDate.get(key);
      const hasActivity =
        !!day &&
        (day.mealsCompletedCount > 0 || day.waterConsumedMl > 0 || day.weightKg != null);
      if (!hasActivity) {
        if (i === 0) {
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        break;
      }
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  });

  async load(profileId: string): Promise<void> {
    this.loading.set(true);
    this.profileId.set(profileId);

    let settings = await this.repository.getSettings(profileId);
    if (!settings.dayTypes.length) {
      settings = {
        ...settings,
        dayTypes: DEFAULT_DAY_TYPES,
        weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
        updatedAt: Date.now(),
      };
      await this.repository.putSettings(settings);
    }
    this.settings.set(settings);

    let templates = await this.repository.listMealTemplates(profileId);
    if (!templates.length) {
      templates = await this._seedDefaultMealTemplates(profileId);
    }
    this.mealTemplates.set(templates);

    this.logDate.set(this._todayKey());
    const detail = await this._ensureTodayExists();
    this.todayDetail.set(detail);

    const from = this._dateKeyDaysAgo(370);
    const days = await this.repository.listDays(profileId, from, this._todayKey());
    this.recentDays.set([...days].sort((a, b) => a.date.localeCompare(b.date)));

    this.loading.set(false);
  }

  // Points the "Hoje" tab (todayDetail + its quick-log actions) at a
  // different day, creating it (with the current active meal plan and that
  // day's own weekday schedule) if it doesn't exist yet - lets a log be
  // backdated instead of only ever applying to the real current day.
  async selectLogDate(date: string): Promise<void> {
    this.logDate.set(date);
    const detail = await this._ensureDayExists(date);
    this.todayDetail.set(detail);
  }

  async loadDayDetail(dayId: string): Promise<NutritionDayDetail | null> {
    if (this.todayDetail()?.day.id === dayId) return this.todayDetail();
    return this.repository.getDayDetail(dayId);
  }

  async loadDetailsForDays(
    dayIds: string[],
  ): Promise<Record<string, NutritionDayDetail>> {
    return this.repository.listDayDetails(dayIds);
  }

  // ---- Meals ----

  async toggleMeal(dayId: string, mealLogId: string): Promise<void> {
    const detail = await this._loadDetail(dayId);
    if (!detail) return;
    const target = detail.meals.find((meal) => meal.id === mealLogId);
    if (!target) return;
    const now = Date.now();
    const updatedLog: MealLog = {
      ...target,
      completed: !target.completed,
      completedAt: !target.completed ? now : null,
    };
    await this.repository.putMealLog(updatedLog);
    const meals = detail.meals.map((meal) => (meal.id === mealLogId ? updatedLog : meal));
    await this._persistDetail({ ...detail, meals });
    this.queueCloudSave();
  }

  async editMealToday(dayId: string, mealLogId: string, calories: number): Promise<void> {
    const detail = await this._loadDetail(dayId);
    if (!detail) return;
    const target = detail.meals.find((meal) => meal.id === mealLogId);
    if (!target) return;
    const updatedLog: MealLog = {
      ...target,
      calories: Math.max(0, Math.round(calories)),
      editedFromTemplate: true,
    };
    await this.repository.putMealLog(updatedLog);
    const meals = detail.meals.map((meal) => (meal.id === mealLogId ? updatedLog : meal));
    await this._persistDetail({ ...detail, meals });
    this.queueCloudSave();
  }

  // ---- Extras / exercise / water ----

  async addExtraCalorie(
    dayId: string,
    description: string,
    calories: number,
    time = Date.now(),
  ): Promise<void> {
    if (!description.trim() || calories <= 0) return;
    const detail = await this._loadDetail(dayId);
    if (!detail) return;
    const entry: ExtraCalorieEntry = {
      id: crypto.randomUUID(),
      nutritionDayId: dayId,
      description: description.trim(),
      calories: Math.round(calories),
      time,
    };
    await this.repository.putExtraCalorie(entry);
    await this._persistDetail({ ...detail, extras: [...detail.extras, entry] });
    this.queueCloudSave();
  }

  async removeExtraCalorie(dayId: string, id: string): Promise<void> {
    const detail = await this._loadDetail(dayId);
    if (!detail) return;
    await this.repository.deleteExtraCalorie(id);
    await this._persistDetail({
      ...detail,
      extras: detail.extras.filter((entry) => entry.id !== id),
    });
    this.queueCloudSave();
  }

  async addExerciseLog(
    dayId: string,
    type: ExerciseType,
    description: string,
    caloriesBurned: number,
    durationMinutes: number | null,
    time = Date.now(),
  ): Promise<void> {
    if (caloriesBurned <= 0) return;
    const detail = await this._loadDetail(dayId);
    if (!detail) return;
    const entry: ExerciseLogEntry = {
      id: crypto.randomUUID(),
      nutritionDayId: dayId,
      type,
      description: description.trim(),
      caloriesBurned: Math.round(caloriesBurned),
      durationMinutes:
        durationMinutes && durationMinutes > 0 ? Math.round(durationMinutes) : null,
      time,
    };
    await this.repository.putExerciseLog(entry);
    await this._persistDetail({ ...detail, exercises: [...detail.exercises, entry] });
    this.queueCloudSave();
  }

  async removeExerciseLog(dayId: string, id: string): Promise<void> {
    const detail = await this._loadDetail(dayId);
    if (!detail) return;
    await this.repository.deleteExerciseLog(id);
    await this._persistDetail({
      ...detail,
      exercises: detail.exercises.filter((entry) => entry.id !== id),
    });
    this.queueCloudSave();
  }

  async addWater(dayId: string, amountMl: number): Promise<void> {
    if (!amountMl) return;
    const detail = await this._loadDetail(dayId);
    if (!detail) return;
    const entry: WaterLogEntry = {
      id: crypto.randomUUID(),
      nutritionDayId: dayId,
      amountMl: Math.round(amountMl),
      createdAt: Date.now(),
    };
    await this.repository.putWaterLog(entry);
    await this._persistDetail({ ...detail, waterLogs: [...detail.waterLogs, entry] });
    this.queueCloudSave();
  }

  async undoLastWater(dayId: string): Promise<void> {
    const detail = await this._loadDetail(dayId);
    if (!detail || !detail.waterLogs.length) return;
    const last = [...detail.waterLogs].sort((a, b) => b.createdAt - a.createdAt)[0];
    await this.repository.deleteWaterLog(last.id);
    await this._persistDetail({
      ...detail,
      waterLogs: detail.waterLogs.filter((entry) => entry.id !== last.id),
    });
    this.queueCloudSave();
  }

  // ---- Day-level fields ----

  async setWeight(dayId: string, kg: number): Promise<void> {
    const detail = await this._loadDetail(dayId);
    if (!detail) return;
    const day = { ...detail.day, weightKg: kg > 0 ? kg : null };
    await this._persistDetail({ ...detail, day });
    this.queueCloudSave();
  }

  async setDayType(dayId: string, dayTypeId: string): Promise<void> {
    const detail = await this._loadDetail(dayId);
    if (!detail) return;
    const dayType =
      this.settings().dayTypes.find((item) => item.id === dayTypeId) ??
      this.settings().dayTypes[0];
    if (!dayType) return;
    const day = { ...detail.day, dayType: dayType.id, calorieGoal: dayType.calorieGoal };
    await this._persistDetail({ ...detail, day });
    this.queueCloudSave();
  }

  async setFoodRating(
    dayId: string,
    rating: FoodRating | null,
    notes: string,
  ): Promise<void> {
    const detail = await this._loadDetail(dayId);
    if (!detail) return;
    const day = { ...detail.day, foodRating: rating, notes };
    await this._persistDetail({ ...detail, day });
    this.queueCloudSave();
  }

  async completeDay(dayId: string): Promise<boolean> {
    const detail = await this._loadDetail(dayId);
    if (!detail || detail.day.completedAt) return false;
    const day = { ...detail.day, completedAt: Date.now() };
    await this._persistDetail({ ...detail, day });
    this.rpg.grantExternalReward(
      `nutrition-complete:${dayId}`,
      5,
      0,
      'nutrition',
      this.profileId(),
    );
    this.queueCloudSave();
    return true;
  }

  // ---- Meal templates (dieta base) ----

  async addMealTemplate(
    name: string,
    calories: number,
    time: string | null,
    foods: string[],
  ): Promise<void> {
    if (!name.trim()) return;
    const now = Date.now();
    const template: MealTemplate = {
      id: crypto.randomUUID(),
      profileId: this.profileId(),
      name: name.trim(),
      description: '',
      defaultCalories: Math.max(0, Math.round(calories)),
      defaultTime: time,
      foods,
      position: this.mealTemplates().length,
      active: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.repository.putMealTemplate(template);
    this.mealTemplates.update((rows) => [...rows, template]);
    this.queueCloudSave();
  }

  async updateMealTemplate(
    id: string,
    changes: Partial<
      Pick<
        MealTemplate,
        'name' | 'description' | 'defaultCalories' | 'defaultTime' | 'foods' | 'active'
      >
    >,
  ): Promise<void> {
    const current = this.mealTemplates().find((item) => item.id === id);
    if (!current) return;
    const updated = { ...current, ...changes, updatedAt: Date.now() };
    await this.repository.putMealTemplate(updated);
    this.mealTemplates.update((rows) =>
      rows.map((item) => (item.id === id ? updated : item)),
    );
    this.queueCloudSave();
  }

  async removeMealTemplate(id: string): Promise<void> {
    const current = this.mealTemplates().find((item) => item.id === id);
    if (!current) return;
    const updated = {
      ...current,
      deletedAt: Date.now(),
      active: false,
      updatedAt: Date.now(),
    };
    await this.repository.putMealTemplate(updated);
    this.mealTemplates.update((rows) => rows.filter((item) => item.id !== id));
    this.queueCloudSave();
  }

  // ---- Settings ----

  async updateSettings(
    changes: Partial<
      Pick<
        NutritionSettings,
        'waterGoalMl' | 'weightUnit' | 'dayTypes' | 'weeklySchedule'
      >
    >,
  ): Promise<void> {
    const updated = { ...this.settings(), ...changes, updatedAt: Date.now() };
    await this.repository.putSettings(updated);
    this.settings.set(updated);
    this.queueCloudSave();
  }

  // ---- Internals ----

  private async _ensureTodayExists(): Promise<NutritionDayDetail> {
    return this._ensureDayExists(this._todayKey());
  }

  private async _ensureDayExists(dateKey: string): Promise<NutritionDayDetail> {
    const profileId = this.profileId();
    const existing = await this.repository.getDayByDate(profileId, dateKey);
    if (existing) {
      const detail = await this.repository.getDayDetail(existing.id);
      if (detail) return detail;
    }
    const [year, month, dayOfMonth] = dateKey.split('-').map(Number);
    const weekday = new Date(year, month - 1, dayOfMonth).getDay();
    const dayTypeId =
      this.settings().weeklySchedule[weekday] ??
      this.settings().dayTypes[0]?.id ??
      'standard';
    const dayType =
      this.settings().dayTypes.find((item) => item.id === dayTypeId) ??
      this.settings().dayTypes[0];
    const now = Date.now();
    const activeMeals = this.mealTemplates().filter((template) => template.active);
    const day: NutritionDay = {
      id: crypto.randomUUID(),
      profileId,
      date: dateKey,
      dayType: dayType?.id ?? 'standard',
      calorieGoal: dayType?.calorieGoal ?? 3500,
      waterGoalMl: this.settings().waterGoalMl,
      weightKg: null,
      foodRating: null,
      notes: '',
      completedAt: null,
      totalCaloriesConsumed: 0,
      waterConsumedMl: 0,
      exerciseCaloriesBurned: 0,
      mealsCompletedCount: 0,
      mealsPlannedCount: activeMeals.length,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.putDay(day);
    const meals: MealLog[] = activeMeals.map((template, index) => ({
      id: crypto.randomUUID(),
      nutritionDayId: day.id,
      mealTemplateId: template.id,
      name: template.name,
      foods: [...template.foods],
      time: template.defaultTime,
      position: index,
      calories: template.defaultCalories,
      completed: false,
      completedAt: null,
      editedFromTemplate: false,
    }));
    await Promise.all(meals.map((meal) => this.repository.putMealLog(meal)));
    this.recentDays.update((rows) => [...rows, day]);
    return { day, meals, extras: [], exercises: [], waterLogs: [] };
  }

  private async _seedDefaultMealTemplates(profileId: string): Promise<MealTemplate[]> {
    const now = Date.now();
    const templates: MealTemplate[] = DEFAULT_MEAL_SEEDS.map((seed, index) => ({
      id: crypto.randomUUID(),
      profileId,
      name: seed.name,
      description: seed.description,
      defaultCalories: seed.defaultCalories,
      defaultTime: seed.defaultTime,
      foods: seed.foods,
      position: index,
      active: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));
    await Promise.all(
      templates.map((template) => this.repository.putMealTemplate(template)),
    );
    return templates;
  }

  private async _loadDetail(dayId: string): Promise<NutritionDayDetail | null> {
    const current = this.todayDetail();
    if (current?.day.id === dayId) return current;
    return this.repository.getDayDetail(dayId);
  }

  private async _persistDetail(detail: NutritionDayDetail): Promise<NutritionDayDetail> {
    const totalCaloriesConsumed =
      detail.meals
        .filter((meal) => meal.completed)
        .reduce((sum, meal) => sum + meal.calories, 0) +
      detail.extras.reduce((sum, entry) => sum + entry.calories, 0);
    const waterConsumedMl = detail.waterLogs.reduce(
      (sum, entry) => sum + entry.amountMl,
      0,
    );
    const exerciseCaloriesBurned = detail.exercises.reduce(
      (sum, entry) => sum + entry.caloriesBurned,
      0,
    );
    const mealsCompletedCount = detail.meals.filter((meal) => meal.completed).length;
    const mealsPlannedCount = detail.meals.length;
    const day: NutritionDay = {
      ...detail.day,
      totalCaloriesConsumed,
      waterConsumedMl,
      exerciseCaloriesBurned,
      mealsCompletedCount,
      mealsPlannedCount,
      updatedAt: Date.now(),
    };
    await this.repository.putDay(day);
    const updated: NutritionDayDetail = { ...detail, day };

    if (this.todayDetail()?.day.id === day.id) this.todayDetail.set(updated);
    this.recentDays.update((rows) =>
      rows.some((row) => row.id === day.id)
        ? rows.map((row) => (row.id === day.id ? day : row))
        : [...rows, day],
    );

    this._syncConsistencyRewards(day);
    return updated;
  }

  /**
   * Consistency-only XP (spec §13): rewards for registering, never for eating
   * less / skipping meals / losing weight. Grant and revoke are both
   * idempotent per sourceId (see RpgProfileService), so it's safe to call
   * this after every mutation and let it settle to the right state -
   * un-checking a meal that broke a completed set correctly gives the bonus
   * back up for grabs without any extra bookkeeping here.
   */
  private _syncConsistencyRewards(day: NutritionDay): void {
    const characterId = this.profileId();
    const allMealsDone =
      day.mealsPlannedCount > 0 && day.mealsCompletedCount === day.mealsPlannedCount;
    const mealsSourceId = `nutrition-meals:${day.id}`;
    if (allMealsDone)
      this.rpg.grantExternalReward(mealsSourceId, 5, 0, 'nutrition', characterId);
    else this.rpg.revokeExternalReward(mealsSourceId, 5, 0, characterId);

    const hydrationReached =
      day.waterGoalMl > 0 && day.waterConsumedMl >= day.waterGoalMl;
    const waterSourceId = `nutrition-water:${day.id}`;
    if (hydrationReached)
      this.rpg.grantExternalReward(waterSourceId, 3, 0, 'nutrition', characterId);
    else this.rpg.revokeExternalReward(waterSourceId, 3, 0, characterId);

    const weightSourceId = `nutrition-weight:${day.id}`;
    if (day.weightKg != null)
      this.rpg.grantExternalReward(weightSourceId, 1, 0, 'nutrition', characterId);
    else this.rpg.revokeExternalReward(weightSourceId, 1, 0, characterId);

    if (day.date === this._todayKey()) {
      const streak = this.nutritionStreak();
      if (streak > 0 && streak % 7 === 0) {
        this.rpg.grantExternalReward(
          `nutrition-streak:${day.id}-${streak}`,
          10,
          0,
          'nutrition',
          characterId,
        );
      }
    }
  }

  private _averageWeight(days: NutritionDay[], lastN: number): number | null {
    const withWeight = [...days]
      .filter((day) => day.weightKg != null)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, lastN);
    if (!withWeight.length) return null;
    return (
      withWeight.reduce((sum, day) => sum + (day.weightKg ?? 0), 0) / withWeight.length
    );
  }

  private _dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;
  }

  private _todayKey(): string {
    return this._dateKey(new Date());
  }

  private _dateKeyDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return this._dateKey(date);
  }

  private queueCloudSave(): void {
    clearTimeout(this.cloudSaveTimer);
    this.cloudSaveTimer = setTimeout(async () => {
      const profileId = this.profileId();
      if (!profileId) return;
      await this.cloud.save(
        'nutrition',
        profileId,
        await this.repository.export(profileId),
      );
    }, 800);
  }
}
