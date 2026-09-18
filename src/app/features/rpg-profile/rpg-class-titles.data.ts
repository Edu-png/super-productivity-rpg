import { RpgClassId } from './rpg-profile.model';

export type RpgTitleMetric = 'intelligence' | 'health' | 'social' | 'finance' | 'streak';

export interface RpgClassTitleTier {
  id: string;
  classId: RpgClassId;
  level: number;
  title: string;
  metric: RpgTitleMetric;
  target: number;
  questLabel: string;
}

const METRIC_LABEL: Record<RpgTitleMetric, string> = {
  intelligence: 'pontos de Inteligência',
  health: 'pontos de Saúde',
  social: 'pontos de Social',
  finance: 'moedas',
  streak: 'dias seguidos de sequência',
};

const LEVELS = [20, 40, 60, 80, 100];

function tiers(
  classId: RpgClassId,
  titles: string[],
  metric: RpgTitleMetric,
  targets: number[],
): RpgClassTitleTier[] {
  return titles.map((title, index) => ({
    id: `${classId}-${LEVELS[index]}`,
    classId,
    level: LEVELS[index],
    title,
    metric,
    target: targets[index],
    questLabel: `Alcance ${targets[index]} ${METRIC_LABEL[metric]}`,
  }));
}

// Every class has its own 5-tier title ladder, unlocked every 20 levels
// (20/40/60/80/100). Each tier also demands a class-flavored quest (an
// attribute or streak threshold) that gets progressively harder, so a title
// is never just "reach the level" - the level is a gate, the quest is the
// actual unlock condition.
// The intelligence/health/social ladders (mage/guardian/warrior/cleric/bard/
// necromancer/barbarian) share [150, 450, 1000, 2000, 3600] as of 2026-08-31
// - raised from the original [150,350,600,900,1300], which a consistently
// active player could clear almost entirely before even reaching level 20,
// since raw attribute totals accrue independently of character level.
export const RPG_CLASS_TITLES: Record<RpgClassId, RpgClassTitleTier[]> = {
  adventurer: tiers(
    'adventurer',
    ['Andarilho', 'Explorador', 'Desbravador', 'Vanguarda do Caminho', 'Lenda Errante'],
    'streak',
    [5, 10, 15, 20, 30],
  ),
  mage: tiers(
    'mage',
    ['Aprendiz Arcano', 'Estudioso das Runas', 'Feiticeiro', 'Arcanista', 'Arquimago'],
    'intelligence',
    [150, 450, 1000, 2000, 3600],
  ),
  guardian: tiers(
    'guardian',
    ['Escudeiro', 'Protetor', 'Guardião Vigilante', 'Muralha Viva', 'Bastião Eterno'],
    'health',
    [150, 450, 1000, 2000, 3600],
  ),
  merchant: tiers(
    'merchant',
    [
      'Vendedor Ambulante',
      'Comerciante',
      'Negociante Astuto',
      'Barão do Comércio',
      'Magnata das Rotas',
    ],
    'finance',
    [100, 250, 450, 700, 1000],
  ),
  ranger: tiers(
    'ranger',
    [
      'Batedor',
      'Rastreador',
      'Patrulheiro Experiente',
      'Guardião da Trilha',
      'Mestre da Mata',
    ],
    'streak',
    [7, 14, 21, 28, 40],
  ),
  warrior: tiers(
    'warrior',
    ['Recruta', 'Soldado', 'Guerreiro Veterano', 'Campeão de Batalha', 'Lenda da Guerra'],
    'health',
    [150, 450, 1000, 2000, 3600],
  ),
  cleric: tiers(
    'cleric',
    ['Noviço', 'Acólito', 'Clérigo Devoto', 'Sacerdote', 'Alto Sacerdote'],
    'social',
    [150, 450, 1000, 2000, 3600],
  ),
  rogue: tiers(
    'rogue',
    [
      'Batedor de Carteiras',
      'Ladino das Sombras',
      'Assassino Silencioso',
      'Mestre dos Disfarces',
      'Sombra Lendária',
    ],
    'streak',
    [5, 12, 20, 28, 40],
  ),
  bard: tiers(
    'bard',
    ['Trovador', 'Menestrel', 'Bardo Renomado', 'Virtuoso', 'Lenda das Canções'],
    'social',
    [150, 450, 1000, 2000, 3600],
  ),
  necromancer: tiers(
    'necromancer',
    [
      'Aprendiz das Sombras',
      'Conjurador',
      'Necromante Sombrio',
      'Senhor dos Mortos',
      'Lich Supremo',
    ],
    'intelligence',
    [150, 450, 1000, 2000, 3600],
  ),
  archer: tiers(
    'archer',
    [
      'Atirador Novato',
      'Arqueiro Habilidoso',
      'Atirador de Elite',
      'Mestre do Arco',
      'Falcão Certeiro',
    ],
    'streak',
    [6, 14, 22, 30, 42],
  ),
  barbarian: tiers(
    'barbarian',
    ['Selvagem', 'Guerreiro Tribal', 'Bárbaro Feroz', 'Destruidor', 'Colosso Lendário'],
    'health',
    [150, 450, 1000, 2000, 3600],
  ),
};
