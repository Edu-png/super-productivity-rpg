import { Task } from '../features/tasks/task.model';

export const getTimeLeftForTask = (task: Task): number => {
  if (task.subTaskIds.length > 0) {
    return task.timeEstimate;
  }
  return Math.max(0, task.timeEstimate - task.timeSpent) || 0;
};

export const getTimeLeftForTasks = (tasks: Task[]): number => {
  return tasks.reduce((acc, task) => acc + getTimeLeftForTask(task), 0);
};

export const getTimeLeftForTaskWithMinVal = (task: Task, minVal: number): number => {
  if (task.subTaskIds.length > 0) {
    return Math.max(minVal, task.timeEstimate);
  }
  if (typeof task.timeSpent !== 'number') {
    throw new Error('timeSpent is not a number');
  }
  return Math.max(minVal, task.timeEstimate - task.timeSpent) || 0;
};

export const getTimeLeftForTasksWithMinVal = (tasks: Task[], minVal: number): number => {
  return tasks.reduce((acc, task) => acc + Math.max(getTimeLeftForTask(task), minVal), 0);
};

/**
 * Schedule-only counterpart of getTimeLeftForTask. Everywhere else (stats,
 * logs, RPG, etc.) a task's remaining time shrinks as timeSpent accrues -
 * useful for "how much work is left" math. But a schedule block represents
 * the planned slot itself, so it always renders at the full timeEstimate
 * regardless of how much has been tracked so far (never bigger, never
 * smaller than what was programmed). The real overage is surfaced separately
 * via getScheduleOverageForTask (a "+Xm" badge) rather than by resizing the
 * block - actual tracked time is untouched and stays accurate everywhere.
 */
export const getScheduleDurationForTask = (task: Task): number => task.timeEstimate;

/** How far past its estimate a task's tracked time has gone, for the "+Xm" schedule badge. */
export const getScheduleOverageForTask = (task: Task): number =>
  task.subTaskIds.length > 0 ? 0 : Math.max(0, task.timeSpent - task.timeEstimate);
