import { parseModelJson } from './parse-model-json';

describe('parseModelJson', () => {
  it('parses bare JSON', () => {
    expect(parseModelJson<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });

  it('parses a fenced answer whose strings hold their own code fences', () => {
    const answer =
      '```json\n{"questions": [{"question": "Rode:\\n```python\\nprint(1)\\n```"}]}\n```';
    expect(parseModelJson<{ questions: unknown[] }>(answer).questions.length).toBe(1);
  });

  it('parses JSON with a sentence around it', () => {
    expect(parseModelJson('Aqui está o quiz:\n[{"x": 2}]\nBons estudos!')).toEqual([
      { x: 2 },
    ]);
  });

  it('throws when there is no JSON at all', () => {
    let failed = false;
    try {
      parseModelJson('sem json aqui');
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});
