import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { DatePipe, DecimalPipe } from '@angular/common';
import { NutritionService } from '../application/nutrition.service';
import { NutritionRepository } from '../domain/nutrition.repository';
import { NutritionIdbRepository } from '../persistence/nutrition-idb.repository';
import {
  ExerciseType,
  FoodRating,
  MealTemplate,
  NutritionDayDetail,
  NutritionDayType,
} from '../domain/nutrition.models';
import { RpgProfileService } from '../../rpg-profile/rpg-profile.service';
import { CharacterRendererComponent } from '../../rpg-profile/character-renderer.component';
import { confirmDialog } from '../../../util/native-dialogs';

interface HistoryCell {
  key: string;
  day: number;
  currentMonth: boolean;
  today: boolean;
  status: 'complete' | 'partial' | 'none';
}

interface ProgressPoint {
  date: string;
  label: string;
  value: number;
}

const MEAL_ICONS = ['wb_sunny', 'cookie', 'lunch_dining', 'local_cafe', 'nights_stay'];
const MEAL_COLORS = ['#e0ab3c', '#7ecb9e', '#4fb3d9', '#c98fe0', '#e0864f', '#8fa6e0'];
const EXTRA_COLOR = '#8a8fa3';

@Component({
  selector: 'nutrition-page',
  standalone: true,
  imports: [FormsModule, MatIcon, DatePipe, DecimalPipe, CharacterRendererComponent],
  templateUrl: './nutrition-page.component.html',
  styleUrl: './nutrition-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    NutritionService,
    { provide: NutritionRepository, useClass: NutritionIdbRepository },
  ],
})
export class NutritionPageComponent implements OnInit {
  readonly nutrition = inject(NutritionService);
  readonly profile = inject(RpgProfileService);

  readonly selectedCharacterId = signal(this.profile.activeCharacterId());
  readonly tab = signal<'today' | 'history' | 'progress' | 'settings'>('today');
  readonly todayLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  // ---- Hoje: extras / exercise modals ----
  readonly extraModalOpen = signal(false);
  extraDescription = '';
  extraCalories = 0;

  readonly exerciseModalOpen = signal(false);
  exerciseType: ExerciseType = 'run';
  exerciseDescription = '';
  exerciseCalories = 0;
  exerciseDuration: number | null = null;

  customWaterMl = 250;
  weightInput = 0;
  ratingNotes = '';

  readonly editingMealId = signal<string | null>(null);
  editMealCalories = 0;

  // ---- Histórico ----
  readonly historyMonth = signal(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  readonly historyDetailDayId = signal<string | null>(null);
  readonly historyDetail = signal<NutritionDayDetail | null>(null);
  historyWeightInput = 0;

  // ---- Progresso ----
  readonly progressRangeDays = signal<number | 'all'>(30);
  readonly rangeDayDetails = signal<Record<string, NutritionDayDetail>>({});

  // ---- Configurações ----
  readonly editingTemplateId = signal<string | null>(null);
  templateName = '';
  templateDescription = '';
  templateCalories = 0;
  templateTime = '';
  templateFoodsText = '';
  newDayTypeLabel = '';
  newDayTypeGoal = 3500;

  readonly mealIconFor = (index: number): string => MEAL_ICONS[index % MEAL_ICONS.length];
  readonly mealColorFor = (index: number): string =>
    MEAL_COLORS[index % MEAL_COLORS.length];

  readonly waterDroplets = computed(() => {
    const goal = this.nutrition.todayDetail()?.day.waterGoalMl || 3000;
    const consumed = this.nutrition.waterConsumed();
    const totalDroplets = 8;
    const filled = Math.min(totalDroplets, Math.round((consumed / goal) * totalDroplets));
    return Array.from({ length: totalDroplets }, (_, i) => i < filled);
  });

  readonly yesterdayWeight = computed(() => {
    const today = this.nutrition.todayDetail()?.day.date;
    if (!today) return null;
    const sorted = this.nutrition
      .recentDays()
      .filter((day) => day.date < today && day.weightKg != null)
      .sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0]?.weightKg ?? null;
  });

  readonly weightDiff = computed(() => {
    const today = this.nutrition.todayDetail()?.day.weightKg;
    const yesterday = this.yesterdayWeight();
    if (today == null || yesterday == null) return null;
    return today - yesterday;
  });

  readonly mealsProgressPercent = computed(() => {
    const day = this.nutrition.todayDetail()?.day;
    if (!day || !day.mealsPlannedCount) return 0;
    return Math.round((day.mealsCompletedCount / day.mealsPlannedCount) * 100);
  });

  readonly canCompleteDay = computed(() => {
    const day = this.nutrition.todayDetail()?.day;
    if (!day) return false;
    return day.mealsCompletedCount > 0 && day.waterConsumedMl > 0 && day.weightKg != null;
  });

  readonly historyCells = computed<HistoryCell[]>(() => {
    const byDate = new Map(this.nutrition.recentDays().map((day) => [day.date, day]));
    const now = new Date();
    const month = this.historyMonth();
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const first = new Date(year, monthIndex, 1);
    const start = new Date(year, monthIndex, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = this._dateKey(date);
      const day = byDate.get(key);
      let status: HistoryCell['status'] = 'none';
      if (day?.completedAt) status = 'complete';
      else if (
        day &&
        (day.mealsCompletedCount > 0 || day.waterConsumedMl > 0 || day.weightKg != null)
      ) {
        status = 'partial';
      }
      return {
        key,
        day: date.getDate(),
        currentMonth: date.getMonth() === monthIndex,
        today: key === this._dateKey(now),
        status,
      };
    });
  });

  readonly historyMonthLabel = computed(() =>
    this.historyMonth().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  );

  readonly progressDays = computed(() => {
    const range = this.progressRangeDays();
    const all = this.nutrition.recentDays();
    if (range === 'all') return all;
    const cutoff = this._dateKeyDaysAgo(range);
    return all.filter((day) => day.date >= cutoff);
  });

  readonly calorieChart = computed(() => {
    const days = this.progressDays();
    const consumed = this._toPoints(days, (day) => day.totalCaloriesConsumed);
    const goal = this._toPoints(days, (day) => day.calorieGoal);
    const [consumedXY, goalXY] = this._seriesXY([consumed, goal]);
    return {
      consumedXY,
      goalXY,
      polylineConsumed: this._polylineFromXY(consumedXY),
      polylineGoal: this._polylineFromXY(goalXY),
    };
  });

  readonly weightChart = computed(() => {
    const days = this.progressDays().filter((day) => day.weightKg != null);
    const points = this._toPoints(days, (day) => day.weightKg ?? 0);
    const movingAverage = points.map((point, index) => {
      const window = points.slice(Math.max(0, index - 6), index + 1);
      const avg = window.reduce((sum, p) => sum + p.value, 0) / window.length;
      return { ...point, value: avg };
    });
    const [pointsXY, averageXY] = this._seriesXY([points, movingAverage]);
    return {
      pointsXY,
      averageXY,
      polylinePoints: this._polylineFromXY(pointsXY),
      polylineAverage: this._polylineFromXY(averageXY),
    };
  });

  readonly weightStats = computed(() => {
    const all = [...this.nutrition.recentDays()]
      .filter((day) => day.weightKg != null)
      .sort((a, b) => a.date.localeCompare(b.date));
    const current = all.at(-1)?.weightKg ?? null;
    const avg7 = this.nutrition.weeklyAverageWeight();
    const days30Ago = this._dateKeyDaysAgo(30);
    const before30 =
      [...all].reverse().find((day) => day.date <= days30Ago)?.weightKg ?? null;
    const first = all[0]?.weightKg ?? null;
    return {
      current,
      avg7,
      change30d: current != null && before30 != null ? current - before30 : null,
      changeSinceStart: current != null && first != null ? current - first : null,
    };
  });

  readonly waterChart = computed(() => {
    const days = this.progressDays();
    const points = this._toPoints(days, (day) => day.waterConsumedMl / 1000);
    const goalPoints = this._toPoints(days, (day) => day.waterGoalMl / 1000);
    const [pointsXY, goalXY] = this._seriesXY([points, goalPoints]);
    const daysWithGoalMet = days.filter(
      (day) => day.waterConsumedMl >= day.waterGoalMl,
    ).length;
    const avgMl = days.length
      ? days.reduce((sum, day) => sum + day.waterConsumedMl, 0) / days.length
      : 0;
    return {
      pointsXY,
      goalXY,
      polyline: this._polylineFromXY(pointsXY),
      polylineGoal: this._polylineFromXY(goalXY),
      avgLiters: avgMl / 1000,
      goalMetPercent: days.length ? Math.round((daysWithGoalMet / days.length) * 100) : 0,
    };
  });

  readonly adherenceChart = computed(() => {
    const days = this.progressDays();
    const planned = days.reduce((sum, day) => sum + day.mealsPlannedCount, 0);
    const completed = days.reduce((sum, day) => sum + day.mealsCompletedCount, 0);
    return { percent: planned ? Math.round((completed / planned) * 100) : 0 };
  });

  readonly ratingDistribution = computed(() => {
    const days = this.progressDays();
    const counts: Record<FoodRating, number> = { great: 0, good: 0, okay: 0, bad: 0 };
    for (const day of days) {
      if (day.foodRating) counts[day.foodRating]++;
    }
    return counts;
  });

  readonly mealCalorieBreakdown = computed(() => {
    const details = this.rangeDayDetails();
    const totalsByName = new Map<string, number>();
    let extrasTotal = 0;
    for (const detail of Object.values(details)) {
      for (const meal of detail.meals) {
        if (!meal.completed) continue;
        totalsByName.set(meal.name, (totalsByName.get(meal.name) ?? 0) + meal.calories);
      }
      extrasTotal += detail.extras.reduce((sum, entry) => sum + entry.calories, 0);
    }
    const rows = [...totalsByName.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([name, calories], index) => ({
        name,
        calories,
        color: this.mealColorFor(index),
      }));
    if (extrasTotal > 0)
      rows.push({ name: 'Extras', calories: extrasTotal, color: EXTRA_COLOR });
    const max = Math.max(1, ...rows.map((row) => row.calories));
    return rows.map((row) => ({ ...row, widthPercent: (row.calories / max) * 100 }));
  });

  readonly exerciseBreakdown = computed(() => {
    const details = this.rangeDayDetails();
    const totals: Record<ExerciseType, number> = { run: 0, gym: 0, other: 0 };
    let dailyTotal = 0;
    for (const detail of Object.values(details)) {
      for (const entry of detail.exercises) {
        totals[entry.type] += entry.caloriesBurned;
        dailyTotal += entry.caloriesBurned;
      }
    }
    return { totals, hasData: dailyTotal > 0 };
  });

  readonly exerciseChart = computed(() => {
    const days = this.progressDays();
    const points = this._toPoints(days, (day) => day.exerciseCaloriesBurned);
    const [pointsXY] = this._seriesXY([points]);
    return { pointsXY, polyline: this._polylineFromXY(pointsXY) };
  });

  readonly insights = computed<string[]>(() => {
    const days = this.progressDays();
    const results: string[] = [];
    if (!days.length) return results;

    const last7 = days.slice(-7);
    const waterGoalDays = last7.filter(
      (day) => day.waterConsumedMl >= day.waterGoalMl,
    ).length;
    if (last7.length >= 3) {
      results.push(
        `Você atingiu sua meta de água em ${waterGoalDays} dos últimos ${last7.length} dias.`,
      );
    }

    const avgCalories =
      days.reduce((sum, day) => sum + day.totalCaloriesConsumed, 0) / days.length;
    results.push(`Sua média calórica no período foi ${Math.round(avgCalories)} kcal.`);

    const weightStats = this.weightStats();
    if (weightStats.change30d != null) {
      const direction = weightStats.change30d >= 0 ? 'aumentou' : 'diminuiu';
      results.push(
        `Seu peso médio dos últimos 7 dias ${direction} ${Math.abs(weightStats.change30d).toFixed(1)} kg nos últimos 30 dias.`,
      );
    }

    const adherence = this.adherenceChart().percent;
    results.push(`Você completou ${adherence}% das refeições planejadas no período.`);

    return results;
  });

  private _dayTypeLabelById(id: string): string {
    return this.nutrition.settings().dayTypes.find((item) => item.id === id)?.label ?? id;
  }

  weekdayDayTypeLabel(weekday: number): string {
    const id = this.nutrition.settings().weeklySchedule[weekday];
    return id ? this._dayTypeLabelById(id) : '—';
  }

  readonly weekdayLabels = [
    'Domingo',
    'Segunda',
    'Terça',
    'Quarta',
    'Quinta',
    'Sexta',
    'Sábado',
  ];
  readonly weekdayIndexes = [0, 1, 2, 3, 4, 5, 6];
  readonly ratingOptions: Array<{ id: FoodRating; label: string; icon: string }> = [
    { id: 'great', label: 'Ótimo', icon: 'sentiment_very_satisfied' },
    { id: 'good', label: 'Bem', icon: 'sentiment_satisfied' },
    { id: 'okay', label: 'Médio', icon: 'sentiment_neutral' },
    { id: 'bad', label: 'Ruim', icon: 'sentiment_dissatisfied' },
  ];

  async ngOnInit(): Promise<void> {
    await this.nutrition.load(this.selectedCharacterId());
    this.weightInput = this.nutrition.todayDetail()?.day.weightKg ?? 0;
  }

  async selectCharacter(characterId: string): Promise<void> {
    if (!characterId || characterId === this.selectedCharacterId()) return;
    this.selectedCharacterId.set(characterId);
    await this.nutrition.load(characterId);
    this.weightInput = this.nutrition.todayDetail()?.day.weightKg ?? 0;
  }

  async onLogDateChange(date: string): Promise<void> {
    if (!date) return;
    await this.nutrition.selectLogDate(date);
  }

  // ---- Hoje: meals ----

  async toggleMeal(mealLogId: string): Promise<void> {
    const dayId = this.nutrition.todayDetail()?.day.id;
    if (!dayId) return;
    await this.nutrition.toggleMeal(dayId, mealLogId);
  }

  openMealEditor(mealLogId: string, currentCalories: number): void {
    this.editingMealId.set(mealLogId);
    this.editMealCalories = currentCalories;
  }

  closeMealEditor(): void {
    this.editingMealId.set(null);
  }

  async saveMealEdit(): Promise<void> {
    const dayId = this.nutrition.todayDetail()?.day.id;
    const mealLogId = this.editingMealId();
    if (!dayId || !mealLogId) return;
    await this.nutrition.editMealToday(dayId, mealLogId, this.editMealCalories);
    this.closeMealEditor();
  }

  // ---- Hoje: extras ----

  openExtraModal(): void {
    this.extraDescription = '';
    this.extraCalories = 0;
    this.extraModalOpen.set(true);
  }

  async saveExtra(): Promise<void> {
    const dayId = this.nutrition.todayDetail()?.day.id;
    if (!dayId) return;
    await this.nutrition.addExtraCalorie(
      dayId,
      this.extraDescription,
      this.extraCalories,
    );
    this.extraModalOpen.set(false);
  }

  async removeExtra(id: string): Promise<void> {
    const dayId = this.nutrition.todayDetail()?.day.id;
    if (!dayId) return;
    await this.nutrition.removeExtraCalorie(dayId, id);
  }

  // ---- Hoje: exercício ----

  openExerciseModal(): void {
    this.exerciseType = 'run';
    this.exerciseDescription = '';
    this.exerciseCalories = 0;
    this.exerciseDuration = null;
    this.exerciseModalOpen.set(true);
  }

  async saveExercise(): Promise<void> {
    const dayId = this.nutrition.todayDetail()?.day.id;
    if (!dayId) return;
    await this.nutrition.addExerciseLog(
      dayId,
      this.exerciseType,
      this.exerciseDescription,
      this.exerciseCalories,
      this.exerciseDuration,
    );
    this.exerciseModalOpen.set(false);
  }

  async removeExercise(id: string): Promise<void> {
    const dayId = this.nutrition.todayDetail()?.day.id;
    if (!dayId) return;
    await this.nutrition.removeExerciseLog(dayId, id);
  }

  exerciseTypeLabel(type: ExerciseType): string {
    return { run: 'Corrida', gym: 'Academia', other: 'Outro' }[type];
  }

  // ---- Hoje: água ----

  async addWater(ml: number): Promise<void> {
    const dayId = this.nutrition.todayDetail()?.day.id;
    if (!dayId) return;
    await this.nutrition.addWater(dayId, ml);
  }

  async addCustomWater(): Promise<void> {
    if (!this.customWaterMl) return;
    await this.addWater(this.customWaterMl);
  }

  async undoWater(): Promise<void> {
    const dayId = this.nutrition.todayDetail()?.day.id;
    if (!dayId) return;
    await this.nutrition.undoLastWater(dayId);
  }

  // ---- Hoje: peso / tipo do dia / avaliação / concluir ----

  async saveWeight(): Promise<void> {
    const dayId = this.nutrition.todayDetail()?.day.id;
    if (!dayId || !this.weightInput) return;
    await this.nutrition.setWeight(dayId, this.weightInput);
  }

  async changeDayType(dayTypeId: string): Promise<void> {
    const dayId = this.nutrition.todayDetail()?.day.id;
    if (!dayId) return;
    await this.nutrition.setDayType(dayId, dayTypeId);
  }

  async setRating(rating: FoodRating): Promise<void> {
    const dayId = this.nutrition.todayDetail()?.day.id;
    if (!dayId) return;
    const current = this.nutrition.todayDetail()?.day.foodRating;
    await this.nutrition.setFoodRating(
      dayId,
      current === rating ? null : rating,
      this.ratingNotes,
    );
  }

  async saveRatingNotes(): Promise<void> {
    const dayId = this.nutrition.todayDetail()?.day.id;
    if (!dayId) return;
    const current = this.nutrition.todayDetail()?.day.foodRating ?? null;
    await this.nutrition.setFoodRating(dayId, current, this.ratingNotes);
  }

  async completeDay(): Promise<void> {
    const dayId = this.nutrition.todayDetail()?.day.id;
    if (!dayId) return;
    await this.nutrition.completeDay(dayId);
  }

  // ---- Histórico ----

  previousHistoryMonth(): void {
    const current = this.historyMonth();
    this.historyMonth.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  nextHistoryMonth(): void {
    const current = this.historyMonth();
    this.historyMonth.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  async openHistoryDay(cell: HistoryCell): Promise<void> {
    if (cell.status === 'none' && !cell.currentMonth) return;
    const day = this.nutrition.recentDays().find((item) => item.date === cell.key);
    if (!day) return;
    this.historyDetailDayId.set(day.id);
    const detail = await this.nutrition.loadDayDetail(day.id);
    this.historyDetail.set(detail);
    this.historyWeightInput = detail?.day.weightKg ?? 0;
  }

  closeHistoryDay(): void {
    this.historyDetailDayId.set(null);
    this.historyDetail.set(null);
  }

  async toggleHistoryMeal(mealLogId: string): Promise<void> {
    const dayId = this.historyDetailDayId();
    if (!dayId) return;
    await this.nutrition.toggleMeal(dayId, mealLogId);
    this.historyDetail.set(await this.nutrition.loadDayDetail(dayId));
  }

  async saveHistoryWeight(): Promise<void> {
    const dayId = this.historyDetailDayId();
    if (!dayId || !this.historyWeightInput) return;
    await this.nutrition.setWeight(dayId, this.historyWeightInput);
    this.historyDetail.set(await this.nutrition.loadDayDetail(dayId));
  }

  // ---- Progresso ----

  setProgressRange(range: number | 'all'): void {
    this.progressRangeDays.set(range);
    this._refreshRangeDetails();
  }

  private async _refreshRangeDetails(): Promise<void> {
    const dayIds = this.progressDays().map((day) => day.id);
    if (!dayIds.length) {
      this.rangeDayDetails.set({});
      return;
    }
    this.rangeDayDetails.set(await this.nutrition.loadDetailsForDays(dayIds));
  }

  onProgressTabOpened(): void {
    this.tab.set('progress');
    void this._refreshRangeDetails();
  }

  // ---- Configurações: dieta base ----

  openTemplateEditor(template: MealTemplate): void {
    this.editingTemplateId.set(template.id);
    this.templateName = template.name;
    this.templateDescription = template.description;
    this.templateCalories = template.defaultCalories;
    this.templateTime = template.defaultTime ?? '';
    this.templateFoodsText = template.foods.join('\n');
  }

  closeTemplateEditor(): void {
    this.editingTemplateId.set(null);
  }

  async saveTemplateEdit(): Promise<void> {
    const id = this.editingTemplateId();
    if (!id) return;
    await this.nutrition.updateMealTemplate(id, {
      name: this.templateName,
      description: this.templateDescription,
      defaultCalories: this.templateCalories,
      defaultTime: this.templateTime || null,
      foods: this.templateFoodsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    });
    this.closeTemplateEditor();
  }

  async removeTemplate(id: string): Promise<void> {
    if (
      !confirmDialog(
        'Remover este modelo de refeição? Isso não afeta dias já registrados.',
      )
    )
      return;
    await this.nutrition.removeMealTemplate(id);
  }

  templateForMeal(mealTemplateId: string | null): MealTemplate | null {
    if (!mealTemplateId) return null;
    return (
      this.nutrition.mealTemplates().find((item) => item.id === mealTemplateId) ?? null
    );
  }

  editTemplateFromMeal(mealTemplateId: string | null): void {
    const template = this.templateForMeal(mealTemplateId);
    if (!template) return;
    this.tab.set('settings');
    this.openTemplateEditor(template);
  }

  async addTemplate(): Promise<void> {
    if (!this.templateName.trim()) return;
    await this.nutrition.addMealTemplate(
      this.templateName,
      this.templateCalories,
      this.templateTime || null,
      this.templateFoodsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    );
    this.templateName = '';
    this.templateCalories = 0;
    this.templateTime = '';
    this.templateFoodsText = '';
  }

  // ---- Configurações: metas / tipos de dia / agenda semanal ----

  async updateWaterGoal(waterGoalMl: number): Promise<void> {
    await this.nutrition.updateSettings({ waterGoalMl });
  }

  async updateDayTypeGoal(dayType: NutritionDayType, calorieGoal: number): Promise<void> {
    const dayTypes = this.nutrition
      .settings()
      .dayTypes.map((item) => (item.id === dayType.id ? { ...item, calorieGoal } : item));
    await this.nutrition.updateSettings({ dayTypes });
  }

  async addDayType(): Promise<void> {
    if (!this.newDayTypeLabel.trim()) return;
    const dayTypes = [
      ...this.nutrition.settings().dayTypes,
      {
        id: crypto.randomUUID(),
        label: this.newDayTypeLabel.trim(),
        calorieGoal: this.newDayTypeGoal,
      },
    ];
    await this.nutrition.updateSettings({ dayTypes });
    this.newDayTypeLabel = '';
    this.newDayTypeGoal = 3500;
  }

  async removeDayType(id: string): Promise<void> {
    const dayTypes = this.nutrition.settings().dayTypes.filter((item) => item.id !== id);
    if (!dayTypes.length) return;
    await this.nutrition.updateSettings({ dayTypes });
  }

  async setWeeklySchedule(weekday: number, dayTypeId: string): Promise<void> {
    const weeklySchedule = {
      ...this.nutrition.settings().weeklySchedule,
      [weekday]: dayTypeId,
    };
    await this.nutrition.updateSettings({ weeklySchedule });
  }

  // ---- Helpers ----

  formatCalories(value: number): string {
    return `${Math.round(value).toLocaleString('pt-BR')} kcal`;
  }

  formatLiters(ml: number): string {
    return `${(ml / 1000).toFixed(1)} L`;
  }

  sumWater(waterLogs: Array<{ amountMl: number }>): number {
    return waterLogs.reduce((sum, entry) => sum + entry.amountMl, 0);
  }

  private _toPoints(
    days: Array<{ date: string }>,
    valueFn: (day: any) => number,
  ): ProgressPoint[] {
    return days.map((day: any) => ({
      date: day.date,
      label: this._shortLabel(day.date),
      value: valueFn(day),
    }));
  }

  // Maps one or more same-length series onto a SHARED scale (so e.g.
  // "consumido" and "meta" stay visually comparable on one chart) and gives
  // each point real x/y coordinates - needed both for the <polyline> string
  // and for per-point <circle> markers, which matter a lot with few days of
  // data: a 1-point polyline has zero length and draws nothing at all, so
  // without a marker a brand-new day's data looked like it "wasn't there".
  private _seriesXY(
    seriesList: ProgressPoint[][],
  ): Array<Array<ProgressPoint & { x: number; y: number }>> {
    const width = 900;
    const height = 200;
    const length = Math.max(0, ...seriesList.map((series) => series.length));
    const max = Math.max(
      1,
      ...seriesList.flatMap((series) => series.map((point) => point.value)),
    );
    return seriesList.map((series) =>
      series.map((point, index) => ({
        ...point,
        x: length <= 1 ? width / 2 : (index / (length - 1)) * width,
        y: height - (point.value / max) * height,
      })),
    );
  }

  private _polylineFromXY(points: Array<{ x: number; y: number }>): string {
    return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  }

  private _shortLabel(dateStr: string): string {
    const date = this._parseLocalDate(dateStr);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private _parseLocalDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, Math.max(0, month - 1), day || 1);
  }

  private _dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`;
  }

  private _dateKeyDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return this._dateKey(date);
  }
}
