import {
  progressTowardTargets,
  promotionChecklist,
  skillGaps,
  unmetPrerequisites,
} from './career-quest.util';
import { CareerEvidence, CareerQuestState, CareerSkillDef } from './career-quest.model';

const skill = (id: string, target24: number, prereq: string[] = []): CareerSkillDef => ({
  id,
  attribute: 'technical',
  group: 'G',
  name: id,
  skillClass: 'core',
  target12: target24 - 1,
  target24,
  startMonth: 1,
  prerequisites: prereq.map((item) => {
    const [prereqId, level] = item.split(':');
    return { id: prereqId, level: Number(level) };
  }),
  criteria: ['1', '2', '3', '4', '5'],
});

const evidence = (
  level: number,
  kind: CareerEvidence['kind'],
  aiPolicy: CareerEvidence['aiPolicy'] = 'no-ai',
  passed?: boolean,
): CareerEvidence => ({
  id: `${kind}-${level}-${aiPolicy}`,
  skillId: 'PY',
  level,
  kind,
  title: kind,
  url: '',
  note: '',
  aiPolicy,
  passed,
  at: 0,
});

const state = (level: number, items: CareerEvidence[] = []): CareerQuestState => ({
  skills: { PY: { level, provisional: false }, SQL: { level: 1, provisional: false } },
  evidence: items,
  quests: [],
  seededAt: 0,
});

describe('promotionChecklist', () => {
  it('never promotes on a course alone: needs a passed test, an artifact and an explanation', () => {
    expect(promotionChecklist('PY', state(1, [evidence(2, 'artifact')]))?.ready).toBe(
      false,
    );
    const ready = promotionChecklist(
      'PY',
      state(1, [
        evidence(2, 'test', 'no-ai', true),
        evidence(2, 'artifact', 'ai-allowed'),
        evidence(2, 'explanation', 'ai-allowed'),
      ]),
    );
    expect(ready?.nextLevel).toBe(2);
    expect(ready?.ready).toBe(true);
  });

  it('ignores failed tests', () => {
    const list = promotionChecklist(
      'PY',
      state(1, [
        evidence(2, 'test', 'no-ai', false),
        evidence(2, 'artifact'),
        evidence(2, 'explanation'),
      ]),
    );
    expect(list?.test).toBe(false);
  });

  it('requires NO AI proof from Level 3 on', () => {
    const list = promotionChecklist(
      'PY',
      state(2, [
        evidence(3, 'test', 'ai-limited', true),
        evidence(3, 'artifact', 'ai-allowed'),
        evidence(3, 'explanation', 'ai-allowed'),
      ]),
    );
    expect(list?.noAiRequired).toBe(true);
    expect(list?.ready).toBe(false);
  });

  it('returns null at the top level', () => {
    expect(promotionChecklist('PY', state(5))).toBeNull();
  });
});

describe('prerequisites, progress and gaps', () => {
  const skills = [skill('PY', 4), skill('SQL', 4), skill('API', 3, ['PY:3', 'SQL:1'])];

  it('lists only unmet prerequisites', () => {
    expect(unmetPrerequisites(skills[2], state(2))).toEqual([
      { id: 'PY', level: 3, current: 2 },
    ]);
  });

  it('measures progress toward the 24-month targets', () => {
    // PY 2/4 + SQL 1/4 + API 0/3 = 3/11
    expect(progressTowardTargets(skills, state(2))).toBe(27);
  });

  it('sorts gaps by distance to the target', () => {
    expect(skillGaps(skills, state(2)).map((row) => [row.skill.id, row.gap24])).toEqual([
      ['API', 3],
      ['SQL', 3],
      ['PY', 2],
    ]);
  });
});
