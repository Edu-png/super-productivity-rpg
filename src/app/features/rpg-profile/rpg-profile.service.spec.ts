import { TestBed } from '@angular/core/testing';
import { TaskService } from '../tasks/task.service';
import { RpgProfileService } from './rpg-profile.service';
import { Task } from '../tasks/task.model';
import { EMPTY } from 'rxjs';

const task = (overrides: Partial<Task>): Task =>
  ({
    id: 'task',
    projectId: 'project',
    title: 'Task',
    created: 1,
    isDone: false,
    timeEstimate: 0,
    timeSpent: 0,
    timeSpentOnDay: {},
    subTaskIds: [],
    attachments: [],
    ...overrides,
  }) as Task;

describe('RpgProfileService', () => {
  let service: RpgProfileService;
  let taskService: jasmine.SpyObj<TaskService>;

  beforeEach(() => {
    localStorage.clear();
    taskService = jasmine.createSpyObj<TaskService>(
      'TaskService',
      ['getAllTasksEverywhere'],
      { allTasks$: EMPTY },
    );
    TestBed.configureTestingModule({
      providers: [{ provide: TaskService, useValue: taskService }],
    });
    service = TestBed.inject(RpgProfileService);
  });

  it('awards estimated minutes once per completed task', async () => {
    taskService.getAllTasksEverywhere.and.resolveTo([
      task({
        id: 'completed',
        isDone: true,
        doneOn: new Date(2026, 6, 20).getTime(),
        timeEstimate: 50 * 60_000,
      }),
    ]);

    await service.refresh();
    await service.refresh();

    expect(service.totalXp()).toBe(50);
    expect(Object.keys(service.state().xpLedger)).toEqual(['completed']);
    expect(service.coins()).toBe(5);
  });

  it('reassigns earned XP when a project attribute changes', async () => {
    taskService.getAllTasksEverywhere.and.resolveTo([
      task({
        id: 'study',
        projectId: 'studies',
        isDone: true,
        timeEstimate: 60 * 60_000,
      }),
    ]);
    await service.refresh();

    service.mapProject('studies', 'intelligence');
    expect(service.attributeXp().intelligence).toBe(60);
    expect(service.attributeXp().health).toBe(0);

    service.mapProject('studies', 'health');
    expect(service.attributeXp().intelligence).toBe(0);
    expect(service.attributeXp().health).toBe(60);
  });

  it('averages completion only across days that contain top-level tasks', async () => {
    const firstDay = Array.from({ length: 10 }, (_, index) =>
      task({
        id: `day-one-${index}`,
        dueDay: '2026-07-28',
        isDone: index < 9,
      }),
    );
    taskService.getAllTasksEverywhere.and.resolveTo([
      ...firstDay,
      task({ id: 'day-two', dueDay: '2026-07-29', isDone: true }),
      task({
        id: 'subtask',
        parentId: 'day-two',
        dueDay: '2026-07-30',
        isDone: false,
      }),
      task({ id: 'no-day', isDone: false }),
    ]);

    await service.refresh();

    expect(service.disciplineDays().length).toBe(2);
    expect(service.discipline()).toBe(95);
  });

  it('spends coins once and blocks unaffordable purchases', async () => {
    taskService.getAllTasksEverywhere.and.resolveTo([
      task({
        id: 'completed',
        isDone: true,
        timeEstimate: 100 * 60_000,
      }),
    ]);
    await service.refresh();
    service.addReward('Filme', 7);
    const reward = service.state().rewards[0];

    expect(service.buyReward(reward.id)).toBeTrue();
    expect(service.coins()).toBe(3);
    expect(service.buyReward(reward.id)).toBeFalse();
    expect(service.state().rewards[0].purchasedCount).toBe(1);
  });

  it('applies class bonuses without changing the base XP ledger', async () => {
    taskService.getAllTasksEverywhere.and.resolveTo([
      task({
        id: 'completed',
        isDone: true,
        doneOn: new Date(2020, 0, 1).getTime(),
        timeEstimate: 8100 * 60_000,
      }),
    ]);
    await service.refresh();

    service.setClass('mage');
    expect(service.baseTaskXp()).toBe(8100);
    expect(service.totalXp()).toBe(8910);

    service.setClass('merchant');
    expect(service.totalXp()).toBe(8100);
    expect(service.coins()).toBe(972);
  });

  it('keeps classes free while subclasses require their unlock level', async () => {
    taskService.getAllTasksEverywhere.and.resolveTo([]);
    await service.refresh();

    service.setClass('necromancer');
    expect(service.state().classId).toBe('necromancer');

    service.setSubclass('chronomancer');
    expect(service.state().subclassId).toBe('none');
  });

  it('claims completed daily quests only once per date and quest', async () => {
    const today = new Date();
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    taskService.getAllTasksEverywhere.and.resolveTo([
      task({
        id: 'today-task',
        dueDay: todayStr,
        isDone: true,
        timeEstimate: 10 * 60_000,
      }),
    ]);

    await service.refresh();
    const firstBonus = service.state().questBonusXp;
    await service.refresh();

    expect(firstBonus).toBe(120);
    expect(service.state().questBonusXp).toBe(firstBonus);
    expect(Object.keys(service.state().claimedDailyQuests).length).toBe(2);
  });

  it('awards each newly completed task only to the active character', async () => {
    const firstTask = task({
      id: 'first',
      isDone: true,
      timeEstimate: 30 * 60_000,
    });
    taskService.getAllTasksEverywhere.and.resolveTo([firstTask]);
    await service.refresh();
    const firstCharacterId = service.activeCharacterId();

    service.createCharacter('Segundo herói');
    const secondCharacterId = service.activeCharacterId();
    taskService.getAllTasksEverywhere.and.resolveTo([
      firstTask,
      task({
        id: 'second',
        isDone: true,
        timeEstimate: 50 * 60_000,
      }),
    ]);
    await service.refresh();

    expect(service.baseTaskXp()).toBe(50);
    service.switchCharacter(firstCharacterId);
    expect(service.baseTaskXp()).toBe(30);
    service.switchCharacter(secondCharacterId);
    expect(service.baseTaskXp()).toBe(50);
  });

  it('requires progressively more XP for each new level', async () => {
    taskService.getAllTasksEverywhere.and.resolveTo([]);
    await service.refresh();

    expect(service.level()).toBe(1);
    expect(service.nextLevelXp() - service.levelStartXp()).toBe(100);

    taskService.getAllTasksEverywhere.and.resolveTo([
      task({
        id: 'level-up',
        isDone: true,
        timeEstimate: 100 * 60_000,
      }),
    ]);
    await service.refresh();

    expect(service.level()).toBe(2);
    expect(service.nextLevelXp() - service.levelStartXp()).toBe(300);
  });

  it('applies dungeon penalties without allowing negative balances', async () => {
    taskService.getAllTasksEverywhere.and.resolveTo([
      task({
        id: 'earned',
        isDone: true,
        timeEstimate: 50 * 60_000,
      }),
    ]);
    await service.refresh();

    service.addPenalty('Quebrei o combinado', 200, 200);

    expect(service.totalXp()).toBe(0);
    expect(service.coins()).toBe(0);
    expect(service.state().penalties[0].title).toBe('Quebrei o combinado');
  });

  it('starts with an equippable Ring of Power that grants two percent XP', async () => {
    taskService.getAllTasksEverywhere.and.resolveTo([
      task({
        id: 'ring-xp',
        isDone: true,
        doneOn: new Date(2020, 0, 1).getTime(),
        timeEstimate: 100 * 60_000,
      }),
    ]);
    await service.refresh();
    const ring = service
      .state()
      .inventory.find((item) => item.id === 'starter-ring-of-power');

    expect(ring).toBeDefined();
    expect(ring!.imageUrl).toBe('assets/rpg/items/ring-of-power.png');
    service.equipItem(ring!.id);
    expect(service.totalXp()).toBe(102);
  });

  it('only unlocks constellation stars connected to a purchased path', async () => {
    taskService.getAllTasksEverywhere.and.resolveTo([
      task({
        id: 'constellation-levels',
        isDone: true,
        doneOn: new Date(2020, 0, 1).getTime(),
        timeEstimate: 2500 * 60_000,
      }),
    ]);
    await service.refresh();

    expect(service.canUnlockStar('discipline-streak')).toBeFalse();
    expect(service.unlockStar('discipline-streak')).toBeFalse();
    expect(service.canUnlockStar('discipline-spark')).toBeTrue();
    expect(service.unlockStar('discipline-spark')).toBeTrue();
    expect(service.starRank('discipline-spark')).toBe(1);
    expect(service.state().lastUnlockedStarId).toBe('discipline-spark');
  });

  it('applies purchased constellation effects to real XP', async () => {
    taskService.getAllTasksEverywhere.and.resolveTo([
      task({
        id: 'constellation-xp',
        isDone: true,
        doneOn: new Date(2020, 0, 1).getTime(),
        timeEstimate: 2500 * 60_000,
      }),
    ]);
    await service.refresh();
    const before = service.totalXp();

    service.unlockStar('discipline-spark');

    expect(service.constellationBonuses().xpMultiplier).toBe(0.02);
    expect(service.totalXp()).toBeGreaterThan(before);
    expect(service.availableSkillPoints()).toBe(service.level() - 2);
  });
});
