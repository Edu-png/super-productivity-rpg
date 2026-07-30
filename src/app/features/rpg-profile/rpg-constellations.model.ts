export type RpgConstellationId =
  | 'destiny'
  | 'discipline'
  | 'health'
  | 'intelligence'
  | 'finance'
  | 'social';

export type RpgStarRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type RpgStarNodeType = 'small' | 'medium' | 'notable' | 'legendary' | 'hub';
export type RpgClusterPattern =
  | 'short_branch'
  | 'small_ring'
  | 'partial_ring'
  | 'spiral'
  | 'diamond'
  | 'fork'
  | 'double_path'
  | 'loop'
  | 'satellites'
  | 'converging_paths';

export interface RpgStarEffects {
  xp_multiplier?: number;
  gold_multiplier?: number;
  luck?: number;
  rare_drop?: number;
}

export interface RpgConstellationStar {
  id: string;
  name: string;
  description: string;
  lore: string;
  constellation: RpgConstellationId;
  position: { x: number; y: number };
  connections: string[];
  cost: number;
  maxLevel: number;
  requiredLevel?: number;
  icon: string;
  rarity: RpgStarRarity;
  nodeType?: RpgStarNodeType;
  clusterId?: string;
  effects: RpgStarEffects;
}

export interface RpgConstellationCluster {
  id: string;
  region: RpgConstellationId;
  hybridRegion?: RpgConstellationId;
  pattern: RpgClusterPattern;
  rotation: number;
  scale: number;
  center: { x: number; y: number };
  ring: number;
  hubId: string;
  parentHubIds: string[];
  isDestinyHub?: boolean;
}

export interface RpgConstellationDefinition {
  id: RpgConstellationId;
  name: string;
  specialty: string;
  color: string;
  icon: string;
}

export interface RpgConstellationBonuses {
  xpMultiplier: number;
  goldMultiplier: number;
  luck: number;
  rareDrop: number;
}
