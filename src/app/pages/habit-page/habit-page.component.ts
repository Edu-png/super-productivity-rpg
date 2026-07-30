import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CharacterRendererComponent } from '../../features/rpg-profile/character-renderer.component';
import { TaskHabitService } from '../../features/habit-tracker/task-habit.service';
import { Task } from '../../features/tasks/task.model';
import { RpgProfileService } from '../../features/rpg-profile/rpg-profile.service';

interface CalendarDay {
  date: Date;
  key: string;
  inMonth: boolean;
}

@Component({
  selector: 'habit-page',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, CharacterRendererComponent],
  templateUrl: './habit-page.component.html',
  styleUrl: './habit-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HabitPageComponent {
  readonly tracker = inject(TaskHabitService);
  readonly profile = inject(RpgProfileService);
  readonly selectedCharacterIds = signal<string[]>([
    this.profile.activeCharacterId(),
  ]);
  readonly view = signal<'day' | 'month'>('day');
  readonly editorOpen = signal(false);
  readonly search = signal('');
  readonly selectedDate = signal(new Date());
  readonly monthCursor = signal(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );

  readonly selectedDateKey = computed(() => this._dateKey(this.selectedDate()));
  readonly selectedDateLabel = computed(() =>
    this.selectedDate().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );
  readonly monthLabel = computed(() =>
    this.monthCursor().toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    }),
  );
  readonly calendarDays = computed<CalendarDay[]>(() => {
    const cursor = this.monthCursor();
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return {
        date,
        key: this._dateKey(date),
        inMonth: date.getMonth() === cursor.getMonth(),
      };
    });
  });
  readonly filteredCandidates = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.tracker
      .candidates()
      .filter((task) => !query || task.title.toLocaleLowerCase().includes(query));
  });
  readonly visibleHabits = computed(() =>
    this.tracker
      .habitsForCharacters(this.selectedCharacterIds())
      .sort((a, b) => {
        const date = this.selectedDateKey();
        const aTime = this.tracker.scheduledAt(a.id, date);
        const bTime = this.tracker.scheduledAt(b.id, date);
        if (aTime === null && bTime === null) return a.title.localeCompare(b.title);
        if (aTime === null) return 1;
        if (bTime === null) return -1;
        return aTime - bTime;
      }),
  );

  toggleCharacter(characterId: string): void {
    this.selectedCharacterIds.update((current) =>
      current.includes(characterId)
        ? current.length > 1
          ? current.filter((id) => id !== characterId)
          : current
        : [...current, characterId],
    );
  }

  completionRate(date: string): number {
    return this.tracker.completionRate(date, this.selectedCharacterIds());
  }

  previousDay(): void {
    this._moveSelectedDate(-1);
  }

  nextDay(): void {
    this._moveSelectedDate(1);
  }

  today(): void {
    this.selectedDate.set(new Date());
    this.monthCursor.set(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    );
  }

  previousMonth(): void {
    this.monthCursor.update(
      (date) => new Date(date.getFullYear(), date.getMonth() - 1, 1),
    );
  }

  nextMonth(): void {
    this.monthCursor.update(
      (date) => new Date(date.getFullYear(), date.getMonth() + 1, 1),
    );
  }

  selectCalendarDay(day: CalendarDay): void {
    this.selectedDate.set(day.date);
    this.view.set('day');
  }

  toggleTask(task: Task): void {
    const selected = this.selectedCharacterIds();
    if (this.tracker.isLinked(task, selected)) {
      const habit = this.tracker.habits().find((candidate) =>
        task.repeatCfgId
          ? candidate.repeatCfgId === task.repeatCfgId
          : candidate.sourceTaskId === task.id ||
            candidate.normalizedTitle ===
              task.title
                .normalize('NFD')
                .replace(/\p{Diacritic}/gu, '')
                .trim()
                .toLocaleLowerCase(),
      );
      if (habit) this.tracker.unassignCharacters(habit.id, selected);
    } else {
      this.tracker.addFromTask(task, selected);
    }
  }

  private _moveSelectedDate(amount: number): void {
    this.selectedDate.update((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + amount);
      return next;
    });
  }

  private _dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
