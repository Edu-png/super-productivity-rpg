import { Task } from '../tasks/task.model';
import {
  RpgContract,
  RpgMedalTier,
  RpgProfileState,
} from '../rpg-profile/rpg-profile.model';

const HOUR_MS = 60 * 60 * 1000;

export interface RpgReportRange {
  /** Inclusive YYYY-MM-DD bounds. */
  startDay: string;
  endDay: string;
  startMs: number;
  /** Exclusive: start of the day after endDay. */
  endMs: number;
}

export interface RpgReportProject {
  id: string;
  title: string;
  color?: string;
}

export interface RpgReportBar {
  id: string;
  label: string;
  hours: number;
  color?: string;
}

export interface RpgReportPenaltyRow {
  title: string;
  count: number;
  xp: number;
  coins: number;
  money: number;
}

export interface RpgReportMedal {
  title: string;
  /** null for annual goals, which have no rarity. */
  tier: RpgMedalTier | null;
  isUpgrade: boolean;
  xp: number;
  gold: number;
}

export interface RpgReport {
  totalHours: number;
  tasksDone: number;
  xpEarned: number;
  hoursByProject: RpgReportBar[];
  hoursByAttribute: RpgReportBar[];
  /** Per day for ranges up to 31 days, per month beyond that. */
  timeline: RpgReportBar[];
  penalties: RpgReportPenaltyRow[];
  penaltyTotals: RpgReportPenaltyRow;
  contractsWon: RpgContract[];
  contractsLost: RpgContract[];
  medals: RpgReportMedal[];
  moneyAdded: number;
  moneyTransferred: number;
}

const MONTH_LABELS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

const inRange = (at: number | undefined, range: RpgReportRange): boolean =>
  typeof at === 'number' && at >= range.startMs && at < range.endMs;

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** All YYYY-MM-DD days in the inclusive range. */
export const daysInRange = (range: RpgReportRange): string[] => {
  const days: string[] = [];
  const [y, m, d] = range.startDay.split('-').map(Number);
  const cursor = new Date(y, m - 1, d);
  for (let i = 0; i < 400; i++) {
    const day = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (day > range.endDay) break;
    days.push(day);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

export const buildRpgReport = (input: {
  range: RpgReportRange;
  tasks: Task[];
  projects: RpgReportProject[];
  state: RpgProfileState;
  monthlyMedalTitles: Record<string, string>;
  /** Attribute id (core or custom) -> display label. */
  attributeLabels: Record<string, string>;
  /** Report for this character only: tasks credited to another character are skipped. */
  characterId: string;
  taskOwnerIds: Record<string, string>;
  xpMultiplier: number;
}): RpgReport => {
  const { range, tasks, projects, state } = input;
  const days = daysInRange(range);
  const isDaily = days.length <= 31;

  // ---- hours ----
  const hoursByProjectMs = new Map<string, number>();
  const timelineMs = new Map<string, number>();
  let totalMs = 0;
  let tasksDone = 0;
  for (const task of tasks) {
    // Tasks are shared across characters; each one is credited to whoever was
    // active when it was completed. Uncredited (still open) tasks count for all.
    const owner =
      input.taskOwnerIds[task.parentId ?? task.id] ?? input.taskOwnerIds[task.id];
    if (owner && owner !== input.characterId) continue;
    if (task.isDone && inRange(task.doneOn, range) && !task.subTaskIds.length) {
      tasksDone++;
    }
    // A parent's timeSpentOnDay already includes its subtasks' time.
    if (task.parentId) continue;
    for (const [day, spent] of Object.entries(task.timeSpentOnDay ?? {})) {
      if (day < range.startDay || day > range.endDay || !spent) continue;
      totalMs += spent;
      const projectKey = task.projectId || '';
      hoursByProjectMs.set(projectKey, (hoursByProjectMs.get(projectKey) ?? 0) + spent);
      const bucket = isDaily ? day : day.slice(0, 7);
      timelineMs.set(bucket, (timelineMs.get(bucket) ?? 0) + spent);
    }
  }

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const hoursByProject = [...hoursByProjectMs.entries()]
    .map(([id, ms]) => ({
      id: id || 'none',
      label: projectById.get(id)?.title ?? 'Sem projeto',
      color: projectById.get(id)?.color,
      hours: round1(ms / HOUR_MS),
    }))
    .filter((bar) => bar.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  const attributeMs = new Map<string, number>();
  for (const [projectId, ms] of hoursByProjectMs) {
    const attribute = state.projectAttributes[projectId];
    if (!attribute || !input.attributeLabels[attribute]) continue;
    attributeMs.set(attribute, (attributeMs.get(attribute) ?? 0) + ms);
  }
  const hoursByAttribute = [...attributeMs.entries()]
    .map(([id, ms]) => ({
      id,
      label: input.attributeLabels[id],
      hours: round1(ms / HOUR_MS),
    }))
    .filter((bar) => bar.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  const buckets = isDaily ? days : [...new Set(days.map((day) => day.slice(0, 7)))];
  const timeline = buckets.map((bucket) => {
    const [y, m, d] = bucket.split('-');
    return {
      id: bucket,
      label: isDaily ? `${d}/${m}` : `${MONTH_LABELS[Number(m) - 1]}/${y.slice(2)}`,
      hours: round1((timelineMs.get(bucket) ?? 0) / HOUR_MS),
    };
  });

  // ---- XP ----
  const baseXp = Object.values(state.xpLedger)
    .filter((entry) => inRange(entry.earnedAt, range))
    .reduce((sum, entry) => sum + entry.xp, 0);

  // ---- penalties ----
  const penaltyRows = new Map<string, RpgReportPenaltyRow>();
  const addPenalty = (
    key: string,
    title: string,
    xp: number,
    coins: number,
    money: number,
  ): void => {
    const row = penaltyRows.get(key) ?? { title, count: 0, xp: 0, coins: 0, money: 0 };
    row.count++;
    row.xp += xp;
    row.coins += coins;
    row.money += money;
    penaltyRows.set(key, row);
  };
  for (const entry of state.penaltyLog ?? []) {
    if (!inRange(entry.at, range)) continue;
    addPenalty(entry.penaltyId, entry.title, entry.xp, entry.coins, entry.money);
  }
  for (const penalty of state.penalties) {
    const isFailedTask =
      !!penalty.sourceTaskId || penalty.title.startsWith('Não concluída: ');
    if (!isFailedTask || !inRange(penalty.createdAt, range)) continue;
    addPenalty(
      'failed-tasks',
      'Tarefas não concluídas',
      penalty.xpLoss,
      penalty.coinsLoss,
      0,
    );
  }
  const penalties = [...penaltyRows.values()].sort(
    (a, b) => b.count - a.count || b.money - a.money,
  );
  const penaltyTotals = penalties.reduce(
    (total, row) => ({
      ...total,
      count: total.count + row.count,
      xp: total.xp + row.xp,
      coins: total.coins + row.coins,
      money: total.money + row.money,
    }),
    { title: 'Total', count: 0, xp: 0, coins: 0, money: 0 },
  );

  // ---- contracts ----
  const resolved = (state.contracts ?? []).filter((contract) =>
    inRange(contract.resolvedAt, range),
  );
  const contractsWon = resolved.filter((contract) => contract.status === 'won');
  const contractsLost = resolved.filter((contract) => contract.status === 'lost');

  // ---- medals ----
  const medals: RpgReportMedal[] = [];
  const claims = state.trophyClaims;
  for (const [key, claim] of Object.entries(claims)) {
    if (!inRange(claim.claimedAt, range)) continue;
    if (key.startsWith('monthly:')) {
      const id = key.slice('monthly:'.length);
      medals.push({
        title: input.monthlyMedalTitles[id] ?? `Medalha ${id}`,
        tier: claims[`monthly-tier:${id}`]?.tier ?? 'bronze',
        isUpgrade: false,
        xp: claim.xp,
        gold: claim.gold,
      });
    } else if (key.startsWith('monthly-tier:')) {
      const id = key.slice('monthly-tier:'.length);
      // Already shown with its final tier when the base claim is in the same period.
      if (inRange(claims[`monthly:${id}`]?.claimedAt, range)) {
        const base = medals.find(
          (medal) => medal.title === (input.monthlyMedalTitles[id] ?? `Medalha ${id}`),
        );
        if (base) {
          base.xp += claim.xp;
          base.gold += claim.gold;
          continue;
        }
      }
      medals.push({
        title: input.monthlyMedalTitles[id] ?? `Medalha ${id}`,
        tier: claim.tier ?? 'bronze',
        isUpgrade: true,
        xp: claim.xp,
        gold: claim.gold,
      });
    } else if (key.startsWith('annual:')) {
      const goal = state.annualGoals.find((item) => `annual:${item.id}` === key);
      medals.push({
        title: goal?.title ?? 'Meta anual',
        tier: null,
        isUpgrade: false,
        xp: claim.xp,
        gold: claim.gold,
      });
    }
  }

  // ---- money box ----
  const moneyAdded =
    penaltyTotals.money +
    contractsLost.reduce((sum, contract) => sum + contract.stakeMoney, 0);
  const moneyTransferred = (state.penaltyMoneyTransfers ?? [])
    .filter((transfer) => inRange(transfer.at, range))
    .reduce((sum, transfer) => sum + transfer.amount, 0);

  return {
    totalHours: round1(totalMs / HOUR_MS),
    tasksDone,
    xpEarned: Math.round(baseXp * input.xpMultiplier),
    hoursByProject,
    hoursByAttribute,
    timeline,
    penalties,
    penaltyTotals,
    contractsWon,
    contractsLost,
    medals,
    moneyAdded: Math.round(moneyAdded * 100) / 100,
    moneyTransferred: Math.round(moneyTransferred * 100) / 100,
  };
};
