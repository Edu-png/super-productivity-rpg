import { CAREER_CHALLENGES } from './career-quest.challenges';
import { CAREER_QUEST_CONTENT } from './career-quest.content';
import { CareerContentBlock } from './career-quest.model';

const challengeIds = (questId: string): string[] =>
  (CAREER_QUEST_CONTENT.get(questId)?.promptContent.sections ?? [])
    .flatMap((section) => section.blocks)
    .filter(
      (block): block is Extract<CareerContentBlock, { type: 'challenge' }> =>
        block.type === 'challenge',
    )
    .map((block) => block.challenge.id);

describe('career-quest.challenges', () => {
  it('attaches every runnable exercise to its entry test', () => {
    expect(challengeIds('q-w1-python-entry')).toEqual([
      'cq-py-1',
      'cq-py-2',
      'cq-py-3',
      'cq-py-4',
      'cq-py-5',
    ]);
    expect(challengeIds('q-w1-sql-entry')).toEqual([
      'cq-sql-1',
      'cq-sql-2',
      'cq-sql-3',
      'cq-sql-4',
      'cq-sql-5',
      'cq-sql-6',
      'cq-sql-7',
      'cq-sql-8',
    ]);
  });

  it('gives every exercise tests with an expected output', () => {
    for (const challenge of CAREER_CHALLENGES) {
      expect(challenge.tests.length > 0).toBe(true);
      expect(challenge.tests.every((test) => test.expected.trim().length > 0)).toBe(true);
    }
  });
});
