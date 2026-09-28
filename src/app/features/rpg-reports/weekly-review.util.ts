import { StudySession } from '../academy-arcana/domain/academy.models';
import { RpgReport, RpgReportRange } from './rpg-report.util';

export const WEEKLY_REVIEW_REWARD = { xp: 100, coins: 20 };

export interface WeekDistractionSummary {
  count: number;
  blocks: number;
  minutes: number;
  topCategory: string | null;
}

export interface ReviewHighlight {
  icon: string;
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export const formatHours = (hours: number): string => {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return minutes ? `${whole}h ${minutes}min` : `${whole}h`;
};

const formatMoney = (value: number): string =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const percentChange = (current: number, previous: number): number | null =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

/** Distractions logged in Academia Arcana blocks that started inside the range. */
export const summarizeWeekDistractions = (
  sessions: StudySession[],
  range: RpgReportRange,
): WeekDistractionSummary => {
  const categories = new Map<string, number>();
  let count = 0;
  let blocks = 0;
  let minutes = 0;
  for (const session of sessions) {
    if (!Array.isArray(session.distractions)) continue;
    if (session.status !== 'completed' && session.status !== 'active') continue;
    if (session.startedAt < range.startMs || session.startedAt >= range.endMs) continue;
    blocks++;
    minutes += Math.max(1, session.actualMinutes || session.plannedMinutes);
    for (const distraction of session.distractions) {
      count++;
      categories.set(
        distraction.category,
        (categories.get(distraction.category) ?? 0) + 1,
      );
    }
  }
  const top = [...categories.entries()].sort((a, b) => b[1] - a[1])[0];
  return { count, blocks, minutes, topCategory: top ? top[0] : null };
};

/** Auto-generated "what happened this week" lines, compared with the previous week. */
export const buildReviewHighlights = (input: {
  report: RpgReport;
  previous: RpgReport;
  distractions: WeekDistractionSummary;
  previousDistractions: WeekDistractionSummary;
}): ReviewHighlight[] => {
  const { report, previous, distractions, previousDistractions } = input;
  const highlights: ReviewHighlight[] = [];

  const hoursChange = percentChange(report.totalHours, previous.totalHours);
  highlights.push({
    icon: 'schedule',
    text:
      `${formatHours(report.totalHours)} registradas` +
      (hoursChange === null
        ? ''
        : ` (${hoursChange >= 0 ? '+' : ''}${hoursChange}% vs. semana anterior)`),
    tone: hoursChange === null ? 'neutral' : hoursChange >= 0 ? 'good' : 'bad',
  });

  const bestDay = [...report.timeline].sort((a, b) => b.hours - a.hours)[0];
  if (bestDay && bestDay.hours > 0) {
    const [y, m, d] = bestDay.id.split('-').map(Number);
    const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
    highlights.push({
      icon: 'emoji_events',
      text: `Melhor dia: ${weekday} ${bestDay.label} (${formatHours(bestDay.hours)})`,
      tone: 'good',
    });
  }

  const topProject = report.hoursByProject[0];
  if (topProject) {
    highlights.push({
      icon: 'folder',
      text: `Projeto principal: ${topProject.label} (${formatHours(topProject.hours)})`,
      tone: 'neutral',
    });
  }

  highlights.push({
    icon: 'task_alt',
    text: `${report.tasksDone} tarefas concluídas · ${report.xpEarned.toLocaleString('pt-BR')} XP`,
    tone: report.tasksDone >= previous.tasksDone ? 'good' : 'neutral',
  });

  if (report.penaltyTotals.count === 0) {
    highlights.push({ icon: 'verified', text: 'Semana sem punições 🎉', tone: 'good' });
  } else {
    const top = report.penalties[0];
    highlights.push({
      icon: 'gavel',
      text: `${report.penaltyTotals.count} punições · mais frequente: ${top.title} (${top.count}×)`,
      tone: 'bad',
    });
  }

  if (distractions.blocks > 0) {
    const perHour = Math.round((distractions.count / distractions.minutes) * 600) / 10;
    const previousPerHour = previousDistractions.minutes
      ? (previousDistractions.count / previousDistractions.minutes) * 60
      : null;
    highlights.push({
      icon: 'psychology_alt',
      text:
        `${distractions.count} distrações em ${distractions.blocks} blocos de estudo ` +
        `(${perHour.toLocaleString('pt-BR')}/h)` +
        (distractions.topCategory ? ` · principal: ${distractions.topCategory}` : ''),
      tone:
        previousPerHour === null
          ? 'neutral'
          : perHour <= previousPerHour
            ? 'good'
            : 'bad',
    });
  }

  if (report.contractsWon.length || report.contractsLost.length) {
    highlights.push({
      icon: 'history_edu',
      text: `Contratos: ${report.contractsWon.length} cumpridos · ${report.contractsLost.length} quebrados`,
      tone: report.contractsLost.length ? 'bad' : 'good',
    });
  }

  if (report.moneyAdded > 0) {
    highlights.push({
      icon: 'savings',
      text: `${formatMoney(report.moneyAdded)} para a caixinha de punições`,
      tone: 'bad',
    });
  }

  if (report.medals.length) {
    highlights.push({
      icon: 'military_tech',
      text: `Medalhas: ${report.medals.map((medal) => medal.title).join(', ')}`,
      tone: 'good',
    });
  }

  return highlights;
};
