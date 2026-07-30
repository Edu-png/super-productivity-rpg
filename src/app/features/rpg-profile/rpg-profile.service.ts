import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { TaskService } from '../tasks/task.service';
import { LS } from '../../core/persistence/storage-keys.const';
import {
  DisciplineDay,
  RpgAchievement,
  RpgAttributeId,
  RpgClassId,
  RpgDailyQuest,
  RpgCampaign,
  RpgItem,
  RpgItemRarity,
  RpgItemSlot,
  RpgProfileState,
  RpgProfilesState,
  RpgPet,
  RpgPetStage,
  RpgPetType,
  RpgReward,
  RpgAppearance,
  RpgAnnualGoal,
  RpgRealmId,
  RpgSpeciesId,
  RpgSubclassId,
  RPG_SUBCLASS_UNLOCK_LEVELS,
} from './rpg-profile.model';
import { TaskHabitService } from '../habit-tracker/task-habit.service';
import { Task } from '../tasks/task.model';
import { getDbDateStr } from '../../util/get-db-date-str';
import { debounceTime } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RPG_CONSTELLATION_STARS } from './rpg-constellations.data';
import { RpgConstellationBonuses } from './rpg-constellations.model';
import { DomainStateStore } from '../../core/persistence/domain-state-store.service';

const ITEM_PACK_PATH = 'assets/rpg/items-pack';
const RARE_ITEM_PACK_PATH = 'assets/rpg/rare-items';
const GENERATED_ITEM_PATH = 'assets/rpg/generated-items';
const ITEM_PACK_ASSETS: Record<RpgItemSlot, string[]> = {
  head: ['rpg-item-0-6'],
  neck: ['rpg-item-6-2', 'rpg-item-6-3'],
  chest: ['rpg-item-0-5', 'rpg-item-0-7', 'rpg-item-2-6'],
  hands: ['rpg-item-2-5', 'rpg-item-1-5'],
  mainHand: ['rpg-item-4-5', 'rpg-item-4-7', 'rpg-item-5-6', 'rpg-item-6-4', 'rpg-item-7-7'],
  offHand: ['rpg-item-0-4', 'rpg-item-5-3'],
  ringLeft: ['rpg-item-6-0', 'rpg-item-6-1'],
  ringRight: ['rpg-item-6-1', 'rpg-item-6-0'],
  boots: ['rpg-item-1-5', 'rpg-item-1-7'],
  companion: ['rpg-item-0-2', 'rpg-item-5-1'],
  pet: ['rpg-item-2-2', 'rpg-item-1-2'],
  relic: ['rpg-item-0-3', 'rpg-item-3-3'],
};

const RARE_ITEM_ASSETS: Record<RpgItemSlot, string[]> = {
  head: ['rare-item-9-11', 'rare-item-9-12', 'rare-item-10-13'],
  neck: ['rare-item-6-10', 'rare-item-6-12', 'rare-item-7-10'],
  chest: ['rare-item-8-10', 'rare-item-8-11', 'rare-item-8-12'],
  hands: ['rare-item-9-3', 'rare-item-9-4', 'rare-item-9-5'],
  mainHand: ['rare-item-0-8', 'rare-item-1-10', 'rare-item-2-5', 'rare-item-3-13'],
  offHand: ['rare-item-7-3', 'rare-item-8-3', 'rare-item-10-10'],
  ringLeft: ['rare-item-6-0', 'rare-item-6-1', 'rare-item-6-2'],
  ringRight: ['rare-item-6-3', 'rare-item-6-4', 'rare-item-6-5'],
  boots: ['rare-item-9-8', 'rare-item-9-9', 'rare-item-9-10'],
  companion: ['rare-item-15-2', 'rare-item-15-7', 'rare-item-17-4'],
  pet: ['rare-item-15-5', 'rare-item-17-7', 'rare-item-18-9'],
  relic: ['rare-item-17-10', 'rare-item-18-11', 'rare-item-19-10'],
};

const itemPackImage = (assetId: string): string => {
  const [, , row, column] = assetId.split('-');
  return `${ITEM_PACK_PATH}/item-${row}-${column}.png`;
};

const rareItemImage = (assetId: string): string => {
  const [, , row, column] = assetId.split('-');
  return `${RARE_ITEM_PACK_PATH}/item-${row}-${column}.png`;
};

const generatedItemImage = (name: string, slot: RpgItemSlot): string | null => {
  const normalized = name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const namedIcons: [string, string][] = [
    ['grimorio', 'apprentice-grimoire'],
    ['tomo', 'ancient-tome'],
    ['cajado', 'wizard-staff'],
    ['espada', 'training-sword'],
    ['lamina', 'goal-blade'],
    ['adaga', 'simple-dagger'],
    ['machado', 'battle-axe'],
    ['arco', 'short-bow'],
    ['alaude', 'fantasy-lute'],
    ['bolsa', 'travel-satchel'],
    ['roupa simples', 'traveler-tunic'],
    ['elmo', 'focus-helmet'],
    ['amuleto', 'discipline-amulet'],
    ['armadura', 'constancy-armor'],
    ['luvas', 'execution-gloves'],
    ['escudo', 'routine-shield'],
    ['anel do tempo', 'time-ring'],
    ['anel', 'gold-purple-ring'],
    ['botas', 'pathfinder-boots'],
    ['companheiro runico', 'companion-rune'],
    ['reliquia', 'violet-relic'],
  ];
  const named = namedIcons.find(([keyword]) => normalized.includes(keyword))?.[1];
  if (named) return `${GENERATED_ITEM_PATH}/${named}.png`;
  const slotFallback: Partial<Record<RpgItemSlot, string>> = {
    head: 'focus-helmet',
    neck: 'discipline-amulet',
    chest: 'constancy-armor',
    hands: 'execution-gloves',
    mainHand: 'goal-blade',
    offHand: 'routine-shield',
    ringLeft: 'gold-purple-ring',
    ringRight: 'silver-blue-ring',
    boots: 'pathfinder-boots',
    companion: 'companion-rune',
    relic: 'violet-relic',
  };
  return slotFallback[slot] ? `${GENERATED_ITEM_PATH}/${slotFallback[slot]}.png` : null;
};

const STARTER_RING: RpgItem = {
  id: 'starter-ring-of-power',
  name: 'Anel do Poder',
  icon: 'radio_button_checked',
  imageUrl: 'assets/rpg/items/ring-of-power.png',
  rarity: 'common',
  slot: 'ringLeft',
  power: 2,
  stats: { power: 2, luck: 1, xpMultiplier: 0.02 },
  obtainedAt: 0,
  source: 'starter',
};

const PET_COMPANION_ID = 'active-pet-companion';
export const RPG_INVENTORY_CAPACITY = 22;
const PET_TYPES: Record<
  RpgPetType,
  { label: string; slug: string; icon: string }
> = {
  tiger: { label: 'Tigre Astral', slug: 'tiger', icon: 'pets' },
  dragon: { label: 'Dragão Rúnico', slug: 'dragon', icon: 'local_fire_department' },
  phoenix: { label: 'Fênix Solar', slug: 'phoenix', icon: 'local_fire_department' },
  wolf: { label: 'Lobo Lunar', slug: 'wolf', icon: 'dark_mode' },
  griffin: { label: 'Grifo Celestial', slug: 'griffin', icon: 'flutter_dash' },
};

const DEFAULT_APPEARANCE: RpgAppearance = {
  gender: 'male',
  bodyType: 'standard',
  faceType: 'oval',
  skinColor: '#b97850',
  eyeColor: '#4aa3df',
  hairStyle: 'short',
  hairColor: '#2b1712',
  hairSize: 'medium',
  beard: 'none',
  beardColor: '#2b1712',
  beardSize: 'medium',
  mustache: 'none',
  accessory: 'none',
  eyebrows: 'straight',
  eyeStyle: 'round',
  noseStyle: 'small',
  mouthStyle: 'neutral',
  marking: 'none',
  clothingColor: '#315a9c',
  armorColor: '#8f98a3',
  detailColor: '#d8a62f',
  capeColor: '#7f2431',
  accessoryColor: '#3d9d8b',
};

const DEFAULT_STATE: RpgProfileState = {
  id: 'main-character',
  createdAt: 0,
  displayName: 'Meu personagem',
  speciesId: 'human',
  appearance: DEFAULT_APPEARANCE,
  avatarDataUrl: null,
  attributeRatings: {
    health: 0,
    intelligence: 0,
    social: 0,
    finance: 0,
    discipline: 0,
  },
  projectAttributes: {},
  xpLedger: {},
  rewards: [],
  coinsSpent: 0,
  classId: 'adventurer',
  subclassId: 'none',
  selectedTitleId: null,
  claimedDailyQuests: {},
  questBonusXp: 0,
  questBonusCoins: 0,
  penalties: [],
  inventory: [STARTER_RING],
  equippedItems: {},
  lastRewardedLevel: 1,
  weeklyBossClaims: {},
  skills: {},
  skillPointsSpent: 0,
  lastUnlockedStarId: null,
  pet: {
    name: 'Ovo misterioso',
    xp: 0,
    type: 'tiger',
    createdAt: Date.now(),
    boundAt: null,
  },
  campaigns: [],
  annualGoals: [],
  monthlyMedalConfigs: {},
  trophyClaims: {},
  overflowItems: [],
  currentRealmId: 'village',
  realmProgress: {},
  projectRealms: {},
};

@Injectable({ providedIn: 'root' })
export class RpgProfileService {
  readonly levelUpCelebration = signal<{
    previousLevel: number;
    currentLevel: number;
    starPoints: number;
    itemNames: string[];
    unlocks: string[];
  } | null>(null);
  private readonly _taskService = inject(TaskService);
  private readonly _habitTracker = inject(TaskHabitService);
  private readonly _domainState = inject(DomainStateStore);
  private readonly _roster = signal<RpgProfilesState>(this._loadRoster());
  private readonly _state = computed(
    () => this._roster().characters[this._roster().activeCharacterId],
  );
  private readonly _tasks = signal<Task[]>([]);

  readonly state = this._state;
  readonly characters = computed(() => Object.values(this._roster().characters));
  readonly activeCharacterId = computed(() => this._roster().activeCharacterId);
  readonly equipmentBonuses = computed(() => {
    const bonuses = {
      power: 0,
      intelligence: 0,
      luck: 0,
      xpMultiplier: 0,
      goldMultiplier: 0,
      rareDrop: 0,
    };
    const equippedIds = new Set(
      Object.values(this._state().equippedItems).filter(
        (itemId): itemId is string => !!itemId,
      ),
    );
    for (const itemId of equippedIds) {
      const item = this._state().inventory.find((candidate) => candidate.id === itemId);
      if (!item) continue;
      const itemBonuses = this.itemBonuses(item);
      bonuses.power += itemBonuses.power;
      bonuses.intelligence += itemBonuses.intelligence;
      bonuses.luck += itemBonuses.luck;
      bonuses.xpMultiplier += itemBonuses.xpMultiplier;
      bonuses.goldMultiplier += itemBonuses.goldMultiplier;
      bonuses.rareDrop += itemBonuses.rareDrop;
    }
    return bonuses;
  });
  readonly baseTaskXp = computed(() =>
    Object.values(this._state().xpLedger).reduce((sum, entry) => sum + entry.xp, 0),
  );
  readonly xpMultiplier = computed(() => {
    let multiplier = this._state().classId === 'mage' ? 1.1 : 1;
    if (this._state().classId === 'warrior') {
      multiplier += 0.05;
    }
    if (this._state().subclassId === 'scholar') {
      multiplier += 0.05;
    }
    multiplier += (this._state().skills['focus-mastery'] ?? 0) * 0.02;
    multiplier += (this._state().skills['deep-work'] ?? 0) * 0.015;
    multiplier += (this._state().skills['wisdom-core'] ?? 0) * 0.01;
    multiplier += this.equipmentBonuses().xpMultiplier;
    multiplier += this.constellationBonuses().xpMultiplier;
    return multiplier;
  });
  readonly goldMultiplier = computed(() => {
    let multiplier = this._state().classId === 'merchant' ? 1.2 : 1;
    if (this._state().subclassId === 'alchemist') {
      multiplier += 0.1;
    }
    if (this._state().classId === 'bard') {
      multiplier += Math.min(0.15, this.streak() * 0.01);
    }
    multiplier += this.equipmentBonuses().goldMultiplier;
    multiplier += this.constellationBonuses().goldMultiplier;
    return multiplier;
  });
  readonly totalXp = computed(() => {
    const earned =
      Math.round(this.baseTaskXp() * this.xpMultiplier()) + this._state().questBonusXp;
    return Math.max(0, earned - this._penaltyXp());
  });
  readonly level = computed(() => Math.floor(Math.sqrt(this.totalXp() / 100)) + 1);
  readonly levelStartXp = computed(() => Math.pow(this.level() - 1, 2) * 100);
  readonly nextLevelXp = computed(() => Math.pow(this.level(), 2) * 100);
  readonly levelProgress = computed(() => {
    const range = this.nextLevelXp() - this.levelStartXp();
    return range ? ((this.totalXp() - this.levelStartXp()) / range) * 100 : 0;
  });
  readonly coins = computed(() =>
    Math.max(
      0,
      Math.floor(this.baseTaskXp() * this.goldMultiplier() * 0.1) +
        this._state().questBonusCoins -
        this._state().coinsSpent -
        this._penaltyCoins(),
    ),
  );
  readonly availableSkillPoints = computed(() =>
    Math.max(0, this.level() - 1 - this._state().skillPointsSpent),
  );
  readonly constellationBonuses = computed<RpgConstellationBonuses>(() => {
    const bonuses: RpgConstellationBonuses = {
      xpMultiplier: 0,
      goldMultiplier: 0,
      luck: 0,
      rareDrop: 0,
    };
    for (const star of RPG_CONSTELLATION_STARS) {
      const rank = this._state().skills[star.id] ?? 0;
      bonuses.xpMultiplier += (star.effects.xp_multiplier ?? 0) * rank;
      bonuses.goldMultiplier += (star.effects.gold_multiplier ?? 0) * rank;
      bonuses.luck += (star.effects.luck ?? 0) * rank;
      bonuses.rareDrop += (star.effects.rare_drop ?? 0) * rank;
    }
    return bonuses;
  });
  readonly purchasedTalents = computed(
    () => Object.entries(this._state().skills).filter(([, rank]) => rank > 0).length,
  );
  readonly equippedVisualAssets = computed<Partial<Record<RpgItemSlot, string>>>(() => {
    const state = this._state();
    return Object.fromEntries(
      Object.entries(state.equippedItems).flatMap(([slot, itemId]) => {
        const item = state.inventory.find((candidate) => candidate.id === itemId);
        return item?.spriteAssetId ? [[slot, item.spriteAssetId]] : [];
      }),
    );
  });
  readonly streak = computed(() => this._calculateCurrentStreak());
  private readonly _petXpPerLevel = 100;
  readonly petLevel = computed(() =>
    Math.max(1, Math.floor(this._state().pet.xp / this._petXpPerLevel) + 1),
  );
  readonly petIsBound = computed(() => this._state().pet.boundAt != null);
  readonly petAgeDays = computed(() =>
    Math.max(
      1,
      Math.floor(
        (Date.now() - (this._state().pet.createdAt ?? Date.now())) / 86_400_000,
      ) + 1,
    ),
  );
  readonly petStageKey = computed<RpgPetStage>(() => {
    const level = this.petLevel();
    const days = this.petAgeDays();
    if (level >= 200 && days >= 120) return 'epic';
    if (level >= 100 && days >= 60) return 'adult';
    if (level >= 40 && days >= 21) return 'teen';
    if (level >= 5 && days >= 3) return 'cub';
    return 'egg';
  });
  readonly petStage = computed(() => {
    const labels: Record<RpgPetStage, string> = {
      egg: 'Ovo místico',
      cub: 'Filhote',
      teen: 'Adolescente',
      adult: 'Adulto',
      epic: 'Forma épica',
    };
    return labels[this.petStageKey()];
  });
  readonly petImageUrl = computed(() => {
    const pet = this._state().pet;
    const definition = PET_TYPES[pet.type] ?? PET_TYPES.tiger;
    return (
      pet.imageUrl ||
      `assets/rpg/pets/evolutions/${definition.slug}-${this.petStageKey()}.png`
    );
  });
  readonly petEvolutionPath = computed(() => [
    { key: 'egg' as const, label: 'Ovo', level: 1, days: 1 },
    { key: 'cub' as const, label: 'Filhote', level: 5, days: 3 },
    { key: 'teen' as const, label: 'Adolescente', level: 40, days: 21 },
    { key: 'adult' as const, label: 'Adulto', level: 100, days: 60 },
    { key: 'epic' as const, label: 'Épico', level: 200, days: 120 },
  ]);
  readonly worlds = computed(() => [
    { name: 'Vila Inicial', level: 1, icon: 'home' },
    { name: 'Floresta dos Hábitos', level: 25, icon: 'forest' },
    { name: 'Montanhas do Foco', level: 60, icon: 'landscape' },
    { name: 'Castelo da Disciplina', level: 110, icon: 'castle' },
    { name: 'Reino Celestial', level: 180, icon: 'cloud' },
  ]);
  readonly weeklyBoss = computed(() => this._buildWeeklyBoss());
  readonly disciplineDays = computed(() => this._calculateDiscipline(this._tasks()));
  readonly discipline = computed(() => {
    const days = this.disciplineDays();
    return days.length
      ? days.reduce((sum, day) => sum + day.percentage, 0) / days.length
      : 0;
  });
  readonly attributeXp = computed(() => {
    const totals: Record<RpgAttributeId, number> = {
      health: 0,
      intelligence: 0,
      discipline: Math.round(this.discipline()),
      social: 0,
      finance: 0,
    };
    const mappings = this._state().projectAttributes;
    for (const entry of Object.values(this._state().xpLedger)) {
      const attribute = mappings[entry.projectId];
      if (attribute && attribute !== 'discipline') {
        totals[attribute] += entry.xp;
      }
    }
    if (this._state().classId === 'guardian') {
      totals.health = Math.round(totals.health * 1.15);
    }
    if (this._state().subclassId === 'paladin') {
      totals.health = Math.round(totals.health * 1.1);
    }
    return totals;
  });
  readonly dailyQuests = computed(() => this._buildDailyQuests(this._tasks()));
  readonly monthlyQuests = computed(() => this._buildMonthlyQuests(this._tasks()));
  readonly achievements = computed<RpgAchievement[]>(() => {
    const attributes = this.attributeXp();
    const days = this.disciplineDays().length;
    return [
      this._achievement(
        'first-step',
        'Primeiro passo',
        'Conquiste 5 XP.',
        'footprint',
        this.totalXp(),
        5,
      ),
      this._achievement(
        'apprentice',
        'Aprendiz persistente',
        'Alcance o nível 3.',
        'auto_awesome',
        this.level(),
        3,
      ),
      this._achievement(
        'scholar',
        'Mente brilhante',
        'Consiga 100 pontos de Inteligência.',
        'psychology',
        attributes.intelligence,
        100,
      ),
      this._achievement(
        'guardian',
        'Guardião do bem-estar',
        'Consiga 100 pontos de Saúde.',
        'favorite',
        attributes.health,
        100,
      ),
      this._achievement(
        'disciplined',
        'Coração disciplinado',
        'Mantenha 90% em pelo menos 3 dias.',
        'military_tech',
        this.discipline() >= 90 ? days : 0,
        3,
      ),
      this._achievement(
        'veteran',
        'Herói da rotina',
        'Alcance 1.000 XP.',
        'workspace_premium',
        this.totalXp(),
        1000,
      ),
    ];
  });
  readonly unlockedTitles = computed(() =>
    this.achievements()
      .filter((achievement) => achievement.isUnlocked)
      .map((achievement) => ({
        id: achievement.id,
        title: achievement.title,
      })),
  );
  readonly selectedTitle = computed(
    () =>
      this.unlockedTitles().find((title) => title.id === this._state().selectedTitleId)
        ?.title ?? 'Aventureiro iniciante',
  );
  readonly monthlyMedals = computed(() => {
    const year = new Date().getFullYear();
    const names = [
      'Despertador Imparável',
      'Poliglota em Ascensão',
      'Cuidando de Si',
      'Coração no Projeto',
      'Guardião do Foco',
      'Comedor de Livros',
      'Tanquinho Lendário',
      'O Codificador',
      'Energia Relâmpago',
      'Zen em Meio ao Caos',
      'Construtor de Sonhos',
      'Senhor dos Cofres',
    ];
    return names.map((title, monthIndex) => {
      const id = `${year}-${monthIndex + 1}`;
      const config = this._state().monthlyMedalConfigs[id];
      const stats = this._monthlyHabitStats(year, monthIndex, config?.habitIds);
      const targetDays =
        config?.targetDays ??
        Math.ceil(new Date(year, monthIndex + 1, 0).getDate() * 0.8);
      const monthEnded =
        new Date().getFullYear() > year ||
        (new Date().getFullYear() === year && new Date().getMonth() > monthIndex);
      return {
        id,
        monthIndex,
        title,
        imageUrl: `assets/rpg/trophies/month-${String(monthIndex + 1).padStart(2, '0')}.png`,
        percentage: stats.percentage,
        completed: stats.completed,
        possible: stats.possible,
        completedDays: stats.completedDays,
        progressPercentage: Math.min(
          100,
          Math.round((stats.completedDays / targetDays) * 100),
        ),
        targetDays,
        habitIds: config?.habitIds ?? [],
        isUnlocked:
          monthEnded &&
          stats.possibleDays > 0 &&
          stats.completedDays >= targetDays,
      };
    });
  });

  constructor() {
    void this._hydrateDomainState();
    this._taskService.allTasks$
      .pipe(debounceTime(100), takeUntilDestroyed())
      .subscribe(() => void this.refresh());
    effect(() => {
      this._habitTracker.state();
      this._state();
      queueMicrotask(() => untracked(() => this.claimAvailableTrophies()));
    });
  }

  async refresh(): Promise<void> {
    const tasks = await this._taskService.getAllTasksEverywhere();
    this._tasks.set(tasks);
    const current = this._state();
    const inventoryBeforeRewards = new Set(current.inventory.map((item) => item.id));
    const ledger = { ...current.xpLedger };
    const processedTaskIds = { ...this._roster().processedTaskIds };
    const realmProgress = { ...current.realmProgress };
    let changed = false;
    let gainedXp = 0;

    for (const task of tasks) {
      if (!task.isDone || processedTaskIds[task.id]) {
        continue;
      }
      const xp = this._xpForTask(task);
      ledger[task.id] = {
        taskId: task.id,
        projectId: task.projectId,
        xp,
        earnedAt: task.doneOn ?? Date.now(),
      };
      processedTaskIds[task.id] = current.id;
      gainedXp += xp;
      const taskRealm = current.projectRealms[task.projectId];
      if (taskRealm) {
        const progress = realmProgress[taskRealm];
        realmProgress[taskRealm] = {
          steps: (progress?.steps ?? 0) + Math.max(1, Math.round(xp / 10)),
          bossDamage: (progress?.bossDamage ?? 0) + xp,
          visitedAt: progress?.visitedAt ?? Date.now(),
          timeSpentMs: progress?.timeSpentMs ?? 0,
        };
      }
      changed = true;
    }

    if (changed) {
      this._saveRoster({
        ...this._roster(),
        processedTaskIds,
        characters: {
          ...this._roster().characters,
          [current.id]: this._syncPetCompanion({
            ...current,
            xpLedger: ledger,
            realmProgress,
            pet: { ...current.pet, xp: current.pet.xp + gainedXp },
          }),
        },
      });
    }
    this._enforceProgressionLocks();
    this._claimCompletedDailyQuests();
    this._claimCompletedMonthlyQuests();
    this._claimWeeklyBoss();
    this._grantLevelRewards(inventoryBeforeRewards);
  }

  createCharacter(
    displayName: string,
    speciesId: RpgSpeciesId = 'human',
    classId: RpgClassId = 'adventurer',
    appearance: RpgAppearance = DEFAULT_APPEARANCE,
    subclassId: RpgSubclassId = 'none',
  ): void {
    const id = crypto.randomUUID();
    const starterEquipment = this._createStarterEquipment(classId);
    const character: RpgProfileState = {
      ...DEFAULT_STATE,
      id,
      createdAt: Date.now(),
      displayName: displayName.trim() || `Personagem ${this.characters().length + 1}`,
      speciesId,
      classId,
      subclassId:
        subclassId !== 'none' &&
        RPG_SUBCLASS_UNLOCK_LEVELS[subclassId] <= this.level() &&
        this._subclassBelongsToClass(subclassId, classId)
          ? subclassId
          : 'none',
      appearance: { ...appearance },
      inventory: [STARTER_RING, ...starterEquipment],
      equippedItems: {
        chest: starterEquipment.find((item) => item.slot === 'chest')?.id,
        mainHand: starterEquipment.find((item) => item.slot === 'mainHand')?.id,
      },
      projectAttributes: {},
      xpLedger: {},
      rewards: [],
      claimedDailyQuests: {},
      pet: {
        name: 'Ovo misterioso',
        xp: 0,
        type: 'tiger',
        createdAt: Date.now(),
        boundAt: null,
      },
    };
    this._saveRoster({
      ...this._roster(),
      activeCharacterId: id,
      characters: { ...this._roster().characters, [id]: character },
    });
  }

  switchCharacter(characterId: string): void {
    if (!this._roster().characters[characterId]) {
      return;
    }
    this._saveRoster({ ...this._roster(), activeCharacterId: characterId });
    this._claimCompletedDailyQuests();
  }

  deleteCharacter(characterId: string): boolean {
    if (this.characters().length <= 1 || !this._roster().characters[characterId]) {
      return false;
    }
    const characters = { ...this._roster().characters };
    delete characters[characterId];
    const nextId =
      this._roster().activeCharacterId === characterId
        ? Object.keys(characters)[0]
        : this._roster().activeCharacterId;
    this._saveRoster({
      ...this._roster(),
      activeCharacterId: nextId,
      characters,
    });
    return true;
  }

  grantExternalReward(
    sourceId: string,
    xp: number,
    gold: number,
    projectId = 'external-activity',
    characterId = this.activeCharacterId(),
  ): boolean {
    const state = this._roster().characters[characterId];
    if (!state) return false;
    const ledgerId = `external:${sourceId}`;
    if (state.xpLedger[ledgerId]) return false;
    const inventoryBeforeRewards = new Set(state.inventory.map((item) => item.id));
    const grantedXp = Math.max(0, Math.round(xp));
    this._save({
      ...state,
      xpLedger: {
        ...state.xpLedger,
        [ledgerId]: {
          taskId: ledgerId,
          projectId,
          xp: grantedXp,
          earnedAt: Date.now(),
        },
      },
      questBonusCoins: state.questBonusCoins + Math.max(0, Math.round(gold)),
      pet: { ...state.pet, xp: state.pet.xp + grantedXp },
    });
    if (characterId === this.activeCharacterId()) {
      this._grantLevelRewards(inventoryBeforeRewards);
    }
    return true;
  }

  addPenalty(title: string, xpLoss: number, coinsLoss: number): void {
    if (!title.trim()) {
      return;
    }
    this._save({
      ...this._state(),
      penalties: [
        ...this._state().penalties,
        {
          id: crypto.randomUUID(),
          title: title.trim(),
          xpLoss: Math.max(0, Math.round(xpLoss)),
          coinsLoss: Math.max(0, Math.round(coinsLoss)),
          createdAt: Date.now(),
        },
      ],
    });
  }

  removePenalty(penaltyId: string): void {
    this._save({
      ...this._state(),
      penalties: this._state().penalties.filter((item) => item.id !== penaltyId),
    });
  }

  setPenaltyImage(penaltyId: string, imageUrl: string): void {
    this._save({
      ...this._state(),
      penalties: this._state().penalties.map((item) =>
        item.id === penaltyId ? { ...item, imageUrl } : item,
      ),
    });
  }

  equipItem(itemId: string, targetSlot?: RpgItemSlot): boolean {
    const item = this._state().inventory.find((candidate) => candidate.id === itemId);
    if (!item) {
      return false;
    }
    const slot = targetSlot ?? item.slot;
    if (!this.canEquipItem(item, slot)) return false;
    const equippedItems = { ...this._state().equippedItems };
    for (const [equippedSlot, equippedItemId] of Object.entries(equippedItems)) {
      if (equippedItemId === item.id) {
        delete equippedItems[equippedSlot as RpgItemSlot];
      }
    }
    equippedItems[slot] = item.id;
    this._save({
      ...this._state(),
      equippedItems,
    });
    return true;
  }

  canEquipItem(item: RpgItem, slot: RpgItemSlot): boolean {
    if (!this.canUseItem(item)) return false;
    if (item.slot === 'ringLeft') return slot === 'ringLeft' || slot === 'ringRight';
    if (item.slot === 'ringRight') return slot === 'ringLeft' || slot === 'ringRight';
    return item.slot === slot;
  }

  canUseItem(item: RpgItem): boolean {
    const hasClass = !item.requiredClass || item.requiredClass === this._state().classId;
    const hasLevel = !item.requiredLevel || this.level() >= item.requiredLevel;
    return hasClass && hasLevel;
  }

  itemSaleValue(item: RpgItem): number {
    const rarityMultiplier: Record<RpgItemRarity, number> = {
      common: 1,
      uncommon: 2,
      rare: 4,
      epic: 8,
      legendary: 16,
      mythic: 30,
    };
    const power = Number.isFinite(Number(item.power)) ? Number(item.power) : 0;
    return (
      item.value ??
      Math.max(
        1,
        Math.round((power + 1) * rarityMultiplier[item.rarity] * 2.5),
      )
    );
  }

  itemUpgradeCost(item: RpgItem): number {
    const power = Number.isFinite(Number(item.power)) ? Number(item.power) : 0;
    return Math.max(5, (power + 1) * 8 + (item.upgradeLevel ?? 0) * 15);
  }

  itemBonuses(item: RpgItem): {
    power: number;
    intelligence: number;
    luck: number;
    xpMultiplier: number;
    goldMultiplier: number;
    rareDrop: number;
  } {
    const basePower = Number.isFinite(Number(item.power)) ? Number(item.power) : 0;
    const fallback = {
      power: ['chest', 'mainHand', 'offHand', 'hands'].includes(item.slot)
        ? basePower
        : Math.ceil(basePower * 0.5),
      intelligence: ['head', 'neck', 'companion', 'relic'].includes(item.slot)
        ? Math.max(0, basePower)
        : 0,
      luck: ['ringLeft', 'ringRight', 'pet', 'relic'].includes(item.slot)
        ? Math.max(0, Math.ceil(basePower * 0.5))
        : 0,
      xpMultiplier: ['head', 'hands', 'ringLeft', 'ringRight'].includes(item.slot)
        ? basePower * 0.005
        : 0,
      goldMultiplier: ['neck', 'boots', 'companion', 'relic'].includes(item.slot)
        ? basePower * 0.005
        : 0,
      rareDrop: ['ringLeft', 'ringRight', 'pet', 'relic'].includes(item.slot)
        ? basePower * 0.0025
        : 0,
    };
    return {
      power: item.stats?.power ?? fallback.power,
      intelligence: item.stats?.intelligence ?? fallback.intelligence,
      luck: item.stats?.luck ?? fallback.luck,
      xpMultiplier: item.stats?.xpMultiplier ?? fallback.xpMultiplier,
      goldMultiplier: item.stats?.goldMultiplier ?? fallback.goldMultiplier,
      rareDrop: item.stats?.rareDrop ?? fallback.rareDrop,
    };
  }

  sellItem(itemId: string): { ok: boolean; message: string } {
    const state = this._state();
    const item = state.inventory.find((candidate) => candidate.id === itemId);
    if (!item) return { ok: false, message: 'Item não encontrado.' };
    if (item.id === PET_COMPANION_ID) {
      return { ok: false, message: 'Seu pet não pode ser vendido.' };
    }
    const equippedSlot = Object.entries(state.equippedItems).find(
      ([, equippedId]) => equippedId === itemId,
    )?.[0] as RpgItemSlot | undefined;
    const equippedItems = { ...state.equippedItems };
    if (equippedSlot) delete equippedItems[equippedSlot];
    const value = this.itemSaleValue(item);
    this._save({
      ...state,
      questBonusCoins: state.questBonusCoins + value,
      equippedItems,
      inventory: state.inventory.filter((candidate) => candidate.id !== itemId),
    });
    return { ok: true, message: `${item.name} vendido por ${value} moedas.` };
  }

  upgradeItem(itemId: string): { ok: boolean; message: string } {
    const state = this._state();
    const item = state.inventory.find((candidate) => candidate.id === itemId);
    if (!item) return { ok: false, message: 'Item não encontrado.' };
    if (!this.canUseItem(item)) {
      return {
        ok: false,
        message: 'Somente a classe e o nível exigidos podem aprimorar este item.',
      };
    }
    const cost = this.itemUpgradeCost(item);
    if (this.coins() < cost) {
      return { ok: false, message: `São necessárias ${cost} moedas.` };
    }
    const currentPower = Number.isFinite(Number(item.power)) ? Number(item.power) : 0;
    const gain = Math.max(1, Math.ceil(currentPower * 0.25));
    const currentBonuses = this.itemBonuses(item);
    this._save({
      ...state,
      coinsSpent: state.coinsSpent + cost,
      inventory: state.inventory.map((candidate) =>
        candidate.id === itemId
          ? {
              ...candidate,
              power: currentPower + gain,
              stats: {
                power: currentBonuses.power + gain,
                intelligence:
                  currentBonuses.intelligence +
                  (currentBonuses.intelligence > 0 ? 1 : 0),
                luck: currentBonuses.luck + (currentBonuses.luck > 0 ? 1 : 0),
                xpMultiplier:
                  currentBonuses.xpMultiplier +
                  (currentBonuses.xpMultiplier > 0 ? 0.005 : 0),
                goldMultiplier:
                  currentBonuses.goldMultiplier +
                  (currentBonuses.goldMultiplier > 0 ? 0.005 : 0),
                rareDrop:
                  currentBonuses.rareDrop +
                  (currentBonuses.rareDrop > 0 ? 0.0025 : 0),
              },
              upgradeLevel: (candidate.upgradeLevel ?? 0) + 1,
            }
          : candidate,
      ),
    });
    return { ok: true, message: `${item.name} aprimorado para +${(item.upgradeLevel ?? 0) + 1}.` };
  }

  fuseItems(itemIds: string[]): { ok: boolean; message: string; itemId?: string } {
    const uniqueIds = [...new Set(itemIds)];
    if (uniqueIds.length !== 3) {
      return { ok: false, message: 'Selecione exatamente 3 itens para fundir.' };
    }
    const state = this._state();
    const items = uniqueIds
      .map((id) => state.inventory.find((candidate) => candidate.id === id))
      .filter((item): item is RpgItem => !!item);
    if (items.length !== 3) return { ok: false, message: 'Um dos itens não existe mais.' };
    if (items.some((item) => item.id === PET_COMPANION_ID)) {
      return { ok: false, message: 'Pets não podem ser usados em fusões.' };
    }
    if (items.some((item) => this.isItemEquipped(item.id))) {
      return { ok: false, message: 'Desequipe os três itens antes de fundir.' };
    }
    const slotGroup = (slot: RpgItemSlot): string =>
      slot === 'ringLeft' || slot === 'ringRight' ? 'ring' : slot;
    if (new Set(items.map((item) => slotGroup(item.slot))).size !== 1) {
      return { ok: false, message: 'A fusão exige três itens do mesmo tipo.' };
    }
    if (new Set(items.map((item) => item.rarity)).size !== 1) {
      return { ok: false, message: 'Os três itens precisam ter a mesma raridade.' };
    }
    const rarityOrder: RpgItemRarity[] = [
      'common',
      'uncommon',
      'rare',
      'epic',
      'legendary',
      'mythic',
    ];
    const base = items.reduce((best, item) => (item.power > best.power ? item : best));
    const nextRarity =
      rarityOrder[Math.min(rarityOrder.length - 1, rarityOrder.indexOf(base.rarity) + 1)];
    const fusedUsesRarePack = ['rare', 'epic', 'legendary', 'mythic'].includes(
      nextRarity,
    );
    const fusedAssetPool = fusedUsesRarePack
      ? RARE_ITEM_ASSETS[base.slot]
      : ITEM_PACK_ASSETS[base.slot];
    const fusedAssetId =
      fusedAssetPool[
        Math.abs(
          uniqueIds.join('').split('').reduce((sum, character) => {
            return sum + character.charCodeAt(0);
          }, 0),
        ) % fusedAssetPool.length
      ];
    const fused: RpgItem = {
      ...base,
      id: crypto.randomUUID(),
      name: `${base.name} Fundido`,
      rarity: nextRarity,
      spriteAssetId: fusedAssetId,
      imageUrl: fusedUsesRarePack
        ? rareItemImage(fusedAssetId)
        : itemPackImage(fusedAssetId),
      power: Math.max(
        this.itemBonuses(base).power + 1,
        Math.ceil(
          items.reduce((sum, item) => sum + this.itemBonuses(item).power, 0) * 0.6,
        ),
      ),
      stats: {
        power: Math.ceil(
          items.reduce((sum, item) => sum + this.itemBonuses(item).power, 0) * 0.6,
        ),
        intelligence: Math.ceil(
          items.reduce(
            (sum, item) => sum + this.itemBonuses(item).intelligence,
            0,
          ) * 0.6,
        ),
        luck: Math.ceil(
          items.reduce((sum, item) => sum + this.itemBonuses(item).luck, 0) * 0.6,
        ),
        xpMultiplier:
          items.reduce(
            (sum, item) => sum + this.itemBonuses(item).xpMultiplier,
            0,
          ) * 0.6,
        goldMultiplier:
          items.reduce(
            (sum, item) => sum + this.itemBonuses(item).goldMultiplier,
            0,
          ) * 0.6,
        rareDrop:
          items.reduce((sum, item) => sum + this.itemBonuses(item).rareDrop, 0) *
          0.6,
      },
      upgradeLevel: 0,
      requiredClass:
        items.every((item) => item.requiredClass === items[0].requiredClass)
          ? items[0].requiredClass
          : state.classId,
      obtainedAt: Date.now(),
      source: 'level',
    };
    this._save({
      ...state,
      inventory: [
        ...state.inventory.filter((candidate) => !uniqueIds.includes(candidate.id)),
        fused,
      ],
    });
    return { ok: true, message: `${fused.name} criado com ${fused.power} de poder.`, itemId: fused.id };
  }

  isItemEquipped(itemId: string): boolean {
    return Object.values(this._state().equippedItems).includes(itemId);
  }

  unequipSlot(slot: RpgItemSlot): void {
    const equippedItems = { ...this._state().equippedItems };
    delete equippedItems[slot];
    this._save({ ...this._state(), equippedItems });
  }

  equippedItem(slot: RpgItemSlot): RpgItem | null {
    const id = this._state().equippedItems[slot];
    return this._state().inventory.find((item) => item.id === id) ?? null;
  }

  starRank(starId: string): number {
    return starId === 'destiny-core' ? 1 : (this._state().skills[starId] ?? 0);
  }

  canUnlockStar(starId: string): boolean {
    const star = RPG_CONSTELLATION_STARS.find((candidate) => candidate.id === starId);
    if (!star || star.id === 'destiny-core') return false;
    if (this.starRank(star.id) >= star.maxLevel) return false;
    if (this.level() < (star.requiredLevel ?? 1)) return false;
    if (this.availableSkillPoints() < star.cost) return false;
    // Multiple connections are alternative adjacent paths, as in a passive
    // skill web. Owning any connected predecessor is enough to continue.
    return star.connections.some((connectionId) => this.starRank(connectionId) > 0);
  }

  unlockStar(starId: string): boolean {
    const star = RPG_CONSTELLATION_STARS.find((candidate) => candidate.id === starId);
    if (!star || !this.canUnlockStar(starId)) return false;
    this._save({
      ...this._state(),
      skillPointsSpent: this._state().skillPointsSpent + star.cost,
      lastUnlockedStarId: star.id,
      skills: {
        ...this._state().skills,
        [star.id]: this.starRank(star.id) + 1,
      },
    });
    return true;
  }

  updatePet(name: string, type: RpgPetType): void {
    const currentPet = this._state().pet;
    if (currentPet.boundAt != null && currentPet.type !== type) {
      return;
    }
    const changedSpecies = currentPet.type !== type;
    const isFirstBond = currentPet.boundAt == null;
    this._save(this._syncPetCompanion({
      ...this._state(),
      pet: {
        ...currentPet,
        name: name.trim() || 'Companheiro',
        type,
        xp: changedSpecies || isFirstBond ? 0 : currentPet.xp,
        imageUrl: changedSpecies ? undefined : currentPet.imageUrl,
        createdAt:
          changedSpecies || isFirstBond
            ? Date.now()
            : (currentPet.createdAt ?? Date.now()),
        boundAt: currentPet.boundAt ?? Date.now(),
      },
    }));
  }

  setPetImage(imageUrl: string): void {
    this._save(
      this._syncPetCompanion({
        ...this._state(),
        pet: { ...this._state().pet, imageUrl },
      }),
    );
  }

  addCampaign(title: string, finalBoss: string): void {
    if (!title.trim()) {
      return;
    }
    const campaign: RpgCampaign = {
      id: crypto.randomUUID(),
      title: title.trim(),
      finalBoss: finalBoss.trim() || 'Desafio final',
      chapters: [],
    };
    this._save({ ...this._state(), campaigns: [...this._state().campaigns, campaign] });
  }

  addAnnualGoal(
    title: string,
    habitIds: string[],
    targetDays: number,
    iconIndex: number,
  ): void {
    if (!title.trim() || !habitIds.length) return;
    const goal: RpgAnnualGoal = {
      id: crypto.randomUUID(),
      title: title.trim(),
      habitIds: [...habitIds],
      targetDays: Math.max(1, Math.min(366, Math.round(targetDays))),
      year: new Date().getFullYear(),
      iconIndex: Math.max(1, Math.min(12, Math.round(iconIndex))),
    };
    this._save({
      ...this._state(),
      annualGoals: [...this._state().annualGoals, goal],
    });
  }

  removeAnnualGoal(goalId: string): void {
    this._save({
      ...this._state(),
      annualGoals: this._state().annualGoals.filter((goal) => goal.id !== goalId),
    });
  }

  updateMonthlyMedalConfig(
    medalId: string,
    habitIds: string[],
    targetDays: number,
  ): void {
    const validHabitIds = new Set(
      this._habitTracker
        .habitsForCharacters([this._state().id])
        .map((habit) => habit.id),
    );
    const selected = [...new Set(habitIds)].filter((id) => validHabitIds.has(id));
    if (!selected.length) return;
    this._save({
      ...this._state(),
      monthlyMedalConfigs: {
        ...this._state().monthlyMedalConfigs,
        [medalId]: {
          habitIds: selected,
          targetDays: Math.max(
            1,
            Math.min(31, Math.round(targetDays)),
          ),
        },
      },
    });
  }

  annualGoalProgress(goal: RpgAnnualGoal): {
    completedDays: number;
    percentage: number;
    isUnlocked: boolean;
  } {
    const start = new Date(goal.year, 0, 1);
    const end =
      goal.year === new Date().getFullYear()
        ? new Date()
        : new Date(goal.year, 11, 31);
    let completedDays = 0;
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const date = this._dateKey(cursor);
      if (
        goal.habitIds.every((habitId) =>
          this._habitTracker.isComplete(habitId, date),
        )
      ) {
        completedDays++;
      }
    }
    return {
      completedDays,
      percentage: Math.min(100, (completedDays / goal.targetDays) * 100),
      isUnlocked: completedDays >= goal.targetDays,
    };
  }

  trophyReward(
    kind: 'monthly' | 'annual',
    difficulty: number,
    habitCount = 1,
  ): { xp: number; gold: number } {
    if (kind === 'monthly') {
      return {
        xp: 80 + Math.min(220, Math.round(difficulty * 2)),
        gold: 15 + Math.min(60, Math.round(difficulty / 4)),
      };
    }
    return {
      xp: Math.min(1500, 100 + Math.round(difficulty * 3) + habitCount * 25),
      gold: Math.min(350, 20 + Math.round(difficulty / 3) + habitCount * 10),
    };
  }

  claimAvailableTrophies(): void {
    const state = this._state();
    const claims = { ...state.trophyClaims };
    let xp = 0;
    let gold = 0;
    let changed = false;

    for (const medal of this.monthlyMedals()) {
      const key = `monthly:${medal.id}`;
      if (!medal.isUnlocked || claims[key]) continue;
      const reward = this.trophyReward('monthly', medal.possible);
      claims[key] = { claimedAt: Date.now(), ...reward };
      xp += reward.xp;
      gold += reward.gold;
      changed = true;
    }
    for (const goal of state.annualGoals) {
      const key = `annual:${goal.id}`;
      if (!this.annualGoalProgress(goal).isUnlocked || claims[key]) continue;
      const reward = this.trophyReward(
        'annual',
        goal.targetDays,
        goal.habitIds.length,
      );
      claims[key] = { claimedAt: Date.now(), ...reward };
      xp += reward.xp;
      gold += reward.gold;
      changed = true;
    }
    if (!changed) return;
    this._save({
      ...state,
      trophyClaims: claims,
      questBonusXp: state.questBonusXp + xp,
      questBonusCoins: state.questBonusCoins + gold,
    });
  }

  resolveOverflowByReplacing(itemToRemoveId: string): {
    ok: boolean;
    message: string;
  } {
    const state = this._state();
    const incoming = state.overflowItems[0];
    const removed = state.inventory.find((item) => item.id === itemToRemoveId);
    if (!incoming || !removed) {
      return { ok: false, message: 'Item não encontrado.' };
    }
    if (this.isItemEquipped(removed.id)) {
      return { ok: false, message: 'Desequipe o item antes de substituí-lo.' };
    }
    this._save({
      ...state,
      inventory: [
        ...state.inventory.filter((item) => item.id !== removed.id),
        incoming,
      ].slice(0, RPG_INVENTORY_CAPACITY),
      overflowItems: state.overflowItems.slice(1),
    });
    return {
      ok: true,
      message: `${incoming.name} guardado; ${removed.name} foi removido.`,
    };
  }

  sellOverflowItem(): { ok: boolean; message: string } {
    const state = this._state();
    const incoming = state.overflowItems[0];
    if (!incoming) return { ok: false, message: 'Não há item excedente.' };
    const value = this.itemSaleValue(incoming);
    this._save({
      ...state,
      questBonusCoins: state.questBonusCoins + value,
      overflowItems: state.overflowItems.slice(1),
    });
    return {
      ok: true,
      message: `${incoming.name} vendido por ${value} moedas porque a mochila estava cheia.`,
    };
  }

  travelToRealm(realmId: RpgRealmId): void {
    const state = this._state();
    const previous = state.realmProgress[realmId];
    this._save({
      ...state,
      currentRealmId: realmId,
      realmProgress: {
        ...state.realmProgress,
        [realmId]: {
          steps: previous?.steps ?? 0,
          bossDamage: previous?.bossDamage ?? 0,
          timeSpentMs: previous?.timeSpentMs ?? 0,
          visitedAt: Date.now(),
        },
      },
    });
  }

  mapProjectToRealm(projectId: string, realmId: RpgRealmId): void {
    this._save({
      ...this._state(),
      projectRealms: { ...this._state().projectRealms, [projectId]: realmId },
    });
  }

  addCampaignChapter(
    campaignId: string,
    title: string,
    projectId: string | null,
    targetCompletedTasks: number,
  ): void {
    if (!title.trim()) {
      return;
    }
    this._save({
      ...this._state(),
      campaigns: this._state().campaigns.map((campaign) =>
        campaign.id === campaignId
          ? {
              ...campaign,
              chapters: [
                ...campaign.chapters,
                {
                  id: crypto.randomUUID(),
                  title: title.trim(),
                  projectId,
                  targetCompletedTasks: Math.max(1, Math.round(targetCompletedTasks)),
                },
              ],
            }
          : campaign,
      ),
    });
  }

  setCampaignImage(campaignId: string, imageUrl: string): void {
    this._save({
      ...this._state(),
      campaigns: this._state().campaigns.map((campaign) =>
        campaign.id === campaignId ? { ...campaign, imageUrl } : campaign,
      ),
    });
  }

  deleteCampaign(campaignId: string): void {
    this._save({
      ...this._state(),
      campaigns: this._state().campaigns.filter(
        (campaign) => campaign.id !== campaignId,
      ),
    });
  }

  campaignChapterProgress(projectId: string | null, target: number): number {
    const completed = this._tasks().filter(
      (task) =>
        !task.parentId && task.isDone && (!projectId || task.projectId === projectId),
    ).length;
    return Math.min(100, (completed / target) * 100);
  }

  updateIdentity(displayName: string, avatarDataUrl: string | null): void {
    this._save({ ...this._state(), displayName: displayName.trim(), avatarDataUrl });
  }

  mapProject(projectId: string, attribute: RpgAttributeId | null): void {
    this._save({
      ...this._state(),
      projectAttributes: {
        ...this._state().projectAttributes,
        [projectId]: attribute,
      },
    });
  }

  setAttributeRating(attribute: RpgAttributeId, rating: number): void {
    this._save({
      ...this._state(),
      attributeRatings: {
        ...this._state().attributeRatings,
        [attribute]: Math.max(0, Math.min(10, Math.round(rating))),
      },
    });
  }

  private _subclassBelongsToClass(
    subclassId: RpgSubclassId,
    classId: RpgClassId,
  ): boolean {
    if (subclassId === 'none') return true;
    const classSubclasses: Record<RpgClassId, RpgSubclassId[]> = {
      adventurer: ['vanguard', 'trailblazer'],
      mage: ['chronomancer', 'scholar', 'battlemage', 'archmage'],
      guardian: ['paladin', 'sentinel', 'templar'],
      merchant: ['alchemist', 'artificer', 'tycoon'],
      ranger: ['pathfinder', 'beastmaster', 'warden'],
      warrior: ['berserker', 'warlord'],
      cleric: ['oracle', 'saint'],
      rogue: ['assassin', 'shadowmaster'],
      bard: ['minstrel', 'virtuoso'],
      necromancer: ['reaper', 'lich'],
      archer: ['sniper', 'falconer'],
      barbarian: ['juggernaut', 'chieftain'],
    };
    return classSubclasses[classId].includes(subclassId);
  }

  chooseSubclass(subclassId: RpgSubclassId): void {
    const state = this._state();
    if (
      state.subclassId !== 'none' ||
      subclassId === 'none' ||
      this.level() < RPG_SUBCLASS_UNLOCK_LEVELS[subclassId] ||
      !this._subclassBelongsToClass(subclassId, state.classId)
    ) {
      return;
    }
    this._save({ ...state, subclassId });
  }

  private _enforceProgressionLocks(): void {
    const state = this._state();
    if (
      this.level() < RPG_SUBCLASS_UNLOCK_LEVELS[state.subclassId] ||
      !this._subclassBelongsToClass(state.subclassId, state.classId)
    ) {
      this._save({ ...state, subclassId: 'none' });
    }
  }

  selectTitle(titleId: string | null): void {
    if (titleId && !this.unlockedTitles().some((title) => title.id === titleId)) {
      return;
    }
    this._save({ ...this._state(), selectedTitleId: titleId });
  }

  addReward(title: string, cost: number): void {
    const reward: RpgReward = {
      id: crypto.randomUUID(),
      title: title.trim(),
      cost: Math.max(1, Math.round(cost)),
      purchasedCount: 0,
    };
    this._save({ ...this._state(), rewards: [...this._state().rewards, reward] });
  }

  buyReward(rewardId: string): boolean {
    const reward = this._state().rewards.find((item) => item.id === rewardId);
    if (!reward || this.coins() < reward.cost) {
      return false;
    }
    this._save({
      ...this._state(),
      coinsSpent: this._state().coinsSpent + reward.cost,
      rewards: this._state().rewards.map((item) =>
        item.id === rewardId
          ? { ...item, purchasedCount: item.purchasedCount + 1 }
          : item,
      ),
    });
    return true;
  }

  removeReward(rewardId: string): void {
    this._save({
      ...this._state(),
      rewards: this._state().rewards.filter((item) => item.id !== rewardId),
    });
  }

  setRewardImage(rewardId: string, imageUrl: string): void {
    this._save({
      ...this._state(),
      rewards: this._state().rewards.map((item) =>
        item.id === rewardId ? { ...item, imageUrl } : item,
      ),
    });
  }

  private _xpForTask(task: Task): number {
    const estimatedMinutes = Math.round((task.timeEstimate || 0) / 60000);
    const base = Math.max(5, estimatedMinutes);
    const taskRealm = this._state().projectRealms[task.projectId];
    const realmBonus =
      taskRealm && taskRealm === this._state().currentRealmId ? 0.1 : 0;
    return Math.round(base * (1 + realmBonus));
  }

  private _buildDailyQuests(tasks: Task[]): RpgDailyQuest[] {
    const today = getDbDateStr();
    const todayTasks = tasks.filter(
      (task) => !task.parentId && this._taskDay(task) === today,
    );
    const completed = todayTasks.filter((task) => task.isDone).length;
    const focusedMinutes = Math.floor(
      tasks.reduce((sum, task) => sum + (task.timeSpentOnDay?.[today] ?? 0), 0) / 60000,
    );
    const perfectProgress =
      todayTasks.length > 0 ? Math.round((completed / todayTasks.length) * 100) : 0;
    const questXpMultiplier =
      this._state().classId === 'ranger' ||
      this._state().classId === 'archer' ||
      this._state().subclassId === 'pathfinder' ||
      this._state().subclassId === 'chronomancer'
        ? 1.1
        : 1;

    return [
      this._quest(
        today,
        'first-task',
        'Primeira vitória',
        'Conclua uma tarefa de hoje.',
        'check_circle',
        completed,
        1,
        20,
        1,
        questXpMultiplier,
      ),
      this._quest(
        today,
        'three-tasks',
        'Combo de produtividade',
        'Conclua três tarefas de hoje.',
        'local_fire_department',
        completed,
        3,
        40,
        2,
        questXpMultiplier,
      ),
      this._quest(
        today,
        'focus-hour',
        'Guardião do foco',
        'Registre 60 minutos de foco hoje.',
        'timer',
        focusedMinutes,
        60,
        60,
        3,
        questXpMultiplier,
      ),
      this._quest(
        today,
        'perfect-day',
        'Dia perfeito',
        'Conclua 100% das tarefas planejadas para hoje.',
        'hotel_class',
        perfectProgress,
        100,
        100,
        5,
        questXpMultiplier,
      ),
    ];
  }

  private _buildMonthlyQuests(tasks: Task[]): RpgDailyQuest[] {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const completed = tasks.filter((task) => {
      if (!task.isDone || task.parentId || !task.doneOn) return false;
      const done = new Date(task.doneOn);
      return (
        done.getFullYear() === now.getFullYear() && done.getMonth() === now.getMonth()
      );
    }).length;
    return [
      this._quest(
        month,
        'monthly-legend',
        'Lenda do mês',
        'Conclua 40 tarefas durante este mês.',
        'calendar_month',
        completed,
        40,
        500,
        30,
        1,
      ),
    ];
  }

  private _quest(
    date: string,
    id: string,
    title: string,
    description: string,
    icon: string,
    progress: number,
    target: number,
    rewardXp: number,
    rewardCoins: number,
    multiplier: number,
  ): RpgDailyQuest {
    const claimKey = `${date}:${id}`;
    const isComplete = progress >= target;
    return {
      id: claimKey,
      title,
      description,
      icon,
      progress: Math.min(progress, target),
      target,
      rewardXp: Math.round(rewardXp * multiplier),
      rewardCoins,
      isComplete,
      // A historical claim must never make an incomplete card look completed.
      // This can happen when tracked time is edited or imported after a claim.
      isClaimed: isComplete && claimKey in this._state().claimedDailyQuests,
    };
  }

  private _claimCompletedDailyQuests(): void {
    const completed = this.dailyQuests().filter(
      (quest) => quest.isComplete && !quest.isClaimed,
    );
    if (!completed.length) {
      return;
    }
    const state = this._state();
    const claims = { ...state.claimedDailyQuests };
    let bonusXp = state.questBonusXp;
    let bonusCoins = state.questBonusCoins;
    for (const quest of completed) {
      claims[quest.id] = Date.now();
      bonusXp += quest.rewardXp;
      bonusCoins += quest.rewardCoins;
    }
    this._save({
      ...state,
      claimedDailyQuests: claims,
      questBonusXp: bonusXp,
      questBonusCoins: bonusCoins,
    });
  }

  private _claimCompletedMonthlyQuests(): void {
    const completed = this.monthlyQuests().filter(
      (quest) => quest.isComplete && !quest.isClaimed,
    );
    if (!completed.length) return;
    const state = this._state();
    const claims = { ...state.claimedDailyQuests };
    let bonusXp = state.questBonusXp;
    let bonusCoins = state.questBonusCoins;
    for (const quest of completed) {
      claims[quest.id] = Date.now();
      bonusXp += quest.rewardXp;
      bonusCoins += quest.rewardCoins;
    }
    this._save({
      ...state,
      claimedDailyQuests: claims,
      questBonusXp: bonusXp,
      questBonusCoins: bonusCoins,
    });
  }

  private _achievement(
    id: string,
    title: string,
    description: string,
    icon: string,
    current: number,
    target: number,
  ): RpgAchievement {
    return {
      id,
      title,
      description,
      icon,
      isUnlocked: current >= target,
      progress: Math.min(100, (current / target) * 100),
    };
  }

  private _calculateDiscipline(tasks: Task[]): DisciplineDay[] {
    const days = new Map<string, { total: number; completed: number }>();
    for (const task of tasks) {
      if (task.parentId) {
        continue;
      }
      const date = this._taskDay(task);
      if (!date) {
        continue;
      }
      const day = days.get(date) ?? { total: 0, completed: 0 };
      day.total++;
      if (task.isDone) {
        day.completed++;
      }
      days.set(date, day);
    }
    return [...days.entries()]
      .map(([date, day]) => ({
        date,
        ...day,
        percentage: (day.completed / day.total) * 100,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  private _taskDay(task: Task): string | null {
    if (task.dueWithTime) {
      return getDbDateStr(task.dueWithTime);
    }
    if (task.dueDay) {
      return task.dueDay;
    }
    if (task.doneOn) {
      return getDbDateStr(task.doneOn);
    }
    return null;
  }

  private _penaltyXp(): number {
    const raw = this._state().penalties.reduce((sum, item) => sum + item.xpLoss, 0);
    const resilienceReduction = (this._state().skills['resilience'] ?? 0) * 0.05;
    const ironWillReduction = (this._state().skills['iron-will'] ?? 0) * 0.03;
    const secondChanceReduction = (this._state().skills['second-chance'] ?? 0) * 0.1;
    const skillReduction = Math.min(
      0.65,
      resilienceReduction + ironWillReduction + secondChanceReduction,
    );
    const classReduction = this._state().classId === 'cleric' ? 0.2 : 0;
    return Math.round(raw * Math.max(0.2, 1 - skillReduction - classReduction));
  }

  private _penaltyCoins(): number {
    return this._state().penalties.reduce((sum, item) => sum + item.coinsLoss, 0);
  }

  private _monthlyHabitStats(
    year: number,
    monthIndex: number,
    selectedHabitIds?: readonly string[],
  ): {
    completed: number;
    possible: number;
    completedDays: number;
    possibleDays: number;
    percentage: number;
  } {
    const selected = selectedHabitIds?.length
      ? new Set(selectedHabitIds)
      : null;
    const habits = this._habitTracker
      .habitsForCharacters([this._state().id])
      .filter((habit) => !selected || selected.has(habit.id));
    if (!habits.length) {
      return {
        completed: 0,
        possible: 0,
        completedDays: 0,
        possibleDays: 0,
        percentage: 0,
      };
    }
    const firstDay = new Date(year, monthIndex, 1);
    const lastCalendarDay = new Date(year, monthIndex + 1, 0);
    const today = new Date();
    const lastDay = lastCalendarDay > today ? today : lastCalendarDay;
    if (firstDay > today) {
      return {
        completed: 0,
        possible: 0,
        completedDays: 0,
        possibleDays: 0,
        percentage: 0,
      };
    }

    let completed = 0;
    let possible = 0;
    let completedDays = 0;
    let possibleDays = 0;
    for (
      const cursor = new Date(firstDay);
      cursor <= lastDay;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const date = this._dateKey(cursor);
      let dayPossible = 0;
      let dayCompleted = 0;
      for (const habit of habits) {
        if (cursor.getTime() < new Date(habit.createdAt).setHours(0, 0, 0, 0)) {
          continue;
        }
        possible++;
        dayPossible++;
        if (this._habitTracker.isComplete(habit.id, date)) {
          completed++;
          dayCompleted++;
        }
      }
      if (dayPossible) {
        possibleDays++;
        if (dayCompleted === dayPossible) completedDays++;
      }
    }
    return {
      completed,
      possible,
      completedDays,
      possibleDays,
      percentage: possible ? Math.round((completed / possible) * 100) : 0,
    };
  }

  private _dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private _calculateCurrentStreak(): number {
    const completedDays = new Set(
      this.disciplineDays()
        .filter((day) => day.percentage >= 70)
        .map((day) => day.date),
    );
    const cursor = new Date();
    let streak = 0;
    for (let index = 0; index < 366; index++) {
      const date = getDbDateStr(cursor);
      if (!completedDays.has(date)) {
        if (index === 0) {
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        break;
      }
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  private _buildWeeklyBoss(): {
    key: string;
    title: string;
    progress: number;
    target: number;
    percentage: number;
    isDefeated: boolean;
    isClaimed: boolean;
  } {
    const now = new Date();
    const monday = new Date(now);
    const day = monday.getDay() || 7;
    monday.setHours(0, 0, 0, 0);
    const mondayDate = monday.getDate() - day;
    monday.setDate(mondayDate + 1);
    const end = new Date(monday);
    end.setDate(end.getDate() + 7);
    const progress = Object.values(this._state().xpLedger)
      .filter(
        (entry) => entry.earnedAt >= monday.getTime() && entry.earnedAt < end.getTime(),
      )
      .reduce((sum, entry) => sum + entry.xp, 0);
    const levelTarget = this.level() * 50;
    const target = 300 + levelTarget;
    const key = getDbDateStr(monday);
    return {
      key,
      title: 'Guardião da Fortaleza Semanal',
      progress: Math.min(progress, target),
      target,
      percentage: Math.min(100, (progress / target) * 100),
      isDefeated: progress >= target,
      isClaimed: key in this._state().weeklyBossClaims,
    };
  }

  private _claimWeeklyBoss(): void {
    const boss = this.weeklyBoss();
    if (!boss.isDefeated || boss.isClaimed) {
      return;
    }
    const state = this._state();
    const bossXp = state.classId === 'necromancer' ? 375 : 300;
    this._save(this._withInventoryItems({
      ...state,
      questBonusXp: state.questBonusXp + bossXp,
      questBonusCoins: state.questBonusCoins + 25,
      weeklyBossClaims: { ...state.weeklyBossClaims, [boss.key]: Date.now() },
    }, [this._createDrop('weekly-boss', this._rollBossRarity())]));
  }

  private _grantLevelRewards(inventoryBeforeRewards: ReadonlySet<string>): void {
    const state = this._state();
    const currentLevel = this.level();
    if (currentLevel <= state.lastRewardedLevel) {
      return;
    }
    const drops: RpgItem[] = [];
    for (let level = state.lastRewardedLevel + 1; level <= currentLevel; level++) {
      const treasureBonus = (state.skills['treasure-hunter'] ?? 0) * 0.02;
      const rareInstinctBonus = (state.skills['rare-instinct'] ?? 0) * 0.015;
      const fortuneHeartBonus = (state.skills['fortune-heart'] ?? 0) * 0.05;
      const rogueBonus = state.classId === 'rogue' ? 0.05 : 0;
      // Progressão deliberadamente longa: subir de nível concede Star Points,
      // mas equipamento deve continuar especial mesmo após muitos meses.
      // Nv. 1 ≈ 2,8%, Nv. 10 ≈ 5,5%, Nv. 50 ≈ 17,5%.
      const levelChance = level * 0.003;
      const baseChance = 0.025 + levelChance;
      const equipmentChance =
        this.equipmentBonuses().rareDrop + this.equipmentBonuses().luck * 0.002;
      const bonusChance =
        treasureBonus +
        rareInstinctBonus +
        fortuneHeartBonus +
        rogueBonus +
        equipmentChance;
      // Sorte e talentos ajudam, porém nunca tornam o drop de nível rotineiro.
      const chance = Math.min(0.22, baseChance + bonusChance);
      if (Math.random() <= chance) {
        drops.push(this._createDrop('level', this._rollLevelRarity(level)));
      }
    }
    this._save(this._withInventoryItems({
      ...state,
      lastRewardedLevel: currentLevel,
    }, drops));
    const previousLevel = state.lastRewardedLevel;
    const unlockedSubclasses = Object.entries(RPG_SUBCLASS_UNLOCK_LEVELS)
      .filter(
        ([, requiredLevel]) =>
          requiredLevel > previousLevel && requiredLevel <= currentLevel,
      )
      .map(([subclassId]) => `Nova subclasse disponível: ${subclassId}`);
    const unlockedWorlds = this.worlds()
      .filter(
        (world) => world.level > previousLevel && world.level <= currentLevel,
      )
      .map((world) => `Novo mundo: ${world.name}`);
    this.levelUpCelebration.set({
      previousLevel,
      currentLevel,
      starPoints: currentLevel - previousLevel,
      itemNames: [
        ...state.inventory
          .filter((item) => !inventoryBeforeRewards.has(item.id))
          .map((item) => item.name),
        ...drops.map((item) => item.name),
      ],
      unlocks: [...unlockedSubclasses, ...unlockedWorlds],
    });
  }

  dismissLevelUpCelebration(): void {
    this.levelUpCelebration.set(null);
  }

  private _rollLevelRarity(level: number): RpgItemRarity {
    const roll = Math.random();
    if (level >= 15 && roll < 0.02) return 'epic';
    if (level >= 10 && roll < 0.08) return 'rare';
    if (level >= 4 && roll < 0.35) return 'uncommon';
    return 'common';
  }

  private _rollBossRarity(): RpgItemRarity {
    const roll = Math.random();
    if (this.level() >= 20 && roll < 0.04) return 'legendary';
    if (roll < 0.2) return 'epic';
    return 'rare';
  }

  private _withInventoryItems(
    state: RpgProfileState,
    items: readonly RpgItem[],
  ): RpgProfileState {
    if (!items.length) return state;
    const available = Math.max(0, RPG_INVENTORY_CAPACITY - state.inventory.length);
    return {
      ...state,
      inventory: [...state.inventory, ...items.slice(0, available)],
      overflowItems: [
        ...state.overflowItems,
        ...items.slice(available),
      ],
    };
  }

  private _createStarterEquipment(classId: RpgClassId): RpgItem[] {
    const weapons: Record<
      RpgClassId,
      { name: string; icon: string; spriteAssetId: string }
    > = {
      adventurer: {
        name: 'Espada de treino',
        icon: 'swords',
        spriteAssetId: 'rpg-item-4-7',
      },
      mage: {
        name: 'Grimório de aprendiz',
        icon: 'menu_book',
        spriteAssetId: 'rpg-item-3-4',
      },
      guardian: {
        name: 'Escudo de madeira',
        icon: 'shield',
        spriteAssetId: 'rpg-item-0-4',
      },
      merchant: {
        name: 'Bolsa de viagem',
        icon: 'business_center',
        spriteAssetId: 'rpg-item-5-1',
      },
      ranger: {
        name: 'Arco de treino',
        icon: 'my_location',
        spriteAssetId: 'rpg-item-6-4',
      },
      warrior: {
        name: 'Machado de treino',
        icon: 'hardware',
        spriteAssetId: 'rpg-item-5-6',
      },
      cleric: {
        name: 'Cajado de noviço',
        icon: 'healing',
        spriteAssetId: 'rpg-item-7-7',
      },
      rogue: {
        name: 'Adaga simples',
        icon: 'content_cut',
        spriteAssetId: 'rpg-item-7-7',
      },
      bard: {
        name: 'Alaúde simples',
        icon: 'music_note',
        spriteAssetId: 'rpg-item-3-4',
      },
      necromancer: {
        name: 'Tomo antigo',
        icon: 'book_2',
        spriteAssetId: 'rpg-item-7-3',
      },
      archer: {
        name: 'Arco curto',
        icon: 'my_location',
        spriteAssetId: 'rpg-item-6-6',
      },
      barbarian: {
        name: 'Machado bárbaro',
        icon: 'hardware',
        spriteAssetId: 'rpg-item-5-6',
      },
    };
    const clothing: Partial<Record<RpgClassId, string>> = {
      warrior: 'rpg-item-0-7',
      guardian: 'rpg-item-0-7',
      cleric: 'rpg-item-2-6',
      mage: 'rpg-item-0-6',
      necromancer: 'rpg-item-0-6',
      ranger: 'rpg-item-0-5',
      archer: 'rpg-item-0-5',
      rogue: 'rpg-item-0-4',
      barbarian: 'rpg-item-0-5',
    };
    return [
      {
        id: crypto.randomUUID(),
        name: 'Roupa simples de viajante',
        icon: 'checkroom',
        spriteAssetId: clothing[classId] ?? 'rpg-item-0-5',
        imageUrl: `${GENERATED_ITEM_PATH}/traveler-tunic.png`,
        rarity: 'common',
        requiredClass: classId,
        slot: 'chest',
        power: 0,
        obtainedAt: Date.now(),
        source: 'starter',
      },
      {
        id: crypto.randomUUID(),
        ...weapons[classId],
        imageUrl:
          generatedItemImage(weapons[classId].name, 'mainHand') ??
          itemPackImage(weapons[classId].spriteAssetId),
        rarity: 'common',
        requiredClass: classId,
        slot: 'mainHand',
        power: 0,
        obtainedAt: Date.now(),
        source: 'starter',
      },
    ];
  }

  private _createDrop(source: 'level' | 'weekly-boss', rarity: RpgItemRarity): RpgItem {
    const templates: Record<RpgItemSlot, { name: string; icon: string }> = {
      head: { name: 'Elmo do Foco', icon: 'sports_motorsports' },
      neck: { name: 'Amuleto da Disciplina', icon: 'diamond' },
      chest: { name: 'Armadura da Constância', icon: 'checkroom' },
      hands: { name: 'Luvas da Execução', icon: 'back_hand' },
      mainHand: { name: 'Lâmina das Metas', icon: 'swords' },
      offHand: { name: 'Escudo da Rotina', icon: 'shield' },
      ringLeft: { name: 'Anel do Tempo', icon: 'radio_button_checked' },
      ringRight: { name: 'Anel da Constância', icon: 'radio_button_checked' },
      boots: { name: 'Botas do Caminho', icon: 'ice_skating' },
      companion: { name: 'Companheiro Rúnico', icon: 'pets' },
      pet: { name: 'Runa do Companheiro', icon: 'pets' },
      relic: { name: 'Relíquia do Destino', icon: 'auto_awesome' },
    };
    const slots = Object.keys(templates) as RpgItemSlot[];
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const usesRarePack = ['rare', 'epic', 'legendary', 'mythic'].includes(rarity);
    const slotAssets = usesRarePack ? RARE_ITEM_ASSETS[slot] : ITEM_PACK_ASSETS[slot];
    const spriteAssetId = slotAssets[Math.floor(Math.random() * slotAssets.length)];
    const rarityPower: Record<RpgItemRarity, number> = {
      common: 1,
      uncommon: 2,
      rare: 4,
      epic: 7,
      legendary: 12,
      mythic: 18,
    };
    const classes: RpgClassId[] = [
      'adventurer',
      'mage',
      'guardian',
      'merchant',
      'ranger',
      'warrior',
      'cleric',
      'rogue',
      'bard',
      'necromancer',
      'archer',
      'barbarian',
    ];
    const requiredClass =
      Math.random() < 0.65
        ? this._state().classId
        : classes[Math.floor(Math.random() * classes.length)];
    const requiredLevel: Record<RpgItemRarity, number> = {
      common: 1,
      uncommon: 2,
      rare: 4,
      epic: 7,
      legendary: 12,
      mythic: 20,
    };
    return {
      id: crypto.randomUUID(),
      ...templates[slot],
      spriteAssetId,
      imageUrl:
        generatedItemImage(templates[slot].name, slot) ??
        (usesRarePack ? rareItemImage(spriteAssetId) : itemPackImage(spriteAssetId)),
      rarity,
      requiredClass,
      requiredLevel: requiredLevel[rarity],
      slot,
      power: rarityPower[rarity],
      obtainedAt: Date.now(),
      source,
    };
  }

  private _loadRoster(): RpgProfilesState {
    try {
      const stored = localStorage.getItem(LS.RPG_PROFILE);
      if (!stored) {
        return this._createDefaultRoster();
      }
      const parsed = JSON.parse(stored) as RpgProfilesState | Partial<RpgProfileState>;
      if ('characters' in parsed && parsed.characters) {
        const characters = Object.fromEntries(
          Object.entries(parsed.characters).map(([id, character]) => [
            id,
            this._withStarterRing({ ...DEFAULT_STATE, ...character, id }),
          ]),
        );
        const activeCharacterId =
          parsed.activeCharacterId && characters[parsed.activeCharacterId]
            ? parsed.activeCharacterId
            : Object.keys(characters)[0];
        return {
          activeCharacterId,
          characters,
          processedTaskIds: parsed.processedTaskIds ?? {},
        };
      }
      const migrated = this._withStarterRing({
        ...DEFAULT_STATE,
        ...parsed,
        id: DEFAULT_STATE.id,
      });
      return {
        activeCharacterId: migrated.id,
        characters: { [migrated.id]: migrated },
        processedTaskIds: Object.fromEntries(
          Object.keys(migrated.xpLedger).map((taskId) => [taskId, migrated.id]),
        ),
      };
    } catch {
      return this._createDefaultRoster();
    }
  }

  private _save(state: RpgProfileState): void {
    this._saveRoster({
      ...this._roster(),
      characters: { ...this._roster().characters, [state.id]: state },
    });
  }

  private _createDefaultRoster(): RpgProfilesState {
    return {
      activeCharacterId: DEFAULT_STATE.id,
      characters: { [DEFAULT_STATE.id]: { ...DEFAULT_STATE } },
      processedTaskIds: {},
    };
  }

  private _withStarterRing(state: RpgProfileState): RpgProfileState {
    const slotMigration: Record<string, RpgItemSlot> = {
      weapon: 'mainHand',
      ring: 'ringLeft',
      amulet: 'neck',
    };
    const starterRingAliases = new Set(
      state.inventory
        .filter(
          (item) =>
            item.id === STARTER_RING.id ||
            item.name.trim().toLocaleLowerCase('pt-BR') === 'anel do poder',
        )
        .map((item) => item.id),
    );
    const savedStarterRing = state.inventory.find(
      (item) => item.id === STARTER_RING.id,
    ) ?? state.inventory.find((item) => starterRingAliases.has(item.id));
    const inventoryWithoutDuplicateRings = state.inventory.filter(
      (item) => !starterRingAliases.has(item.id),
    );
    const inventory = [
      {
        ...STARTER_RING,
        power: savedStarterRing?.power ?? STARTER_RING.power,
        upgradeLevel: savedStarterRing?.upgradeLevel,
        obtainedAt: savedStarterRing?.obtainedAt ?? STARTER_RING.obtainedAt,
      },
      ...inventoryWithoutDuplicateRings,
    ].map((item) => {
      const migratedItem = {
        ...item,
        slot: slotMigration[item.slot] ?? item.slot,
      };
      if (item.id === STARTER_RING.id) {
        return {
          ...migratedItem,
          imageUrl: STARTER_RING.imageUrl,
          spriteAssetId: undefined,
        };
      }
      const semanticImage = generatedItemImage(
        migratedItem.name,
        migratedItem.slot,
      );
      if (semanticImage) {
        return {
          ...migratedItem,
          imageUrl: semanticImage,
          spriteAssetId: undefined,
        };
      }
      if (['rare', 'epic', 'legendary', 'mythic'].includes(migratedItem.rarity)) {
        const rareAssets = RARE_ITEM_ASSETS[migratedItem.slot];
        const rareAssetIndex =
          Math.abs(
            [...migratedItem.id].reduce(
              (sum, character) => sum + character.charCodeAt(0),
              0,
            ),
          ) % rareAssets.length;
        const spriteAssetId = migratedItem.spriteAssetId?.startsWith('rare-item-')
          ? migratedItem.spriteAssetId
          : rareAssets[rareAssetIndex];
        return {
          ...migratedItem,
          spriteAssetId,
          imageUrl: rareItemImage(spriteAssetId),
        };
      }
      if (migratedItem.spriteAssetId?.startsWith('rpg-item-')) {
        return {
          ...migratedItem,
          imageUrl: itemPackImage(migratedItem.spriteAssetId),
        };
      }
      if (migratedItem.spriteAssetId?.startsWith('rare-item-')) {
        return {
          ...migratedItem,
          imageUrl: rareItemImage(migratedItem.spriteAssetId),
        };
      }
      const availableAssets = ITEM_PACK_ASSETS[migratedItem.slot];
      const assetIndex = Math.abs(
        [...migratedItem.id].reduce((sum, character) => sum + character.charCodeAt(0), 0),
      ) % availableAssets.length;
      const spriteAssetId = availableAssets[assetIndex];
      return {
        ...migratedItem,
        spriteAssetId,
        imageUrl: itemPackImage(spriteAssetId),
      };
    });
    const equippedItems = Object.fromEntries(
      Object.entries(state.equippedItems).map(([slot, itemId]) => [
        slotMigration[slot] ?? slot,
        starterRingAliases.has(itemId) ? STARTER_RING.id : itemId,
      ]),
    ) as Partial<Record<RpgItemSlot, string>>;
    if (
      equippedItems.ringLeft === STARTER_RING.id &&
      equippedItems.ringRight === STARTER_RING.id
    ) {
      delete equippedItems.ringRight;
    }
    return this._syncPetCompanion({
      ...state,
      attributeRatings: {
        ...DEFAULT_STATE.attributeRatings,
        ...state.attributeRatings,
      },
      pet: { ...DEFAULT_STATE.pet, ...state.pet },
      appearance: { ...DEFAULT_APPEARANCE, ...state.appearance },
      equippedItems,
      inventory,
    });
  }

  private _syncPetCompanion(state: RpgProfileState): RpgProfileState {
    const legacyTypes: Record<string, RpgPetType> = {
      cat: 'tiger',
      owl: 'griffin',
      slime: 'phoenix',
      wolf: 'wolf',
      dragon: 'dragon',
    };
    const rawPet = { ...DEFAULT_STATE.pet, ...state.pet };
    const type = PET_TYPES[rawPet.type]
      ? rawPet.type
      : (legacyTypes[rawPet.type] ?? 'tiger');
    const pet: RpgPet = {
      ...rawPet,
      type,
      createdAt: rawPet.createdAt ?? state.createdAt ?? Date.now(),
      boundAt: rawPet.boundAt === undefined ? Date.now() : rawPet.boundAt,
    };
    const definition = PET_TYPES[pet.type];
    const level = Math.max(1, Math.floor(pet.xp / this._petXpPerLevel) + 1);
    const days = Math.max(
      1,
      Math.floor((Date.now() - (pet.createdAt ?? Date.now())) / 86_400_000) + 1,
    );
    const stage: RpgPetStage =
      level >= 200 && days >= 120
        ? 'epic'
        : level >= 100 && days >= 60
          ? 'adult'
          : level >= 40 && days >= 21
            ? 'teen'
            : level >= 5 && days >= 3
              ? 'cub'
              : 'egg';
    const rarity: RpgItemRarity =
      stage === 'epic'
        ? 'legendary'
        : stage === 'adult'
          ? 'epic'
          : stage === 'teen'
            ? 'rare'
            : stage === 'cub'
              ? 'uncommon'
              : 'common';
    const item: RpgItem = {
      id: PET_COMPANION_ID,
      name: `${pet.name} · ${definition.label}`,
      icon: definition.icon,
      imageUrl:
        pet.imageUrl ||
        `assets/rpg/pets/evolutions/${definition.slug}-${stage}.png`,
      spriteAssetId: undefined,
      description: `Mascote ${stage}, nível ${level} e ${days} dias de vínculo.`,
      rarity,
      slot: 'pet',
      power: level,
      obtainedAt: state.createdAt || Date.now(),
      source: 'starter',
    };
    const inventory = state.inventory.filter((candidate) => candidate.id !== item.id);
    const equippedItems = { ...state.equippedItems };
    if (equippedItems.companion === PET_COMPANION_ID) {
      delete equippedItems.companion;
      equippedItems.pet = PET_COMPANION_ID;
    }
    return { ...state, pet, equippedItems, inventory: [item, ...inventory] };
  }

  private _saveRoster(roster: RpgProfilesState): void {
    this._roster.set(roster);
    void this._domainState.put('rpg:profiles', roster);
  }

  private async _hydrateDomainState(): Promise<void> {
    if (localStorage.getItem(LS.RPG_PROFILE)) {
      await this._domainState.put('rpg:profiles', this._roster());
      localStorage.removeItem(LS.RPG_PROFILE);
      return;
    }
    const stored = await this._domainState.get<RpgProfilesState>('rpg:profiles');
    if (stored?.characters?.[stored.activeCharacterId]) {
      this._roster.set(stored);
    }
  }
}
