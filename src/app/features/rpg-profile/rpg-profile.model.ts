export type RpgAttributeId =
  | 'health'
  | 'intelligence'
  | 'discipline'
  | 'social'
  | 'finance';
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

export const RPG_SUBCLASS_UNLOCK_LEVELS: Record<RpgSubclassId, number> = {
  none: 1,
  scholar: 25,
  paladin: 35,
  alchemist: 45,
  pathfinder: 60,
  chronomancer: 100,
  vanguard: 45,
  trailblazer: 100,
  battlemage: 45,
  archmage: 100,
  sentinel: 45,
  templar: 100,
  artificer: 45,
  tycoon: 100,
  beastmaster: 45,
  warden: 100,
  berserker: 45,
  warlord: 100,
  oracle: 45,
  saint: 100,
  assassin: 45,
  shadowmaster: 100,
  minstrel: 45,
  virtuoso: 100,
  reaper: 45,
  lich: 100,
  sniper: 45,
  falconer: 100,
  juggernaut: 45,
  chieftain: 100,
};

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
}

export interface RpgMonthlyMedalConfig {
  habitIds: string[];
  targetDays: number;
  // Manual day credit added on top of the live habit-completion count, e.g.
  // for progress tracked outside the Habit Tracker (Academia Arcana, etc.)
  // that this medal has no way to see on its own.
  manualCredit?: number;
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
  projectAttributes: Record<string, RpgAttributeId | null>;
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
