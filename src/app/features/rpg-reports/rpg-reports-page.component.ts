import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { Store } from '@ngrx/store';
import { TaskService } from '../tasks/task.service';
import { Task } from '../tasks/task.model';
import { selectAllProjects } from '../project/store/project.selectors';
import { RpgProfileService } from '../rpg-profile/rpg-profile.service';
import { RpgMedalTier, RpgWeeklyReview } from '../rpg-profile/rpg-profile.model';
import { AcademyRepository } from '../academy-arcana/domain/academy.repository';
import { AcademyIdbRepository } from '../academy-arcana/persistence/academy-idb.repository';
import { StudySession } from '../academy-arcana/domain/academy.models';
import { startOfWeekMs } from '../rpg-profile/rpg-contracts.util';
import { getDbDateStr } from '../../util/get-db-date-str';
import { CharacterRendererComponent } from '../rpg-profile/character-renderer.component';
import { buildRpgReport, RpgReportBar, RpgReportRange } from './rpg-report.util';
import {
  buildReviewHighlights,
  summarizeWeekDistractions,
  WEEKLY_REVIEW_REWARD,
} from './weekly-review.util';

type ReportMode = 'week' | 'month';

const DAY_MS = 24 * 60 * 60 * 1000;

const toMonthStr = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

@Component({
  selector: 'rpg-reports-page',
  templateUrl: './rpg-reports-page.component.html',
  styleUrl: './rpg-reports-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, FormsModule, MatIcon, MatIconButton, CharacterRendererComponent],
  // Lets the weekly review read this character's Academia Arcana sessions (distractions).
  providers: [{ provide: AcademyRepository, useClass: AcademyIdbRepository }],
})
export class RpgReportsPageComponent implements OnInit {
  private readonly _taskService = inject(TaskService);
  private readonly _store = inject(Store);
  readonly profile = inject(RpgProfileService);
  private readonly _academyRepository = inject(AcademyRepository);

  readonly view = signal<'report' | 'review'>('report');
  readonly mode = signal<ReportMode>('month');
  readonly weekStart = signal(startOfWeekMs(Date.now()));
  readonly monthFrom = signal(toMonthStr(new Date()));
  readonly monthTo = signal(toMonthStr(new Date()));
  readonly isLoading = signal(true);
  private readonly _tasks = signal<Task[]>([]);
  private readonly _studySessions = signal<StudySession[]>([]);
  private readonly _projects = this._store.selectSignal(selectAllProjects);

  readonly TIER_LABEL: Record<RpgMedalTier, string> = {
    bronze: 'Bronze',
    silver: 'Prata',
    gold: 'Ouro',
  };

  readonly range = computed((): RpgReportRange & { label: string } => {
    if (this.mode() === 'week') {
      return this._weekRange(this.weekStart());
    }
    // Month range, tolerant of from/to being picked in reverse.
    const [a, b] = [this.monthFrom(), this.monthTo()].sort();
    const [fy, fm] = a.split('-').map(Number);
    const [ty, tm] = b.split('-').map(Number);
    const start = new Date(fy, fm - 1, 1);
    const afterEnd = new Date(ty, tm, 1);
    const halfDay = DAY_MS / 2;
    const end = new Date(afterEnd.getTime() - halfDay);
    return {
      startDay: getDbDateStr(start),
      endDay: getDbDateStr(end),
      startMs: start.getTime(),
      endMs: afterEnd.getTime(),
      label:
        a === b ? this._monthLabel(a) : `${this._monthLabel(a)} – ${this._monthLabel(b)}`,
    };
  });

  readonly report = computed(() => this._buildReport(this.range()));

  // ---- weekly review ----
  readonly reviewWeekStart = signal(RpgReportsPageComponent._defaultReviewWeek());
  readonly reviewRange = computed(() => this._weekRange(this.reviewWeekStart()));
  private readonly _previousReviewRange = computed(() => {
    const previous = new Date(this.reviewWeekStart());
    previous.setDate(previous.getDate() - 7);
    return this._weekRange(previous.getTime());
  });
  readonly reviewReport = computed(() => this._buildReport(this.reviewRange()));
  readonly reviewHighlights = computed(() =>
    buildReviewHighlights({
      report: this.reviewReport(),
      previous: this._buildReport(this._previousReviewRange()),
      distractions: summarizeWeekDistractions(this._studySessions(), this.reviewRange()),
      previousDistractions: summarizeWeekDistractions(
        this._studySessions(),
        this._previousReviewRange(),
      ),
    }),
  );
  readonly savedReview = computed(
    () => this.profile.state().weeklyReviews?.[this.reviewRange().startDay],
  );
  readonly previousReview = computed(
    () => this.profile.state().weeklyReviews?.[this._previousReviewRange().startDay],
  );
  readonly pastReviews = computed(() =>
    Object.values(this.profile.state().weeklyReviews ?? {})
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .slice(0, 12),
  );
  readonly REVIEW_REWARD = WEEKLY_REVIEW_REWARD;
  reviewRating = 0;
  reviewWorked = '';
  reviewBlocked = '';
  reviewChange = '';
  reviewNextFocus = '';
  reviewPreviousFocusDone: RpgWeeklyReview['previousFocusDone'] = null;
  readonly reviewMessage = signal('');

  private _buildReport(range: RpgReportRange): ReturnType<typeof buildRpgReport> {
    return buildRpgReport({
      range,
      tasks: this._tasks(),
      projects: this._projects().map((project) => ({
        id: project.id,
        title: project.title,
        color: project.theme?.primary,
      })),
      state: this.profile.state(),
      monthlyMedalTitles: Object.fromEntries(
        this.profile.monthlyMedals().map((medal) => [medal.id, medal.title]),
      ),
      attributeLabels: Object.fromEntries(
        this.profile
          .attributeDefinitions()
          .map((attribute) => [attribute.id, attribute.label]),
      ),
      xpMultiplier: this.profile.xpMultiplier(),
      characterId: this.profile.activeCharacterId(),
      taskOwnerIds: this.profile.taskOwnerIds(),
    });
  }

  readonly maxProjectHours = computed(() => this._max(this.report().hoursByProject));
  readonly maxAttributeHours = computed(() => this._max(this.report().hoursByAttribute));
  readonly maxTimelineHours = computed(() => this._max(this.report().timeline));
  /** Label every bar on short ranges, thin them out on long ones so they never collide. */
  readonly timelineLabelEvery = computed(() =>
    Math.max(1, Math.ceil(this.report().timeline.length / 12)),
  );
  readonly maxPenaltyCount = computed(() =>
    Math.max(1, ...this.report().penalties.map((row) => row.count)),
  );

  private readonly _brl = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  ngOnInit(): void {
    void this.reload();
    this.loadReviewForm();
  }

  async reload(): Promise<void> {
    this.isLoading.set(true);
    // Includes archived tasks, so "finish day" doesn't erase past hours.
    this._tasks.set(await this._taskService.getAllTasksEverywhere());
    // Academia Arcana stores sessions per character (profileId = character id).
    const now = Date.now();
    const yearMs = 400 * DAY_MS;
    this._studySessions.set(
      await this._academyRepository.listSessions(
        this.profile.activeCharacterId(),
        now - yearMs,
        now,
        0,
        5000,
      ),
    );
    this.isLoading.set(false);
  }

  shiftReviewWeek(delta: number): void {
    const date = new Date(this.reviewWeekStart());
    const days = delta * 7;
    date.setDate(date.getDate() + days);
    this.reviewWeekStart.set(startOfWeekMs(date.getTime()));
    this.loadReviewForm();
  }

  openReview(weekStart?: string): void {
    if (weekStart) {
      const [y, m, d] = weekStart.split('-').map(Number);
      this.reviewWeekStart.set(new Date(y, m - 1, d).getTime());
    }
    this.view.set('review');
    this.loadReviewForm();
  }

  /** Fills the form from the saved review of the selected week, or clears it. */
  loadReviewForm(): void {
    const saved = this.savedReview();
    this.reviewRating = saved?.rating ?? 0;
    this.reviewWorked = saved?.worked ?? '';
    this.reviewBlocked = saved?.blocked ?? '';
    this.reviewChange = saved?.change ?? '';
    this.reviewNextFocus = saved?.nextFocus ?? '';
    this.reviewPreviousFocusDone = saved?.previousFocusDone ?? null;
    this.reviewMessage.set('');
  }

  saveReview(): void {
    if (!this.reviewRating) {
      this.reviewMessage.set('Dê uma nota para a semana antes de concluir.');
      return;
    }
    const isFirstTime = this.profile.saveWeeklyReview(
      {
        weekStart: this.reviewRange().startDay,
        rating: this.reviewRating,
        worked: this.reviewWorked.trim(),
        blocked: this.reviewBlocked.trim(),
        change: this.reviewChange.trim(),
        nextFocus: this.reviewNextFocus.trim(),
        previousFocusDone: this.reviewPreviousFocusDone,
      },
      WEEKLY_REVIEW_REWARD,
    );
    this.reviewMessage.set(
      isFirstTime
        ? `Revisão concluída! +${WEEKLY_REVIEW_REWARD.xp} XP e +${WEEKLY_REVIEW_REWARD.coins} moedas.`
        : 'Revisão atualizada.',
    );
  }

  reviewWeekLabel(weekStart: string): string {
    const [y, m, d] = weekStart.split('-').map(Number);
    return this._weekRange(new Date(y, m - 1, d).getTime()).label;
  }

  shiftWeek(delta: number): void {
    const date = new Date(this.weekStart());
    const days = delta * 7;
    date.setDate(date.getDate() + days);
    this.weekStart.set(startOfWeekMs(date.getTime()));
  }

  presetMonths(preset: 'this' | 'last' | 'last3' | 'year'): void {
    const now = new Date();
    const current = toMonthStr(now);
    if (preset === 'this') {
      this.monthFrom.set(current);
      this.monthTo.set(current);
    } else if (preset === 'last') {
      const last = toMonthStr(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      this.monthFrom.set(last);
      this.monthTo.set(last);
    } else if (preset === 'last3') {
      this.monthFrom.set(toMonthStr(new Date(now.getFullYear(), now.getMonth() - 2, 1)));
      this.monthTo.set(current);
    } else {
      this.monthFrom.set(`${now.getFullYear()}-01`);
      this.monthTo.set(current);
    }
  }

  formatMoney(value: number): string {
    return this._brl.format(value);
  }

  formatHours(hours: number): string {
    const whole = Math.floor(hours);
    const minutes = Math.round((hours - whole) * 60);
    return minutes ? `${whole}h ${minutes}min` : `${whole}h`;
  }

  barWidth(value: number, max: number): number {
    return max > 0 ? Math.max(2, (value / max) * 100) : 0;
  }

  private _weekRange(weekStartMs: number): RpgReportRange & { label: string } {
    const start = new Date(weekStartMs);
    const end = new Date(weekStartMs);
    end.setDate(end.getDate() + 6);
    const endMs = new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate() + 1,
    ).getTime();
    return {
      startDay: getDbDateStr(start),
      endDay: getDbDateStr(end),
      startMs: start.getTime(),
      endMs,
      label: `${this._shortDay(start)} – ${this._shortDay(end)}`,
    };
  }

  /** Early in the week (Mon/Tue) the week worth reviewing is the one that just ended. */
  private static _defaultReviewWeek(): number {
    const now = new Date();
    const thisWeek = startOfWeekMs(now.getTime());
    const isEarlyWeek = now.getDay() === 1 || now.getDay() === 2;
    if (!isEarlyWeek) return thisWeek;
    const previous = new Date(thisWeek);
    previous.setDate(previous.getDate() - 7);
    return previous.getTime();
  }

  private _max(bars: RpgReportBar[]): number {
    return Math.max(0, ...bars.map((bar) => bar.hours));
  }

  private _shortDay(date: Date): string {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private _monthLabel(month: string): string {
    const [y, m] = month.split('-').map(Number);
    const name = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
    return `${name} ${y}`;
  }
}
