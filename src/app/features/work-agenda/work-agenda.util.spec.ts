import { Task } from '../tasks/task.model';
import { NO_PROJECT, WorkCardMeta, WorkNote, WorkProject } from './work-agenda.model';
import {
  buildSuggestionContext,
  cardColumn,
  cardCompanyId,
  cardProject,
  cardSearchMatch,
  DoneCardFacts,
  doneByDay,
  heatmapWeeks,
  isBoardTask,
  isGitIssueTask,
  syncDoneLog,
  todayBlockTasks,
} from './work-agenda.util';

const task = (overrides: Partial<Task>): Task =>
  ({
    id: 't',
    title: 'Task',
    isDone: false,
    subTaskIds: [],
    ...overrides,
  }) as Task;

const meta = (overrides: Partial<WorkCardMeta> = {}): WorkCardMeta => ({
  taskId: 't',
  columnId: 'todo',
  order: 0,
  ...overrides,
});

const note = (overrides: Partial<WorkNote>): WorkNote => ({
  id: 'n',
  profileId: 'p',
  taskId: 't',
  day: '2026-10-05',
  text: '',
  attachments: [],
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('work agenda', () => {
  it('recognizes GitHub/GitLab tasks from built-in and plugin providers', () => {
    expect(isGitIssueTask(task({ issueType: 'GITLAB' }))).toBeTrue();
    expect(isGitIssueTask(task({ issueType: 'GITHUB' }))).toBeTrue();
    expect(isGitIssueTask(task({ issueType: 'JIRA' }))).toBeFalse();
    expect(isGitIssueTask(task({}))).toBeFalse();
  });

  it('shows imported issues and manual cards, but not the ones taken off the board', () => {
    const cards = {
      manual: meta({ taskId: 'manual' }),
      hidden: meta({ isHidden: true }),
    };
    expect(isBoardTask(task({ id: 'gh', issueType: 'GITHUB' }), cards)).toBeTrue();
    expect(isBoardTask(task({ id: 'manual' }), cards)).toBeTrue();
    expect(isBoardTask(task({ id: 'other' }), cards)).toBeFalse();
    expect(isBoardTask(task({ id: 'hidden', issueType: 'GITHUB' }), cards)).toBeFalse();
  });

  it('keeps done tasks in "Concluído" and new cards in the backlog', () => {
    expect(cardColumn(task({ isDone: true }), meta({ columnId: 'doing' }))).toBe('done');
    expect(cardColumn(task({}), meta({ columnId: 'review' }))).toBe('review');
    expect(cardColumn(task({}), undefined)).toBe('backlog');
    // Undone again after being finished on the board
    expect(cardColumn(task({}), meta({ columnId: 'done' }))).toBe('backlog');
  });

  it('finds a card by title, note text or text read from a photo, ignoring accents', () => {
    const notes = [
      note({ day: '2026-10-05', text: 'Revisar migração do banco' }),
      note({
        day: '2026-10-06',
        attachments: [
          {
            id: 'a',
            name: 'caderno.jpg',
            mimeType: 'image/webp',
            size: 1,
            dataUrl: '',
            ocrText: 'Reunião com o time de dados',
          },
        ],
      }),
    ];
    expect(cardSearchMatch('', 'Deploy', notes)).toBe('');
    expect(cardSearchMatch('deploy', 'Deploy API', notes)).toBe('título');
    expect(cardSearchMatch('migracao', 'Deploy', notes)).toBe('anotação de 05/10');
    expect(cardSearchMatch('reuniao', 'Deploy', notes)).toBe(
      'texto lido em caderno.jpg (06/10)',
    );
    expect(cardSearchMatch('inexistente', 'Deploy', notes)).toBeNull();
  });

  it("lists today's unfinished top-level tasks with work blocks first", () => {
    const today = '2026-10-07';
    const tasks = [
      task({ id: 'yoga', title: 'Yoga', dueDay: today }),
      task({ id: 'b2', title: 'Trabalhar - Bloco II', dueDay: today }),
      task({ id: 'b1', title: 'Trabalhar - Bloco I', dueDay: today }),
      task({ id: 'sub', title: 'Trabalhar - sub', dueDay: today, parentId: 'b1' }),
      task({ id: 'done', title: 'Trabalhar - feito', dueDay: today, isDone: true }),
      task({ id: 'tomorrow', title: 'Trabalhar - amanhã', dueDay: '2026-10-08' }),
    ];
    expect(todayBlockTasks(tasks, today, () => '').map((t) => t.id)).toEqual([
      'b1',
      'b2',
      'yoga',
    ]);
  });

  describe('finished cards log', () => {
    const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
    const done = (taskId: string, estimateMs = 30 * 60_000): DoneCardFacts => ({
      taskId,
      isDone: true,
      doneOn: Date.UTC(2026, 9, 6, 12),
      title: taskId,
      estimateMs,
    });

    it('records finished cards, drops undone ones and keeps archived ones', () => {
      const log = syncDoneLog(
        { archived: { day: '2026-09-01', title: 'old', estimateMin: 60 } },
        [done('a'), { ...done('b'), isDone: false }],
        dayOf,
      );
      expect(log['a']).toEqual({ day: '2026-10-06', title: 'a', estimateMin: 30 });
      expect(log['archived']).toBeDefined();
      const undone = syncDoneLog(log, [{ ...done('a'), isDone: false }], dayOf);
      expect(undone['a']).toBeUndefined();
    });

    it('returns the same log when nothing changed', () => {
      const log = syncDoneLog({}, [done('a')], dayOf);
      expect(syncDoneLog(log, [done('a')], dayOf)).toBe(log);
    });

    it('sums cards and estimated minutes per day', () => {
      const byDay = doneByDay({
        a: { day: '2026-10-06', title: 'a', estimateMin: 90 },
        b: { day: '2026-10-06', title: 'b', estimateMin: 30 },
        c: { day: '2026-10-07', title: 'c', estimateMin: 0 },
      });
      expect(byDay.get('2026-10-06')).toEqual(
        jasmine.objectContaining({ count: 2, minutes: 120 }),
      );
      expect(byDay.get('2026-10-07')?.count).toBe(1);
    });
  });

  it('lays the heatmap out in Monday-first weeks ending this week', () => {
    // 2026-10-07 is a Wednesday
    const weeks = heatmapWeeks('2026-10-07', 2);
    expect(weeks[0][0]).toBe('2026-09-28');
    expect(weeks[1][0]).toBe('2026-10-05');
    expect(weeks[1][2]).toBe('2026-10-07');
    expect(weeks[1][3]).toBeNull();
  });

  it('builds the suggestions context with open cards first, notes and OCR text, within the limit', () => {
    const notes = [
      note({
        day: '2026-10-06',
        text: 'Falta paginação',
        attachments: [
          {
            id: 'a',
            name: 'foto.jpg',
            mimeType: 'image/webp',
            size: 1,
            dataUrl: '',
            ocrText: 'cache no Redis',
          },
        ],
      }),
    ];
    const text = buildSuggestionContext([
      { title: 'Feito', column: 'Concluído', isDone: true, notes: [] },
      {
        title: 'API de pedidos',
        column: 'Em andamento',
        priority: 'high',
        deadlineDay: '2026-10-10',
        isDone: false,
        notes,
      },
    ]);
    expect(text.indexOf('API de pedidos')).toBeLessThan(text.indexOf('Feito'));
    expect(text).toContain('urgência high, prazo 2026-10-10');
    expect(text).toContain('Falta paginação');
    expect(text).toContain('cache no Redis');
    const small = buildSuggestionContext(
      [{ title: 'API de pedidos', column: 'A fazer', isDone: false, notes }],
      20,
    );
    expect(small).toBe('');
  });

  it("resolves a card's project from the card, else from its repo, and its company from the project", () => {
    const projects: WorkProject[] = [
      {
        id: 'api',
        companyId: 'c1',
        name: 'API',
        description: '',
        issueProviderIds: ['repo1'],
      },
      { id: 'app', companyId: 'c2', name: 'App', description: '', issueProviderIds: [] },
    ];
    const fromRepo = task({ issueProviderId: 'repo1' });
    expect(cardProject(fromRepo, undefined, projects)?.id).toBe('api');
    expect(cardProject(fromRepo, meta({ projectId: 'app' }), projects)?.id).toBe('app');
    expect(
      cardProject(fromRepo, meta({ projectId: NO_PROJECT }), projects),
    ).toBeUndefined();
    expect(cardProject(task({}), undefined, projects)).toBeUndefined();
    expect(cardCompanyId(undefined, projects[0])).toBe('c1');
    expect(cardCompanyId(meta({ companyId: 'c9' }), projects[0])).toBe('c9');
  });
});
