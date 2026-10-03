import { CAREER_SKILLS } from './career-quest.catalog';
import { CAREER_CAPSTONES } from './career-quest.capstones';
import { CAREER_QUEST_CONTENT } from './career-quest.content';
import { CAREER_SEED_QUESTS } from './career-quest.quests';
import { parseCareerMarkup } from './content/career-content-markup';
import { highlightCode } from './content/career-code-highlight';
import {
  canAddFocus,
  careerPriorityScore,
  horizonOf,
  promotionChecklist,
} from './career-quest.util';
import { CareerContent, CareerEvidence, CareerQuestState } from './career-quest.model';

const byId = new Map(CAREER_SKILLS.map((skill) => [skill.id, skill]));

/** Skill ids that existed before the consolidated evolution - none may disappear. */
const LEGACY_IDS = [
  ...[
    'PY-01',
    'PY-02',
    'PY-03',
    'PY-04',
    'PY-05',
    'PY-06',
    'PY-07',
    'PY-08',
    'PY-09',
    'PY-10',
    'PY-11',
  ],
  ...['SE-01', 'SE-02', 'SE-03', 'SE-04', 'SE-05', 'SE-06', 'SE-07', 'SE-08', 'SE-09'],
  ...['BE-01', 'BE-02', 'BE-03', 'BE-04', 'BE-05', 'BE-06', 'BE-07'],
  ...['DB-01', 'DB-02', 'DB-03', 'DB-04', 'DB-05', 'DB-06', 'DB-07'],
  ...[
    'LX-01',
    'LX-02',
    'LX-03',
    'LX-04',
    'LX-05',
    'DK-01',
    'DK-02',
    'DK-03',
    'DK-04',
    'DK-05',
  ],
  ...['DE-01', 'DE-02', 'DE-03', 'DE-04', 'DE-05', 'DE-06', 'DE-07', 'DE-08', 'DE-09'],
  ...[
    'CL-01',
    'CL-02',
    'CL-03',
    'CL-04',
    'CL-05',
    'CL-06',
    'CL-07',
    'CL-08',
    'CL-09',
    'CL-10',
  ],
  ...['ML-01', 'ML-02', 'ML-03', 'ML-04', 'ML-05', 'ML-06'],
  ...['AI-01', 'AI-02', 'AI-03', 'AI-04', 'AI-05', 'AI-06', 'AI-07', 'AI-08', 'AI-09'],
  ...[
    'AG-01',
    'AG-02',
    'AG-03',
    'AG-04',
    'AG-05',
    'AG-06',
    'AG-07',
    'AG-08',
    'AG-09',
    'AG-10',
  ],
  ...['DL-01', 'DL-02', 'DL-03', 'DL-04', 'DL-05', 'DL-06', 'DL-07'],
  ...['SD-01', 'SD-02', 'SD-03', 'SD-04', 'SD-05', 'SD-06', 'SD-07', 'BI-01', 'BI-02'],
  ...['EN-01', 'EN-09', 'EN-16', 'EV-01', 'EV-10', 'IN-01', 'IN-14'],
];

const state = (
  levels: Record<string, number>,
  extra: Partial<CareerQuestState> = {},
): CareerQuestState => ({
  skills: Object.fromEntries(
    Object.entries(levels).map(([id, level]) => [id, { level, provisional: false }]),
  ),
  evidence: [],
  quests: [],
  seededAt: 0,
  ...extra,
});

describe('catalog integrity', () => {
  it('keeps every existing skill', () => {
    expect(LEGACY_IDS.filter((id) => !byId.has(id))).toEqual([]);
  });

  it('adds the new blocks', () => {
    const groups = new Set(CAREER_SKILLS.map((skill) => skill.group));
    for (const group of [
      'Computer Science',
      'Networking / Web',
      'Security',
      'Observability',
      'Production / Deploy',
      'ML / AI Systems',
    ]) {
      expect(groups.has(group)).toBe(true);
    }
    expect(
      ['DE-10', 'DE-11', 'DE-12', 'DK-06', 'MAS-08', 'PR-08', 'SEC-07'].every((id) =>
        byId.has(id),
      ),
    ).toBe(true);
  });

  it('has unique ids, valid prerequisites, criteria and sane targets', () => {
    expect(new Set(CAREER_SKILLS.map((skill) => skill.id)).size).toBe(
      CAREER_SKILLS.length,
    );
    const problems: string[] = [];
    for (const skill of CAREER_SKILLS) {
      if (skill.criteria?.length !== 5) problems.push(`${skill.id}: criteria`);
      if (skill.target12 > skill.target24) problems.push(`${skill.id}: 12m > 24m`);
      if (skill.target24 > 5 || skill.target12 < 0) problems.push(`${skill.id}: range`);
      if (!['now', 'next', 'later'].includes(skill.horizon))
        problems.push(`${skill.id}: horizon`);
      for (const prereq of skill.prerequisites) {
        if (!byId.has(prereq.id))
          problems.push(`${skill.id}: unknown prereq ${prereq.id}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps L4 at 24 months on the central competences only', () => {
    const l4 = CAREER_SKILLS.filter((skill) => skill.target24 >= 4);
    const nonCore = l4.filter((skill) => skill.skillClass !== 'core');
    // English/Interview/Evidence keep their own L4 goals; technical L4 must be core.
    expect(
      nonCore.filter((skill) => skill.attribute === 'technical').map((s) => s.id),
    ).toEqual([]);
  });

  it('applies the requested examples', () => {
    expect([byId.get('PY-02')!.target12, byId.get('PY-02')!.target24]).toEqual([3, 4]);
    expect([byId.get('DE-09')!.target12, byId.get('DE-09')!.target24]).toEqual([1, 2]);
    expect([byId.get('DL-02')!.target12, byId.get('DL-02')!.target24]).toEqual([1, 2]);
    expect([byId.get('AG-07')!.target12, byId.get('AG-07')!.target24]).toEqual([1, 2]);
  });

  it('sets the initial NOW / NEXT / LATER', () => {
    expect(
      ['PY-01', 'PY-02', 'SE-01', 'LX-01'].map((id) => byId.get(id)!.horizon),
    ).toEqual(['now', 'now', 'now', 'now']);
    expect(
      ['PY-03', 'DB-02', 'DB-05', 'BE-01', 'BE-02', 'SE-03', 'DK-01'].every(
        (id) => byId.get(id)!.horizon === 'next',
      ),
    ).toBe(true);
    expect(
      ['DE-08', 'DE-09', 'CL-09', 'DL-06', 'AG-07', 'DK-06'].every(
        (id) => byId.get(id)!.horizon === 'later',
      ),
    ).toBe(true);
  });

  it('follows the requested dependency chains', () => {
    const requires = (id: string, prereqId: string): boolean =>
      byId.get(id)!.prerequisites.some((prereq) => prereq.id === prereqId);
    expect(requires('PY-03', 'PY-02')).toBe(true);
    expect(requires('BE-02', 'BE-01') && requires('BE-03', 'BE-02')).toBe(true);
    expect(
      requires('DB-02', 'DB-01') &&
        requires('DB-05', 'DB-02') &&
        requires('DB-06', 'DB-05'),
    ).toBe(true);
    expect(requires('DK-02', 'DK-01') && requires('PR-04', 'DK-04')).toBe(true);
    expect(
      requires('AI-03', 'AI-02') &&
        requires('AI-05', 'AI-04') &&
        requires('AI-09', 'AI-08'),
    ).toBe(true);
  });
});

describe('capstones and quest content', () => {
  it('defines CAP-01..CAP-07 with all required parts', () => {
    expect(CAREER_CAPSTONES.map((cap) => cap.id)).toEqual([
      'CAP-01',
      'CAP-02',
      'CAP-03',
      'CAP-04',
      'CAP-05',
      'CAP-06',
      'CAP-07',
    ]);
    for (const cap of CAREER_CAPSTONES) {
      expect(cap.skillIds.every((id) => byId.has(id))).toBe(true);
      expect(
        cap.checklist.length > 0 &&
          cap.deliverables.length > 0 &&
          cap.evidence.length > 0,
      ).toBe(true);
      expect(cap.xp > 0).toBe(true);
    }
    expect([CAREER_CAPSTONES[0].aiPolicy, CAREER_CAPSTONES[1].aiPolicy]).toEqual([
      'no-ai',
      'ai-limited',
    ]);
  });

  it('migrated the three entrance tests to structured content', () => {
    for (const id of ['q-w1-python-entry', 'q-w1-sql-entry', 'q-w1-git-linux-entry']) {
      expect(CAREER_SEED_QUESTS.some((quest) => quest.id === id)).toBe(true);
      const content = CAREER_QUEST_CONTENT.get(id)!;
      expect(content.promptContent.sections![0].title).toBe('Instruções gerais');
      expect(!!content.evaluationRubric && !!content.solutionContent).toBe(true);
    }
  });

  it('keeps the bug hunt code as a Python block with its bugs intact', () => {
    const python = CAREER_QUEST_CONTENT.get('q-w1-python-entry')!;
    const section = python.promptContent.sections!.find(
      (item) => item.title === '5. Caça aos bugs',
    )!;
    const code = section.blocks.find((block) => block.type === 'code');
    expect(code?.type === 'code' && code.language).toBe('python');
    const text = code?.type === 'code' ? code.code : '';
    expect(text.includes('return sum(notas) / len(notas) - 1')).toBe(true);
    expect(text.includes('        total += aluno["notas"]')).toBe(true);
    expect(text.includes('> corte]')).toBe(true);
  });

  it('never puts the solution or rubric inside the prompt', () => {
    const python = CAREER_QUEST_CONTENT.get('q-w1-python-entry')!;
    const prompt = JSON.stringify(python.promptContent);
    expect(prompt.includes('bug 1:')).toBe(false);
    expect(prompt.includes('total += media(aluno["notas"])')).toBe(false);
  });

  it('never renders multiline code as a paragraph', () => {
    const problems: string[] = [];
    const visit = (content: CareerContent | undefined, where: string): void => {
      const blocks = [
        ...(content?.blocks ?? []),
        ...(content?.sections ?? []).flatMap((section) => section.blocks),
      ];
      for (const block of blocks) {
        if (block.type === 'paragraph' && block.text.includes('\n')) problems.push(where);
      }
    };
    for (const [id, content] of CAREER_QUEST_CONTENT) {
      visit(content.promptContent, id);
      visit(content.evaluationRubric, id);
      visit(content.solutionContent, id);
    }
    expect(problems).toEqual([]);
  });
});

describe('builder markup', () => {
  it('parses heading, paragraph, lists, quote, callout and divider', () => {
    const content = parseCareerMarkup(
      '## Título\nUm parágrafo\ncontinua aqui.\n\n- a\n- b\n1. um\n2. dois\n> citação\n!! cuidado\n!i info\n!t dica\n---',
    );
    expect(content.blocks).toEqual([
      { type: 'heading', text: 'Título' },
      { type: 'paragraph', text: 'Um parágrafo continua aqui.' },
      { type: 'list', items: ['a', 'b'], ordered: false },
      { type: 'list', items: ['um', 'dois'], ordered: true },
      { type: 'quote', text: 'citação' },
      { type: 'callout', tone: 'warning', text: 'cuidado' },
      { type: 'callout', tone: 'info', text: 'info' },
      { type: 'callout', tone: 'tip', text: 'dica' },
      { type: 'divider' },
    ]);
  });

  it('keeps code indentation and line breaks exactly, with the language', () => {
    const content = parseCareerMarkup(
      '```py\ndef f():\n    if True:\n        return 1\n\n    return 2\n```',
    );
    expect(content.blocks).toEqual([
      {
        type: 'code',
        language: 'python',
        code: 'def f():\n    if True:\n        return 1\n\n    return 2',
      },
    ]);
  });

  it('creates collapsible sections from # titles', () => {
    const content = parseCareerMarkup('Intro\n# Parte 1\ntexto\n# Parte 2\n- x');
    expect(content.sections?.map((section) => section.title)).toEqual([
      'Introdução',
      'Parte 1',
      'Parte 2',
    ]);
  });

  it('keeps HTML as plain text (rendered escaped, never as markup)', () => {
    const content = parseCareerMarkup('<img src=x onerror=alert(1)>');
    expect(content.blocks).toEqual([
      { type: 'paragraph', text: '<img src=x onerror=alert(1)>' },
    ]);
  });
});

describe('code highlighting', () => {
  it('reassembles to the exact original code', () => {
    const code = 'def f(x):\n    # comentário\n    return "a#b" + 42\n';
    expect(
      highlightCode(code, 'python')
        .map((token) => token.text)
        .join(''),
    ).toBe(code);
  });

  it('classifies keywords, strings, comments and numbers', () => {
    const tokens = highlightCode("SELECT name FROM t WHERE x = 'a' -- nota", 'sql');
    const kinds = (kind: string): string[] =>
      tokens.filter((token) => token.kind === kind).map((token) => token.text);
    expect(kinds('keyword')).toEqual(['SELECT', 'FROM', 'WHERE']);
    expect(kinds('string')).toEqual(["'a'"]);
    expect(kinds('comment')).toEqual(['-- nota']);
  });
});

describe('priority, focus, horizon and prerequisite gating', () => {
  it('computes Importance × Gap × Timing', () => {
    // PY-02: core (4) × gap 4-1=3 × NOW (3) = 36
    expect(careerPriorityScore(byId.get('PY-02')!, state({ 'PY-02': 1 }))).toBe(36);
    // DE-09: supporting (2) × gap 2 × LATER (1) = 4
    expect(careerPriorityScore(byId.get('DE-09')!, state({}))).toBe(4);
  });

  it('lets the player override the horizon', () => {
    const skill = byId.get('DE-09')!;
    expect(horizonOf(skill, state({}, { horizonOverrides: { 'DE-09': 'now' } }))).toBe(
      'now',
    );
  });

  it('limits Active Focus per attribute', () => {
    const full = state({}, { focus: ['PY-02', 'SE-01', 'LX-01', 'EN-02'] });
    expect(canAddFocus(byId.get('DB-02')!, full, CAREER_SKILLS)).toBe(false);
    expect(canAddFocus(byId.get('EN-09')!, full, CAREER_SKILLS)).toBe(false);
    expect(canAddFocus(byId.get('EV-01')!, full, CAREER_SKILLS)).toBe(true);
  });

  it('blocks promotion to L3+ when prerequisites are missing, never below', () => {
    const proof = (level: number): CareerEvidence[] =>
      (['test', 'artifact', 'explanation'] as const).map((kind) => ({
        id: `${kind}${level}`,
        skillId: 'PY-03',
        level,
        kind,
        title: kind,
        url: '',
        note: '',
        aiPolicy: 'no-ai',
        passed: true,
        at: 0,
      }));
    const skill = byId.get('PY-03')!;
    // PY-03 needs PY-02 L2. At L1 → L2 it's allowed even with PY-02 at L1.
    expect(
      promotionChecklist(
        'PY-03',
        state({ 'PY-03': 1, 'PY-02': 1 }, { evidence: proof(2) }),
        skill,
      )?.ready,
    ).toBe(true);
    // L2 → L3 with PY-02 at L1 → blocked.
    const blocked = promotionChecklist(
      'PY-03',
      state({ 'PY-03': 2, 'PY-02': 1 }, { evidence: proof(3) }),
      skill,
    );
    expect(blocked?.prereqsOk).toBe(false);
    expect(blocked?.ready).toBe(false);
    // Same, prerequisites met → allowed.
    expect(
      promotionChecklist(
        'PY-03',
        state({ 'PY-03': 2, 'PY-02': 2 }, { evidence: proof(3) }),
        skill,
      )?.ready,
    ).toBe(true);
  });
});
