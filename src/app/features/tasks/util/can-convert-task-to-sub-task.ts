import { Task } from '../task.model';

type ConvertibleTaskFields = Pick<
  Task,
  'parentId' | 'subTaskIds' | 'repeatCfgId' | 'dueWithTime' | 'reminderId' | 'remindAt'
>;

// NOTE: issue-linked tasks (issueId/issueProviderId/issueType) are
// deliberately ALLOWED here - this fork's users file GitHub/GitLab issues as
// subtasks of a work block on purpose. The one known trade-off: a
// non-'always'-polling provider's background refresh only scans top-level
// context tasks (poll-issue-updates.effects.ts), so a nested issue subtask
// may not get picked up by automatic polling - manual "Update issue data"
// still works regardless of nesting.
export const canConvertTaskToSubTask = (task: ConvertibleTaskFields): boolean =>
  !task.parentId &&
  !task.subTaskIds?.length &&
  !task.repeatCfgId &&
  !task.dueWithTime &&
  !task.reminderId &&
  !task.remindAt;

/**
 * Whether a `convertToSubTask` op may be applied to the given (already
 * looked-up) task and target parent. Used by BOTH the section and crud
 * meta-reducers so their guards stay in lock-step — if they diverge, one
 * reducer can strip the task from its section while the other leaves it
 * top-level. Rejects a missing target, self-nesting, and nesting under a task
 * that is itself a subtask (the UI renders only two levels, so deeper nesting
 * would orphan the task and leave parent time aggregation stale).
 */
export const canApplyConvertToSubTask = (
  task: (ConvertibleTaskFields & Pick<Task, 'id'>) | undefined,
  targetParent: Pick<Task, 'id' | 'parentId'> | undefined,
): boolean =>
  !!task &&
  !!targetParent &&
  task.id !== targetParent.id &&
  !targetParent.parentId &&
  canConvertTaskToSubTask(task);
