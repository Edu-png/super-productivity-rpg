import { applyTestResult, gradeGroup } from './career-quest.util';
import { CAREER_QUEST_CONTENT } from './career-quest.content';
import { CareerGradingGroup } from './career-quest.model';

const group = (countsDoc: boolean): CareerGradingGroup => ({
  skillId: 'PY-02',
  level: 2,
  label: 'x',
  passMin: 2,
  countsDoc,
  items: [
    { id: 'a', label: 'a', criteria: [] },
    { id: 'b', label: 'b', criteria: [] },
    { id: 'c', label: 'c', criteria: [] },
  ],
});

describe('self-grading', () => {
  it('counts "with docs" only when the test allows it', () => {
    const answers = { a: 'solo', b: 'doc', c: 'fail' } as const;
    expect(gradeGroup(group(true), answers)).toEqual({
      valid: 2,
      answered: 3,
      total: 3,
      passed: true,
    });
    expect(gradeGroup(group(false), answers).passed).toBe(false);
  });

  it('reports unanswered items', () => {
    expect(gradeGroup(group(true), { a: 'solo' }).answered).toBe(1);
  });

  it('defines grading for the three entrance tests with the documented pass rules', () => {
    const rules = ['q-w1-python-entry', 'q-w1-sql-entry', 'q-w1-git-linux-entry'].map(
      (id) =>
        CAREER_QUEST_CONTENT.get(id)!.grading!.groups.map(
          (item) =>
            `${item.skillId}:${item.passMin}/${item.items.length}:${item.countsDoc}`,
        ),
    );
    expect(rules).toEqual([
      ['PY-02:4/5:true'],
      ['DB-02:6/8:true'],
      ['SE-01:4/5:false', 'LX-01:5/6:false'],
    ]);
  });
});

describe('applyTestResult', () => {
  it('a pass confirms the provisional level', () => {
    expect(applyTestResult({ level: 2, provisional: true }, 2, true, 1)).toEqual({
      level: 2,
      provisional: false,
    });
  });

  it('a fail at or below the current level drops below the tested level', () => {
    expect(applyTestResult({ level: 2, provisional: true }, 2, false, 1)).toEqual({
      level: 1,
      provisional: false,
      levelChangedAt: 1,
    });
  });

  it('passing above the current level is evidence, not a promotion', () => {
    expect(applyTestResult({ level: 1, provisional: true }, 2, true, 1)).toEqual({
      level: 1,
      provisional: false,
    });
  });
});
