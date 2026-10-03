import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { TaskService } from '../tasks/task.service';
import { LS } from '../../core/persistence/storage-keys.const';
import {
  DisciplineDay,
  RpgAttributeDefinition,
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
  RpgContract,
  RpgPenalty,
  RpgPetType,
  RpgWeeklyReview,
  RpgReward,
  RpgAppearance,
  RpgAnnualGoal,
  RpgRealmId,
  RpgSpeciesId,
  RpgSubclassId,
  RPG_SUBCLASS_BONUSES,
  RPG_SUBCLASS_UNLOCK_LEVELS,
} from './rpg-profile.model';
import { RPG_CLASS_TITLES, RpgTitleMetric } from './rpg-class-titles.data';
import { RPG_TIER_ACHIEVEMENT_SETS } from './rpg-tier-achievements.data';
import {
  RPG_EMERGENCY_RECOVERY_FLAG,
  getEmergencyRecoveryCharacter,
} from './rpg-emergency-recovery.data';
import {
  monthlyMedalHistoryFor,
  isMonthlyMedalHistoryCompleted,
  monthlyMedalHistoryPercentage,
  applyMonthlyMedalHistorySeed,
  RPG_MONTHLY_MEDAL_HISTORY_YEAR,
  RPG_MONTHLY_MEDAL_HISTORY_BONUS_KEY,
} from './rpg-monthly-medal-history.data';
import { TaskHabitService } from '../habit-tracker/task-habit.service';
import { Task } from '../tasks/task.model';
import { getDbDateStr } from '../../util/get-db-date-str';
import { debounceTime } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RPG_CONSTELLATION_STARS } from './rpg-constellations.data';
import { RpgConstellationBonuses } from './rpg-constellations.model';
import { DomainStateStore } from '../../core/persistence/domain-state-store.service';
import { RPG_REALMS } from './rpg-realms.data';
import {
  RPG_CATALOG_IMAGE_BY_NAME,
  RPG_CLASS_ITEM_CATALOG,
  RPG_PET_ITEM_ATTRIBUTE_BY_NAME,
  RPG_PET_ITEM_CATALOG,
} from './rpg-item-catalog.data';
import {
  applyImageReplacements,
  shrinkLargeInlineImages,
} from '../../util/shrink-image-data-url';
import { CareerQuestState } from '../career-quest/career-quest.model';
import {
  contractProgress,
  MEDAL_TIER_EXTRA,
  medalTierFor,
  startOfWeekMs,
} from './rpg-contracts.util';

const RPG_REALM_BY_ID = new Map(RPG_REALMS.map((realm) => [realm.id, realm]));

const ITEM_PACK_PATH = 'assets/rpg/items-pack';
const RARE_ITEM_PACK_PATH = 'assets/rpg/rare-items';
const GENERATED_ITEM_PATH = 'assets/rpg/generated-items';
const ITEM_PACK_ASSETS: Record<RpgItemSlot, string[]> = {
  head: ['rpg-item-0-6'],
  neck: ['rpg-item-6-2', 'rpg-item-6-3'],
  chest: ['rpg-item-0-5', 'rpg-item-0-7', 'rpg-item-2-6'],
  hands: ['rpg-item-2-5', 'rpg-item-1-5'],
  mainHand: [
    'rpg-item-4-5',
    'rpg-item-4-7',
    'rpg-item-5-6',
    'rpg-item-6-4',
    'rpg-item-7-7',
  ],
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

/** Extra names per slot for drops - each maps to art via generatedItemImage. */
const DROP_VARIANTS: Partial<Record<RpgItemSlot, { name: string; icon: string }[]>> = {
  head: [
    { name: 'Elmo do Foco', icon: 'sports_motorsports' },
    { name: 'Elmo de Aço', icon: 'sports_motorsports' },
  ],
  neck: [
    { name: 'Amuleto da Disciplina', icon: 'diamond' },
    { name: 'Amuleto Violeta', icon: 'diamond' },
  ],
  chest: [
    { name: 'Armadura da Constância', icon: 'checkroom' },
    { name: 'Peitoral de Prata', icon: 'checkroom' },
  ],
  hands: [
    { name: 'Luvas da Execução', icon: 'back_hand' },
    { name: 'Luvas de Couro', icon: 'back_hand' },
  ],
  offHand: [
    { name: 'Escudo da Rotina', icon: 'shield' },
    { name: 'Escudo do Cavaleiro', icon: 'shield' },
  ],
  ringLeft: [
    { name: 'Anel do Tempo', icon: 'radio_button_checked' },
    { name: 'Anel Prateado', icon: 'radio_button_checked' },
  ],
  ringRight: [
    { name: 'Anel da Constância', icon: 'radio_button_checked' },
    { name: 'Anel Prateado', icon: 'radio_button_checked' },
  ],
  boots: [
    { name: 'Botas do Caminho', icon: 'ice_skating' },
    { name: 'Botas de Couro', icon: 'ice_skating' },
  ],
  companion: [
    { name: 'Runa do Companheiro', icon: 'pets' },
    { name: 'Coleira Encantada', icon: 'pets' },
    { name: 'Sino do Vínculo', icon: 'notifications' },
    { name: 'Pingente de Patinha', icon: 'pets' },
  ],
  relic: [
    { name: 'Relíquia do Destino', icon: 'auto_awesome' },
    { name: 'Chave do Tesouro', icon: 'key' },
  ],
};

const BLADES = [
  { name: 'Lâmina das Metas', icon: 'swords' },
  { name: 'Espada de Treino', icon: 'swords' },
  { name: 'Machado de Batalha', icon: 'hardware' },
];
const ARCANE = [
  { name: 'Cajado Arcano', icon: 'auto_fix_high' },
  { name: 'Tomo Antigo', icon: 'book_2' },
  { name: 'Grimório Rúnico', icon: 'menu_book' },
  { name: 'Orbe Astral', icon: 'brightness_7' },
  { name: 'Varinha Lunar', icon: 'nightlight' },
];
/** Weapon drops per class - each name maps to art via generatedItemImage. */
const CLASS_WEAPONS: Record<string, { name: string; icon: string }[]> = {
  adventurer: BLADES,
  warrior: BLADES,
  barbarian: BLADES,
  guardian: BLADES,
  mage: ARCANE,
  necromancer: ARCANE,
  cleric: [ARCANE[0], ARCANE[1], ARCANE[3]],
  rogue: [
    { name: 'Adaga Sombria', icon: 'content_cut' },
    { name: 'Lâmina das Metas', icon: 'swords' },
  ],
  ranger: [{ name: 'Arco Curto', icon: 'my_location' }, BLADES[0]],
  archer: [{ name: 'Arco Longo', icon: 'my_location' }],
  bard: [
    { name: 'Alaúde Encantado', icon: 'music_note' },
    { name: 'Varinha Lunar', icon: 'nightlight' },
  ],
  merchant: [
    { name: 'Bolsa de Ouro', icon: 'business_center' },
    { name: 'Chave do Tesouro', icon: 'key' },
  ],
};

/** Pet attributes a companion accessory grants, by kind (name). */
const companionPetAttributes = (
  name: string,
  power: number,
): { loyalty: number; joy: number; scent: number } => {
  const p = Math.max(0, power);
  // Pet treats/toys feed one specific attribute (see RPG_PET_ITEM_CATALOG).
  const petAttribute = RPG_PET_ITEM_ATTRIBUTE_BY_NAME.get(name);
  if (petAttribute) {
    return {
      loyalty: petAttribute === 'loyalty' ? p : 0,
      joy: petAttribute === 'joy' ? p : 0,
      scent: petAttribute === 'scent' ? p : 0,
    };
  }
  const normalized = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  if (normalized.includes('coleira')) return { loyalty: p, joy: 0, scent: 0 };
  if (normalized.includes('sino')) return { loyalty: 0, joy: p, scent: 0 };
  if (normalized.includes('pingente')) return { loyalty: 0, joy: 0, scent: p };
  const half = Math.ceil(p * 0.5);
  return { loyalty: half, joy: half, scent: half };
};

const generatedItemImage = (name: string, slot: RpgItemSlot): string | null => {
  const normalized = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const namedIcons: [string, string][] = [
    // Companion accessories (checked first: 'runa do companheiro' must not
    // fall through to a generic keyword).
    ['coleira', 'companion-collar'],
    ['sino', 'companion-bell'],
    ['pingente', 'companion-pendant'],
    ['runa do companheiro', 'companion-rune'],
    // Variant names that reuse existing art - must precede the generic
    // keyword of their slot ('elmo', 'amuleto', 'luvas'...).
    ['elmo de aco', 'steel-helmet'],
    ['amuleto violeta', 'purple-amulet'],
    ['peitoral', 'silver-breastplate'],
    ['luvas de couro', 'leather-gloves'],
    ['escudo do cavaleiro', 'knight-shield'],
    ['botas de couro', 'leather-boots'],
    ['anel prateado', 'silver-blue-ring'],
    ['chave', 'treasure-key'],
    ['orbe', 'arcane-orb'],
    ['varinha', 'moon-wand'],
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
/** XP/coins actually deducted by a penalty so far; older entries predate the running totals. */
const penaltyAppliedTotals = (penalty: RpgPenalty): { xp: number; coins: number } => ({
  xp: penalty.xpLossApplied ?? penalty.xpLoss * (penalty.timesApplied ?? 0),
  coins: penalty.coinsLossApplied ?? penalty.coinsLoss * (penalty.timesApplied ?? 0),
});

/** Rounds a real-money amount (R$) to cents, never negative. */
const toMoney = (value: number): number =>
  Math.max(0, Math.round((Number(value) || 0) * 100) / 100);

const RPG_REWARDS_PENALTIES_SEED_FLAG = 'rpg-rewards-penalties-seed-2026-07-31-v1';
// One-time manual credit for "O Codificador" (August 2026): the owner's real
// data-science study days that month were tracked in Academia Arcana, not
// the "Estudar Dados" Habit Tracker habit, so the medal has no way to see
// them on its own - requested directly by the owner.
const RPG_AUGUST_CODIFICADOR_CREDIT_FLAG = 'rpg-august-codificador-credit-2026-09-16-v1';
// Which single character the historical 2026 monthly-medal import
// (_seedMonthlyMedalHistory) belongs to - it must never leak into any other
// character in the roster. Recorded the first time the seed successfully
// applies; defaults to the recovered real character so it's pinned correctly
// from the very first run, regardless of which character happens to be
// active at that moment.
const RPG_MONTHLY_MEDAL_HISTORY_OWNER_KEY =
  'rpg-monthly-medal-history-owner-character-id';
export const RPG_INVENTORY_CAPACITY = 22;
const PET_TYPES: Record<RpgPetType, { label: string; slug: string; icon: string }> = {
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
  // localStorage->domain-state migration/restore in _hydrateDomainState() is
  // async; nothing that saves the roster (trophy/medal claiming included)
  // may run before it settles, or it can persist the pre-hydration in-memory
  // roster and clobber whichever character was actually stored.
  private readonly _hydrated = signal(false);
  readonly hydrated = this._hydrated.asReadonly();
  private readonly _state = computed(
    () => this._roster().characters[this._roster().activeCharacterId],
  );
  private readonly _tasks = signal<Task[]>([]);
  private _tasksLoaded = false;

  readonly state = this._state;
  readonly characters = computed(() => Object.values(this._roster().characters));
  readonly activeCharacterId = computed(() => this._roster().activeCharacterId);
  /** Task id -> id of the character it was credited to (done or failed). */
  readonly taskOwnerIds = computed(() => this._roster().processedTaskIds);
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
  // No level check here: level() derives from XP, which uses this bonus (a
  // computed cycle). _enforceProgressionLocks already resets a subclass the
  // current level can't hold.
  private readonly _subclassBonus = computed(
    () => RPG_SUBCLASS_BONUSES[this._state().subclassId],
  );
  /**
   * XP bonus for honours already earned: +0.5% per tier medal and +3% per
   * class title. Read from the persisted unlock records (not from
   * classTitleTiers / tierAchievementSets, which depend on level -> XP and
   * would make xpMultiplier circular). A title i-1 is unlocked once
   * classTierBaselines[class][i] is stamped; the last one via mastery.
   */
  readonly honorBonus = computed(() => {
    const state = this._state();
    // Unlocked titles come from classUnlockedTitleTiers; older saves only
    // have classTierBaselines (key i stamped => tier i-1 unlocked) and
    // mastery (tier 4).
    const byClass = new Map<string, Set<number>>();
    const add = (classId: string, tier: number): void => {
      if (!byClass.has(classId)) byClass.set(classId, new Set());
      byClass.get(classId)!.add(tier);
    };
    for (const [classId, tiers] of Object.entries(state.classUnlockedTitleTiers ?? {})) {
      for (const key of Object.keys(tiers ?? {})) add(classId, Number(key));
    }
    for (const [classId, tiers] of Object.entries(state.classTierBaselines ?? {})) {
      for (const key of Object.keys(tiers ?? {})) add(classId, Number(key) - 1);
      if (state.masteredClassBonuses?.[classId as RpgClassId]) add(classId, 4);
    }
    const unlockedTiers = [...byClass.values()].flatMap((tiers) => [...tiers]);
    const rewards = unlockedTiers.map((index) => this.titleReward(index));
    return {
      titles: unlockedTiers.length,
      xp: rewards.reduce((sum, reward) => sum + reward.xp, 0),
      gold: rewards.reduce((sum, reward) => sum + reward.gold, 0),
    };
  });
  /** Bonus a class title grants once unlocked, growing with its tier (0..4). */
  titleReward(tierIndex: number): { xp: number; gold: number } {
    const xp = [0.02, 0.03, 0.04, 0.06, 0.08];
    const gold = [0.01, 0.015, 0.02, 0.03, 0.04];
    const index = Math.min(4, Math.max(0, tierIndex));
    return { xp: xp[index], gold: gold[index] };
  }
  /**
   * The honour bonus as it was computed before titles-only (+0.2-1% XP and
   * +0.1-0.5% gold per medal by tier, +3% XP per title) - only used to freeze
   * past XP at the multiplier the player actually had when history starts.
   */
  private _legacyHonorBonus(): { xp: number; gold: number } {
    const state = this._state();
    const xpByTier = [0.002, 0.0035, 0.005, 0.0075, 0.01];
    const goldByTier = [0.001, 0.0015, 0.0025, 0.0035, 0.005];
    let xp = this.honorBonus().titles * 0.03;
    let gold = 0;
    for (const id of Object.keys(state.unlockedTierAchievementIds ?? {})) {
      const tier = Math.min(4, Math.max(0, Number(/^tier(\d+)-/.exec(id)?.[1] ?? 0)));
      xp += xpByTier[tier];
      gold += goldByTier[tier];
    }
    return { xp, gold };
  }
  /**
   * Sorte (equipment + constellations): +0.2% level-up rare-drop chance per
   * point, and it lifts that chance's 22% cap by 0.1% per point (up to 30%) -
   * otherwise a capped character gained nothing from more luck.
   */
  readonly luckEffect = computed(() => {
    const luck = this.equipmentBonuses().luck + this.constellationBonuses().luck;
    return { luck, chance: luck * 0.002, cap: Math.min(0.3, 0.22 + luck * 0.001) };
  });
  /** Attributes the equipped companion accessory gives the pet (see itemBonuses). */
  readonly petAttributes = computed(() => {
    const itemId = this._state().equippedItems.companion;
    const item = itemId
      ? this._state().inventory.find((candidate) => candidate.id === itemId)
      : undefined;
    if (!item) return null;
    const bonuses = this.itemBonuses(item);
    return {
      itemName: item.name,
      loyalty: Math.round(bonuses.xpMultiplier / 0.005),
      joy: Math.round(bonuses.goldMultiplier / 0.005),
      scent: Math.round(bonuses.rareDrop / 0.0025),
      ...bonuses,
    };
  });
  /**
   * Odds of each rarity for a level-up drop at the current level. Luck shifts
   * every threshold up (0.5% "boost" per point, capped at 40%), so a lucky
   * character gets better items, not just more of them. Legendary only from
   * level 25.
   */
  readonly levelDropOdds = computed(() => this._levelDropOdds(this.level()));
  private _levelDropOdds(
    level: number,
  ): Record<'uncommon' | 'rare' | 'epic' | 'legendary', number> {
    const boost = Math.min(0.4, this.luckEffect().luck * 0.005);
    return {
      legendary: level >= 25 ? boost * 0.05 : 0,
      epic: level >= 15 ? 0.02 + boost * 0.15 : 0,
      rare: level >= 10 ? 0.08 + boost * 0.4 : 0,
      uncommon: level >= 4 ? 0.35 + boost * 0.6 : 0,
    };
  }
  readonly baseTaskXp = computed(() =>
    Object.values(this._state().xpLedger).reduce((sum, entry) => sum + entry.xp, 0),
  );
  readonly xpMultiplier = computed(() => {
    let multiplier = this._state().classId === 'mage' ? 1.1 : 1;
    if (this._state().classId === 'warrior') {
      multiplier += 0.05;
    }
    multiplier += this._subclassBonus().xp ?? 0;
    multiplier += (this._state().skills['focus-mastery'] ?? 0) * 0.02;
    multiplier += (this._state().skills['deep-work'] ?? 0) * 0.015;
    multiplier += (this._state().skills['wisdom-core'] ?? 0) * 0.01;
    multiplier += this.equipmentBonuses().xpMultiplier;
    multiplier += this.constellationBonuses().xpMultiplier;
    multiplier += this.honorBonus().xp;
    return multiplier;
  });
  readonly goldMultiplier = computed(() => {
    let multiplier = this._state().classId === 'merchant' ? 1.2 : 1;
    multiplier += this._subclassBonus().gold ?? 0;
    if (this._state().classId === 'bard') {
      multiplier += Math.min(0.15, this.streak() * 0.01);
    }
    multiplier += this.equipmentBonuses().goldMultiplier;
    multiplier += this.constellationBonuses().goldMultiplier;
    multiplier += this.honorBonus().gold;
    return multiplier;
  });
  /**
   * Where each bonus comes from, mirroring xpMultiplier / goldMultiplier and the
   * level-up rare-drop roll. Values are fractions (0.1 = +10%).
   */
  readonly bonusBreakdown = computed(() => {
    const state = this._state();
    const skill = (id: string): number => state.skills[id] ?? 0;
    const subclass = this._subclassBonus();
    const equipment = this.equipmentBonuses();
    const constellations = this.constellationBonuses();
    const rows = [
      {
        source: 'Classe',
        xp: state.classId === 'mage' ? 0.1 : state.classId === 'warrior' ? 0.05 : 0,
        gold:
          state.classId === 'merchant'
            ? 0.2
            : state.classId === 'bard'
              ? Math.min(0.15, this.streak() * 0.01)
              : 0,
        rare: state.classId === 'rogue' ? 0.05 : 0,
      },
      { source: 'Subclasse', xp: subclass.xp ?? 0, gold: subclass.gold ?? 0, rare: 0 },
      {
        source: 'Talentos',
        xp:
          skill('focus-mastery') * 0.02 +
          skill('deep-work') * 0.015 +
          skill('wisdom-core') * 0.01,
        gold: 0,
        rare:
          skill('treasure-hunter') * 0.02 +
          skill('rare-instinct') * 0.015 +
          skill('fortune-heart') * 0.05,
      },
      {
        source: 'Equipamento',
        xp: equipment.xpMultiplier,
        gold: equipment.goldMultiplier,
        rare: equipment.rareDrop,
      },
      {
        source: 'Constelações',
        xp: constellations.xpMultiplier,
        gold: constellations.goldMultiplier,
        rare: constellations.rareDrop,
      },
      {
        source: `Sorte (${this.luckEffect().luck})`,
        xp: 0,
        gold: 0,
        rare: this.luckEffect().chance,
      },
      {
        source: `Títulos (${this.honorBonus().titles})`,
        xp: this.honorBonus().xp,
        gold: this.honorBonus().gold,
        rare: 0,
      },
      { source: 'Nível', xp: 0, gold: 0, rare: 0.025 + this.level() * 0.003 },
    ];
    const rareSum = rows.reduce((sum, row) => sum + row.rare, 0);
    const rareCap = this.luckEffect().cap;
    // Only applies to tasks of projects mapped to this city (see _xpForTask /
    // _realmTaskBonus), so it's shown apart and kept out of the totals.
    const realm = RPG_REALM_BY_ID.get(state.currentRealmId);
    return {
      rows,
      realm: realm
        ? {
            name: realm.name,
            xp: realm.bonuses.xp,
            gold: realm.bonuses.gold,
            rare: realm.bonuses.rareDrop,
          }
        : null,
      total: {
        xp: this.xpMultiplier() - 1,
        gold: this.goldMultiplier() - 1,
        rare: Math.min(rareCap, rareSum),
      },
      rareCap,
      rareCapped: rareSum > rareCap,
    };
  });
  /**
   * Task XP / gold-base weighted by the multiplier in effect when each entry
   * was earned (multiplierHistory), so changing class, subclass, items or
   * titles never re-scales XP already earned. Before the history is seeded,
   * falls back to the live multipliers (the old behaviour).
   */
  private readonly _weightedTaskTotals = computed(() => {
    const history = this._state().multiplierHistory;
    const entries = Object.values(this._state().xpLedger);
    if (!history?.length) {
      const base = this.baseTaskXp();
      return { xp: base * this.xpMultiplier(), gold: base * this.goldMultiplier() };
    }
    let xp = 0;
    let gold = 0;
    for (const entry of entries) {
      let segment = history[0];
      for (const candidate of history) {
        if (candidate.at <= (entry.earnedAt ?? 0)) segment = candidate;
        else break;
      }
      xp += entry.xp * segment.xp;
      gold += entry.xp * segment.gold;
    }
    return { xp, gold };
  });
  readonly totalXp = computed(() => {
    const earned = Math.round(this._weightedTaskTotals().xp) + this._state().questBonusXp;
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
      Math.floor(this._weightedTaskTotals().gold * 0.1) +
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
  // Legacy rates, kept only to reproduce whatever level a pet had already
  // Level tracks bond-age directly (days), not task XP - XP-based leveling
  // could never reliably stay in sync with petStageKey's day gates (a pet
  // could blow past a stage's level threshold within a month, long before
  // its bond-age gate). This rate is tuned so a pet's level tracks roughly
  // alongside the owner's own character level over the same span, rather
  // than the much steeper (5/3/day) rate used before 2026-08-31, which let
  // levels run far ahead of both bond-age and character level.
  private readonly _petLevelGrowthPerDay = 0.6;
  private _petAgeDaysFor(pet: RpgPet): number {
    if (pet.boundAt == null) return 0;
    return Math.max(
      1,
      Math.floor((Date.now() - (pet.createdAt ?? Date.now())) / 86_400_000) + 1,
    );
  }
  private _petLevelFor(pet: RpgPet): number {
    return Math.max(
      1,
      Math.round(1 + this._petAgeDaysFor(pet) * this._petLevelGrowthPerDay),
    );
  }
  readonly petLevel = computed(() => this._petLevelFor(this._state().pet));
  readonly petIsBound = computed(() => this._state().pet.boundAt != null);
  // The generic "Ovo misterioso" placeholder exists from character creation,
  // but the pet's own journey (bond age, evolution stage) must only start
  // once the player actually names/binds their unique pet via updatePet() -
  // which is also the point pet.createdAt gets reset to "now" for this
  // reason. Before that, there's nothing bonded yet, so age is 0.
  readonly petAgeDays = computed(() => this._petAgeDaysFor(this._state().pet));
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
  readonly disciplineDays = computed(() => this._calculateDiscipline());
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
      // Accumulated, unlike discipline() (an average that can never pass 100
      // and so could never reach the 150+ tier targets): each tracked day adds
      // its completion % / 10, so a perfect day is worth 10 points.
      discipline: Math.round(
        this.disciplineDays().reduce((sum, day) => sum + day.percentage / 10, 0),
      ),
      social: 0,
      finance: 0,
    };
    const mappings = this._state().projectAttributes;
    for (const entry of Object.values(this._state().xpLedger)) {
      const attribute = mappings[entry.projectId];
      // Custom attributes aren't part of the core totals that feed titles,
      // constellations and tier achievements.
      if (attribute && attribute !== 'discipline' && attribute in totals) {
        totals[attribute as RpgAttributeId] += entry.xp;
      }
    }
    if (this._state().classId === 'guardian') {
      totals.health = Math.round(totals.health * 1.15);
    }
    totals.health = Math.round(totals.health * (1 + (this._subclassBonus().health ?? 0)));
    return totals;
  });
  readonly dailyQuests = computed(() => this._buildDailyQuests(this._tasks()));
  readonly monthlyQuests = computed(() => this._buildMonthlyQuests(this._tasks()));
  // Raw values behind the 10 tier achievements, shared by every class.
  private readonly _tierAchievementMetricValues = computed(() => {
    const attrs = this.attributeXp();
    return {
      totalXp: this.totalXp(),
      coins: this.coins(),
      streak: this.streak(),
      health: attrs.health,
      intelligence: attrs.intelligence,
      discipline: attrs.discipline,
      social: attrs.social,
      finance: attrs.finance,
      petLevel: this.petLevel(),
      characterAgeDays: Math.floor((Date.now() - this._state().createdAt) / 86_400_000),
    };
  });
  // 5 sets of 10 achievements (one set per title tier). Set[i] must be fully
  // completed before title tier[i] can unlock, on top of its own level and
  // attribute requirement - completing "iniciante" unlocks the ability to
  // become "Aprendiz Arcano", completing "Aprendiz Arcano"'s set unlocks
  // "Estudioso das Runas", and so on.
  readonly tierAchievementSets = computed(() => {
    const values = this._tierAchievementMetricValues();
    // Non-monotonic metrics (streak, coins) can drop back below a target
    // already reached - unlockedTierAchievementIds is a permanent record of
    // every achievement ever reached, so isUnlocked never flickers back off.
    const everUnlocked = this._state().unlockedTierAchievementIds ?? {};
    return RPG_TIER_ACHIEVEMENT_SETS.map((set) =>
      set.map((def) => {
        const current = values[def.metric];
        return {
          ...def,
          current,
          isUnlocked: current >= def.target || !!everUnlocked[def.id],
          progress: Math.min(100, (current / def.target) * 100),
        };
      }),
    );
  });
  // Persists any achievement that just crossed its target for the first time
  // so tierAchievementSets' isUnlocked stays permanently true afterwards.
  // Called opportunistically (see constructor) rather than from inside the
  // computed above, since computed() must stay side-effect free.
  private _persistNewlyUnlockedTierAchievements(): void {
    const state = this._state();
    const everUnlocked = { ...(state.unlockedTierAchievementIds ?? {}) };
    let changed = false;
    for (const set of this.tierAchievementSets()) {
      for (const item of set) {
        if (item.isUnlocked && !everUnlocked[item.id]) {
          everUnlocked[item.id] = Date.now();
          changed = true;
        }
      }
    }
    if (!changed) return;
    this._save({ ...state, unlockedTierAchievementIds: everUnlocked });
  }
  // Which achievement set is currently relevant to show: the one gating the
  // next not-yet-unlocked title tier. Once every tier is unlocked, falls back
  // to the last (hardest) set.
  readonly activeTierAchievementIndex = computed(() => {
    const tiers = this.classTitleTiers();
    const firstLocked = tiers.findIndex((tier) => !tier.isUnlocked);
    return firstLocked === -1 ? Math.max(0, tiers.length - 1) : firstLocked;
  });
  readonly activeTierAchievements = computed(
    () => this.tierAchievementSets()[this.activeTierAchievementIndex()] ?? [],
  );
  // Class-specific title ladder: every 20 levels unlocks a themed title, but
  // reaching the level only opens the gate - the tier's own quest (an
  // attribute or streak threshold that gets harder each tier) plus fully
  // completing the previous tier's 10 achievements is what actually unlocks it.
  private _titleMetricValues(): Record<RpgTitleMetric, number> {
    const attrs = this.attributeXp();
    return {
      intelligence: attrs.intelligence,
      health: attrs.health,
      social: attrs.social,
      finance: this.coins(),
      streak: this.streak(),
    };
  }
  readonly classTitleTiers = computed(() => {
    const level = this.level();
    const metricValues = this._titleMetricValues();
    const currentClassId = this._state().classId;
    // Tier 0 counts from class-adoption time (classMetricBaselines); tiers
    // 1-4 each count from the moment their predecessor tier is unlocked AND
    // their own level is reached (classTierBaselines) - so a tier's quest never
    // shows progress that was actually earned while a still-locked previous
    // tier hadn't been reached yet.
    const classBaseline = this._state().classMetricBaselines?.[currentClassId] ?? 0;
    const tierBaselines = this._state().classTierBaselines?.[currentClassId] ?? {};
    const tiers = RPG_CLASS_TITLES[currentClassId] ?? [];
    const achievementSets = this.tierAchievementSets();
    return tiers.map((tier, index) => {
      const floor = index > 0 ? tiers[index - 1].target : 0;
      const phaseTarget = tier.target - floor;
      // Tier 0 counts from class-adoption. Tiers 1-4 count from nothing at
      // all (stay at 0) until their predecessor tier actually unlocks and
      // stamps a baseline - never fall back to counting pre-existing/banked
      // metric total, or a tier would look pre-filled before its turn.
      const baseline = index === 0 ? classBaseline : tierBaselines[index];
      const phaseCurrent =
        baseline === undefined
          ? 0
          : Math.max(0, Math.min(phaseTarget, metricValues[tier.metric] - baseline));
      const meetsLevel = level >= tier.level;
      const meetsQuest = phaseCurrent >= phaseTarget;
      const achievementSet = achievementSets[index] ?? [];
      const achievementsCompleted = achievementSet.filter(
        (item) => item.isUnlocked,
      ).length;
      const meetsAchievements =
        achievementSet.length > 0 && achievementsCompleted === achievementSet.length;
      return {
        ...tier,
        current: phaseCurrent,
        target: phaseTarget,
        isLevelLocked: !meetsLevel,
        isUnlocked: meetsLevel && meetsQuest && meetsAchievements,
        progress:
          phaseTarget > 0 ? Math.min(100, (phaseCurrent / phaseTarget) * 100) : 100,
        achievementsCompleted,
        achievementsTotal: achievementSet.length,
      };
    });
  });
  readonly unlockedClassTitles = computed(() =>
    this.classTitleTiers().filter((tier) => tier.isUnlocked),
  );
  // Snapshots classTierBaselines[classId][i] the moment tier i-1 unlocks, so
  // tier i's own quest starts counting from right then instead of from
  // whatever the shared metric already was. Called opportunistically (see
  // constructor) rather than from inside classTitleTiers, since computed()
  // must stay side-effect free.
  // A tier's quest only starts counting once every other requirement to
  // unlock it is met: previous tier unlocked AND the tier's level reached.
  // Also records unlocked titles (classUnlockedTitleTiers) and drops
  // baselines stamped early by the old rule (before the level was reached).
  private _persistTierBaselineTransitions(): void {
    const state = this._state();
    const classId = state.classId;
    const level = this.level();
    const tiers = this.classTitleTiers();
    const existing = state.classTierBaselines?.[classId] ?? {};
    const existingUnlocked = state.classUnlockedTitleTiers?.[classId] ?? {};
    const metricValues = this._titleMetricValues();
    const baselines: Record<number, number> = { ...existing };
    const unlocked: Record<number, number> = { ...existingUnlocked };
    let changed = false;
    // Old rule: baseline key i was stamped as soon as tier i-1 unlocked.
    for (const key of Object.keys(existing)) {
      if (unlocked[Number(key) - 1] === undefined) {
        unlocked[Number(key) - 1] = Date.now();
        changed = true;
      }
    }
    tiers.forEach((tier, i) => {
      if (tier.isUnlocked && unlocked[i] === undefined) {
        unlocked[i] = Date.now();
        changed = true;
      }
      if (i === 0) return;
      const ready = unlocked[i - 1] !== undefined && level >= tier.level;
      if (!ready && baselines[i] !== undefined && unlocked[i] === undefined) {
        delete baselines[i];
        changed = true;
      } else if (ready && baselines[i] === undefined) {
        baselines[i] = metricValues[tier.metric];
        changed = true;
      }
    });
    if (!changed) return;
    this._save({
      ...state,
      classTierBaselines: {
        ...(state.classTierBaselines ?? {}),
        [classId]: baselines,
      },
      classUnlockedTitleTiers: {
        ...(state.classUnlockedTitleTiers ?? {}),
        [classId]: unlocked,
      },
    });
  }
  // True once every tier of the CURRENT class's title ladder is unlocked -
  // gates changeClass() below.
  readonly hasMasteredCurrentClass = computed(() => {
    const tiers = this.classTitleTiers();
    return tiers.length > 0 && tiers.every((tier) => tier.isUnlocked);
  });
  readonly selectedTitle = computed(
    () =>
      this.unlockedClassTitles().find((tier) => tier.id === this._state().selectedTitleId)
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
    const now = new Date();
    // The historical import is real data for exactly one character - every
    // other character (including brand new ones) must fall through to the
    // normal live habit-based computation below, or they'd all show the same
    // "already completed" Jan-Jun 2026 regardless of their own actual
    // habit history (which, for a new character, is none at all).
    const isHistoryOwner = this._state().id === this._monthlyMedalHistoryOwnerId();
    return names.map((title, monthIndex) => {
      const id = `${year}-${monthIndex + 1}`;
      const monthEnded =
        now.getFullYear() > year ||
        (now.getFullYear() === year && now.getMonth() > monthIndex);
      const config = this._state().monthlyMedalConfigs[id];
      const labels = this._state().monthlyMedalLabels?.[id];
      const displayTitle = labels?.title || title;
      const imported = isHistoryOwner
        ? monthlyMedalHistoryFor(year, monthIndex)
        : undefined;
      // A saved configuration takes over from the imported history, except for
      // months the history already records as completed (past achievements stay put).
      const history =
        imported && (isMonthlyMedalHistoryCompleted(imported) || !config)
          ? imported
          : undefined;

      // Historical months (imported from the owner's previous external
      // tracking) report their final outcome directly instead of being
      // live-computed from in-app habit completions, which don't exist for
      // periods before this app's habit tracker did.
      if (history) {
        const completed = isMonthlyMedalHistoryCompleted(history);
        const percentage = monthlyMedalHistoryPercentage(history);
        const ratio = history.target ? history.progress / history.target : 0;
        return {
          id,
          monthIndex,
          title: displayTitle,
          imageUrl: `assets/rpg/trophies/month-${String(monthIndex + 1).padStart(2, '0')}.png`,
          description: labels?.description ?? history.description,
          metricType: history.metricType,
          unit: history.metricType === 'currency' ? 'R$' : '',
          mode:
            history.metricType === 'currency' ? ('value' as const) : ('habit' as const),
          percentage,
          completed,
          possible: history.target,
          completedDays: history.progress,
          progressPercentage: percentage,
          targetDays: history.target,
          habitIds: [],
          manualCredit: 0,
          needsHabitSetup: false,
          isUnlocked: completed,
          hasEnded: monthEnded,
          ratio,
          tier: completed ? medalTierFor(ratio) : null,
        };
      }

      if (config?.mode === 'value') {
        const target = Math.max(1, config.valueTarget ?? 1);
        const current = Math.max(0, config.valueCurrent ?? 0);
        const reached = current >= target;
        const percentage = Math.min(100, Math.round((current / target) * 100));
        return {
          id,
          monthIndex,
          title: displayTitle,
          imageUrl: `assets/rpg/trophies/month-${String(monthIndex + 1).padStart(2, '0')}.png`,
          description: labels?.description ?? imported?.description ?? '',
          metricType: 'value' as const,
          unit: config.valueUnit ?? '',
          mode: 'value' as const,
          percentage,
          completed: current,
          possible: target,
          completedDays: current,
          progressPercentage: percentage,
          targetDays: target,
          habitIds: config.habitIds ?? [],
          manualCredit: 0,
          needsHabitSetup: false,
          isUnlocked: reached,
          hasEnded: monthEnded,
          ratio: current / target,
          tier: reached ? medalTierFor(current / target) : null,
        };
      }
      const stats = this._monthlyHabitStats(year, monthIndex, config?.habitIds);
      const targetDays =
        config?.targetDays ??
        Math.ceil(new Date(year, monthIndex + 1, 0).getDate() * 0.8);
      // Manual credit covers progress this medal can't see on its own (e.g.
      // tracked in Academia Arcana instead of a Habit Tracker habit).
      const completedDays = stats.completedDays + (config?.manualCredit ?? 0);
      const percentage = Math.min(100, Math.round((completedDays / targetDays) * 100));
      return {
        id,
        monthIndex,
        title: displayTitle,
        imageUrl: `assets/rpg/trophies/month-${String(monthIndex + 1).padStart(2, '0')}.png`,
        description: labels?.description ?? '',
        metricType: 'days' as const,
        unit: '',
        mode: 'habit' as const,
        percentage,
        completed: stats.completed,
        possible: stats.possible,
        completedDays,
        progressPercentage: percentage,
        targetDays,
        habitIds: config?.habitIds ?? [],
        manualCredit: config?.manualCredit ?? 0,
        needsHabitSetup: !config?.habitIds?.length,
        // Delivered as soon as the target is reached - completed days only
        // grow during the month, so there's no need to wait for it to close.
        isUnlocked: stats.possibleDays > 0 && completedDays >= targetDays,
        hasEnded: monthEnded,
        ratio: completedDays / targetDays,
        tier:
          stats.possibleDays > 0 && completedDays >= targetDays
            ? medalTierFor(completedDays / targetDays)
            : null,
      };
    });
  });

  constructor() {
    void this._hydrateDomainState().then(() => void this.refresh());
    this._taskService.allTasks$
      .pipe(debounceTime(100), takeUntilDestroyed())
      .subscribe(() => {
        // GUARD: refresh() reads/writes the active character's roster entry.
        // _roster's own initial value (see _loadRoster) is a synchronous,
        // localStorage-only guess that's often just the bare default
        // character - firing refresh() against it before _hydrateDomainState
        // finishes loading the real persisted roster from IndexedDB would
        // process every already-completed task as "new" against that empty
        // character and save the result, permanently overwriting the real
        // one still mid-load (#lost-mage-character incident). Hydration
        // triggers its own refresh() once done, so nothing is missed.
        if (!this._hydrated()) return;
        void this.refresh();
      });
    effect(() => {
      this._habitTracker.state();
      this._state();
      if (!this._hydrated()) return;
      queueMicrotask(() =>
        untracked(() => {
          this._seedMonthlyMedalHistory();
          this.claimAvailableTrophies();
          this._resolveContracts();
          this._backfillPenaltyMoneyLog();
          this._persistNewlyUnlockedTierAchievements();
          this._persistTierBaselineTransitions();
          this._recordMultiplierChange();
        }),
      );
    });
    // Pushed rather than injected (TaskHabitService can't depend back on
    // this service - see the comment on its own _failedTaskIds field) so a
    // task marked "not done" here stops counting as an automatic habit
    // completion, even though it's still isDone:true for the penalty/todo-
    // list-exit mechanics.
    effect(() => {
      const failedTaskIds = this._roster().failedTaskIds;
      this._habitTracker.setFailedTaskIds(new Set(Object.keys(failedTaskIds ?? {})));
    });
  }

  /**
   * Appends to multiplierHistory whenever the live XP/gold multiplier changes,
   * so the new value only applies from now on. First run seeds the history
   * with the multiplier the player had up to now (legacy honour bonus
   * included), keeping every bit of past XP exactly where it was.
   */
  private _recordMultiplierChange(): void {
    const state = this._state();
    const xp = this.xpMultiplier();
    const gold = this.goldMultiplier();
    const history = state.multiplierHistory ?? [];
    if (!history.length) {
      const honor = this.honorBonus();
      const legacy = this._legacyHonorBonus();
      this._save({
        ...state,
        multiplierHistory: [
          { at: 0, xp: xp - honor.xp + legacy.xp, gold: gold - honor.gold + legacy.gold },
          { at: Date.now(), xp, gold },
        ],
      });
      return;
    }
    const last = history[history.length - 1];
    if (Math.abs(last.xp - xp) < 1e-9 && Math.abs(last.gold - gold) < 1e-9) return;
    this._save({
      ...state,
      multiplierHistory: [...history, { at: Date.now(), xp, gold }],
    });
  }

  async refresh(): Promise<void> {
    const tasks = await this._taskService.getAllTasksEverywhere();
    this._tasks.set(tasks);
    this._tasksLoaded = true;
    const current = this._state();
    const inventoryBeforeRewards = new Set(current.inventory.map((item) => item.id));
    const ledger = { ...current.xpLedger };
    const processedTaskIds = { ...this._roster().processedTaskIds };
    const failedTaskIds = { ...(this._roster().failedTaskIds ?? {}) };
    const realmProgress = { ...current.realmProgress };
    let penalties = current.penalties;
    let changed = false;
    let gainedXp = 0;
    let gainedCoins = 0;
    const realmDrops: RpgItem[] = [];

    for (const task of tasks) {
      if (task.isDone) {
        if (processedTaskIds[task.id]) continue;
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
          const realmBonus = this._realmTaskBonus(task, xp);
          gainedCoins += realmBonus.coins;
          if (realmBonus.drop) realmDrops.push(realmBonus.drop);
        }
        changed = true;
      } else if (processedTaskIds[task.id] === current.id) {
        // Task went from done/failed back to not-done (checkbox, context menu,
        // whatever undid it) - reverse whatever it was given/charged instead of
        // leaving a stale reward or penalty behind. Only handled for the
        // currently active character; a task processed under a different,
        // no-longer-active character is left untouched (rare edge case, not
        // worth the complexity of cross-character reversal).
        const penaltyId = failedTaskIds[task.id];
        if (penaltyId) {
          penalties = penalties.filter((p) => p.id !== penaltyId);
          delete failedTaskIds[task.id];
        } else if (ledger[task.id]) {
          const entry = ledger[task.id];
          gainedXp -= entry.xp;
          delete ledger[task.id];
          const taskRealm = current.projectRealms[task.projectId];
          if (taskRealm) {
            gainedCoins -= this._realmTaskBonus(task, entry.xp).coins;
          }
        }
        delete processedTaskIds[task.id];
        changed = true;
      }
    }

    if (changed) {
      this._saveRoster({
        ...this._roster(),
        processedTaskIds,
        failedTaskIds,
        characters: {
          ...this._roster().characters,
          [current.id]: this._syncPetCompanion(
            this._withInventoryItems(
              {
                ...current,
                xpLedger: ledger,
                realmProgress,
                penalties,
                questBonusCoins: Math.max(0, current.questBonusCoins + gainedCoins),
                pet: { ...current.pet, xp: Math.max(0, current.pet.xp + gainedXp) },
              },
              realmDrops,
            ),
          ),
        },
      });
    }
    this._enforceProgressionLocks();
    this._claimCompletedDailyQuests();
    this._claimCompletedMonthlyQuests();
    this._claimWeeklyBoss();
    this._resolveContracts();
    this._grantLevelRewards(inventoryBeforeRewards);
  }

  /**
   * Counterpart to marking a task done: instead of granting the xp/gold
   * _xpForTask would have awarded, it takes the same amount away (via the
   * existing penalties ledger) and marks the task as processed so refresh()
   * never also grants it later - a habit that gets explicitly given up on
   * should cost you, not pay out.
   */
  markTaskAsFailed(task: Task): void {
    const roster = this._roster();
    if (roster.processedTaskIds[task.id]) return;
    const current = this._state();
    const xpLoss = this._xpForTask(task);
    const coinsLoss = Math.round(xpLoss * this.goldMultiplier() * 0.1);
    const penaltyId = crypto.randomUUID();
    this._saveRoster({
      ...roster,
      processedTaskIds: { ...roster.processedTaskIds, [task.id]: current.id },
      // Stores the penalty's own id (not the character id) so refresh()'s
      // reversal pass can remove this exact entry if the task is un-done later.
      failedTaskIds: { ...(roster.failedTaskIds ?? {}), [task.id]: penaltyId },
      characters: {
        ...roster.characters,
        [current.id]: {
          ...current,
          penalties: [
            ...current.penalties,
            {
              id: penaltyId,
              title: `Não concluída: ${task.title}`,
              xpLoss,
              coinsLoss,
              createdAt: Date.now(),
              timesApplied: 1,
              sourceTaskId: task.id,
            },
          ],
        },
      },
    });
  }

  isTaskFailed(taskId: string): boolean {
    return !!this._roster().failedTaskIds?.[taskId];
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
    const today = getDbDateStr();
    // Snapshot today's already-tracked focus time so _buildDailyQuests can
    // subtract it back out - otherwise a character created mid-day would
    // instantly inherit however many minutes were already logged today under
    // no character (or a different one).
    const focusedMinutesBaselineAtCreation = Math.floor(
      this._tasks().reduce((sum, task) => sum + (task.timeSpentOnDay?.[today] ?? 0), 0) /
        60000,
    );
    const character: RpgProfileState = {
      ...DEFAULT_STATE,
      id,
      createdAt: Date.now(),
      focusedMinutesBaselineAtCreation,
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

  // Upserts a full character state (e.g. from a per-character backup file)
  // and makes it active, without touching any other character in the roster.
  importCharacterState(state: RpgProfileState): void {
    this._saveRoster({
      ...this._roster(),
      activeCharacterId: state.id,
      characters: { ...this._roster().characters, [state.id]: state },
    });
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

  /**
   * Symmetric undo for grantExternalReward, keyed by the same sourceId - used
   * when an editable external log (e.g. an Academia Arcana study session) is
   * edited or deleted, so its XP/gold/pet-XP don't linger after the source
   * record they came from is gone or corrected. No-ops if nothing was ever
   * granted for this sourceId (nothing to undo).
   */
  revokeExternalReward(
    sourceId: string,
    xp: number,
    gold: number,
    characterId = this.activeCharacterId(),
  ): boolean {
    const state = this._roster().characters[characterId];
    if (!state) return false;
    const ledgerId = `external:${sourceId}`;
    if (!state.xpLedger[ledgerId]) return false;
    const { [ledgerId]: _removed, ...remainingLedger } = state.xpLedger;
    const revokedXp = Math.max(0, Math.round(xp));
    this._save({
      ...state,
      xpLedger: remainingLedger,
      questBonusCoins: Math.max(0, state.questBonusCoins - Math.max(0, Math.round(gold))),
      pet: { ...state.pet, xp: Math.max(0, state.pet.xp - revokedXp) },
    });
    return true;
  }

  addPenalty(
    title: string,
    xpLoss: number,
    coinsLoss: number,
    moneyLoss = 0,
    exercise = '',
  ): void {
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
          moneyLoss: toMoney(moneyLoss),
          exercise: exercise.trim(),
          createdAt: Date.now(),
          timesApplied: 0,
          xpLossApplied: 0,
          coinsLossApplied: 0,
        },
      ],
    });
  }

  updatePenalty(
    penaltyId: string,
    changes: {
      title: string;
      xpLoss: number;
      coinsLoss: number;
      moneyLoss: number;
      exercise: string;
    },
  ): void {
    if (!changes.title.trim()) {
      return;
    }
    this._save({
      ...this._state(),
      penalties: this._state().penalties.map((item) => {
        if (item.id !== penaltyId) {
          return item;
        }
        // Freeze what was already deducted so the new values only apply from now on.
        const applied = penaltyAppliedTotals(item);
        return {
          ...item,
          title: changes.title.trim(),
          xpLoss: Math.max(0, Math.round(changes.xpLoss)),
          coinsLoss: Math.max(0, Math.round(changes.coinsLoss)),
          moneyLoss: toMoney(changes.moneyLoss),
          exercise: changes.exercise.trim(),
          xpLossApplied: applied.xp,
          coinsLossApplied: applied.coins,
        };
      }),
    });
  }

  applyPenalty(penaltyId: string): void {
    const state = this._state();
    const penalty = state.penalties.find((item) => item.id === penaltyId);
    if (!penalty) {
      return;
    }
    const applied = penaltyAppliedTotals(penalty);
    // Repeating the same penalty within a week escalates it: the nth
    // application this week costs n times the base values.
    const now = Date.now();
    const weekStart = startOfWeekMs(now);
    const thisWeek = (penalty.weekAppliedAt ?? []).filter((at) => at >= weekStart);
    const multiplier = thisWeek.length + 1;
    const addedXp = penalty.xpLoss * multiplier;
    const addedCoins = penalty.coinsLoss * multiplier;
    const addedMoney = (penalty.moneyLoss ?? 0) * multiplier;
    this._save({
      ...state,
      penaltyLog: [
        ...(state.penaltyLog ?? []),
        {
          penaltyId,
          title: penalty.title,
          at: now,
          xp: addedXp,
          coins: addedCoins,
          money: toMoney(addedMoney),
        },
      ],
      penaltyMoneyOwed: toMoney((state.penaltyMoneyOwed ?? 0) + addedMoney),
      penalties: state.penalties.map((item) =>
        item.id === penaltyId
          ? {
              ...item,
              timesApplied: (item.timesApplied ?? 0) + 1,
              xpLossApplied: applied.xp + addedXp,
              coinsLossApplied: applied.coins + addedCoins,
              weekAppliedAt: [...thisWeek, now],
            }
          : item,
      ),
    });
  }

  /**
   * Saves (or updates) the weekly review for a week. The XP/coin reward is paid
   * only the first time a given week is completed.
   */
  saveWeeklyReview(
    review: Omit<RpgWeeklyReview, 'completedAt'>,
    reward: { xp: number; coins: number },
  ): boolean {
    const state = this._state();
    const isFirstTime = !state.weeklyReviews?.[review.weekStart];
    this._save({
      ...state,
      weeklyReviews: {
        ...state.weeklyReviews,
        [review.weekStart]: { ...review, completedAt: Date.now() },
      },
      questBonusXp: state.questBonusXp + (isFirstTime ? reward.xp : 0),
      questBonusCoins: state.questBonusCoins + (isFirstTime ? reward.coins : 0),
    });
    return isFirstTime;
  }

  /** Replaces this character's Career Quest state through an updater. */
  updateCareerQuest(
    change: (current: CareerQuestState | undefined) => CareerQuestState,
  ): void {
    const state = this._state();
    this._save({ ...state, careerQuest: change(state.careerQuest) });
  }

  /** Marks everything still pending as moved into the real punishment savings box. */
  markPenaltyMoneyTransferred(): void {
    const state = this._state();
    const amount = toMoney(
      (state.penaltyMoneyOwed ?? 0) - (state.penaltyMoneyTransferred ?? 0),
    );
    if (amount <= 0) return;
    this._save({
      ...state,
      penaltyMoneyTransferred: state.penaltyMoneyOwed ?? 0,
      penaltyMoneyTransfers: [
        ...(state.penaltyMoneyTransfers ?? []),
        { at: Date.now(), amount },
      ],
    });
  }

  addContract(
    input: Pick<
      RpgContract,
      | 'title'
      | 'metric'
      | 'target'
      | 'scopeKind'
      | 'scopeId'
      | 'deadlineDay'
      | 'stakeMoney'
      | 'stakeXp'
      | 'stakeCoins'
    >,
  ): void {
    const startDay = getDbDateStr(new Date());
    if (!input.title.trim() || input.target <= 0 || input.deadlineDay < startDay) {
      return;
    }
    const state = this._state();
    const contract: RpgContract = {
      ...input,
      id: crypto.randomUUID(),
      title: input.title.trim(),
      scopeId: input.scopeKind === 'all' ? undefined : input.scopeId,
      startDay,
      stakeMoney: toMoney(input.stakeMoney),
      stakeXp: Math.max(0, Math.round(input.stakeXp)),
      stakeCoins: Math.max(0, Math.round(input.stakeCoins)),
      manualProgress: 0,
      status: 'active',
      createdAt: Date.now(),
    };
    this._save({ ...state, contracts: [...(state.contracts ?? []), contract] });
  }

  removeContract(contractId: string): void {
    const state = this._state();
    this._save({
      ...state,
      contracts: (state.contracts ?? []).filter((item) => item.id !== contractId),
    });
  }

  adjustContractProgress(contractId: string, delta: number): void {
    const state = this._state();
    this._save({
      ...state,
      contracts: (state.contracts ?? []).map((item) =>
        item.id === contractId && item.status === 'active' && item.metric === 'manual'
          ? { ...item, manualProgress: Math.max(0, item.manualProgress + delta) }
          : item,
      ),
    });
  }

  contractProgress(contract: RpgContract): number {
    return contract.finalProgress ?? contractProgress(contract, this._tasks());
  }

  /**
   * One-time, idempotent: money owed/transferred before the dated logs existed
   * has no entry, so the reports tab couldn't place it in any period. The
   * real-money box only shipped on 2026-09-25, so any unlogged amount was
   * applied on that day - record the difference once as a single entry.
   */
  private _backfillPenaltyMoneyLog(): void {
    const state = this._state();
    const loggedOwed =
      (state.penaltyLog ?? []).reduce((sum, entry) => sum + entry.money, 0) +
      (state.contracts ?? [])
        .filter((contract) => contract.status === 'lost')
        .reduce((sum, contract) => sum + contract.stakeMoney, 0);
    const missingOwed = toMoney((state.penaltyMoneyOwed ?? 0) - loggedOwed);
    const loggedTransferred = (state.penaltyMoneyTransfers ?? []).reduce(
      (sum, transfer) => sum + transfer.amount,
      0,
    );
    const missingTransferred = toMoney(
      (state.penaltyMoneyTransferred ?? 0) - loggedTransferred,
    );
    if (missingOwed < 0.01 && missingTransferred < 0.01) return;
    const at = new Date(2026, 8, 25, 12).getTime();
    this._save({
      ...state,
      penaltyLog:
        missingOwed >= 0.01
          ? [
              ...(state.penaltyLog ?? []),
              {
                penaltyId: 'legacy-before-log',
                title: 'Punições antes do registro',
                at,
                xp: 0,
                coins: 0,
                money: missingOwed,
              },
            ]
          : state.penaltyLog,
      penaltyMoneyTransfers:
        missingTransferred >= 0.01
          ? [...(state.penaltyMoneyTransfers ?? []), { at, amount: missingTransferred }]
          : state.penaltyMoneyTransfers,
    });
  }

  /**
   * Settles active contracts: reaching the target wins the stake right away;
   * a deadline that passed without it loses the stake (XP/coins through a
   * hidden penalty entry, money into the punishment savings box).
   */
  private _resolveContracts(): void {
    // Hour-based progress reads the task list - resolving before refresh()
    // has loaded it would wrongly fail every contract past its deadline.
    if (!this._tasksLoaded) return;
    const state = this._state();
    const contracts = state.contracts ?? [];
    if (!contracts.some((item) => item.status === 'active')) return;
    const today = getDbDateStr(new Date());
    const now = Date.now();
    let owed = state.penaltyMoneyOwed ?? 0;
    let bonusXp = state.questBonusXp;
    let bonusCoins = state.questBonusCoins;
    const newPenalties: RpgPenalty[] = [];
    let changed = false;
    const next = contracts.map((contract): RpgContract => {
      if (contract.status !== 'active') return contract;
      const progress = contractProgress(contract, this._tasks());
      if (progress >= contract.target) {
        changed = true;
        bonusXp += contract.stakeXp;
        bonusCoins += contract.stakeCoins;
        return { ...contract, status: 'won', resolvedAt: now, finalProgress: progress };
      }
      if (today > contract.deadlineDay) {
        changed = true;
        owed = toMoney(owed + contract.stakeMoney);
        newPenalties.push({
          id: crypto.randomUUID(),
          title: `Contrato quebrado: ${contract.title}`,
          xpLoss: contract.stakeXp,
          coinsLoss: contract.stakeCoins,
          createdAt: now,
          timesApplied: 1,
          xpLossApplied: contract.stakeXp,
          coinsLossApplied: contract.stakeCoins,
          sourceContractId: contract.id,
        });
        return { ...contract, status: 'lost', resolvedAt: now, finalProgress: progress };
      }
      return contract;
    });
    if (!changed) return;
    this._save({
      ...state,
      contracts: next,
      penaltyMoneyOwed: owed,
      questBonusXp: bonusXp,
      questBonusCoins: bonusCoins,
      penalties: [...state.penalties, ...newPenalties],
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
      Math.max(1, Math.round((power + 1) * rarityMultiplier[item.rarity] * 2.5))
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
    if (item.slot === 'companion' && !item.stats) {
      // Companion accessories power up the pet, and the pet's attributes are
      // what reach the player: Lealdade -> XP, Alegria -> ouro, Faro -> drop raro.
      const pet = companionPetAttributes(item.name, basePower);
      return {
        power: 0,
        intelligence: 0,
        luck: 0,
        xpMultiplier: pet.loyalty * 0.005,
        goldMultiplier: pet.joy * 0.005,
        rareDrop: pet.scent * 0.0025,
      };
    }
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
                  currentBonuses.intelligence + (currentBonuses.intelligence > 0 ? 1 : 0),
                luck: currentBonuses.luck + (currentBonuses.luck > 0 ? 1 : 0),
                xpMultiplier:
                  currentBonuses.xpMultiplier +
                  (currentBonuses.xpMultiplier > 0 ? 0.005 : 0),
                goldMultiplier:
                  currentBonuses.goldMultiplier +
                  (currentBonuses.goldMultiplier > 0 ? 0.005 : 0),
                rareDrop:
                  currentBonuses.rareDrop + (currentBonuses.rareDrop > 0 ? 0.0025 : 0),
              },
              upgradeLevel: (candidate.upgradeLevel ?? 0) + 1,
            }
          : candidate,
      ),
    });
    return {
      ok: true,
      message: `${item.name} aprimorado para +${(item.upgradeLevel ?? 0) + 1}.`,
    };
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
    if (items.length !== 3)
      return { ok: false, message: 'Um dos itens não existe mais.' };
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
          uniqueIds
            .join('')
            .split('')
            .reduce((sum, character) => {
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
          items.reduce((sum, item) => sum + this.itemBonuses(item).intelligence, 0) * 0.6,
        ),
        luck: Math.ceil(
          items.reduce((sum, item) => sum + this.itemBonuses(item).luck, 0) * 0.6,
        ),
        xpMultiplier:
          items.reduce((sum, item) => sum + this.itemBonuses(item).xpMultiplier, 0) * 0.6,
        goldMultiplier:
          items.reduce((sum, item) => sum + this.itemBonuses(item).goldMultiplier, 0) *
          0.6,
        rareDrop:
          items.reduce((sum, item) => sum + this.itemBonuses(item).rareDrop, 0) * 0.6,
      },
      upgradeLevel: 0,
      requiredClass: items.every((item) => item.requiredClass === items[0].requiredClass)
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
    return {
      ok: true,
      message: `${fused.name} criado com ${fused.power} de poder.`,
      itemId: fused.id,
    };
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

  /**
   * Why a star can't be unlocked right now, in the order the player should fix
   * it - null when it can. Shown on the unlock button so a level or point gate
   * isn't mistaken for a broken connection.
   */
  starLockReason(starId: string): string | null {
    const star = RPG_CONSTELLATION_STARS.find((candidate) => candidate.id === starId);
    if (!star || star.id === 'destiny-core') return null;
    if (this.starRank(star.id) >= star.maxLevel) return 'Talento dominado';
    if (!star.connections.some((connectionId) => this.starRank(connectionId) > 0)) {
      return 'Desbloqueie antes uma estrela ligada a esta';
    }
    const requiredLevel = star.requiredLevel ?? 1;
    if (this.level() < requiredLevel) {
      return `Requer nível ${requiredLevel} (você está no ${this.level()})`;
    }
    const missing = star.cost - this.availableSkillPoints();
    if (missing > 0) {
      return `Falta${missing > 1 ? 'm' : ''} ${missing} ponto${missing > 1 ? 's' : ''} (custa ${star.cost})`;
    }
    return null;
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
    this._save(
      this._syncPetCompanion({
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
      }),
    );
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
      startingCredit: 0,
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

  updateAnnualGoal(
    goalId: string,
    habitIds: string[],
    targetDays: number,
    startingCredit: number,
  ): void {
    const selected = [...new Set(habitIds)];
    if (!selected.length) return;
    this._save({
      ...this._state(),
      annualGoals: this._state().annualGoals.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              habitIds: selected,
              targetDays: Math.max(1, Math.min(366, Math.round(targetDays))),
              startingCredit: Math.max(0, Math.round(startingCredit)),
            }
          : goal,
      ),
    });
  }

  updateMonthlyMedal(
    medalId: string,
    input: {
      title: string;
      description: string;
      mode: 'habit' | 'value';
      habitIds: string[];
      targetDays: number;
      manualCredit: number;
      valueTarget: number;
      valueCurrent: number;
      valueUnit: string;
    },
  ): void {
    const selected = [...new Set(input.habitIds)];
    if (input.mode === 'habit' && !selected.length) return;
    if (input.mode === 'value' && !(input.valueTarget > 0)) return;
    const state = this._state();
    this._save({
      ...state,
      monthlyMedalLabels: {
        ...state.monthlyMedalLabels,
        [medalId]: {
          title: input.title.trim() || undefined,
          description: input.description.trim() || undefined,
        },
      },
      monthlyMedalConfigs: {
        ...state.monthlyMedalConfigs,
        [medalId]:
          input.mode === 'value'
            ? {
                habitIds: [],
                targetDays: 1,
                mode: 'value',
                valueTarget: Math.max(0, Number(input.valueTarget)),
                valueCurrent: Math.max(0, Number(input.valueCurrent) || 0),
                valueUnit: input.valueUnit.trim(),
              }
            : {
                habitIds: selected,
                targetDays: Math.max(1, Math.min(31, Math.round(input.targetDays))),
                manualCredit: Math.max(0, Math.round(input.manualCredit)),
                mode: 'habit',
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
      goal.year === new Date().getFullYear() ? new Date() : new Date(goal.year, 11, 31);
    let liveCompletedDays = 0;
    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const date = this._dateKey(cursor);
      if (
        goal.habitIds.every((habitId) => this._habitTracker.isComplete(habitId, date))
      ) {
        liveCompletedDays++;
      }
    }
    // Goals created before startingCredit existed read as 50: a one-time
    // compensation for progress lost to the domain-sync bug, applied only to
    // pre-existing goals - every goal created since always has an explicit 0.
    const completedDays = liveCompletedDays + (goal.startingCredit ?? 50);
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
      return { xp: 50, gold: 50 };
    }
    return {
      xp: Math.min(1500, 100 + Math.round(difficulty * 3) + habitCount * 25),
      gold: Math.min(350, 20 + Math.round(difficulty / 3) + habitCount * 10),
    };
  }

  /**
   * Whether the active character is the owner's real one (the same owner the
   * monthly-medal history uses) - personal seed data must only go there.
   */
  isOwnerCharacter(): boolean {
    return this._state().id === this._monthlyMedalHistoryOwnerId();
  }

  // Which single character the historical 2026 monthly-medal import belongs
  // to. Falls back to the recovered real character until the flag is
  // explicitly pinned (see _seedMonthlyMedalHistory).
  private _monthlyMedalHistoryOwnerId(): string {
    return (
      localStorage.getItem(RPG_MONTHLY_MEDAL_HISTORY_OWNER_KEY) ??
      getEmergencyRecoveryCharacter()?.id ??
      ''
    );
  }

  // One-time (idempotent, self-healing) import of the owner's historical
  // monthly-medal outcomes from before this app's habit tracker existed.
  // Directly seeds trophyClaims with deterministic dates/amounts instead of
  // going through the normal live-claim path, since claimAvailableTrophies()
  // would otherwise stamp them with today's date and the old reward formula.
  // Safe to call on every reactive cycle: each check is a no-op once the
  // stored value already matches.
  //
  // GUARD: this real-life historical data belongs to exactly one character.
  // Without an owner check, switching to (or creating) any OTHER character
  // would see its trophyClaims missing these entries and "helpfully" seed
  // them right back in - silently handing every character the same 2026
  // journey progress instead of each having their own.
  private _seedMonthlyMedalHistory(): void {
    const state = this._state();
    if (!state) return;
    if (state.id !== this._monthlyMedalHistoryOwnerId()) return;
    const result = applyMonthlyMedalHistorySeed(
      state.trophyClaims,
      state.questBonusXp,
      state.questBonusCoins,
    );
    if (!localStorage.getItem(RPG_MONTHLY_MEDAL_HISTORY_OWNER_KEY)) {
      // Persist the owner as soon as we know it, not only "if changed" - once
      // the owner's data is already fully seeded, applyMonthlyMedalHistorySeed
      // reports changed:false forever, which meant this line never ran and
      // the owner was re-derived from the recovery-character fallback on
      // every single call instead of being pinned explicitly.
      localStorage.setItem(RPG_MONTHLY_MEDAL_HISTORY_OWNER_KEY, state.id);
    }
    if (!result.changed) return;
    this._save({
      ...state,
      trophyClaims: result.claims,
      questBonusXp: result.questBonusXp,
      questBonusCoins: result.questBonusCoins,
    });
  }

  // One-time cleanup for characters that already got the 2026 monthly-medal
  // history seeded into them before the owner check above existed (e.g. any
  // alt/test character switched to while _seedMonthlyMedalHistory had no
  // guard) - strips those specific claims back out and reverses the XP/gold
  // they granted, so only the real owner keeps that history.
  private _healLeakedMonthlyMedalHistory(): void {
    const ownerId = this._monthlyMedalHistoryOwnerId();
    const roster = this._roster();
    const characters = { ...roster.characters };
    let changed = false;

    for (const [id, character] of Object.entries(roster.characters)) {
      if (id === ownerId) continue;
      const leakedKeys = Object.keys(character.trophyClaims).filter(
        (key) =>
          key.startsWith(`monthly:${RPG_MONTHLY_MEDAL_HISTORY_YEAR}-`) ||
          key === RPG_MONTHLY_MEDAL_HISTORY_BONUS_KEY,
      );
      if (!leakedKeys.length) continue;

      const trophyClaims = { ...character.trophyClaims };
      let refundXp = 0;
      let refundGold = 0;
      for (const key of leakedKeys) {
        refundXp += trophyClaims[key].xp;
        refundGold += trophyClaims[key].gold;
        delete trophyClaims[key];
      }
      characters[id] = {
        ...character,
        trophyClaims,
        questBonusXp: Math.max(0, character.questBonusXp - refundXp),
        questBonusCoins: Math.max(0, character.questBonusCoins - refundGold),
      };
      changed = true;
    }

    if (!changed) return;
    this._saveRoster({ ...roster, characters });
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
    // Rarity upgrades live under their own key: the historical-medal seed
    // rewrites `monthly:*` claims to fixed values, so upgrades stored there
    // would be wiped. Each upgrade pays only the difference to the tier
    // already paid (bronze is the regular claim above).
    for (const medal of this.monthlyMedals()) {
      if (!medal.tier) continue;
      const key = `monthly-tier:${medal.id}`;
      const existing = claims[key];
      const extra =
        MEDAL_TIER_EXTRA[medal.tier] - MEDAL_TIER_EXTRA[existing?.tier ?? 'bronze'];
      if (extra <= 0) continue;
      const base = this.trophyReward('monthly', medal.possible);
      const extraXp = base.xp * extra;
      const extraGold = base.gold * extra;
      claims[key] = {
        claimedAt: Date.now(),
        xp: (existing?.xp ?? 0) + extraXp,
        gold: (existing?.gold ?? 0) + extraGold,
        tier: medal.tier,
      };
      xp += extraXp;
      gold += extraGold;
      changed = true;
    }
    for (const goal of state.annualGoals) {
      const key = `annual:${goal.id}`;
      if (!this.annualGoalProgress(goal).isUnlocked || claims[key]) continue;
      const reward = this.trophyReward('annual', goal.targetDays, goal.habitIds.length);
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
      campaigns: this._state().campaigns.filter((campaign) => campaign.id !== campaignId),
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

  /**
   * Every attribute in display order: the core ones (with the player's
   * renames applied), discipline, then custom ones.
   */
  readonly attributeDefinitions = computed((): RpgAttributeDefinition[] => {
    const state = this._state();
    const core: { id: RpgAttributeId; label: string; icon: string }[] = [
      { id: 'health', label: 'Saúde', icon: 'favorite' },
      { id: 'intelligence', label: 'Inteligência', icon: 'psychology' },
      { id: 'finance', label: 'Finanças', icon: 'savings' },
      { id: 'social', label: 'Social', icon: 'groups' },
      { id: 'discipline', label: 'Disciplina', icon: 'military_tech' },
    ];
    return [
      ...core.map((attribute) => ({
        ...attribute,
        ...state.attributeOverrides?.[attribute.id],
        isCustom: false,
        rating: state.attributeRatings[attribute.id] ?? 0,
      })),
      ...(state.customAttributes ?? []).map((attribute) => ({
        ...attribute,
        isCustom: true,
      })),
    ];
  });

  addCustomAttribute(label: string, icon: string): string | null {
    if (!label.trim()) return null;
    const state = this._state();
    const id = `custom-${crypto.randomUUID()}`;
    this._save({
      ...state,
      customAttributes: [
        ...(state.customAttributes ?? []),
        {
          id,
          label: label.trim(),
          icon: icon || 'star',
          rating: 5,
        },
      ],
    });
    return id;
  }

  updateAttribute(id: string, changes: { label: string; icon: string }): void {
    if (!changes.label.trim()) return;
    const state = this._state();
    const next = { label: changes.label.trim(), icon: changes.icon || 'star' };
    const custom = state.customAttributes ?? [];
    if (custom.some((attribute) => attribute.id === id)) {
      this._save({
        ...state,
        customAttributes: custom.map((attribute) =>
          attribute.id === id ? { ...attribute, ...next } : attribute,
        ),
      });
      return;
    }
    this._save({
      ...state,
      attributeOverrides: { ...state.attributeOverrides, [id]: next },
    });
  }

  removeCustomAttribute(id: string): void {
    const state = this._state();
    // Projects mapped to it fall back to "no attribute".
    const projectAttributes = Object.fromEntries(
      Object.entries(state.projectAttributes).map(([projectId, attribute]) => [
        projectId,
        attribute === id ? null : attribute,
      ]),
    );
    this._save({
      ...state,
      projectAttributes,
      customAttributes: (state.customAttributes ?? []).filter(
        (attribute) => attribute.id !== id,
      ),
    });
  }

  mapProject(projectId: string, attribute: string | null): void {
    this._save({
      ...this._state(),
      projectAttributes: {
        ...this._state().projectAttributes,
        [projectId]: attribute,
      },
    });
  }

  setAttributeRating(attribute: string, rating: number): void {
    const value = Math.max(0, Math.min(10, Math.round(rating)));
    const state = this._state();
    if (attribute.startsWith('custom-')) {
      this._save({
        ...state,
        customAttributes: (state.customAttributes ?? []).map((item) =>
          item.id === attribute ? { ...item, rating: value } : item,
        ),
      });
      return;
    }
    this._save({
      ...state,
      attributeRatings: { ...state.attributeRatings, [attribute]: value },
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
    // Subclass can be switched freely between any already-unlocked option for
    // the current class - it isn't a one-time commitment (the UI now always
    // offers the full list with locked ones disabled, see rpg-profile
    // .component.html's Subclasse selector). 'none' (no subclass) is allowed
    // too - otherwise picking it left the old subclass active while the
    // selector showed none.
    if (
      this.level() < RPG_SUBCLASS_UNLOCK_LEVELS[subclassId] ||
      !this._subclassBelongsToClass(subclassId, state.classId)
    ) {
      return;
    }
    this._save({ ...state, subclassId });
  }

  private readonly _classMasteryBonusXp = 2000;
  private readonly _classMasteryBonusCoins = 300;

  // Lets a player who fully mastered their current class (every title tier
  // unlocked) switch into a different one, resetting subclass/title choice
  // (both tied to the old class) and granting a one-time mastery bonus - only
  // the first time each class is ever mastered, so switching back and forth
  // between already-mastered classes can't be farmed for repeat rewards.
  changeClass(newClassId: RpgClassId): { ok: boolean; message: string } {
    const state = this._state();
    if (!this.hasMasteredCurrentClass()) {
      return {
        ok: false,
        message: 'Complete todos os títulos da classe atual antes de trocar.',
      };
    }
    if (newClassId === state.classId) {
      return { ok: false, message: 'Você já é dessa classe.' };
    }
    const masteredClassBonuses = { ...(state.masteredClassBonuses ?? {}) };
    const alreadyClaimed = !!masteredClassBonuses[state.classId];
    const xp = alreadyClaimed ? 0 : this._classMasteryBonusXp;
    const coins = alreadyClaimed ? 0 : this._classMasteryBonusCoins;
    if (!alreadyClaimed) {
      masteredClassBonuses[state.classId] = Date.now();
    }
    // First time adopting newClassId, freeze its title-ladder metric at its
    // current (already-lived-in-other-classes) value, so its own ladder only
    // measures progress made from here on - never overwritten on a later
    // revisit, so progress already banked in it is never erased.
    const classMetricBaselines = { ...(state.classMetricBaselines ?? {}) };
    if (classMetricBaselines[newClassId] === undefined) {
      const newClassMetric = RPG_CLASS_TITLES[newClassId]?.[0]?.metric;
      if (newClassMetric) {
        classMetricBaselines[newClassId] = this._titleMetricValues()[newClassMetric];
      }
    }
    this._save({
      ...state,
      classId: newClassId,
      subclassId: 'none',
      selectedTitleId: null,
      masteredClassBonuses,
      classMetricBaselines,
      questBonusXp: state.questBonusXp + xp,
      questBonusCoins: state.questBonusCoins + coins,
    });
    return {
      ok: true,
      message:
        xp > 0
          ? `Classe trocada! Bônus de maestria: +${xp} XP e +${coins} moedas.`
          : 'Classe trocada!',
    };
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
    if (titleId && !this.unlockedClassTitles().some((tier) => tier.id === titleId)) {
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

  updateReward(rewardId: string, changes: { title: string; cost: number }): void {
    if (!changes.title.trim()) {
      return;
    }
    this._save({
      ...this._state(),
      rewards: this._state().rewards.map((item) =>
        item.id === rewardId
          ? {
              ...item,
              title: changes.title.trim(),
              cost: Math.max(1, Math.round(changes.cost)),
            }
          : item,
      ),
    });
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
      taskRealm && taskRealm === this._state().currentRealmId
        ? (RPG_REALM_BY_ID.get(taskRealm)?.bonuses.xp ?? 0)
        : 0;
    return Math.round(base * (1 + realmBonus));
  }

  /**
   * Gold/rare-drop realm bonuses for a task whose project is mapped to the
   * realm the player currently lives in. Mirrors _xpForTask's matching rule
   * so all three realm bonuses (xp/gold/rareDrop) apply under the same
   * condition, using each realm's own values from RPG_REALMS instead of one
   * flat number shared by every realm.
   */
  private _realmTaskBonus(
    task: Task,
    xpEarned: number,
  ): { coins: number; drop: RpgItem | null } {
    const taskRealm = this._state().projectRealms[task.projectId];
    if (!taskRealm || taskRealm !== this._state().currentRealmId) {
      return { coins: 0, drop: null };
    }
    const realm = RPG_REALM_BY_ID.get(taskRealm);
    if (!realm) return { coins: 0, drop: null };
    const coins = Math.round(xpEarned * realm.bonuses.gold);
    const drop =
      realm.bonuses.rareDrop > 0 && Math.random() <= realm.bonuses.rareDrop
        ? this._createDrop('realm-task', 'uncommon')
        : null;
    return { coins, drop };
  }

  private _buildDailyQuests(tasks: Task[]): RpgDailyQuest[] {
    const today = getDbDateStr();
    const character = this._state();
    // A character created partway through today must not inherit whatever was
    // already done earlier that same day (under no character, or a different
    // one) - only activity from its own createdAt onward counts as "its" daily
    // progress. Tasks already done before creation are dropped entirely
    // (neither completed nor counted toward "perfect day"'s total); anything
    // still pending, or finished after creation, counts normally.
    const relevantTodayTasks = tasks.filter(
      (task) =>
        !task.parentId &&
        this._taskDay(task) === today &&
        (!task.isDone || !task.doneOn || task.doneOn >= character.createdAt),
    );
    const completed = relevantTodayTasks.filter((task) => task.isDone).length;
    const isCreationDay = getDbDateStr(character.createdAt) === today;
    // timeSpentOnDay is a single per-day total with no sub-day timestamps, so
    // pre-creation focus time can't be filtered out after the fact - instead,
    // the baseline captured at creation (see createCharacter()) is subtracted
    // so only minutes tracked since then count, purely on the creation day.
    const focusedMinutesBaseline = isCreationDay
      ? (character.focusedMinutesBaselineAtCreation ?? 0)
      : 0;
    const focusedMinutes = Math.max(
      0,
      Math.floor(
        tasks.reduce((sum, task) => sum + (task.timeSpentOnDay?.[today] ?? 0), 0) / 60000,
      ) - focusedMinutesBaseline,
    );
    const perfectProgress =
      relevantTodayTasks.length > 0
        ? Math.round((completed / relevantTodayTasks.length) * 100)
        : 0;
    const questXpMultiplier =
      (this._state().classId === 'ranger' || this._state().classId === 'archer'
        ? 1.1
        : 1) + (this._subclassBonus().quest ?? 0);

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
        2,
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
        4,
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
        6,
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
        10,
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
        'Conclua 150 tarefas durante este mês.',
        'calendar_month',
        completed,
        150,
        900,
        90,
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

  /**
   * Uses the habit tracker's own per-day completion ledger (habitsForDate +
   * isComplete) instead of raw task due-dates: an undone recurring task's
   * dueDay/dueWithTime keeps rolling forward to "today" as it becomes
   * overdue, so a due-date-based tally always finds every PAST day's tasks
   * already done (100%) and only today shows the real, still-open state.
   * Weekends are skipped entirely (not counted as failures, not counted as
   * successes) per the user's request to not track discipline on Sat/Sun.
   */
  private _calculateDiscipline(): DisciplineDay[] {
    const characterId = this._state().id;
    // Task history is global (system-wide, unbounded) - without a floor here,
    // a character created today would average in (and build a streak from)
    // real days of discipline that happened before it ever existed. Only days
    // from its own creation day onward count as "its" history.
    const cursor = this._dateFromDbStr(getDbDateStr(this._state().createdAt));
    const today = this._dateFromDbStr(getDbDateStr());
    const days: DisciplineDay[] = [];
    while (cursor <= today) {
      // habitsForDate is already weekday-aware (see TaskHabitService.isActiveOn /
      // _matchesWeekday) - it returns exactly the habits configured for this
      // specific date, so a weekend with fewer (or zero) active habits than a
      // weekday is already reflected in `total` without special-casing it here.
      // Blanket-skipping Saturday/Sunday hid genuinely tracked weekend habits
      // instead of showing their own (smaller) total (#discipline-weekend-total).
      const dateStr = getDbDateStr(cursor);
      const habits = this._habitTracker.habitsForDate(dateStr, [characterId]);
      if (habits.length) {
        const completed = habits.filter((habit) =>
          this._habitTracker.isComplete(habit.id, dateStr),
        ).length;
        days.push({
          date: dateStr,
          completed,
          total: habits.length,
          percentage: (completed / habits.length) * 100,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return days.sort((a, b) => b.date.localeCompare(a.date));
  }

  private _dateFromDbStr(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
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
    const raw = this._state().penalties.reduce(
      (sum, item) => sum + penaltyAppliedTotals(item).xp,
      0,
    );
    const resilienceReduction = (this._state().skills['resilience'] ?? 0) * 0.05;
    const ironWillReduction = (this._state().skills['iron-will'] ?? 0) * 0.03;
    const secondChanceReduction = (this._state().skills['second-chance'] ?? 0) * 0.1;
    const skillReduction = Math.min(
      0.65,
      resilienceReduction + ironWillReduction + secondChanceReduction,
    );
    const classReduction = this._state().classId === 'cleric' ? 0.2 : 0;
    const subclassReduction = this._subclassBonus().penalty ?? 0;
    return Math.round(
      raw * Math.max(0.2, 1 - skillReduction - classReduction - subclassReduction),
    );
  }

  private _penaltyCoins(): number {
    return this._state().penalties.reduce(
      (sum, item) => sum + penaltyAppliedTotals(item).coins,
      0,
    );
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
    // No config yet means this medal isn't associated with a habit at all -
    // it must read as "nothing tracked" (0/0), not "every habit must be
    // completed that day", which is what an unfiltered list would compute.
    if (!selectedHabitIds?.length) {
      return {
        completed: 0,
        possible: 0,
        completedDays: 0,
        possibleDays: 0,
        percentage: 0,
      };
    }
    const selected = new Set(selectedHabitIds);
    const habits = this._habitTracker
      .habitsForCharacters([this._state().id])
      .filter((habit) => selected.has(habit.id));
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
      // No weekly-schedule gating here (unlike isActiveOn/isScheduledOn) -
      // a day the habit was actually completed should count toward the medal
      // regardless of which weekdays the habit is nominally configured for,
      // same as annualGoalProgress() already does via a plain isComplete
      // check. Gating on the schedule was the confirmed cause of medals
      // reading 0 despite real completions existing every day of the week.
      for (const habit of habits) {
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
    const disciplineDays = this.disciplineDays();
    const trackedDays = new Set(disciplineDays.map((day) => day.date));
    const completedDays = new Set(
      disciplineDays.filter((day) => day.percentage >= 70).map((day) => day.date),
    );
    const cursor = new Date();
    let streak = 0;
    for (let index = 0; index < 366; index++) {
      const date = getDbDateStr(cursor);
      // A day with no applicable habits at all (nothing configured for that
      // weekday - which may or may not be a weekend now that disciplineDays()
      // reflects each day's own habit set) neither breaks nor extends the
      // streak, instead of reading as a missed day just because there's no
      // entry to look up.
      if (!trackedDays.has(date)) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
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
    // Forces recompute whenever refresh() runs (e.g. on page open), not just
    // when _state() changes - otherwise this stays cached with last week's
    // numbers until a task is completed, since new Date() isn't a signal.
    this._tasks();
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
    const levelTarget = this.level() * 150;
    const target = 900 + levelTarget;
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
    // Coins scale with the same ~10% ratio as regular task completion
    // (coins() = baseTaskXp * 0.1) instead of a flat, disproportionately
    // small number - quest/boss XP should feel like it's worth roughly as
    // much in gold as ordinary task XP is.
    this._save(
      this._withInventoryItems(
        {
          ...state,
          questBonusXp: state.questBonusXp + bossXp,
          questBonusCoins: state.questBonusCoins + Math.round(bossXp * 0.1),
          weeklyBossClaims: { ...state.weeklyBossClaims, [boss.key]: Date.now() },
        },
        [this._createDrop('weekly-boss', this._rollBossRarity())],
      ),
    );
  }

  // localStorage-backed floor for _grantLevelRewards, independent of
  // state.lastRewardedLevel: the synced roster blob (DomainStateStore) can
  // occasionally load a stale snapshot on startup (a race in its cloud-vs-
  // local "newest updatedAt wins" check), which would otherwise silently
  // regress lastRewardedLevel and cause already-granted level-up drops/Star
  // Points to be handed out again, and the celebration modal to replay for a
  // level range already shown. localStorage is local-only and never part of
  // that synced blob, so it survives the regression and keeps rewarding
  // genuinely one-shot per level even when the roster itself briefly reverts.
  private _highestRewardedLevelKey(characterId: string): string {
    return `rpg-highest-rewarded-level:${characterId}`;
  }

  private _grantLevelRewards(inventoryBeforeRewards: ReadonlySet<string>): void {
    const state = this._state();
    const currentLevel = this.level();
    const floorKey = this._highestRewardedLevelKey(state.id);
    const persistedFloor = Number(localStorage.getItem(floorKey) ?? '0');
    const rewardFloor = Math.max(state.lastRewardedLevel, persistedFloor);
    if (currentLevel <= rewardFloor) {
      // Roster regressed behind localStorage's floor - catch lastRewardedLevel
      // back up without re-granting drops or replaying the celebration.
      if (currentLevel > state.lastRewardedLevel) {
        this._save({ ...state, lastRewardedLevel: currentLevel });
      }
      return;
    }
    localStorage.setItem(floorKey, String(currentLevel));
    const drops: RpgItem[] = [];
    for (let level = rewardFloor + 1; level <= currentLevel; level++) {
      const treasureBonus = (state.skills['treasure-hunter'] ?? 0) * 0.02;
      const rareInstinctBonus = (state.skills['rare-instinct'] ?? 0) * 0.015;
      const fortuneHeartBonus = (state.skills['fortune-heart'] ?? 0) * 0.05;
      const rogueBonus = state.classId === 'rogue' ? 0.05 : 0;
      // Progressão deliberadamente longa: subir de nível concede Star Points,
      // mas equipamento deve continuar especial mesmo após muitos meses.
      // Nv. 1 ≈ 2,8%, Nv. 10 ≈ 5,5%, Nv. 50 ≈ 17,5%.
      const levelChance = level * 0.003;
      const baseChance = 0.025 + levelChance;
      const luck = this.luckEffect();
      const bonusChance =
        treasureBonus +
        rareInstinctBonus +
        fortuneHeartBonus +
        rogueBonus +
        this.equipmentBonuses().rareDrop +
        this.constellationBonuses().rareDrop +
        luck.chance;
      // Sorte e talentos ajudam, porém nunca tornam o drop de nível rotineiro.
      const chance = Math.min(luck.cap, baseChance + bonusChance);
      if (Math.random() <= chance) {
        drops.push(this._createDrop('level', this._rollLevelRarity(level)));
      }
    }
    this._save(
      this._withInventoryItems(
        {
          ...state,
          lastRewardedLevel: currentLevel,
        },
        drops,
      ),
    );
    const previousLevel = rewardFloor;
    const unlockedSubclasses = Object.entries(RPG_SUBCLASS_UNLOCK_LEVELS)
      .filter(
        ([, requiredLevel]) =>
          requiredLevel > previousLevel && requiredLevel <= currentLevel,
      )
      .map(([subclassId]) => `Nova subclasse disponível: ${subclassId}`);
    const unlockedWorlds = this.worlds()
      .filter((world) => world.level > previousLevel && world.level <= currentLevel)
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
    const odds = this._levelDropOdds(level);
    const roll = Math.random();
    let threshold = odds.legendary;
    if (roll < threshold) return 'legendary';
    threshold += odds.epic;
    if (roll < threshold) return 'epic';
    threshold += odds.rare;
    if (roll < threshold) return 'rare';
    threshold += odds.uncommon;
    if (roll < threshold) return 'uncommon';
    return 'common';
  }

  /**
   * Roleta: trades 5 unequipped items for one new item a rarity above the
   * weakest of them; luck (1% per point, max 30%) can push it two steps up.
   */
  rerollItems(itemIds: string[]): { ok: boolean; message: string; itemId?: string } {
    const uniqueIds = [...new Set(itemIds)];
    if (uniqueIds.length !== 5) {
      return { ok: false, message: 'Selecione exatamente 5 itens para roletar.' };
    }
    const state = this._state();
    const items = uniqueIds
      .map((id) => state.inventory.find((candidate) => candidate.id === id))
      .filter((item): item is RpgItem => !!item);
    if (items.length !== 5)
      return { ok: false, message: 'Um dos itens não existe mais.' };
    if (
      items.some((item) => item.id === PET_COMPANION_ID || item.id === STARTER_RING.id)
    ) {
      return { ok: false, message: 'Mascote e Anel do Poder não entram na roleta.' };
    }
    if (items.some((item) => this.isItemEquipped(item.id))) {
      return { ok: false, message: 'Desequipe os itens antes de roletar.' };
    }
    const order: RpgItemRarity[] = [
      'common',
      'uncommon',
      'rare',
      'epic',
      'legendary',
      'mythic',
    ];
    const weakest = Math.min(...items.map((item) => order.indexOf(item.rarity)));
    const jump = Math.random() < Math.min(0.3, this.luckEffect().luck * 0.01) ? 2 : 1;
    const rarity = order[Math.min(order.length - 1, weakest + jump)];
    const reward = this._createDrop('level', rarity);
    this._save({
      ...state,
      inventory: [
        ...state.inventory.filter((candidate) => !uniqueIds.includes(candidate.id)),
        reward,
      ],
    });
    const rarityLabel: Record<RpgItemRarity, string> = {
      common: 'comum',
      uncommon: 'incomum',
      rare: 'raro',
      epic: 'épico',
      legendary: 'lendário',
      mythic: 'mítico',
    };
    return {
      ok: true,
      message: `Roleta: ${reward.name} (${rarityLabel[rarity]})${jump === 2 ? ' - a Sorte subiu duas raridades!' : '.'}`,
      itemId: reward.id,
    };
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
      overflowItems: [...state.overflowItems, ...items.slice(available)],
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

  private _createDrop(
    source: 'level' | 'weekly-boss' | 'realm-task',
    rarity: RpgItemRarity,
  ): RpgItem {
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
      companion: { name: 'Runa do Companheiro', icon: 'pets' },
      pet: { name: 'Companheiro Rúnico', icon: 'pets' },
      relic: { name: 'Relíquia do Destino', icon: 'auto_awesome' },
    };
    // 'pet' is excluded here: that slot is reserved for the synthetic bonded-
    // companion item (see _syncPetCompanion) and drives the MASCOTE showcase
    // directly from equippedItems.pet - a random drop landing there and later
    // getting equipped displaces the player's actual pet with a generic item
    // (#pet-slot-loot-collision). 'companion' is the real equipable slot for
    // pet-themed accessories.
    const slots = (Object.keys(templates) as RpgItemSlot[]).filter(
      (slot) => slot !== 'pet',
    );
    // Weapons were 1 in 11 and almost never usable by the player's class -
    // weight them x3 so new weapons actually show up.
    const weighted = slots.flatMap((slot) =>
      slot === 'mainHand' ? [slot, slot, slot] : [slot],
    );
    const slot = weighted[Math.floor(Math.random() * weighted.length)];
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)];
    const variants = DROP_VARIANTS[slot];
    if (variants?.length) templates[slot] = pick(variants);
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
    // Weapons lean harder on the player's own class (85%) than other gear.
    const ownClassChance = slot === 'mainHand' ? 0.85 : 0.65;
    let requiredClass =
      Math.random() < ownClassChance
        ? this._state().classId
        : classes[Math.floor(Math.random() * classes.length)];
    if (slot === 'mainHand') {
      templates.mainHand = pick(CLASS_WEAPONS[requiredClass] ?? CLASS_WEAPONS.adventurer);
    }
    // Themed catalog: companion drops lean on treats/toys for the player's own
    // pet type; other drops on the class's 10 themed items. Each brings its
    // own art. 60% each, the rest stays on the generic per-slot pool.
    let itemSlot: RpgItemSlot = slot;
    let catalogImage: string | undefined;
    if (slot === 'companion') {
      const petItems = RPG_PET_ITEM_CATALOG[this._state().pet.type] ?? [];
      if (petItems.length && Math.random() < 0.6) {
        const def = pick(petItems);
        templates.companion = { name: def.name, icon: def.icon };
        catalogImage = def.image;
        requiredClass = this._state().classId;
      }
    } else if (Math.random() < 0.6) {
      const def = pick(RPG_CLASS_ITEM_CATALOG[requiredClass] ?? []);
      if (def) {
        itemSlot = def.slot;
        templates[itemSlot] = { name: def.name, icon: def.icon };
        catalogImage = def.image;
      }
    }
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
      ...templates[itemSlot],
      spriteAssetId,
      imageUrl:
        catalogImage ??
        generatedItemImage(templates[itemSlot].name, itemSlot) ??
        (usesRarePack ? rareItemImage(spriteAssetId) : itemPackImage(spriteAssetId)),
      rarity,
      requiredClass,
      requiredLevel: requiredLevel[rarity],
      slot: itemSlot,
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
      failedTaskIds: {},
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
    const savedStarterRing =
      state.inventory.find((item) => item.id === STARTER_RING.id) ??
      state.inventory.find((item) => starterRingAliases.has(item.id));
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
      const semanticImage = generatedItemImage(migratedItem.name, migratedItem.slot);
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
      const assetIndex =
        Math.abs(
          [...migratedItem.id].reduce(
            (sum, character) => sum + character.charCodeAt(0),
            0,
          ),
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
    const level = this._petLevelFor(pet);
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
        pet.imageUrl || `assets/rpg/pets/evolutions/${definition.slug}-${stage}.png`,
      spriteAssetId: undefined,
      description: `Mascote ${stage}, nível ${level} e ${days} dias de vínculo.`,
      rarity,
      slot: 'pet',
      power: level,
      obtainedAt: state.createdAt || Date.now(),
      source: 'starter',
    };
    // A prior version could generate random loot targeting the 'pet' slot,
    // which the normal equip flow then wrote straight into equippedItems.pet -
    // displacing the MASCOTE showcase (driven directly by that slot) with a
    // generic item instead of the bonded companion (#pet-slot-loot-collision).
    // Retarget any such item to the companion accessory slot, where it's a
    // sensible fit, instead of leaving it stuck unequippable.
    const inventory = state.inventory
      .filter((candidate) => candidate.id !== item.id)
      .map((candidate) =>
        candidate.slot === 'pet'
          ? { ...candidate, slot: 'companion' as const }
          : candidate,
      );
    const equippedItems = { ...state.equippedItems };
    if (equippedItems.companion === PET_COMPANION_ID) {
      delete equippedItems.companion;
    }
    // The pet slot is reserved for the bonded companion showcase - always
    // keep it pointed at the real pet, regardless of what a prior save had
    // equipped there.
    equippedItems.pet = PET_COMPANION_ID;
    return { ...state, pet, equippedItems, inventory: [item, ...inventory] };
  }

  private _saveRoster(roster: RpgProfilesState): void {
    this._roster.set(roster);
    void this._domainState.put('rpg:profiles', roster);
  }

  /**
   * Item images are stored on the item when it drops, and this load path
   * doesn't re-derive them (_withStarterRing only runs for the legacy
   * localStorage roster) - so companion accessories would keep whatever art
   * they dropped with. Re-point them at their current generated sprite.
   */
  private _withCompanionAccessoryImages(roster: RpgProfilesState): RpgProfilesState {
    const characters = Object.fromEntries(
      Object.entries(roster.characters).map(([id, character]) => [
        id,
        {
          ...character,
          inventory: character.inventory.map((item) => {
            // Catalog items keep their own art; companion accessories get the
            // current generated sprite (only by name - never a slot fallback).
            const catalogImage = RPG_CATALOG_IMAGE_BY_NAME.get(item.name);
            if (catalogImage)
              return { ...item, imageUrl: catalogImage, spriteAssetId: undefined };
            if (item.slot !== 'companion') return item;
            const named = /coleira|sino|pingente|runa do companheiro/i.test(
              item.name.normalize('NFD').replace(/\p{Diacritic}/gu, ''),
            );
            const imageUrl = named ? generatedItemImage(item.name, 'companion') : null;
            return imageUrl ? { ...item, imageUrl, spriteAssetId: undefined } : item;
          }),
        },
      ]),
    );
    return { ...roster, characters };
  }

  private async _hydrateDomainState(): Promise<void> {
    if (localStorage.getItem(LS.RPG_PROFILE)) {
      await this._domainState.put('rpg:profiles', this._roster());
      localStorage.removeItem(LS.RPG_PROFILE);
      this._hydrated.set(true);
      return;
    }
    const stored = await this._domainState.get<RpgProfilesState>('rpg:profiles');
    if (stored?.characters?.[stored.activeCharacterId]) {
      this._roster.set(this._withCompanionAccessoryImages(stored));
    }
    this._healPhantomDefaultCharacter();
    this._runEmergencyRecoveryOnce();
    this._seedRewardsAndPenaltiesOnce();
    this._healLeakedMonthlyMedalHistory();
    this._creditAugustCodificadorOnce();
    this._hydrated.set(true);
    void this._shrinkStoredImages();
  }

  // Reward/penalty/avatar photos used to be stored at full resolution (~3 MB
  // each), bloating every save, sync and backup. Downscale them once.
  private async _shrinkStoredImages(): Promise<void> {
    const replacements = await shrinkLargeInlineImages(this._roster());
    if (!replacements.size) return;
    this._saveRoster(applyImageReplacements(this._roster(), replacements));
  }

  // One-time seed of the reward/penalty templates the owner asked to have
  // ready to redeem/trigger. Idempotent by title, so it's safe even if it
  // somehow runs more than once or some of these were already added by hand.
  private _seedRewardsAndPenaltiesOnce(): void {
    if (localStorage.getItem(RPG_REWARDS_PENALTIES_SEED_FLAG)) return;
    localStorage.setItem(RPG_REWARDS_PENALTIES_SEED_FLAG, String(Date.now()));
    const state = this._state();
    if (!state) return;

    const rewardsToAdd: Array<{ title: string; cost: number }> = [
      { title: 'Assistir um filme', cost: 30 },
      { title: 'Vale presente (200) reais.', cost: 400 },
      { title: 'Vale presente (500) reais.', cost: 1000 },
      { title: 'Jogo de PS5 ou PC', cost: 500 },
    ];
    const existingRewardTitles = new Set(state.rewards.map((item) => item.title));
    const newRewards = rewardsToAdd
      .filter((item) => !existingRewardTitles.has(item.title))
      .map((item) => ({
        id: crypto.randomUUID(),
        title: item.title,
        cost: item.cost,
        purchasedCount: 0,
      }));

    const penaltiesToAdd: Array<{ title: string; xpLoss: number; coinsLoss: number }> = [
      { title: 'Hábito proibido', xpLoss: 100, coinsLoss: 1000 },
      { title: 'Sai da dieta sem necessidade', xpLoss: 30, coinsLoss: 50 },
      { title: 'Dormiu menos que 7 horas por escolha', xpLoss: 50, coinsLoss: 100 },
      { title: 'Gastou dinheiro sem planejamento', xpLoss: 100, coinsLoss: 200 },
      { title: 'Faltou a academia', xpLoss: 200, coinsLoss: 200 },
      { title: 'Deixou de ler', xpLoss: 100, coinsLoss: 50 },
      { title: 'Deixou de estudar', xpLoss: 100, coinsLoss: 50 },
    ];
    const existingPenaltyTitles = new Set(state.penalties.map((item) => item.title));
    const createdAt = Date.now();
    const newPenalties = penaltiesToAdd
      .filter((item) => !existingPenaltyTitles.has(item.title))
      .map((item) => ({
        id: crypto.randomUUID(),
        title: item.title,
        xpLoss: item.xpLoss,
        coinsLoss: item.coinsLoss,
        createdAt,
        timesApplied: 0,
      }));

    if (!newRewards.length && !newPenalties.length) return;
    this._save({
      ...state,
      rewards: [...state.rewards, ...newRewards],
      penalties: [...state.penalties, ...newPenalties],
    });
  }

  // One-time manual credit for "O Codificador" (August 2026) - see
  // RPG_AUGUST_CODIFICADOR_CREDIT_FLAG for why: the owner's real study days
  // that month were tracked in Academia Arcana, not the Habit Tracker habit
  // this medal reads, so it has no way to see them on its own. Requested
  // directly by the owner. Scoped to the medal-history owner character only.
  private _creditAugustCodificadorOnce(): void {
    if (localStorage.getItem(RPG_AUGUST_CODIFICADOR_CREDIT_FLAG)) return;
    localStorage.setItem(RPG_AUGUST_CODIFICADOR_CREDIT_FLAG, String(Date.now()));
    const state = this._state();
    if (!state || state.id !== this._monthlyMedalHistoryOwnerId()) return;
    const config = state.monthlyMedalConfigs['2026-8'] ?? {
      habitIds: [],
      targetDays: 20,
    };
    this._save({
      ...state,
      monthlyMedalConfigs: {
        ...state.monthlyMedalConfigs,
        '2026-8': { ...config, manualCredit: config.targetDays },
      },
    });
  }

  // One-time emergency restore for the 2026-07-31 startup-race incident: adds
  // back a known-good character recovered from an old snapshot and makes it
  // active, without touching whatever is currently in the roster (nothing is
  // deleted, so there is nothing to lose by running this).
  private _runEmergencyRecoveryOnce(): void {
    if (localStorage.getItem(RPG_EMERGENCY_RECOVERY_FLAG)) return;
    localStorage.setItem(RPG_EMERGENCY_RECOVERY_FLAG, String(Date.now()));
    const recovered = getEmergencyRecoveryCharacter();
    if (!recovered) return;
    const roster = this._roster();
    // Only step in if the character slot Academy Arcana's migrated data is
    // keyed to doesn't already hold a proper mage - never overwrite an
    // already-legitimate character.
    if (roster.characters[recovered.id]?.classId === 'mage') return;
    this._saveRoster({
      ...roster,
      activeCharacterId: recovered.id,
      characters: { ...roster.characters, [recovered.id]: recovered },
    });
  }

  // 'main-character' (DEFAULT_STATE.id) is only ever created by a fresh,
  // never-persisted roster - never by createCharacter(), which always mints
  // a crypto.randomUUID(). If it shows up alongside a real character, it can
  // only be a startup-race artifact (created in-memory before the persisted
  // roster finished loading, then saved by something that ran too early) -
  // never something the user intentionally made via "+ Criar herói". Restore
  // the real character as active and discard the phantom.
  private _healPhantomDefaultCharacter(): void {
    const roster = this._roster();
    const others = Object.keys(roster.characters).filter((id) => id !== 'main-character');
    if (!roster.characters['main-character'] || !others.length) return;
    const preferred = others
      .map((id) => roster.characters[id])
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    const characters = { ...roster.characters };
    delete characters['main-character'];
    this._saveRoster({
      ...roster,
      activeCharacterId:
        roster.activeCharacterId === 'main-character'
          ? preferred.id
          : roster.activeCharacterId,
      characters,
    });
  }
}
