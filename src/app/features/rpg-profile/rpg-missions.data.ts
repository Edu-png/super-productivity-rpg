import { RpgMission, RpgMissionAuto } from './rpg-profile.model';

export const RPG_MISSION_ICON_PATH = 'assets/rpg/missions';

/** Pixel-art covers in assets/rpg/missions, offered when creating a mission. */
export const RPG_MISSION_ICONS: Array<{ id: string; label: string }> = [
  { id: 'moon', label: 'Lua' },
  { id: 'bed', label: 'Cama' },
  { id: 'forbidden', label: 'Proibido' },
  { id: 'apple', label: 'Maçã' },
  { id: 'leaf', label: 'Folha' },
  { id: 'dumbbell', label: 'Haltere' },
  { id: 'hammer', label: 'Martelo' },
  { id: 'books', label: 'Livros' },
  { id: 'hourglass', label: 'Ampulheta' },
  { id: 'target', label: 'Alvo' },
  { id: 'bolt', label: 'Raio' },
  { id: 'book', label: 'Livro aberto' },
  { id: 'candle', label: 'Vela' },
  { id: 'coin', label: 'Moeda' },
  { id: 'chest', label: 'Baú' },
  { id: 'shield', label: 'Escudo' },
  { id: 'crown', label: 'Coroa' },
  { id: 'stars', label: 'Estrelas' },
  { id: 'check', label: 'Check' },
  { id: 'chart', label: 'Gráfico' },
  { id: 'scales', label: 'Balança' },
  { id: 'rise', label: 'Seta' },
  { id: 'chain', label: 'Corrente' },
  { id: 'heart', label: 'Coração' },
  { id: 'flame', label: 'Chama' },
];

export const isMissionRepeatable = (mission: RpgMission): boolean =>
  !mission.stages.length;

export const isMissionComplete = (mission: RpgMission): boolean =>
  !isMissionRepeatable(mission) && mission.claims.length >= mission.stages.length;

/** Each milestone of an evolution line pays one more base reward than the previous one. */
export const missionNextReward = (mission: RpgMission): { xp: number; coins: number } => {
  const factor = isMissionRepeatable(mission) ? 1 : mission.claims.length + 1;
  return { xp: mission.xpReward * factor, coins: mission.coinsReward * factor };
};

type MissionSeed = Pick<
  RpgMission,
  'title' | 'description' | 'icon' | 'stages' | 'unit' | 'xpReward' | 'coinsReward'
>;

export const RPG_MISSION_SEEDS: MissionSeed[] = [
  // Evolution lines
  {
    title: 'Sono Restaurador',
    description: 'Dormir com nota Garmin ≥ 80.',
    icon: 'moon',
    stages: [3, 7, 14, 30],
    unit: 'dias',
    xpReward: 50,
    coinsReward: 20,
  },
  {
    title: 'Guardião do Descanso',
    description: 'Dormir 7h ou mais.',
    icon: 'bed',
    stages: [3, 7, 14, 30],
    unit: 'dias',
    xpReward: 50,
    coinsReward: 20,
  },
  {
    title: 'Resistência',
    description: 'Ficar sem o hábito proibido.',
    icon: 'forbidden',
    stages: [3, 7, 14, 30, 60, 90],
    unit: 'dias',
    xpReward: 80,
    coinsReward: 40,
  },
  {
    title: 'Disciplina Alimentar',
    description: 'Passar o dia dentro da dieta.',
    icon: 'apple',
    stages: [3, 7, 14, 30],
    unit: 'dias',
    xpReward: 50,
    coinsReward: 20,
  },
  {
    title: 'Semana Limpa',
    description: 'Completar a semana sem "sair da dieta sem recuperar".',
    icon: 'leaf',
    stages: [1, 2, 4, 8],
    unit: 'semanas',
    xpReward: 80,
    coinsReward: 30,
  },
  {
    title: 'Sem Desculpas',
    description: 'Completar todos os treinos planejados da semana.',
    icon: 'dumbbell',
    stages: [1, 2, 4, 8],
    unit: 'semanas',
    xpReward: 80,
    coinsReward: 30,
  },
  {
    title: 'Forjando o Corpo',
    description: 'Completar treinos na academia.',
    icon: 'hammer',
    stages: [5, 15, 30, 50, 100],
    unit: 'treinos',
    xpReward: 60,
    coinsReward: 25,
  },
  {
    title: 'Aprendiz Consistente',
    description: 'Estudar em dias consecutivos.',
    icon: 'books',
    stages: [3, 7, 14, 30, 60],
    unit: 'dias',
    xpReward: 50,
    coinsReward: 20,
  },
  {
    title: 'Horas de Maestria',
    description: 'Acumular horas estudadas.',
    icon: 'hourglass',
    stages: [5, 10, 25, 50, 100],
    unit: 'h',
    xpReward: 60,
    coinsReward: 25,
  },
  {
    title: 'Foco Inabalável',
    description: 'Concluir o estudo sem abandonar depois de perder a concentração.',
    icon: 'target',
    stages: [3, 7, 14, 30],
    unit: 'sessões',
    xpReward: 40,
    coinsReward: 15,
  },
  {
    title: 'Deep Work',
    description: 'Uma sessão de estudo focado sem interrupção.',
    icon: 'bolt',
    stages: [30, 60, 90, 120],
    unit: 'min',
    xpReward: 40,
    coinsReward: 15,
  },
  {
    title: 'Leitor Consistente',
    description: 'Ler em dias consecutivos.',
    icon: 'book',
    stages: [3, 7, 14, 30, 60],
    unit: 'dias',
    xpReward: 50,
    coinsReward: 20,
  },
  {
    title: 'Devorador de Livros',
    description: 'Acumular tempo de leitura.',
    icon: 'candle',
    stages: [2, 5, 10, 25, 50],
    unit: 'h',
    xpReward: 50,
    coinsReward: 20,
  },
  {
    title: 'Mestre das Moedas',
    description: 'Passar dias sem gasto não planejado.',
    icon: 'coin',
    stages: [7, 14, 30, 60],
    unit: 'dias',
    xpReward: 60,
    coinsReward: 30,
  },
  {
    title: 'Orçamento Intacto',
    description: 'Fechar o mês sem gastos fora do planejamento.',
    icon: 'chest',
    stages: [1, 2, 3, 6],
    unit: 'meses',
    xpReward: 150,
    coinsReward: 60,
  },
  // Special missions (repeatable)
  {
    title: 'Semana Perfeita',
    description: 'Não receber nenhuma penalidade durante 7 dias.',
    icon: 'shield',
    stages: [],
    unit: '',
    xpReward: 150,
    coinsReward: 60,
  },
  {
    title: 'Quinzena Perfeita',
    description: '14 dias sem penalidade.',
    icon: 'shield',
    stages: [],
    unit: '',
    xpReward: 300,
    coinsReward: 120,
  },
  {
    title: 'Lenda da Disciplina',
    description: '30 dias sem nenhuma penalidade grave.',
    icon: 'crown',
    stages: [],
    unit: '',
    xpReward: 700,
    coinsReward: 300,
  },
  {
    title: 'Combo Triplo',
    description: 'Cumprir sono + estudo + academia no mesmo dia.',
    icon: 'stars',
    stages: [],
    unit: '',
    xpReward: 40,
    coinsReward: 15,
  },
  {
    title: 'Dia 100%',
    description: 'Completar todos os hábitos planejados do dia.',
    icon: 'check',
    stages: [],
    unit: '',
    xpReward: 40,
    coinsReward: 15,
  },
  {
    title: 'Semana 90%',
    description: 'Completar pelo menos 90% dos hábitos da semana.',
    icon: 'chart',
    stages: [],
    unit: '',
    xpReward: 120,
    coinsReward: 50,
  },
  {
    title: 'Equilíbrio',
    description:
      'Cumprir pelo menos 1 objetivo de Saúde, Estudo e Carreira no mesmo dia.',
    icon: 'scales',
    stages: [],
    unit: '',
    xpReward: 40,
    coinsReward: 15,
  },
  {
    title: 'Volta por Cima',
    description:
      'Depois de receber uma penalidade, completar os próximos 3 dias sem reincidência.',
    icon: 'rise',
    stages: [],
    unit: '',
    xpReward: 80,
    coinsReward: 30,
  },
  {
    title: 'Quebra da Reincidência',
    description:
      'Ficar 7 dias sem repetir uma penalidade que vinha acontecendo frequentemente.',
    icon: 'chain',
    stages: [],
    unit: '',
    xpReward: 120,
    coinsReward: 50,
  },
  {
    title: 'Redenção',
    description: 'Cumprir a ação compensatória de uma penalidade imediatamente.',
    icon: 'heart',
    stages: [],
    unit: '',
    xpReward: 30,
    coinsReward: 10,
  },
  {
    title: 'Combo de Redenção',
    description: 'Corrigir 3 erros consecutivos sem deixar acumular.',
    icon: 'heart',
    stages: [],
    unit: '',
    xpReward: 90,
    coinsReward: 35,
  },
  {
    title: 'Imparável',
    description: '14 dias consecutivos concluindo pelo menos 80% das tarefas planejadas.',
    icon: 'flame',
    stages: [],
    unit: '',
    xpReward: 300,
    coinsReward: 120,
  },
];

type MissionAutoTemplate = Omit<RpgMissionAuto, 'ids' | 'since'> & {
  /** Habit/penalty titles to link; no match leaves the mission manual. Omitted = all/any. */
  match?: RegExp;
};

const streak = (
  source: RpgMissionAuto['source'],
  match: RegExp | undefined,
  period: RpgMissionAuto['period'] = 'day',
  extra: Partial<MissionAutoTemplate> = {},
): MissionAutoTemplate => ({
  source,
  match,
  period,
  threshold: 1,
  count: 'streak',
  every: 1,
  ...extra,
});

/** Automatic counting for the example missions that the app's own data can measure. */
export const RPG_MISSION_AUTO_TEMPLATES = new Map<string, MissionAutoTemplate>([
  ['Guardião do Descanso', streak('noPenalty', /dormiu menos/i)],
  ['Resistência', streak('noPenalty', /h[aá]bito proibido/i)],
  ['Disciplina Alimentar', streak('noPenalty', /dieta/i)],
  ['Semana Limpa', streak('noPenalty', /dieta/i, 'week')],
  ['Sem Desculpas', streak('habits', /academia/i, 'week')],
  ['Forjando o Corpo', streak('habits', /academia/i, 'day', { count: 'total' })],
  ['Aprendiz Consistente', streak('habits', /estud/i, 'day', { threshold: 0 })],
  ['Leitor Consistente', streak('habits', /^ler$/i)],
  ['Mestre das Moedas', streak('noPenalty', /gastou dinheiro/i)],
  ['Orçamento Intacto', streak('noPenalty', /gastou dinheiro/i, 'month')],
  ['Semana Perfeita', streak('noPenalty', undefined, 'day', { every: 7 })],
  ['Quinzena Perfeita', streak('noPenalty', undefined, 'day', { every: 14 })],
  ['Lenda da Disciplina', streak('noPenalty', undefined, 'day', { every: 30 })],
  ['Dia 100%', streak('habits', undefined, 'day', { count: 'total' })],
  ['Semana 90%', streak('habits', undefined, 'week', { count: 'total', threshold: 0.9 })],
  ['Imparável', streak('habits', undefined, 'day', { threshold: 0.8, every: 14 })],
]);

/**
 * Resolves a mission's automatic template against this character's habits and
 * penalties. Undefined when there is no template, or it names habits/penalties
 * that don't exist (the mission then stays manual).
 */
export const missionAutoFromTemplate = (
  title: string,
  habits: Array<{ id: string; title: string }>,
  penalties: Array<{ id: string; title: string }>,
  since: string,
): RpgMissionAuto | undefined => {
  const template = RPG_MISSION_AUTO_TEMPLATES.get(title);
  if (!template) return undefined;
  const { match, ...auto } = template;
  const pool = auto.source === 'habits' ? habits : penalties;
  const ids = match ? pool.filter((item) => match.test(item.title)).map((i) => i.id) : [];
  if (match && !ids.length) return undefined;
  return { ...auto, ids, since };
};

/** Automatic missions fed by the Agenda de Trabalho, added once to every character. */
export const RPG_WORK_MISSION_SEEDS: Array<
  Pick<
    RpgMission,
    'title' | 'description' | 'icon' | 'stages' | 'unit' | 'xpReward' | 'coinsReward'
  > & { auto: Omit<RpgMissionAuto, 'since'> }
> = [
  {
    title: 'Jornada Completa',
    description:
      'Dias seguidos concluindo 6h de cards estimados (fim de semana não quebra).',
    icon: 'hourglass',
    stages: [3, 5, 10, 20],
    unit: 'dias',
    xpReward: 60,
    coinsReward: 25,
    auto: {
      source: 'work',
      workMetric: 'dailyGoal',
      ids: [],
      period: 'day',
      threshold: 1,
      count: 'streak',
      every: 1,
    },
  },
  {
    title: 'Revisão Zerada',
    description: 'Esvaziar a coluna "Revisão" do Kanban.',
    icon: 'check',
    stages: [],
    unit: '',
    xpReward: 30,
    coinsReward: 10,
    auto: {
      source: 'work',
      workMetric: 'reviewCleared',
      ids: [],
      period: 'day',
      threshold: 1,
      count: 'total',
      every: 1,
    },
  },
  {
    title: 'Semana sem Urgências',
    description: 'Fechar todos os cards urgentes da semana (domingo sem nenhum aberto).',
    icon: 'shield',
    stages: [],
    unit: '',
    xpReward: 120,
    coinsReward: 50,
    auto: {
      source: 'work',
      workMetric: 'urgentWeek',
      ids: [],
      period: 'week',
      threshold: 1,
      count: 'total',
      every: 1,
    },
  },
];
