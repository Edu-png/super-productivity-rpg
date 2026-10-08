import { Task } from '../tasks/task.model';
import {
  NO_PROJECT,
  WORK_DAILY_GOAL_MIN,
  WorkCardMeta,
  WorkColumnId,
  WorkDailySnapshot,
  WorkDoneEntry,
  WorkNote,
  WorkPriority,
  WorkProject,
  WorkTimeEntry,
} from './work-agenda.model';

/** Tasks imported by the GitHub/GitLab integrations (built-in or plugin). */
export const isGitIssueTask = (task: Pick<Task, 'issueType'>): boolean =>
  /git(hub|lab)/i.test(task.issueType ?? '');

/** Imported issues plus cards created in the tab, minus the ones removed from the board. */
export const isBoardTask = (
  task: Pick<Task, 'id' | 'issueType'>,
  cards: Record<string, WorkCardMeta>,
): boolean => {
  const meta = cards[task.id];
  if (meta?.isHidden) return false;
  return !!meta || isGitIssueTask(task);
};

/** A done task always sits in "Concluído"; otherwise where it was put (new cards start in the backlog). */
export const cardColumn = (
  task: Pick<Task, 'isDone'>,
  meta: WorkCardMeta | undefined,
): WorkColumnId => {
  if (task.isDone) return 'done';
  return meta?.columnId && meta.columnId !== 'done' ? meta.columnId : 'backlog';
};

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Where `query` was found for a card - its title, a note's text or the text
 * read from an attachment - as a short label, or null when it doesn't match.
 */
export const cardSearchMatch = (
  query: string,
  title: string,
  notes: WorkNote[],
): string | null => {
  const needle = normalize(query.trim());
  if (!needle) return '';
  if (normalize(title).includes(needle)) return 'título';
  for (const note of notes) {
    const day = note.day.split('-').reverse().slice(0, 2).join('/');
    if (normalize(note.text).includes(needle)) return `anotação de ${day}`;
    for (const attachment of note.attachments) {
      if (normalize(attachment.ocrText ?? '').includes(needle)) {
        return `texto lido em ${attachment.name} (${day})`;
      }
      if (normalize(attachment.name).includes(needle)) return `anexo ${attachment.name}`;
    }
  }
  return null;
};

/** Top-level, unfinished tasks planned for `today`, work blocks ("Trabalhar - Bloco I") first. */
export const todayBlockTasks = (
  tasks: Task[],
  today: string,
  dayOf: (ms: number) => string,
): Task[] => {
  const isWorkBlock = (task: Task): boolean => /trabalh|bloco/i.test(task.title);
  return tasks
    .filter(
      (task) =>
        !task.parentId &&
        !task.isDone &&
        (task.dueDay === today ||
          (!!task.dueWithTime && dayOf(task.dueWithTime) === today)),
    )
    .sort(
      (a, b) =>
        Number(isWorkBlock(b)) - Number(isWorkBlock(a)) ||
        (a.dueWithTime ?? 0) - (b.dueWithTime ?? 0) ||
        a.title.localeCompare(b.title),
    );
};

export interface DoneCardFacts {
  taskId: string;
  isDone: boolean;
  doneOn?: number | null;
  title: string;
  estimateMs: number;
  spentMs?: number;
  companyId?: string;
  projectId?: string;
  priority?: WorkPriority;
}

/**
 * Brings the finished-cards log in line with the cards still on the board:
 * done ones are (re)recorded, undone ones dropped. Tasks no longer present
 * (archived) keep their entry. Returns the same object when nothing changed.
 */
export const syncDoneLog = (
  log: Record<string, WorkDoneEntry>,
  cards: DoneCardFacts[],
  dayOf: (ms: number) => string,
): Record<string, WorkDoneEntry> => {
  let next = log;
  const set = (taskId: string, entry: WorkDoneEntry | null): void => {
    if (next === log) next = { ...log };
    if (entry) next[taskId] = entry;
    else delete next[taskId];
  };
  for (const card of cards) {
    const existing = log[card.taskId];
    if (!card.isDone) {
      if (existing) set(card.taskId, null);
      continue;
    }
    const entry: WorkDoneEntry = {
      day: dayOf(card.doneOn ?? Date.now()),
      title: card.title,
      estimateMin: Math.round(card.estimateMs / 60_000),
      ...(card.spentMs ? { spentMin: Math.round(card.spentMs / 60_000) } : {}),
      ...(card.companyId ? { companyId: card.companyId } : {}),
      ...(card.projectId ? { projectId: card.projectId } : {}),
      ...(card.priority ? { priority: card.priority } : {}),
    };
    if (JSON.stringify(existing) !== JSON.stringify(entry)) set(card.taskId, entry);
  }
  return next;
};

const shiftDay = (day: string, delta: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

export const addDays = shiftDay;

/** Cards finished and estimated minutes done, per day. */
export const doneByDay = (
  log: Record<string, WorkDoneEntry>,
): Map<string, { count: number; minutes: number; entries: WorkDoneEntry[] }> => {
  const days = new Map<
    string,
    { count: number; minutes: number; entries: WorkDoneEntry[] }
  >();
  for (const entry of Object.values(log)) {
    const day = days.get(entry.day) ?? { count: 0, minutes: 0, entries: [] };
    day.count++;
    day.minutes += entry.estimateMin;
    day.entries.push(entry);
    days.set(entry.day, day);
  }
  return days;
};

/** Monday-first weeks ending with the week of `today`, oldest first; days after today are null. */
export const heatmapWeeks = (today: string, weeks: number): (string | null)[][] => {
  const [y, m, d] = today.split('-').map(Number);
  const mondayOffset = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const earlierWeeksDays = (weeks - 1) * 7;
  const daysBack = mondayOffset + earlierWeeksDays;
  const firstMonday = shiftDay(today, -daysBack);
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (__, weekday) => {
      const offset = week * 7;
      const day = shiftDay(firstMonday, offset + weekday);
      return day <= today ? day : null;
    }),
  );
};

export interface SuggestionCardFacts {
  title: string;
  column: string;
  priority?: string;
  deadlineDay?: string | null;
  isDone: boolean;
  notes: WorkNote[];
}

/**
 * Plain-text digest of a company's cards for the suggestions prompt: open
 * cards first, each with its notes and the text read from attachments, cut
 * to `maxChars` so the request stays small.
 */
export const buildSuggestionContext = (
  cards: SuggestionCardFacts[],
  maxChars = 14_000,
): string => {
  const ordered = [...cards].sort((a, b) => Number(a.isDone) - Number(b.isDone));
  let text = '';
  for (const card of ordered) {
    const facts = [
      card.column,
      card.priority ? `urgência ${card.priority}` : '',
      card.deadlineDay ? `prazo ${card.deadlineDay}` : '',
    ].filter(Boolean);
    let block = `### ${card.title} (${facts.join(', ')})\n`;
    for (const note of card.notes) {
      const read = note.attachments
        .map((attachment) => attachment.ocrText?.trim())
        .filter(Boolean)
        .join('\n');
      const body = [note.text.trim(), read].filter(Boolean).join('\n');
      if (body) block += `- ${note.day}: ${body.replace(/\s+/g, ' ').slice(0, 1200)}\n`;
    }
    if (text.length + block.length > maxChars) break;
    text += `${block}\n`;
  }
  return text.trim();
};

/** The card's project: the one chosen on the card, else the one linked to its repo. */
export const cardProject = (
  task: Pick<Task, 'issueProviderId'>,
  meta: WorkCardMeta | undefined,
  projects: WorkProject[],
): WorkProject | undefined => {
  if (meta?.projectId === NO_PROJECT) return undefined;
  if (meta?.projectId) return projects.find((project) => project.id === meta.projectId);
  return task.issueProviderId
    ? projects.find((project) => project.issueProviderIds.includes(task.issueProviderId!))
    : undefined;
};

/** The company chosen on the card, else its project's company. */
export const cardCompanyId = (
  meta: WorkCardMeta | undefined,
  project: WorkProject | undefined,
): string | undefined => meta?.companyId ?? project?.companyId;

export interface TimeCardFacts {
  taskId: string;
  title: string;
  companyId?: string;
  projectId?: string;
  timeSpentOnDay?: Record<string, number> | null;
}

/**
 * Copies each card's tracked time (whole minutes per day) into the time log,
 * so the timesheet keeps it after the task is archived. Returns the same
 * object when nothing changed.
 */
export const syncTimeLog = (
  log: Record<string, WorkTimeEntry>,
  cards: TimeCardFacts[],
): Record<string, WorkTimeEntry> => {
  let next = log;
  for (const card of cards) {
    const minutesByDay: Record<string, number> = {};
    for (const [day, ms] of Object.entries(card.timeSpentOnDay ?? {})) {
      const minutes = Math.floor(ms / 60_000);
      if (minutes > 0) minutesByDay[day] = minutes;
    }
    const existing = log[card.taskId];
    if (!existing && !Object.keys(minutesByDay).length) continue;
    const entry: WorkTimeEntry = {
      title: card.title,
      ...(card.companyId ? { companyId: card.companyId } : {}),
      ...(card.projectId ? { projectId: card.projectId } : {}),
      minutesByDay,
    };
    if (JSON.stringify(existing) === JSON.stringify(entry)) continue;
    if (next === log) next = { ...log };
    next[card.taskId] = entry;
  }
  return next;
};

export interface TimesheetRow {
  taskId: string;
  title: string;
  companyId?: string;
  projectId?: string;
  minutes: number;
  minutesByDay: Record<string, number>;
}

/** Cards with tracked time in `month` (YYYY-MM), most time first. */
export const timesheetRows = (
  log: Record<string, WorkTimeEntry>,
  month: string,
): TimesheetRow[] =>
  Object.entries(log)
    .map(([taskId, entry]) => {
      const minutesByDay = Object.fromEntries(
        Object.entries(entry.minutesByDay).filter(([day]) => day.startsWith(month)),
      );
      return {
        taskId,
        title: entry.title,
        companyId: entry.companyId,
        projectId: entry.projectId,
        minutes: Object.values(minutesByDay).reduce((sum, value) => sum + value, 0),
        minutesByDay,
      };
    })
    .filter((row) => row.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

const csvCell = (value: string | number): string => {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** One line per card and day, `;`-separated (opens straight in Excel pt-BR). */
export const timesheetCsv = (
  rows: TimesheetRow[],
  companyName: (id?: string) => string,
  projectName: (id?: string) => string,
): string => {
  const lines = [['Data', 'Categoria', 'Projeto', 'Card', 'Horas'].join(';')];
  for (const row of rows) {
    for (const [day, minutes] of Object.entries(row.minutesByDay).sort()) {
      lines.push(
        [
          day.split('-').reverse().join('/'),
          companyName(row.companyId),
          projectName(row.projectId),
          row.title,
          (minutes / 60).toFixed(2).replace('.', ','),
        ]
          .map(csvCell)
          .join(';'),
      );
    }
  }
  return lines.join('\n');
};

export interface EstimateAccuracy {
  key: string;
  count: number;
  /** Tracked / estimated time: 1.4 = takes 40% longer than estimated. */
  ratio: number;
}

/**
 * How tracked time compares to the estimate, per group (company or project),
 * over finished cards that have both. Groups with fewer than `minCount`
 * cards are left out - too little to learn from.
 */
export const estimateAccuracy = (
  entries: WorkDoneEntry[],
  keyOf: (entry: WorkDoneEntry) => string | undefined,
  minCount = 3,
): EstimateAccuracy[] => {
  const groups = new Map<string, { count: number; estimate: number; spent: number }>();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (!key || !entry.estimateMin || !entry.spentMin) continue;
    const group = groups.get(key) ?? { count: 0, estimate: 0, spent: 0 };
    group.count++;
    group.estimate += entry.estimateMin;
    group.spent += entry.spentMin;
    groups.set(key, group);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.count >= minCount)
    .map(([key, group]) => ({
      key,
      count: group.count,
      ratio: Math.round((group.spent / group.estimate) * 100) / 100,
    }))
    .sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1));
};

/**
 * Records today's board state; when "Revisão" goes from having cards to
 * empty, today counts as a day it was cleared. Returns null when nothing changed.
 */
export const nextDailySnapshot = (
  snapshots: Record<string, WorkDailySnapshot>,
  clearedDays: string[],
  today: string,
  current: WorkDailySnapshot,
): { snapshots: Record<string, WorkDailySnapshot>; clearedDays: string[] } | null => {
  const previousDay = Object.keys(snapshots)
    .filter((day) => day <= today)
    .sort()
    .at(-1);
  const previous = previousDay ? snapshots[previousDay] : undefined;
  if (
    previousDay === today &&
    previous?.reviewCount === current.reviewCount &&
    previous.urgentOpen === current.urgentOpen
  ) {
    return null;
  }
  const cleared =
    !!previous &&
    previous.reviewCount > 0 &&
    current.reviewCount === 0 &&
    !clearedDays.includes(today);
  return {
    snapshots: { ...snapshots, [today]: current },
    clearedDays: cleared ? [...clearedDays, today] : clearedDays,
  };
};

export interface WorkDayStats {
  /** Estimated minutes of cards finished that day. */
  estimatedMin: number;
  goalMet: boolean;
  urgentDone: number;
  /** Urgent cards still open at the end of the day (carried from the last snapshot). */
  urgentOpen: number;
  reviewCleared: boolean;
}

/** Per-day work facts the RPG missions read, from `since` to `today`. */
export const workDayStats = (
  doneLog: Record<string, WorkDoneEntry>,
  snapshots: Record<string, WorkDailySnapshot>,
  clearedDays: string[],
  since: string,
  today: string,
): Record<string, WorkDayStats> => {
  const byDay = doneByDay(doneLog);
  const cleared = new Set(clearedDays);
  const stats: Record<string, WorkDayStats> = {};
  let urgentOpen = 0;
  const snapshotDays = Object.keys(snapshots).sort();
  for (const day of snapshotDays) {
    if (day < since) urgentOpen = snapshots[day].urgentOpen;
  }
  for (let day = since; day <= today; day = shiftDay(day, 1)) {
    if (snapshots[day]) urgentOpen = snapshots[day].urgentOpen;
    const done = byDay.get(day);
    const estimatedMin = done?.minutes ?? 0;
    stats[day] = {
      estimatedMin,
      goalMet: estimatedMin >= WORK_DAILY_GOAL_MIN,
      urgentDone:
        done?.entries.filter((entry) => entry.priority === 'urgent').length ?? 0,
      urgentOpen,
      reviewCleared: cleared.has(day),
    };
  }
  return stats;
};

const STOPWORDS = new Set(
  'para com sem como mais menos sobre entre quando onde porque fazer feito ainda essa esse isso esta este isto pelo pela pelos pelas numa num uma umas uns dos das nos nas aos foram será seria teste tarefa card'.split(
    ' ',
  ),
);

const keywords = (text: string): Set<string> =>
  new Set(
    normalize(text)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word)),
  );

/**
 * Academia topics whose title shares a meaningful word with the card's text,
 * best matches first - a quick local pass before asking the AI.
 */
export const matchAcademyTopics = <T extends { id: string; title: string }>(
  cardText: string,
  topics: T[],
  limit = 5,
): T[] => {
  const words = keywords(cardText);
  if (!words.size) return [];
  return topics
    .map((topic) => ({
      topic,
      hits: [...keywords(topic.title)].filter((word) => words.has(word)).length,
    }))
    .filter((row) => row.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.topic.title.localeCompare(b.topic.title))
    .slice(0, limit)
    .map((row) => row.topic);
};

export interface DayListCard {
  task: Pick<
    Task,
    'id' | 'isDone' | 'doneOn' | 'dueDay' | 'dueWithTime' | 'deadlineDay' | 'title'
  >;
  meta?: WorkCardMeta;
}

const PRIORITY_ORDER: Record<WorkPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Cards of one day for the daily list: planned for it (by time, then
 * urgency), due that day, finished that day and - when looking at today -
 * earlier planned ones still open.
 */
export const dayListGroups = <T extends DayListCard>(
  cards: T[],
  day: string,
  today: string,
  dayOf: (ms: number) => string,
): { overdue: T[]; planned: T[]; deadline: T[]; done: T[] } => {
  const plannedDay = (card: T): string | null =>
    card.task.dueDay ?? (card.task.dueWithTime ? dayOf(card.task.dueWithTime) : null);
  const bySchedule = (a: T, b: T): number =>
    (a.task.dueWithTime ?? Number.MAX_SAFE_INTEGER) -
      (b.task.dueWithTime ?? Number.MAX_SAFE_INTEGER) ||
    PRIORITY_ORDER[a.meta?.priority ?? 'low'] -
      PRIORITY_ORDER[b.meta?.priority ?? 'low'] ||
    a.task.title.localeCompare(b.task.title);
  const open = cards.filter((card) => !card.task.isDone);
  const planned = open.filter((card) => plannedDay(card) === day).sort(bySchedule);
  const plannedIds = new Set(planned.map((card) => card.task.id));
  const deadline = open
    .filter((card) => card.task.deadlineDay === day && !plannedIds.has(card.task.id))
    .sort(bySchedule);
  const deadlineIds = new Set(deadline.map((card) => card.task.id));
  const overdue =
    day === today
      ? open
          .filter((card) => {
            const planDay = plannedDay(card);
            return (
              !!planDay &&
              planDay < day &&
              !plannedIds.has(card.task.id) &&
              !deadlineIds.has(card.task.id)
            );
          })
          .sort(bySchedule)
      : [];
  const done = cards.filter(
    (card) => card.task.isDone && !!card.task.doneOn && dayOf(card.task.doneOn) === day,
  );
  return { overdue, planned, deadline, done };
};

/**
 * Cards of a month (YYYY-MM) for the monthly list, grouped by day: a card sits
 * on the day it was finished, else the day it's planned for, else its
 * deadline. Days without cards are left out.
 */
export const monthListGroups = <T extends DayListCard>(
  cards: T[],
  month: string,
  dayOf: (ms: number) => string,
): { day: string; cards: T[] }[] => {
  const days = new Map<string, T[]>();
  for (const card of cards) {
    const { task } = card;
    const day =
      task.isDone && task.doneOn
        ? dayOf(task.doneOn)
        : (task.dueDay ??
          (task.dueWithTime ? dayOf(task.dueWithTime) : null) ??
          task.deadlineDay ??
          null);
    if (!day?.startsWith(month)) continue;
    days.set(day, [...(days.get(day) ?? []), card]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayCards]) => ({
      day,
      cards: dayCards.sort(
        (a, b) =>
          Number(a.task.isDone) - Number(b.task.isDone) ||
          (a.task.dueWithTime ?? Number.MAX_SAFE_INTEGER) -
            (b.task.dueWithTime ?? Number.MAX_SAFE_INTEGER) ||
          a.task.title.localeCompare(b.task.title),
      ),
    }));
};

export const isWeekend = (day: string): boolean => {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  return weekday === 0 || weekday === 6;
};

/**
 * The last `count` working days up to `endDay`, oldest first. Weekends are
 * skipped unless `hasWork` says something was done on them.
 */
export const workingDaysBack = (
  endDay: string,
  count: number,
  hasWork: (day: string) => boolean,
): string[] => {
  const days: string[] = [];
  for (let day = endDay; days.length < count; day = shiftDay(day, -1)) {
    if (!isWeekend(day) || hasWork(day)) days.unshift(day);
  }
  return days;
};
