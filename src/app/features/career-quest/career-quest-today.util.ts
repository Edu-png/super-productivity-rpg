import { CareerQuest, CareerQuestState, CareerSkillDef } from './career-quest.model';
import { promotionChecklist, skillLevel } from './career-quest.util';

export interface TodayFocusStep {
  skill: CareerSkillDef;
  current: number;
  /** Null once the skill is at L5. */
  nextLevel: number | null;
  /** What's still missing to move up, in plain words. */
  missing: string[];
  readyToPromote: boolean;
  /** Quest to work on for this skill (in progress first, then the next planned one). */
  quest: CareerQuest | null;
}

export interface TodayPlan {
  /** The single next action. */
  primary: {
    kind: 'continue' | 'entry-test' | 'next-quest' | 'promote' | 'none';
    text: string;
    quest: CareerQuest | null;
    skill: CareerSkillDef | null;
  };
  focus: TodayFocusStep[];
}

const isEntryTest = (quest: CareerQuest): boolean => quest.id.includes('-entry');

const byWeek = (a: CareerQuest, b: CareerQuest): number =>
  (a.week ?? 99) - (b.week ?? 99);

/** "What should I study today?" from the current Career Quest state. */
export const buildTodayPlan = (
  state: CareerQuestState,
  skills: CareerSkillDef[],
): TodayPlan => {
  const focusIds = state.focus ?? [];
  const focusSkills = focusIds
    .map((id) => skills.find((skill) => skill.id === id))
    .filter((skill): skill is CareerSkillDef => !!skill);
  const open = state.quests.filter(
    (quest) => quest.status !== 'done' && quest.type !== 'boss',
  );

  const focus: TodayFocusStep[] = focusSkills.map((skill) => {
    const current = skillLevel(state, skill.id);
    const check = promotionChecklist(skill.id, state, skill);
    const missing: string[] = [];
    if (check) {
      if (!check.test) missing.push(`passar num teste de L${check.nextLevel}`);
      if (!check.artifact) missing.push('um artefato (repo, query, projeto)');
      if (!check.explanation) missing.push('uma explicação gravada ou escrita');
      if (check.noAiRequired && !check.noAi) missing.push('provas feitas em NO AI');
      if (check.prereqsRequired && !check.prereqsOk) missing.push('pré-requisitos');
    }
    const forSkill = open.filter((quest) => quest.skillIds.includes(skill.id));
    const quest =
      forSkill.find((item) => item.status === 'doing') ??
      [...forSkill].sort(byWeek)[0] ??
      null;
    return {
      skill,
      current,
      nextLevel: check?.nextLevel ?? null,
      missing,
      readyToPromote: !!check?.ready,
      quest,
    };
  });

  const doing = open.filter((quest) => quest.status === 'doing').sort(byWeek)[0];
  const pendingEntry = state.quests
    .filter((quest) => isEntryTest(quest) && !quest.gradedAt)
    .sort(byWeek)[0];
  const ready = focus.find((step) => step.readyToPromote);
  const focusQuest = focus.find((step) => step.quest)?.quest;
  const anyNext = [...open].sort(byWeek)[0];

  let primary: TodayPlan['primary'];
  if (doing) {
    primary = {
      kind: 'continue',
      text: `Continue: ${doing.title}`,
      quest: doing,
      skill: null,
    };
  } else if (pendingEntry) {
    primary = {
      kind: 'entry-test',
      text: `Faça o ${pendingEntry.title} para descobrir seu nível real`,
      quest: pendingEntry,
      skill: null,
    };
  } else if (ready) {
    primary = {
      kind: 'promote',
      text: `${ready.skill.id} já tem tudo para subir para L${ready.nextLevel} — promova`,
      quest: null,
      skill: ready.skill,
    };
  } else if (focusQuest ?? anyNext) {
    const quest = (focusQuest ?? anyNext)!;
    primary = { kind: 'next-quest', text: `Comece: ${quest.title}`, quest, skill: null };
  } else {
    primary = {
      kind: 'none',
      text: 'Nenhuma quest aberta — crie a próxima para as suas skills em foco',
      quest: null,
      skill: null,
    };
  }
  return { primary, focus };
};
