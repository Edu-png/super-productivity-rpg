import { inject, Injectable } from '@angular/core';
import { combineLatest, from, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ProjectService } from '../project/project.service';
import { Task } from '../tasks/task.model';
import { TaskService } from '../tasks/task.service';
import { BreakNr, BreakTime } from '../work-context/work-context.model';
import { SimpleMetrics } from './metric.model';
import { getDbDateStr } from '../../util/get-db-date-str';

@Injectable({ providedIn: 'root' })
export class FolderMetricsService {
  private readonly _projectService = inject(ProjectService);
  private readonly _taskService = inject(TaskService);

  getSimpleMetrics$(projectIds: string[]): Observable<SimpleMetrics> {
    const uniqueIds = [...new Set(projectIds)];
    if (!uniqueIds.length) {
      return of(this._calculate([], {}, {}));
    }

    return combineLatest([
      ...uniqueIds.map((id) => this._projectService.getBreakNrForProject$(id)),
      ...uniqueIds.map((id) => this._projectService.getBreakTimeForProject$(id)),
    ]).pipe(
      switchMap((values) => {
        const splitAt = uniqueIds.length;
        const breakNr = this._sumByDay(values.slice(0, splitAt) as BreakNr[]);
        const breakTime = this._sumByDay(values.slice(splitAt) as BreakTime[]);

        return from(
          Promise.all(uniqueIds.map((id) => this._taskService.getAllTasksForProject(id))),
        ).pipe(
          map((taskGroups) =>
            this._calculate(this._dedupeTasks(taskGroups.flat()), breakNr, breakTime),
          ),
        );
      }),
    );
  }

  private _calculate(
    tasks: Task[],
    breakNr: BreakNr,
    breakTime: BreakTime,
  ): SimpleMetrics {
    const workedDays = new Set<string>();
    let timeSpent = 0;
    let timeEstimate = 0;
    let nrOfCompletedTasks = 0;
    let nrOfSubTasks = 0;
    let nrOfMainTasks = 0;
    let nrOfParentTasks = 0;
    let earliestCreated = Number.MAX_SAFE_INTEGER;

    for (const task of tasks) {
      earliestCreated = Math.min(earliestCreated, task.created);
      if (task.parentId) {
        nrOfSubTasks++;
      } else {
        nrOfMainTasks++;
        timeEstimate += task.timeEstimate;
      }
      if (task.subTaskIds?.length) {
        nrOfParentTasks++;
      }
      if (task.isDone) {
        nrOfCompletedTasks++;
      }
      for (const [dateStr, spent] of Object.entries(task.timeSpentOnDay ?? {})) {
        if (spent > 0) {
          workedDays.add(dateStr);
          timeSpent += spent;
        }
      }
    }

    const daysWorked = workedDays.size;
    const breakNrTotal = this._sumValues(breakNr);
    const breakTimeTotal = this._sumValues(breakTime);
    const effectiveTaskCount = tasks.length - nrOfParentTasks;

    return {
      start:
        earliestCreated === Number.MAX_SAFE_INTEGER
          ? getDbDateStr()
          : getDbDateStr(earliestCreated),
      end: getDbDateStr(),
      timeSpent,
      timeEstimate,
      breakTime: breakTimeTotal,
      breakNr: breakNrTotal,
      nrOfCompletedTasks,
      nrOfAllTasks: tasks.length,
      nrOfSubTasks,
      nrOfMainTasks,
      nrOfParentTasks,
      daysWorked,
      avgTasksPerDay: this._safeDivide(nrOfMainTasks, daysWorked),
      avgTimeSpentOnDay: this._safeDivide(timeSpent, daysWorked),
      avgTimeSpentOnTask: this._safeDivide(timeSpent, nrOfMainTasks),
      avgTimeSpentOnTaskIncludingSubTasks: this._safeDivide(
        timeSpent,
        effectiveTaskCount,
      ),
      avgBreakNr: this._safeDivide(breakNrTotal, daysWorked),
      avgBreakTime: this._safeDivide(breakTimeTotal, daysWorked),
    };
  }

  private _dedupeTasks(tasks: Task[]): Task[] {
    return [...new Map(tasks.map((task) => [task.id, task])).values()];
  }

  private _sumByDay(values: ReadonlyArray<BreakNr | BreakTime>): {
    [dateStr: string]: number;
  } {
    const result: { [dateStr: string]: number } = {};
    for (const value of values) {
      for (const [dateStr, amount] of Object.entries(value)) {
        result[dateStr] = (result[dateStr] ?? 0) + amount;
      }
    }
    return result;
  }

  private _sumValues(value: BreakNr | BreakTime): number {
    return Object.values(value).reduce((total, amount) => total + amount, 0);
  }

  private _safeDivide(value: number, divisor: number): number {
    return divisor ? value / divisor : 0;
  }
}
