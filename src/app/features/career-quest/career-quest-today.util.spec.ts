import { buildTodayPlan } from './career-quest-today.util';
import { CAREER_SKILLS } from './career-quest.catalog';
import { CareerQuest, CareerQuestState } from './career-quest.model';

const quest = (
  id: string,
  status: CareerQuest['status'],
  week: number,
  extra: Partial<CareerQuest> = {},
): CareerQuest =>
  ({
    id,
    title: id,
    status,
    week,
    type: 'quest',
    skillIds: ['PY-02'],
    ...extra,
  }) as CareerQuest;

const PY = 'PY-02';

const state = (quests: CareerQuest[]): CareerQuestState => ({
  skills: { [PY]: { level: 1, provisional: true } },
  evidence: [],
  quests,
  focus: ['PY-02'],
  seededAt: 0,
});

describe('buildTodayPlan', () => {
  it('continues the quest already in progress first', () => {
    const plan = buildTodayPlan(
      state([quest('q-w1-python-entry', 'todo', 1), quest('q-w2-x', 'doing', 2)]),
      CAREER_SKILLS,
    );
    expect(plan.primary.kind).toBe('continue');
    expect(plan.primary.quest?.id).toBe('q-w2-x');
  });

  it('otherwise points to the next ungraded entrance test', () => {
    const plan = buildTodayPlan(
      state([quest('q-w1-sql-entry', 'todo', 1), quest('q-w2-x', 'todo', 2)]),
      CAREER_SKILLS,
    );
    expect(plan.primary.kind).toBe('entry-test');
    expect(plan.primary.quest?.id).toBe('q-w1-sql-entry');
  });

  it('then the next quest of a skill in focus, and lists what is missing to level up', () => {
    const plan = buildTodayPlan(
      state([
        quest('q-w1-sql-entry', 'done', 1, { gradedAt: 1 }),
        quest('q-w2-x', 'todo', 2),
      ]),
      CAREER_SKILLS,
    );
    expect(plan.primary.kind).toBe('next-quest');
    expect(plan.focus[0].skill.id).toBe('PY-02');
    expect(plan.focus[0].nextLevel).toBe(2);
    expect(plan.focus[0].missing.length).toBe(3);
    expect(plan.focus[0].quest?.id).toBe('q-w2-x');
  });
});
