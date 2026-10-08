import { ReviewDelayStreak } from '../academy-arcana/domain/review-delay-penalty';
import { CareerQuestState } from '../career-quest/career-quest.model';

export type RpgAttributeId =
  | 'health'
  | 'intelligence'
  | 'discipline'
  | 'social'
  | 'finance';

// A player-created attribute. Unlike the core ones it isn't wired into
// constellations, titles or tier achievements - it tracks hours and shows on the radar.
export interface RpgCustomAttribute {
  id: string;
  label: string;
  icon: string;
  /** Self-assessed 0-10 rating, like attributeRatings for the core attributes. */
  rating: number;
}

/** An attribute as shown in the UI: a core one (possibly renamed) or a custom one. */
export interface RpgAttributeDefinition {
  id: string;
  label: string;
  icon: string;
  isCustom: boolean;
  rating: number;
}

export type RpgClassId =
  | 'adventurer'
  | 'mage'
  | 'guardian'
  | 'merchant'
  | 'ranger'
  | 'warrior'
  | 'cleric'
  | 'rogue'
  | 'bard'
  | 'necromancer'
  | 'archer'
  | 'barbarian';
export type RpgSubclassId =
  | 'none'
  | 'chronomancer'
  | 'scholar'
  | 'paladin'
  | 'alchemist'
  | 'pathfinder'
  | 'vanguard'
  | 'trailblazer'
  | 'battlemage'
  | 'archmage'
  | 'sentinel'
  | 'templar'
  | 'artificer'
  | 'tycoon'
  | 'beastmaster'
  | 'warden'
  | 'berserker'
  | 'warlord'
  | 'oracle'
  | 'saint'
  | 'assassin'
  | 'shadowmaster'
  | 'minstrel'
  | 'virtuoso'
  | 'reaper'
  | 'lich'
  | 'sniper'
  | 'falconer'
  | 'juggernaut'
  | 'chieftain';
export type RpgSpeciesId =
  | 'human'
  | 'elf'
  | 'dwarf'
  | 'orc'
  | 'fae'
  | 'tiefling'
  | 'draconian';
export type RpgGenderId = 'male' | 'female';

export interface RpgAppearance {
  gender: RpgGenderId;
  bodyType: 'slim' | 'standard' | 'strong';
  faceType: 'round' | 'oval' | 'square';
  skinColor: string;
  eyeColor: string;
  hairStyle:
    | 'short'
    | 'long'
    | 'curly'
    | 'afro'
    | 'bun'
    | 'ponytail'
    | 'mohawk'
    | 'braids'
    | 'dreads'
    | 'wavy'
    | 'bald';
  hairColor: string;
  hairSize: 'small' | 'medium' | 'large';
  beard: 'none' | 'stubble' | 'short' | 'full' | 'goatee' | 'viking' | 'braided' | 'long';
  beardColor: string;
  beardSize: 'small' | 'medium' | 'large';
  mustache: 'none' | 'thin' | 'thick';
  accessory: 'none' | 'earring' | 'glasses' | 'circlet' | 'scar';
  eyebrows: 'soft' | 'straight' | 'bold';
  eyeStyle: 'round' | 'sharp' | 'bright';
  noseStyle: 'small' | 'straight' | 'wide';
  mouthStyle: 'neutral' | 'smile' | 'serious';
  marking: 'none' | 'freckles' | 'scar' | 'warpaint' | 'makeup';
  clothingColor: string;
  armorColor: string;
  detailColor: string;
  capeColor: string;
  accessoryColor: string;
}

// Every class follows the same progressive ladder, ordered by unlock level:
// 2 subclasses -> 50 / 100, 3 -> 25 / 50 / 100, mage (4) -> 25 / 50 / 100 / 150.
// Each later step unlocks a strictly bigger bonus (see RPG_SUBCLASS_BONUSES).
export const RPG_SUBCLASS_UNLOCK_LEVELS: Record<RpgSubclassId, number> = {
  none: 1,
  scholar: 25,
  battlemage: 50,
  chronomancer: 100,
  archmage: 150,
  paladin: 25,
  sentinel: 50,
  templar: 100,
  alchemist: 25,
  artificer: 50,
  tycoon: 100,
  beastmaster: 25,
  pathfinder: 50,
  warden: 100,
  vanguard: 50,
  trailblazer: 100,
  berserker: 50,
  warlord: 100,
  oracle: 50,
  saint: 100,
  assassin: 50,
  shadowmaster: 100,
  minstrel: 50,
  virtuoso: 100,
  reaper: 50,
  lich: 100,
  sniper: 50,
  falconer: 100,
  juggernaut: 50,
  chieftain: 100,
};

/**
 * Real effects of each subclass, as fractions (0.1 = +10%). The UI text is
 * generated from this table, so what's shown is always what's applied.
 * xp: task XP · gold: coins · quest: daily-quest XP · health: Health points ·
 * penalty: reduction of XP lost to penalties.
 */
export interface RpgSubclassBonus {
  xp?: number;
  gold?: number;
  quest?: number;
  health?: number;
  penalty?: number;
}

export const RPG_SUBCLASS_BONUSES: Record<RpgSubclassId, RpgSubclassBonus> = {
  none: {},
  scholar: { xp: 0.05 },
  battlemage: { xp: 0.1 },
  chronomancer: { xp: 0.15, quest: 0.1 },
  archmage: { xp: 0.25, gold: 0.1 },
  paladin: { health: 0.1 },
  sentinel: { health: 0.15, penalty: 0.1 },
  templar: { health: 0.2, xp: 0.1, penalty: 0.1 },
  alchemist: { gold: 0.1 },
  artificer: { gold: 0.15 },
  tycoon: { gold: 0.25, xp: 0.05 },
  beastmaster: { quest: 0.1 },
  pathfinder: { quest: 0.15 },
  warden: { quest: 0.2, xp: 0.1 },
  vanguard: { xp: 0.1 },
  trailblazer: { xp: 0.15, quest: 0.1 },
  berserker: { xp: 0.1 },
  warlord: { xp: 0.15, gold: 0.1 },
  oracle: { quest: 0.1 },
  saint: { quest: 0.1, xp: 0.1, penalty: 0.2 },
  assassin: { gold: 0.1 },
  shadowmaster: { xp: 0.15, gold: 0.1 },
  minstrel: { gold: 0.1 },
  virtuoso: { gold: 0.1, quest: 0.15 },
  reaper: { xp: 0.1 },
  lich: { xp: 0.15, gold: 0.1 },
  sniper: { xp: 0.1 },
  falconer: { xp: 0.1, quest: 0.15 },
  juggernaut: { health: 0.15, penalty: 0.1 },
  chieftain: { xp: 0.1, gold: 0.1, health: 0.1 },
};

const SUBCLASS_BONUS_LABELS: Record<keyof RpgSubclassBonus, string> = {
  xp: 'de XP das tarefas',
  gold: 'de moedas',
  quest: 'de XP das missões diárias',
  health: 'nos pontos de Saúde',
  penalty: 'de redução nas penalidades',
};

export const formatSubclassBonus = (bonus: RpgSubclassBonus): string =>
  (Object.keys(SUBCLASS_BONUS_LABELS) as (keyof RpgSubclassBonus)[])
    .filter((key) => bonus[key])
    .map(
      (key) => `+${Math.round((bonus[key] ?? 0) * 100)}% ${SUBCLASS_BONUS_LABELS[key]}`,
    )
    .join(' · ') + '.';

export interface RpgXpEntry {
  taskId: string;
  projectId: string;
  xp: number;
  earnedAt: number;
}

export interface RpgReward {
  id: string;
  title: string;
  cost: number;
  purchasedCount: number;
  imageUrl?: string;
}

export interface RpgAnnualGoal {
  id: string;
  title: string;
  habitIds: string[];
  targetDays: number;
  year: number;
  iconIndex: number;
  // Manual day credit added on top of the live habit-completion count, e.g.
  // to compensate for progress lost to a data-sync bug. Goals created before
  // this field existed have it as `undefined`, which reads as 50 (a one-time
  // compensation) instead of 0 - see annualGoalProgress().
  startingCredit?: number;
}

export interface RpgTrophyClaim {
  claimedAt: number;
  xp: number;
  gold: number;
  /** Set on `monthly-tier:*` claims - the highest rarity already paid out for that medal. */
  tier?: RpgMedalTier;
}

export type RpgMedalTier = 'bronze' | 'silver' | 'gold';

/** One weekly review ("revisão semanal"), keyed by the Monday that starts the week. */
export interface RpgWeeklyReview {
  weekStart: string;
  /** How the week went, 1-5. */
  rating: number;
  worked: string;
  blocked: string;
  change: string;
  /** Focus chosen for the NEXT week - shown back at the next review. */
  nextFocus: string;
  /** Whether the focus set in the previous review was met. */
  previousFocusDone: 'yes' | 'partial' | 'no' | null;
  completedAt: number;
}

export interface RpgPenaltyLogEntry {
  penaltyId: string;
  title: string;
  at: number;
  xp: number;
  coins: number;
  money: number;
}

/**
 * A commitment with a deadline and a stake: meet the target by the deadline
 * and you earn stakeXp/stakeCoins; miss it and the stake is taken (XP/coins
 * via a hidden penalty, stakeMoney into the real punishment savings box).
 */
export interface RpgContract {
  id: string;
  title: string;
  /** hours: time tracked on tasks in scope · manual: a counter you bump yourself. */
  metric: 'hours' | 'manual';
  target: number;
  scopeKind: 'all' | 'project' | 'tag';
  scopeId?: string;
  /** Inclusive YYYY-MM-DD window. */
  startDay: string;
  deadlineDay: string;
  stakeMoney: number;
  stakeXp: number;
  stakeCoins: number;
  manualProgress: number;
  status: 'active' | 'won' | 'lost';
  createdAt: number;
  resolvedAt?: number;
  finalProgress?: number;
}

export interface RpgMissionClaim {
  at: number;
  xp: number;
  coins: number;
}

/**
 * Self-reported mission that pays XP/coins when marked. With milestones it is
 * an evolution line (3 → 7 → 14 dias...): each claim unlocks the next
 * milestone and pays more. Without milestones it can be claimed any number of times.
 */
export interface RpgMission {
  id: string;
  title: string;
  description: string;
  /** File name (no extension) in assets/rpg/missions. */
  icon: string;
  /** Ascending milestones; empty = repeatable mission. */
  stages: number[];
  unit: string;
  xpReward: number;
  coinsReward: number;
  /** One entry per milestone reached (or per completion, if repeatable). */
  claims: RpgMissionClaim[];
  createdAt: number;
  /** When set, progress is computed from the app's own data and milestones are claimed automatically. */
  auto?: RpgMissionAuto;
}

/**
 * Where an automatic mission reads its progress from. Each day gets a score
 * (done/total), summed per period; a period counts when it reaches the threshold.
 */
export interface RpgMissionAuto {
  /**
   * habits: the listed habits marked as done (every habit of the day when empty) ·
   * noPenalty: none of the listed penalties applied (any dungeon penalty when empty) ·
   * hours: time tracked on tasks in `scope` ·
   * work: Agenda de Trabalho facts, see `workMetric`.
   */
  source: 'habits' | 'noPenalty' | 'hours' | 'work';
  /**
   * work only - dailyGoal: day with 6h of estimated cards finished ·
   * reviewCleared: day the "Revisão" column was emptied ·
   * urgentWeek: week that closed its urgent cards and ended with none open.
   */
  workMetric?: 'dailyGoal' | 'reviewCleared' | 'urgentWeek';
  /** Habit or penalty ids, depending on source. */
  ids: string[];
  /** hours only: 'all' | 'project:<id>' | 'tag:<id>'. */
  scope?: string;
  period: 'day' | 'week' | 'month';
  /** Share of the period that must be done (1 = all of it); 0 = at least one. */
  threshold: number;
  /** streak: periods in a row (a miss resets) · total: every period since `since`. */
  count: 'streak' | 'total';
  /** Repeatable missions only: earned once every this many periods. */
  every: number;
  /** YYYY-MM-DD - nothing before this day counts. */
  since: string;
}

export interface RpgMonthlyMedalConfig {
  habitIds: string[];
  targetDays: number;
  // Manual day credit added on top of the live habit-completion count, e.g.
  // for progress tracked outside the Habit Tracker (Academia Arcana, etc.)
  // that this medal has no way to see on its own.
  manualCredit?: number;
  /** habit (default): days from the linked habits · value: a manual current/target number. */
  mode?: 'habit' | 'value';
  valueTarget?: number;
  valueCurrent?: number;
  /** Free-text unit for value mode, e.g. "R$", "km", "h", "livros". */
  valueUnit?: string;
}

/** Player renames of a monthly medal. */
export interface RpgMonthlyMedalLabel {
  title?: string;
  description?: string;
}

export type RpgRealmId =
  | 'village'
  | 'castle'
  | 'library'
  | 'digital-city'
  | 'laboratory'
  | 'dragon-cave'
  | 'serene-temple';

export interface RpgRealmProgress {
  steps: number;
  bossDamage: number;
  visitedAt: number | null;
  timeSpentMs: number;
}

export interface RpgProfileState {
  id: string;
  createdAt: number;
  // Snapshot (in minutes) of today's already-tracked focus time at the exact
  // moment this character was created - lets daily quests subtract it back
  // out so a character made partway through the day doesn't inherit time
  // tracked before it existed. Only meaningful on the character's own
  // creation day; see _buildDailyQuests.
  focusedMinutesBaselineAtCreation?: number;
  displayName: string;
  speciesId: RpgSpeciesId;
  appearance: RpgAppearance;
  avatarDataUrl: string | null;
  attributeRatings: Record<RpgAttributeId, number>;
  /** Project id -> core attribute id or custom attribute id. */
  projectAttributes: Record<string, string | null>;
  customAttributes?: RpgCustomAttribute[];
  monthlyMedalLabels?: Record<string, RpgMonthlyMedalLabel>;
  /** Player renames/re-icons of the core attributes (ids stay fixed so game systems keep working). */
  attributeOverrides?: Partial<Record<RpgAttributeId, { label: string; icon: string }>>;
  xpLedger: Record<string, RpgXpEntry>;
  rewards: RpgReward[];
  coinsSpent: number;
  classId: RpgClassId;
  subclassId: RpgSubclassId;
  selectedTitleId: string | null;
  claimedDailyQuests: Record<string, number>;
  questBonusXp: number;
  questBonusCoins: number;
  penalties: RpgPenalty[];
  // Real money (R$) owed to the punishment savings box: running total of every
  // applied penalty's moneyLoss. Never touches XP/coins. Missing on older states = 0.
  penaltyMoneyOwed?: number;
  /** Real money (R$) already moved into the punishment savings box. Pending = owed - transferred. */
  penaltyMoneyTransferred?: number;
  contracts?: RpgContract[];
  missions?: RpgMission[];
  weeklyReviews?: Record<string, RpgWeeklyReview>;
  /** Career Quest progress (levels, evidence, quests) for this character. */
  careerQuest?: CareerQuestState;
  /** Dated record of every manual penalty application (for the reports tab). Starts empty on older states. */
  penaltyLog?: RpgPenaltyLogEntry[];
  /** Open late streaks of Academia topic reviews, by node id - see reviewDelayCharges. */
  reviewDelayStreaks?: Record<string, ReviewDelayStreak>;
  /** Dated record of every "Marquei como separado" transfer into the punishment savings box. */
  penaltyMoneyTransfers?: { at: number; amount: number }[];
  inventory: RpgItem[];
  equippedItems: Partial<Record<RpgItemSlot, string>>;
  lastRewardedLevel: number;
  weeklyBossClaims: Record<string, number>;
  skills: Record<string, number>;
  skillPointsSpent: number;
  lastUnlockedStarId: string | null;
  pet: RpgPet;
  campaigns: RpgCampaign[];
  annualGoals: RpgAnnualGoal[];
  monthlyMedalConfigs: Record<string, RpgMonthlyMedalConfig>;
  trophyClaims: Record<string, RpgTrophyClaim>;
  overflowItems: RpgItem[];
  currentRealmId: RpgRealmId;
  realmProgress: Partial<Record<RpgRealmId, RpgRealmProgress>>;
  projectRealms: Record<string, RpgRealmId>;
  /** Ids (RpgTierAchievementDef.id) of tier achievements ever reached, mapped
   * to when - keeps them permanently "CONQUISTADA" even if a non-monotonic
   * metric (streak, coins) later drops back below its target. Missing/absent
   * entries just mean "not yet reached", so no migration is needed. */
  unlockedTierAchievementIds?: Record<string, number>;
  /** Classes whose full title ladder has ever been mastered, mapped to when -
   * grants the one-time mastery bonus exactly once per class even if the
   * player later switches back into an already-mastered class. */
  masteredClassBonuses?: Partial<Record<RpgClassId, number>>;
  /** Snapshot (per class) of the class's title-ladder metric (attribute XP,
   * coins, or streak) at the moment that class was first adopted - so a
   * class's own title progress only counts what's earned AFTER adopting it,
   * not whatever the (shared, ever-accumulating) metric already was from
   * playing a previous class. Set once per class and never overwritten, so
   * switching away and back doesn't erase progress already made in it. This
   * is tier 0's baseline specifically - see classTierBaselines for tiers 1-4. */
  classMetricBaselines?: Partial<Record<RpgClassId, number>>;
  /** Per-class, per-tier-index (1-4) snapshot of the metric at the moment the
   * PREVIOUS tier unlocked - each title tier's quest only counts points
   * earned after its predecessor was actually reached, instead of whatever
   * had already piled up in the background while still below that tier.
   * Populated lazily as each tier unlocks; a missing entry means "still
   * counting from classMetricBaselines / not yet reached that far". */
  classTierBaselines?: Partial<Record<RpgClassId, Record<number, number>>>;
  /** Per-class, per-tier-index (0-4) timestamp of when that title unlocked -
   * the persisted source for honorBonus (titles pay XP/gold). */
  classUnlockedTitleTiers?: Partial<Record<RpgClassId, Record<number, number>>>;
  /**
   * XP/gold multipliers over time: each entry applies to XP earned from `at`
   * until the next entry. Lets class/subclass/item/title changes affect only
   * what's earned afterwards instead of re-scaling all past XP. Absent on
   * characters from before this existed (seeded on first load).
   */
  multiplierHistory?: { at: number; xp: number; gold: number }[];
}

export interface RpgProfilesState {
  activeCharacterId: string;
  characters: Record<string, RpgProfileState>;
  processedTaskIds: Record<string, string>;
  /** Task ids explicitly marked "not done" via markTaskAsFailed, mapped to the id of the penalty entry it created - lets the UI (e.g. the schedule) tell those apart from a task that was simply completed, and lets refresh()'s reversal pass remove the exact penalty if the task is un-done later. */
  failedTaskIds?: Record<string, string>;
}

export interface DisciplineDay {
  date: string;
  completed: number;
  total: number;
  percentage: number;
}

export interface RpgDailyQuest {
  id: string;
  title: string;
  description: string;
  icon: string;
  progress: number;
  target: number;
  rewardXp: number;
  rewardCoins: number;
  isComplete: boolean;
  isClaimed: boolean;
}

export type RpgItemRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'mythic';
export type RpgItemSlot =
  | 'head'
  | 'neck'
  | 'chest'
  | 'hands'
  | 'mainHand'
  | 'offHand'
  | 'ringLeft'
  | 'ringRight'
  | 'boots'
  | 'companion'
  | 'pet'
  | 'relic';

export interface RpgItem {
  id: string;
  name: string;
  icon: string;
  imageUrl?: string;
  spriteAssetId?: string;
  description?: string;
  quantity?: number;
  weight?: number;
  value?: number;
  requiredClass?: RpgClassId;
  requiredLevel?: number;
  upgradeLevel?: number;
  rarity: RpgItemRarity;
  slot: RpgItemSlot;
  power: number;
  stats?: {
    power?: number;
    intelligence?: number;
    luck?: number;
    xpMultiplier?: number;
    goldMultiplier?: number;
    rareDrop?: number;
  };
  obtainedAt: number;
  source: 'level' | 'weekly-boss' | 'starter' | 'realm-task';
}

export interface RpgPenalty {
  id: string;
  title: string;
  xpLoss: number;
  coinsLoss: number;
  createdAt: number;
  imageUrl?: string;
  // How many times this penalty has actually been triggered/logged. Defining
  // a penalty type no longer deducts anything by itself - only applyPenalty()
  // does, once per occurrence. Missing on older entries, which is why every
  // read defaults it to 0.
  timesApplied?: number;
  /** Real money (R$) to set aside each time this penalty is applied. Purely a real-life ledger - never affects XP/coins. */
  moneyLoss?: number;
  /** Physical exercise to do each time this penalty is applied, free text (e.g. "50 flexões, 20 barras"). */
  exercise?: string;
  // Running totals actually deducted so far. Editing xpLoss/coinsLoss must only
  // affect future applications, so the RPG totals read these instead of
  // `xpLoss * timesApplied`. Missing on older entries - see penaltyAppliedTotals().
  xpLossApplied?: number;
  coinsLossApplied?: number;
  /** Legacy: escalation now reads the dated penaltyLog (see penaltyMultiplier). */
  weekAppliedAt?: number[];
  /** Set for the hidden penalty created when a contract is lost. */
  sourceContractId?: string;
  /** Set for penalties auto-generated by markTaskAsFailed (a task marked "not done") - already a one-shot deduction, not a recurring bad-habit template, so the Penalty Dungeon UI hides these instead of offering an "Aplicar" button. */
  sourceTaskId?: string;
}

export interface RpgPet {
  name: string;
  xp: number;
  type: RpgPetType;
  imageUrl?: string;
  createdAt?: number;
  boundAt?: number | null;
}

export type RpgPetType = 'tiger' | 'dragon' | 'phoenix' | 'wolf' | 'griffin';
export type RpgPetStage = 'egg' | 'cub' | 'teen' | 'adult' | 'epic';

export interface RpgCampaignChapter {
  id: string;
  title: string;
  projectId: string | null;
  targetCompletedTasks: number;
}

export interface RpgCampaign {
  id: string;
  title: string;
  finalBoss: string;
  chapters: RpgCampaignChapter[];
  imageUrl?: string;
}
