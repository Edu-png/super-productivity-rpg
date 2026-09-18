import { Task, TaskWithDueTime, TaskWithoutReminder } from '../../tasks/task.model';
import { TaskRepeatCfg } from '../../task-repeat-cfg/task-repeat-cfg.model';

import { PlannerDayMap } from '../../planner/planner.model';
import {
  ScheduleCalendarMapEntry,
  ScheduleDay,
  ScheduleLunchBreakCfg,
  ScheduleWorkStartEndCfg,
} from '../schedule.model';
import { createScheduleDays } from './create-schedule-days';
import { createBlockedBlocksByDayMap } from './create-blocked-blocks-by-day-map';
import { clockStringFromDate } from '../../../ui/duration/clock-string-from-date';

const WEEKDAY_ONLY_ROUTINE_TITLES = new Set(['trabalhar', 'estudar dados']);

export const mapToScheduleDays = (
  now: number,
  dayDates: string[],
  tasks: Task[],
  scheduledTasks: TaskWithDueTime[],
  scheduledTaskRepeatCfgs: TaskRepeatCfg[],
  unScheduledTaskRepeatCfgs: TaskRepeatCfg[],
  // TODO replace with no schedule type
  calenderWithItems: ScheduleCalendarMapEntry[],
  currentId: string | null,
  plannerDayMap: PlannerDayMap,
  workStartEndCfg: ScheduleWorkStartEndCfg = {
    startTime: '0:00',
    endTime: '23:59',
  },
  lunchBreakCfg?: ScheduleLunchBreakCfg,
  realNow?: number,
): ScheduleDay[] => {
  // NOTE to use for failing test cases
  // const params = {
  //   now,
  //   dayDates,
  //   tasks,
  //   scheduledTasks,
  //   scheduledTaskRepeatCfgs,
  //   unScheduledTaskRepeatCfgs,
  //   calenderWithItems,
  //   currentId,
  //   plannerDayMap,
  //   workStartEndCfg,
  //   lunchBreakCfg,
  // };
  // Log.log(JSON.stringify(params));

  const plannerDayKeys = Object.keys(plannerDayMap);
  // const plannerDayTasks = plannerDayKeys
  //   .map((key) => {
  //     return plannerDayMap[key];
  //       // .map(
  //       // (t) => ({ ...t, plannedForDay: key }) as TaskWithPlannedForDayIndication,
  //     // );
  //   })
  //   .flat();

  if (
    !tasks.length &&
    !scheduledTasks.length &&
    !scheduledTaskRepeatCfgs.length &&
    !unScheduledTaskRepeatCfgs.length &&
    !calenderWithItems.length &&
    !plannerDayKeys.length
  ) {
    return [];
  }

  const initialTasks: Task[] = currentId
    ? resortTasksWithCurrentFirst(currentId, tasks)
    : tasks;

  const nonScheduledTasks: TaskWithoutReminder[] = initialTasks.filter(
    (task) => !(typeof task.dueWithTime === 'number'),
  ) as TaskWithoutReminder[];

  const normalizedRepeatCfgs = normalizeRoutineRepeatCfgs(
    [...scheduledTaskRepeatCfgs, ...unScheduledTaskRepeatCfgs],
    scheduledTasks,
  );
  const normalizedScheduledTaskRepeatCfgs = normalizedRepeatCfgs.filter(
    (cfg) => !!cfg.startTime,
  );
  const normalizedUnscheduledTaskRepeatCfgs = normalizedRepeatCfgs.filter(
    (cfg) => !cfg.startTime,
  );

  const blockerBlocksDayMap = createBlockedBlocksByDayMap(
    scheduledTasks,
    normalizedScheduledTaskRepeatCfgs,
    calenderWithItems,
    workStartEndCfg,
    lunchBreakCfg,
    now,
    undefined,
    realNow,
  );

  const v = createScheduleDays(
    nonScheduledTasks,
    normalizedUnscheduledTaskRepeatCfgs,
    dayDates,
    plannerDayMap,
    blockerBlocksDayMap,
    workStartEndCfg,
    now,
    realNow,
  );

  return v;
};

const normalizeRoutineRepeatCfgs = (
  repeatCfgs: TaskRepeatCfg[],
  scheduledTasks: TaskWithDueTime[],
): TaskRepeatCfg[] => {
  const concreteTaskByRepeatCfgId = new Map<string, TaskWithDueTime>();

  scheduledTasks.forEach((task) => {
    if (!task.repeatCfgId) {
      return;
    }

    const current = concreteTaskByRepeatCfgId.get(task.repeatCfgId);
    if (!current || task.dueWithTime < current.dueWithTime) {
      concreteTaskByRepeatCfgId.set(task.repeatCfgId, task);
    }
  });

  return repeatCfgs.map((cfg) => {
    const concreteTask = concreteTaskByRepeatCfgId.get(cfg.id);
    const title = (cfg.title ?? concreteTask?.title ?? '').trim().toLocaleLowerCase();
    const isWeekdayOnlyRoutine = WEEKDAY_ONLY_ROUTINE_TITLES.has(title);
    const inheritedStartTime =
      cfg.startTime ??
      (concreteTask ? clockStringFromDate(concreteTask.dueWithTime) : undefined);
    const inheritedProjectId = concreteTask?.projectId ?? cfg.projectId;

    if (
      !isWeekdayOnlyRoutine &&
      inheritedStartTime === cfg.startTime &&
      inheritedProjectId === cfg.projectId
    ) {
      return cfg;
    }

    return {
      ...cfg,
      startTime: inheritedStartTime,
      projectId: inheritedProjectId,
      ...(isWeekdayOnlyRoutine
        ? {
            quickSetting: 'MONDAY_TO_FRIDAY' as const,
            repeatCycle: 'WEEKLY' as const,
            monday: true,
            tuesday: true,
            wednesday: true,
            thursday: true,
            friday: true,
            saturday: false,
            sunday: false,
          }
        : {}),
    };
  });
};

const resortTasksWithCurrentFirst = (currentId: string, tasks: Task[]): Task[] => {
  let newTasks = tasks;
  const currentTask = tasks.find((t) => t.id === currentId);
  if (currentTask) {
    newTasks = [currentTask, ...tasks.filter((t) => t.id !== currentId)] as Task[];
  }
  return newTasks;
};
