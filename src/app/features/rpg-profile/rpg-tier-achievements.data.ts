// Achievement sets that gate the class title ladder (rpg-class-titles.data.ts).
// Set[i] must be fully completed (all 10 items) before title tier[i] can
// unlock - e.g. every "iniciante" (set 0) achievement must be done before
// "Aprendiz Arcano" (tier 0) becomes available, on top of its own level and
// attribute requirement. The same 10 achievements are shared by every class;
// only the tier's numeral and target scale change.
export type RpgTierAchievementMetric =
  | 'totalXp'
  | 'coins'
  | 'streak'
  | 'health'
  | 'intelligence'
  | 'discipline'
  | 'social'
  | 'finance'
  | 'petLevel'
  | 'characterAgeDays';

export interface RpgTierAchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  metric: RpgTierAchievementMetric;
  target: number;
}

const METRIC_LABEL: Record<RpgTierAchievementMetric, string> = {
  totalXp: 'XP total',
  coins: 'moedas',
  streak: 'dias seguidos de sequência',
  health: 'pontos de Saúde',
  intelligence: 'pontos de Inteligência',
  discipline: 'pontos de Disciplina',
  social: 'pontos de Social',
  finance: 'pontos de Finanças',
  petLevel: 'níveis do mascote',
  characterAgeDays: 'dias desde a criação do personagem',
};

const BASE_ACHIEVEMENTS: {
  key: RpgTierAchievementMetric;
  title: string;
  icon: string;
}[] = [
  { key: 'totalXp', title: 'Poder Acumulado', icon: 'bolt' },
  { key: 'coins', title: 'Peso em Ouro', icon: 'paid' },
  { key: 'streak', title: 'Chama da Sequência', icon: 'local_fire_department' },
  { key: 'health', title: 'Corpo Forjado', icon: 'favorite' },
  { key: 'intelligence', title: 'Mente Afiada', icon: 'psychology' },
  { key: 'discipline', title: 'Disciplina de Ferro', icon: 'military_tech' },
  { key: 'social', title: 'Laços Sociais', icon: 'groups' },
  { key: 'finance', title: 'Visão Financeira', icon: 'account_balance' },
  { key: 'petLevel', title: 'Vínculo com o Companheiro', icon: 'pets' },
  { key: 'characterAgeDays', title: 'Veterania', icon: 'hourglass_bottom' },
];

// One target per tier (index 0..4), increasing in difficulty.
const TIER_TARGETS: Record<RpgTierAchievementMetric, number[]> = {
  totalXp: [3000, 12000, 30000, 55000, 90000],
  coins: [100, 400, 900, 1500, 2500],
  streak: [3, 7, 12, 18, 25],
  health: [150, 450, 1000, 2000, 3600],
  intelligence: [150, 450, 1000, 2000, 3600],
  discipline: [150, 450, 1000, 2000, 3600],
  social: [150, 450, 1000, 2000, 3600],
  finance: [150, 450, 1000, 2000, 3600],
  petLevel: [2, 4, 6, 8, 10],
  characterAgeDays: [10, 30, 60, 100, 150],
};

const TIER_NUMERALS = ['I', 'II', 'III', 'IV', 'V'];

export const RPG_TIER_ACHIEVEMENT_SETS: RpgTierAchievementDef[][] = TIER_NUMERALS.map(
  (numeral, tierIndex) =>
    BASE_ACHIEVEMENTS.map((base) => {
      const target = TIER_TARGETS[base.key][tierIndex];
      return {
        id: `tier${tierIndex}-${base.key}`,
        title: `${base.title} ${numeral}`,
        description: `Alcance ${target} ${METRIC_LABEL[base.key]}.`,
        icon: base.icon,
        metric: base.key,
        target,
      };
    }),
);
