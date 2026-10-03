import {
  CareerAttribute,
  CareerEvidence,
  CareerGradingGroup,
  CareerHorizon,
  CareerSelfGrade,
  CareerSkillState,
  CareerQuestState,
  CareerSkillClass,
  CareerSkillDef,
} from './career-quest.model';

export const QUEST_REWARD: Record<string, { xp: number; coins: number }> = {
  micro: { xp: 30, coins: 5 },
  quest: { xp: 80, coins: 15 },
  project: { xp: 250, coins: 50 },
  boss: { xp: 800, coins: 150 },
};

/** XP for reaching a level, scaled with the level. */
export const promotionReward = (level: number): { xp: number; coins: number } => ({
  xp: level * 100,
  coins: level * 20,
});

export const skillLevel = (state: CareerQuestState, skillId: string): number =>
  state.skills[skillId]?.level ?? 0;

/** Prerequisites not yet met ("DB-02 precisa de L2, está em L1"). */
export const unmetPrerequisites = (
  skill: CareerSkillDef,
  state: CareerQuestState,
): { id: string; level: number; current: number }[] =>
  skill.prerequisites
    .map((prereq) => ({ ...prereq, current: skillLevel(state, prereq.id) }))
    .filter((prereq) => prereq.current < prereq.level);

export interface PromotionChecklist {
  nextLevel: number;
  test: boolean;
  artifact: boolean;
  explanation: boolean;
  /** From Level 3 on, the proof must have been produced without AI generating code. */
  noAiRequired: boolean;
  noAi: boolean;
  /** From Level 3 on, prerequisites must be met to be promoted (studying is never blocked). */
  prereqsRequired: boolean;
  prereqsOk: boolean;
  ready: boolean;
}

/**
 * What's still missing to move a skill one level up. Finishing a course never
 * counts: a passed test, an artifact and an explanation at that level are required.
 */
export const promotionChecklist = (
  skillId: string,
  state: CareerQuestState,
  skill?: CareerSkillDef,
): PromotionChecklist | null => {
  const current = skillLevel(state, skillId);
  if (current >= 5) return null;
  const nextLevel = current + 1;
  const atLevel = state.evidence.filter(
    (item) => item.skillId === skillId && item.level === nextLevel,
  );
  const test = atLevel.some((item) => item.kind === 'test' && item.passed);
  const artifact = atLevel.some((item) => item.kind === 'artifact');
  const explanation = atLevel.some((item) => item.kind === 'explanation');
  const noAiRequired = nextLevel >= 3;
  const relevant = atLevel.filter(
    (item) => item.kind !== 'test' || item.passed,
  ) as CareerEvidence[];
  const noAi = !noAiRequired || relevant.some((item) => item.aiPolicy === 'no-ai');
  const prereqsRequired = nextLevel >= 3;
  const prereqsOk =
    !prereqsRequired || !skill || unmetPrerequisites(skill, state).length === 0;
  return {
    nextLevel,
    test,
    artifact,
    explanation,
    noAiRequired,
    noAi,
    prereqsRequired,
    prereqsOk,
    ready: test && artifact && explanation && noAi && prereqsOk,
  };
};

/** Share of the 24-month targets already reached (0–100), optionally per attribute. */
export const progressTowardTargets = (
  skills: CareerSkillDef[],
  state: CareerQuestState,
  attribute?: CareerAttribute,
): number => {
  const scoped = skills.filter((skill) => !attribute || skill.attribute === attribute);
  const target = scoped.reduce((sum, skill) => sum + skill.target24, 0);
  if (!target) return 0;
  const reached = scoped.reduce(
    (sum, skill) => sum + Math.min(skillLevel(state, skill.id), skill.target24),
    0,
  );
  return Math.round((reached / target) * 100);
};

/** Biggest distances between today and the international target profile. */
export const skillGaps = (
  skills: CareerSkillDef[],
  state: CareerQuestState,
): { skill: CareerSkillDef; current: number; gap12: number; gap24: number }[] =>
  skills
    .map((skill) => {
      const current = skillLevel(state, skill.id);
      return {
        skill,
        current,
        gap12: Math.max(0, skill.target12 - current),
        gap24: Math.max(0, skill.target24 - current),
      };
    })
    .filter((row) => row.gap24 > 0)
    .sort(
      (a, b) =>
        b.gap24 - a.gap24 ||
        a.skill.startMonth - b.skill.startMonth ||
        a.skill.id.localeCompare(b.skill.id),
    );

/** The player's NOW/NEXT/LATER for a skill (their override, else the catalog default). */
export const horizonOf = (
  skill: CareerSkillDef,
  state: CareerQuestState | null,
): CareerHorizon => state?.horizonOverrides?.[skill.id] ?? skill.horizon ?? 'later';

const IMPORTANCE: Record<CareerSkillClass, number> = {
  core: 4,
  important: 3,
  supporting: 2,
  awareness: 1,
};
const TIMING: Record<CareerHorizon, number> = { now: 3, next: 2, later: 1 };

/** Career Priority Score = Importance × Gap (to the 24-month target) × Timing. For ordering only. */
export const careerPriorityScore = (
  skill: CareerSkillDef,
  state: CareerQuestState,
): number => {
  const gap = Math.max(0, skill.target24 - skillLevel(state, skill.id));
  return IMPORTANCE[skill.skillClass] * gap * TIMING[horizonOf(skill, state)];
};

/** Active Focus: at most this many skills per attribute at once. */
export const FOCUS_LIMITS: Record<CareerAttribute, number> = {
  technical: 3,
  english: 1,
  evidence: 1,
  interview: 1,
};

/** Whether one more skill of this attribute can enter the Active Focus. */
export const canAddFocus = (
  skill: CareerSkillDef,
  state: CareerQuestState,
  allSkills: CareerSkillDef[],
): boolean => {
  const attributeOf = new Map(allSkills.map((item) => [item.id, item.attribute]));
  const inFocus = (state.focus ?? []).filter(
    (id) => attributeOf.get(id) === skill.attribute,
  ).length;
  return inFocus < FOCUS_LIMITS[skill.attribute];
};

/** Score of a self-graded group: valid items, how many were answered, and the verdict. */
export const gradeGroup = (
  group: CareerGradingGroup,
  answers: Record<string, CareerSelfGrade> | undefined,
): { valid: number; answered: number; total: number; passed: boolean } => {
  let valid = 0;
  let answered = 0;
  for (const item of group.items) {
    const answer = answers?.[item.id];
    if (!answer) continue;
    answered++;
    if (answer === 'solo' || (answer === 'doc' && group.countsDoc)) valid++;
  }
  return { valid, answered, total: group.items.length, passed: valid >= group.passMin };
};

/**
 * How a recorded test changes a skill. A passed test confirms the level (no
 * longer provisional); a failed test at or below the current level drops the
 * skill below the tested level - in doubt, the lower level wins. Passing a
 * level above the current one is evidence for promotion, not a promotion.
 */
export const applyTestResult = (
  current: CareerSkillState,
  testLevel: number,
  passed: boolean,
  now: number,
): CareerSkillState => {
  if (passed) return { ...current, provisional: false };
  if (testLevel <= current.level) {
    return { ...current, level: testLevel - 1, provisional: false, levelChangedAt: now };
  }
  return { ...current, provisional: false };
};
