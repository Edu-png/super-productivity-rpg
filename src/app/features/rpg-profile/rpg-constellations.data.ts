import {
  RpgClusterPattern,
  RpgConstellationCluster,
  RpgConstellationDefinition,
  RpgConstellationStar,
} from './rpg-constellations.model';

export const RPG_CONSTELLATIONS: RpgConstellationDefinition[] = [
  {
    id: 'destiny',
    name: 'Destino',
    specialty: 'Mudanças de build',
    color: '#f4d06f',
    icon: 'auto_awesome',
  },
  {
    id: 'discipline',
    name: 'Disciplina',
    specialty: 'XP e streaks',
    color: '#f0b83f',
    icon: 'military_tech',
  },
  {
    id: 'health',
    name: 'Saúde',
    specialty: 'Resistência',
    color: '#e85c68',
    icon: 'favorite',
  },
  {
    id: 'intelligence',
    name: 'Inteligência',
    specialty: 'Conhecimento',
    color: '#50a9f2',
    icon: 'psychology',
  },
  {
    id: 'finance',
    name: 'Finanças',
    specialty: 'Ouro',
    color: '#65c779',
    icon: 'savings',
  },
  {
    id: 'social',
    name: 'Social',
    specialty: 'Missões e alianças',
    color: '#b47af2',
    icon: 'groups',
  },
];

const BASE_CONSTELLATION_STARS: RpgConstellationStar[] = [
  {
    id: 'destiny-core',
    name: 'Núcleo Aventureiro',
    description: 'O início de todos os caminhos.',
    lore: 'Toda jornada começa com uma única estrela.',
    constellation: 'destiny',
    position: { x: 800, y: 500 },
    connections: [],
    cost: 0,
    maxLevel: 1,
    icon: 'explore',
    rarity: 'legendary',
    effects: {},
  },
  {
    id: 'discipline-spark',
    name: 'Centelha da Disciplina',
    description: '+2% de XP por nível.',
    lore: 'A repetição transforma intenção em poder.',
    constellation: 'discipline',
    position: { x: 800, y: 365 },
    connections: ['destiny-core'],
    cost: 1,
    maxLevel: 3,
    icon: 'bolt',
    rarity: 'common',
    effects: { xp_multiplier: 0.02 },
  },
  {
    id: 'discipline-streak',
    name: 'Chama da Ofensiva',
    description: '+3% de XP por nível em sua build.',
    lore: 'Uma chama protegida dia após dia torna-se um sol.',
    constellation: 'discipline',
    position: { x: 800, y: 245 },
    connections: ['discipline-spark'],
    cost: 1,
    maxLevel: 3,
    icon: 'local_fire_department',
    rarity: 'uncommon',
    effects: { xp_multiplier: 0.03 },
  },
  {
    id: 'discipline-focus',
    name: 'Multiplicador de Foco',
    description: '+5% de XP por nível.',
    lore: 'O tempo dominado dobra o valor da ação.',
    constellation: 'discipline',
    position: { x: 800, y: 130 },
    connections: ['discipline-streak'],
    cost: 2,
    maxLevel: 2,
    icon: 'timer',
    rarity: 'epic',
    effects: { xp_multiplier: 0.05 },
  },
  {
    id: 'discipline-ascendant',
    name: 'Ascendente da Disciplina',
    description: 'Todo XP aumenta em 25%.',
    lore: 'A vontade deixa de ser esforço e torna-se natureza.',
    constellation: 'discipline',
    position: { x: 800, y: 35 },
    connections: ['discipline-focus'],
    cost: 4,
    maxLevel: 1,
    requiredLevel: 40,
    icon: 'workspace_premium',
    rarity: 'legendary',
    effects: { xp_multiplier: 0.25 },
  },
  {
    id: 'health-vigor',
    name: 'Vigor',
    description: '+2 pontos de sorte defensiva por nível.',
    lore: 'Um corpo cuidado sustenta campanhas longas.',
    constellation: 'health',
    position: { x: 640, y: 430 },
    connections: ['destiny-core'],
    cost: 1,
    maxLevel: 3,
    icon: 'favorite',
    rarity: 'common',
    effects: { luck: 2 },
  },
  {
    id: 'health-rhythm',
    name: 'Ritmo Vital',
    description: '+2% de XP por nível.',
    lore: 'Respiração, descanso e movimento criam ritmo.',
    constellation: 'health',
    position: { x: 500, y: 350 },
    connections: ['health-vigor'],
    cost: 1,
    maxLevel: 3,
    icon: 'monitor_heart',
    rarity: 'uncommon',
    effects: { xp_multiplier: 0.02 },
  },
  {
    id: 'health-fortitude',
    name: 'Fortitude',
    description: '+4 de sorte por nível.',
    lore: 'A constância resiste ao desgaste.',
    constellation: 'health',
    position: { x: 360, y: 260 },
    connections: ['health-rhythm'],
    cost: 2,
    maxLevel: 2,
    icon: 'shield',
    rarity: 'epic',
    effects: { luck: 4 },
  },
  {
    id: 'health-immortal',
    name: 'Coração Inabalável',
    description: '+10% de XP e +10 de sorte.',
    lore: 'O herói aprende a recomeçar sem perder o caminho.',
    constellation: 'health',
    position: { x: 215, y: 165 },
    connections: ['health-fortitude'],
    cost: 4,
    maxLevel: 1,
    requiredLevel: 40,
    icon: 'health_and_safety',
    rarity: 'legendary',
    effects: { xp_multiplier: 0.1, luck: 10 },
  },
  {
    id: 'wisdom-study',
    name: 'Estudo Deliberado',
    description: '+3% de XP por nível.',
    lore: 'Conhecimento exige intenção, não apenas exposição.',
    constellation: 'intelligence',
    position: { x: 960, y: 430 },
    connections: ['destiny-core'],
    cost: 1,
    maxLevel: 3,
    icon: 'menu_book',
    rarity: 'common',
    effects: { xp_multiplier: 0.03 },
  },
  {
    id: 'wisdom-reading',
    name: 'Leitura Profunda',
    description: '+4% de XP por nível.',
    lore: 'Ideias conectadas formam mapas internos.',
    constellation: 'intelligence',
    position: { x: 1100, y: 350 },
    connections: ['wisdom-study'],
    cost: 1,
    maxLevel: 3,
    icon: 'auto_stories',
    rarity: 'uncommon',
    effects: { xp_multiplier: 0.04 },
  },
  {
    id: 'wisdom-course',
    name: 'Mestre dos Cursos',
    description: '+5% de XP por nível.',
    lore: 'O aprendiz transforma conteúdo em competência.',
    constellation: 'intelligence',
    position: { x: 1240, y: 260 },
    connections: ['wisdom-reading'],
    cost: 2,
    maxLevel: 2,
    icon: 'school',
    rarity: 'epic',
    effects: { xp_multiplier: 0.05 },
  },
  {
    id: 'wisdom-sage',
    name: 'Sábio dos Projetos',
    description: '+20% de XP geral.',
    lore: 'Projetos concluídos tornam-se conhecimento permanente.',
    constellation: 'intelligence',
    position: { x: 1385, y: 165 },
    connections: ['wisdom-course'],
    cost: 4,
    maxLevel: 1,
    requiredLevel: 40,
    icon: 'cognition',
    rarity: 'legendary',
    effects: { xp_multiplier: 0.2 },
  },
  {
    id: 'finance-coin',
    name: 'Primeira Moeda',
    description: '+3% de ouro por nível.',
    lore: 'Toda fortuna começa com valor preservado.',
    constellation: 'finance',
    position: { x: 650, y: 590 },
    connections: ['destiny-core'],
    cost: 1,
    maxLevel: 3,
    icon: 'paid',
    rarity: 'common',
    effects: { gold_multiplier: 0.03 },
  },
  {
    id: 'finance-vault',
    name: 'Cofre',
    description: '+5% de ouro por nível.',
    lore: 'O que é guardado pode financiar a próxima aventura.',
    constellation: 'finance',
    position: { x: 520, y: 690 },
    connections: ['finance-coin'],
    cost: 1,
    maxLevel: 3,
    icon: 'lock',
    rarity: 'uncommon',
    effects: { gold_multiplier: 0.05 },
  },
  {
    id: 'finance-bank',
    name: 'Banco do Reino',
    description: '+8% de ouro por nível.',
    lore: 'Recursos organizados trabalham pelo herói.',
    constellation: 'finance',
    position: { x: 390, y: 790 },
    connections: ['finance-vault'],
    cost: 2,
    maxLevel: 2,
    icon: 'account_balance',
    rarity: 'epic',
    effects: { gold_multiplier: 0.08 },
  },
  {
    id: 'finance-dividends',
    name: 'Dividendos Arcanos',
    description: '+20% de ouro e +5 de sorte.',
    lore: 'A prosperidade passa a alimentar a própria jornada.',
    constellation: 'finance',
    position: { x: 255, y: 890 },
    connections: ['finance-bank'],
    cost: 4,
    maxLevel: 1,
    requiredLevel: 40,
    icon: 'currency_exchange',
    rarity: 'legendary',
    effects: { gold_multiplier: 0.2, luck: 5 },
  },
  {
    id: 'social-bond',
    name: 'Primeiro Vínculo',
    description: '+2 de sorte por nível.',
    lore: 'Nenhum destino grandioso é construído sozinho.',
    constellation: 'social',
    position: { x: 950, y: 590 },
    connections: ['destiny-core'],
    cost: 1,
    maxLevel: 3,
    icon: 'handshake',
    rarity: 'common',
    effects: { luck: 2 },
  },
  {
    id: 'social-alliance',
    name: 'Aliança',
    description: '+2% de ouro e XP por nível.',
    lore: 'Objetivos compartilhados ampliam recompensas.',
    constellation: 'social',
    position: { x: 1080, y: 690 },
    connections: ['social-bond'],
    cost: 1,
    maxLevel: 3,
    icon: 'groups',
    rarity: 'uncommon',
    effects: { xp_multiplier: 0.02, gold_multiplier: 0.02 },
  },
  {
    id: 'social-influence',
    name: 'Influência',
    description: '+4 de sorte por nível.',
    lore: 'Confiança abre portas que força alguma alcança.',
    constellation: 'social',
    position: { x: 1210, y: 790 },
    connections: ['social-alliance'],
    cost: 2,
    maxLevel: 2,
    icon: 'campaign',
    rarity: 'epic',
    effects: { luck: 4 },
  },
  {
    id: 'social-legend',
    name: 'Lenda Compartilhada',
    description: '+10% XP, +10% ouro e +5 sorte.',
    lore: 'A história do herói inspira novas histórias.',
    constellation: 'social',
    position: { x: 1345, y: 890 },
    connections: ['social-influence'],
    cost: 4,
    maxLevel: 1,
    requiredLevel: 40,
    icon: 'diversity_3',
    rarity: 'legendary',
    effects: { xp_multiplier: 0.1, gold_multiplier: 0.1, luck: 5 },
  },
  {
    id: 'destiny-time-gold',
    name: 'Tempo é Ouro',
    description: '+15% XP e ouro.',
    lore: 'O relógio deixa de ser limite e torna-se aliado.',
    constellation: 'destiny',
    position: { x: 690, y: 500 },
    connections: ['destiny-core'],
    cost: 5,
    maxLevel: 1,
    requiredLevel: 20,
    icon: 'schedule',
    rarity: 'legendary',
    effects: { xp_multiplier: 0.15, gold_multiplier: 0.15 },
  },
  {
    id: 'destiny-born-scholar',
    name: 'Estudioso Nato',
    description: '+20% de XP.',
    lore: 'Aprender deixa de ser tarefa e torna-se identidade.',
    constellation: 'destiny',
    position: { x: 910, y: 500 },
    connections: ['destiny-core'],
    cost: 5,
    maxLevel: 1,
    requiredLevel: 40,
    icon: 'neurology',
    rarity: 'legendary',
    effects: { xp_multiplier: 0.2 },
  },
  {
    id: 'fortune-sense',
    name: 'Presságio',
    description: '+1% de drop raro por nível.',
    lore: 'Alguns veem acaso; você aprende a ler sinais.',
    constellation: 'destiny',
    position: { x: 800, y: 610 },
    connections: ['destiny-core'],
    cost: 2,
    maxLevel: 3,
    requiredLevel: 20,
    icon: 'visibility',
    rarity: 'rare',
    effects: { rare_drop: 0.01 },
  },
  {
    id: 'fortune-legendary',
    name: 'Convergência Lendária',
    description: '+5% de drop raro e +10 sorte.',
    lore: 'As estrelas improváveis finalmente se alinham.',
    constellation: 'destiny',
    position: { x: 800, y: 735 },
    connections: ['fortune-sense'],
    cost: 5,
    maxLevel: 1,
    requiredLevel: 60,
    icon: 'stars',
    rarity: 'legendary',
    effects: { rare_drop: 0.05, luck: 10 },
  },
  {
    id: 'discipline-daily',
    name: 'Ritual da Aurora',
    description: '+4% de XP em sua build por nível.',
    lore: 'A primeira vitória do dia decide o ritmo da campanha.',
    constellation: 'discipline',
    position: { x: 660, y: 285 },
    connections: ['discipline-spark'],
    cost: 1,
    maxLevel: 3,
    icon: 'wb_sunny',
    rarity: 'uncommon',
    effects: { xp_multiplier: 0.04 },
  },
  {
    id: 'discipline-hard-task',
    name: 'Desafio do Colosso',
    description: '+5% de XP por nível.',
    lore: 'O impossível é apenas uma tarefa ainda não dividida.',
    constellation: 'discipline',
    position: { x: 940, y: 285 },
    connections: ['discipline-spark'],
    cost: 2,
    maxLevel: 3,
    icon: 'fitness_center',
    rarity: 'rare',
    effects: { xp_multiplier: 0.05 },
  },
  {
    id: 'discipline-combo',
    name: 'Combo Ininterrupto',
    description: '+8% de XP por nível.',
    lore: 'Uma conclusão convoca a próxima antes que a chama diminua.',
    constellation: 'discipline',
    position: { x: 625, y: 145 },
    connections: ['discipline-daily'],
    cost: 2,
    maxLevel: 2,
    icon: 'all_inclusive',
    rarity: 'epic',
    effects: { xp_multiplier: 0.08 },
  },
  {
    id: 'discipline-mission',
    name: 'Juramento das Missões',
    description: '+8% de XP por nível.',
    lore: 'Missões cumpridas gravam disciplina na própria alma.',
    constellation: 'discipline',
    position: { x: 975, y: 145 },
    connections: ['discipline-hard-task'],
    cost: 2,
    maxLevel: 2,
    icon: 'task_alt',
    rarity: 'epic',
    effects: { xp_multiplier: 0.08 },
  },
  {
    id: 'health-rest',
    name: 'Descanso Restaurador',
    description: '+3 de sorte por nível.',
    lore: 'Até heróis precisam retornar à fogueira.',
    constellation: 'health',
    position: { x: 540, y: 500 },
    connections: ['health-vigor'],
    cost: 1,
    maxLevel: 3,
    icon: 'bedtime',
    rarity: 'uncommon',
    effects: { luck: 3 },
  },
  {
    id: 'health-renewal',
    name: 'Renovação',
    description: '+4% XP e +3 sorte por nível.',
    lore: 'Recuperar-se também é avançar.',
    constellation: 'health',
    position: { x: 390, y: 465 },
    connections: ['health-rest'],
    cost: 2,
    maxLevel: 2,
    icon: 'recycling',
    rarity: 'rare',
    effects: { xp_multiplier: 0.04, luck: 3 },
  },
  {
    id: 'wisdom-curiosity',
    name: 'Curiosidade Arcana',
    description: '+4% de XP por nível.',
    lore: 'Toda pergunta sincera revela uma nova passagem.',
    constellation: 'intelligence',
    position: { x: 1060, y: 500 },
    connections: ['wisdom-study'],
    cost: 1,
    maxLevel: 3,
    icon: 'lightbulb',
    rarity: 'uncommon',
    effects: { xp_multiplier: 0.04 },
  },
  {
    id: 'wisdom-memory',
    name: 'Palácio da Memória',
    description: '+6% de XP por nível.',
    lore: 'Conhecimento organizado deixa de desaparecer com o tempo.',
    constellation: 'intelligence',
    position: { x: 1210, y: 465 },
    connections: ['wisdom-curiosity'],
    cost: 2,
    maxLevel: 2,
    icon: 'account_tree',
    rarity: 'rare',
    effects: { xp_multiplier: 0.06 },
  },
  {
    id: 'finance-double',
    name: 'Moeda Gêmea',
    description: '+4% de ouro por nível.',
    lore: 'Uma boa decisão financeira costuma trazer uma irmã.',
    constellation: 'finance',
    position: { x: 600, y: 745 },
    connections: ['finance-vault'],
    cost: 1,
    maxLevel: 3,
    icon: 'toll',
    rarity: 'uncommon',
    effects: { gold_multiplier: 0.04 },
  },
  {
    id: 'finance-compound',
    name: 'Juros do Reino',
    description: '+7% de ouro por nível.',
    lore: 'Pequenas reservas passam a trabalhar durante a jornada.',
    constellation: 'finance',
    position: { x: 500, y: 875 },
    connections: ['finance-double'],
    cost: 2,
    maxLevel: 2,
    icon: 'trending_up',
    rarity: 'epic',
    effects: { gold_multiplier: 0.07 },
  },
  {
    id: 'social-mentor',
    name: 'Conselho do Mentor',
    description: '+3% XP e +2 sorte por nível.',
    lore: 'Uma boa orientação encurta caminhos sem reduzir a conquista.',
    constellation: 'social',
    position: { x: 1000, y: 745 },
    connections: ['social-alliance'],
    cost: 1,
    maxLevel: 3,
    icon: 'record_voice_over',
    rarity: 'uncommon',
    effects: { xp_multiplier: 0.03, luck: 2 },
  },
  {
    id: 'social-guild',
    name: 'Guilda da Jornada',
    description: '+5% XP, +5% ouro por nível.',
    lore: 'Grandes campanhas são sustentadas por alianças duradouras.',
    constellation: 'social',
    position: { x: 1100, y: 875 },
    connections: ['social-mentor'],
    cost: 2,
    maxLevel: 2,
    icon: 'shield_person',
    rarity: 'epic',
    effects: { xp_multiplier: 0.05, gold_multiplier: 0.05 },
  },
  {
    id: 'destiny-routine-master',
    name: 'Mestre da Rotina',
    description: '+12% XP e +5 sorte.',
    lore: 'Trinta amanheceres alinhados dobram a força do destino.',
    constellation: 'destiny',
    position: { x: 665, y: 665 },
    connections: ['fortune-sense'],
    cost: 5,
    maxLevel: 1,
    requiredLevel: 40,
    icon: 'event_repeat',
    rarity: 'legendary',
    effects: { xp_multiplier: 0.12, luck: 5 },
  },
  {
    id: 'destiny-tireless',
    name: 'Aventureiro Incansável',
    description: '+10% XP, +10% ouro e +2% drop raro.',
    lore: 'Quando todas as missões caem, o próprio céu oferece um tesouro.',
    constellation: 'destiny',
    position: { x: 935, y: 665 },
    connections: ['fortune-sense'],
    cost: 6,
    maxLevel: 1,
    requiredLevel: 60,
    icon: 'deployed_code',
    rarity: 'legendary',
    effects: { xp_multiplier: 0.1, gold_multiplier: 0.1, rare_drop: 0.02 },
  },
];

type RegionId = Exclude<RpgConstellationStar['constellation'], 'destiny'>;
type RegionTheme = {
  id: RegionId;
  rootId: string;
  names: string[];
  icons: string[];
  effect: keyof RpgConstellationStar['effects'];
};

const REGION_THEMES: RegionTheme[] = [
  { id: 'discipline', rootId: 'discipline-ascendant', names: ['Ritmo', 'Foco', 'Constância', 'Ofensiva', 'Rotina', 'Propósito', 'Domínio', 'Ascensão'], icons: ['bolt', 'timer', 'task_alt', 'local_fire_department', 'event_repeat', 'flag', 'military_tech', 'workspace_premium'], effect: 'xp_multiplier' },
  { id: 'intelligence', rootId: 'wisdom-sage', names: ['Leitura', 'Memória', 'Pesquisa', 'Lógica', 'Estudo', 'Síntese', 'Maestria', 'Sabedoria'], icons: ['menu_book', 'psychology', 'science', 'schema', 'school', 'hub', 'cognition', 'auto_stories'], effect: 'xp_multiplier' },
  { id: 'social', rootId: 'social-legend', names: ['Vínculo', 'Escuta', 'Presença', 'Aliança', 'Mentoria', 'Guilda', 'Influência', 'Legado'], icons: ['handshake', 'hearing', 'record_voice_over', 'groups', 'school', 'shield_person', 'campaign', 'diversity_3'], effect: 'luck' },
  { id: 'finance', rootId: 'finance-dividends', names: ['Reserva', 'Valor', 'Cofre', 'Troca', 'Investimento', 'Patrimônio', 'Prosperidade', 'Fortuna'], icons: ['paid', 'savings', 'lock', 'currency_exchange', 'trending_up', 'account_balance', 'diamond', 'toll'], effect: 'gold_multiplier' },
  { id: 'health', rootId: 'health-immortal', names: ['Fôlego', 'Descanso', 'Movimento', 'Vigor', 'Equilíbrio', 'Resiliência', 'Vitalidade', 'Renovação'], icons: ['air', 'bedtime', 'directions_run', 'favorite', 'balance', 'shield', 'monitor_heart', 'health_and_safety'], effect: 'luck' },
];

const CLUSTER_PATTERNS: Record<RpgClusterPattern, { x: number; y: number }[]> = {
  short_branch: [{ x: 0, y: 0 }, { x: 52, y: -12 }, { x: 105, y: 8 }, { x: 158, y: -18 }, { x: 210, y: 0 }, { x: 80, y: 55 }, { x: 138, y: 66 }, { x: 195, y: 52 }, { x: 235, y: 88 }, { x: 268, y: 25 }],
  small_ring: [{ x: 0, y: 0 }, { x: 58, y: 0 }, { x: 44, y: 45 }, { x: 0, y: 62 }, { x: -46, y: 44 }, { x: -62, y: 0 }, { x: -44, y: -46 }, { x: 0, y: -64 }, { x: 46, y: -44 }, { x: 92, y: 0 }],
  partial_ring: [{ x: 0, y: 0 }, { x: -55, y: 20 }, { x: -70, y: -35 }, { x: -35, y: -82 }, { x: 20, y: -92 }, { x: 68, y: -62 }, { x: 82, y: -8 }, { x: 65, y: 48 }, { x: 20, y: 78 }, { x: 108, y: 72 }],
  spiral: [{ x: 0, y: 0 }, { x: 38, y: 5 }, { x: 48, y: 42 }, { x: 12, y: 66 }, { x: -42, y: 48 }, { x: -65, y: -8 }, { x: -35, y: -72 }, { x: 35, y: -92 }, { x: 98, y: -42 }, { x: 125, y: 35 }],
  diamond: [{ x: 0, y: 0 }, { x: 52, y: -45 }, { x: 52, y: 45 }, { x: 105, y: -78 }, { x: 105, y: 78 }, { x: 152, y: -42 }, { x: 152, y: 42 }, { x: 202, y: 0 }, { x: 104, y: 0 }, { x: 250, y: 0 }],
  fork: [{ x: 0, y: 0 }, { x: 55, y: 0 }, { x: 105, y: -52 }, { x: 160, y: -72 }, { x: 105, y: 52 }, { x: 160, y: 72 }, { x: 218, y: -82 }, { x: 218, y: 82 }, { x: 225, y: 0 }, { x: 280, y: 0 }],
  double_path: [{ x: 0, y: 0 }, { x: 58, y: -38 }, { x: 58, y: 38 }, { x: 118, y: -42 }, { x: 118, y: 42 }, { x: 178, y: -36 }, { x: 178, y: 36 }, { x: 232, y: 0 }, { x: 118, y: 0 }, { x: 285, y: 0 }],
  loop: [{ x: 0, y: 0 }, { x: 54, y: -42 }, { x: 112, y: -58 }, { x: 168, y: -32 }, { x: 182, y: 28 }, { x: 130, y: 62 }, { x: 68, y: 58 }, { x: 40, y: 15 }, { x: 112, y: 0 }, { x: 235, y: 0 }],
  satellites: [{ x: 0, y: 0 }, { x: 0, y: -72 }, { x: 62, y: -35 }, { x: 65, y: 38 }, { x: 0, y: 74 }, { x: -62, y: 38 }, { x: -65, y: -35 }, { x: 105, y: -62 }, { x: 118, y: 58 }, { x: 155, y: 0 }],
  converging_paths: [{ x: 0, y: 0 }, { x: 52, y: -58 }, { x: 52, y: 0 }, { x: 52, y: 58 }, { x: 115, y: -68 }, { x: 115, y: 0 }, { x: 115, y: 68 }, { x: 175, y: -34 }, { x: 175, y: 34 }, { x: 230, y: 0 }],
};

const PATTERN_SEQUENCE = Object.keys(CLUSTER_PATTERNS) as RpgClusterPattern[];
const RING_SPECS = [
  { radius: 360, count: 10, phase: -1.48 },
  { radius: 625, count: 14, phase: -1.34 },
  { radius: 895, count: 16, phase: -1.43 },
];

const angleDistance = (a: number, b: number): number => {
  const difference = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(difference, Math.PI * 2 - difference);
};

const THEME_ANGLES: Record<RegionId, number> = {
  discipline: -Math.PI / 2,
  intelligence: -Math.PI / 10,
  social: Math.PI / 3.25,
  finance: Math.PI / 1.55,
  health: Math.PI * 1.12,
};

const nearestTheme = (angle: number): RegionTheme =>
  REGION_THEMES.reduce((nearest, theme) =>
    angleDistance(angle, THEME_ANGLES[theme.id]) <
    angleDistance(angle, THEME_ANGLES[nearest.id])
      ? theme
      : nearest,
  );

const clusterId = (ring: number, index: number): string =>
  `web-cluster-${ring + 1}-${index + 1}`;

const hubId = (ring: number, index: number): string =>
  `${clusterId(ring, index)}-node-1`;

export const RPG_CONSTELLATION_CLUSTERS: RpgConstellationCluster[] =
  RING_SPECS.flatMap((spec, ring) =>
    Array.from({ length: spec.count }, (_, index) => {
      const angle = spec.phase + (index / spec.count) * Math.PI * 2;
      const theme = nearestTheme(angle);
      const nextTheme = nearestTheme(angle + 0.16);
      const previousRing = ring > 0 ? RING_SPECS[ring - 1] : null;
      const parentIndex = previousRing
        ? Math.round((index / spec.count) * previousRing.count) % previousRing.count
        : -1;
      const sameRingPrevious = (index - 1 + spec.count) % spec.count;
      const jitter = Math.sin((ring + 1) * 17 + index * 11) * 26;
      const isDestinyHub = (ring * 17 + index) % 9 === 0;
      return {
        id: clusterId(ring, index),
        region: theme.id,
        hybridRegion: nextTheme.id !== theme.id ? nextTheme.id : undefined,
        pattern: PATTERN_SEQUENCE[(ring * 7 + index * 3) % PATTERN_SEQUENCE.length],
        rotation: (angle * 180) / Math.PI + ((index % 3) - 1) * 13,
        scale: 0.78 + ((ring + index) % 4) * 0.07,
        center: {
          x: 1600 + Math.cos(angle) * (spec.radius + jitter),
          y: 1200 + Math.sin(angle) * (spec.radius + jitter),
        },
        ring,
        hubId: hubId(ring, index),
        parentHubIds:
          ring === 0
            ? [theme.rootId, hubId(ring, sameRingPrevious)]
            : [
                hubId(ring - 1, parentIndex),
                hubId(ring, sameRingPrevious),
                ...(index % 4 === 0
                  ? [hubId(ring - 1, (parentIndex + 1) % previousRing!.count)]
                  : []),
              ],
        isDestinyHub,
      };
    }),
  );

const localConnections = (
  cluster: RpgConstellationCluster,
  index: number,
): string[] => {
  const node = (localIndex: number): string =>
    `${cluster.id}-node-${localIndex + 1}`;
  if (index === 0) return cluster.parentHubIds;
  if (cluster.pattern === 'small_ring' || cluster.pattern === 'loop') {
    if (index === 9) return [node(8), node(1)];
    return index === 1 ? [node(0)] : [node(index - 1)];
  }
  if (cluster.pattern === 'fork') {
    const parents = [0, 0, 1, 1, 2, 4, 3, 5, 6];
    return index === 9 ? [node(6), node(7), node(8)] : [node(parents[index - 1])];
  }
  if (cluster.pattern === 'double_path') {
    const parents = [0, 0, 1, 2, 3, 4, 5, 3, 7];
    return index === 9 ? [node(5), node(6), node(7)] : [node(parents[index - 1])];
  }
  if (cluster.pattern === 'diamond' || cluster.pattern === 'converging_paths') {
    const parents = [0, 0, 1, 2, 3, 4, 5, 3, 7];
    return index === 9 ? [node(6), node(7), node(8)] : [node(parents[index - 1])];
  }
  if (cluster.pattern === 'satellites') {
    return index < 7 ? [node(0)] : [node(index - 6)];
  }
  return [node(index - 1)];
};

const createExpandedStars = (): RpgConstellationStar[] =>
  RPG_CONSTELLATION_CLUSTERS.flatMap((cluster, clusterIndex) => {
    const theme = REGION_THEMES.find((item) => item.id === cluster.region)!;
    const hybridTheme = cluster.hybridRegion
      ? REGION_THEMES.find((item) => item.id === cluster.hybridRegion)
      : undefined;
    const radians = (cluster.rotation * Math.PI) / 180;
    return CLUSTER_PATTERNS[cluster.pattern].map((offset, index) => {
      const x = offset.x * cluster.scale;
      const y = offset.y * cluster.scale;
      const isHub = index === 0;
      const isFinal = index === 9;
      const isNotable = index === 5 || index === 8;
      const constellation = isHub && cluster.isDestinyHub ? 'destiny' : theme.id;
      const percentageEffect =
        theme.effect === 'xp_multiplier' || theme.effect === 'gold_multiplier';
      const effectValue = percentageEffect
        ? isFinal
          ? 0.018
          : isNotable
            ? 0.007
            : 0.002
        : isFinal
          ? 3
          : isNotable
            ? 2
            : 1;
      const effects = { [theme.effect]: effectValue };
      if (isHub && hybridTheme && hybridTheme.effect !== theme.effect) {
        effects[hybridTheme.effect] =
          hybridTheme.effect === 'luck' ? 1 : 0.003;
      }
      return {
        id: `${cluster.id}-node-${index + 1}`,
        name: isHub
          ? cluster.isDestinyHub
            ? `Encruzilhada do Destino ${clusterIndex + 1}`
            : `Hub ${theme.names[clusterIndex % theme.names.length]}`
          : `${theme.names[(clusterIndex + index) % theme.names.length]} ${index}`,
        description: isHub && hybridTheme
          ? `Ponte entre ${theme.id} e ${hybridTheme.id}.`
          : percentageEffect
            ? `+${Math.round(effectValue * 1000) / 10}% de bônus.`
            : `+${effectValue} de sorte.`,
        lore: isFinal
          ? 'Um marco no fim do cluster, forte sem romper o equilíbrio da jornada.'
          : 'Uma estrela de uma rota configurável da grande malha celestial.',
        constellation,
        clusterId: cluster.id,
        nodeType: isHub
          ? cluster.isDestinyHub
            ? 'legendary'
            : 'hub'
          : isFinal
            ? 'notable'
            : isNotable
              ? 'medium'
              : 'small',
        position: {
          x: cluster.center.x + x * Math.cos(radians) - y * Math.sin(radians),
          y: cluster.center.y + x * Math.sin(radians) + y * Math.cos(radians),
        },
        connections: localConnections(cluster, index),
        cost: isFinal || (isHub && cluster.isDestinyHub) ? 2 : 1,
        maxLevel: 1,
        requiredLevel: cluster.ring * 20 + (isFinal ? 18 : 1),
        icon: cluster.isDestinyHub && isHub
          ? 'auto_awesome'
          : theme.icons[(clusterIndex + index) % theme.icons.length],
        rarity: isHub && cluster.isDestinyHub
          ? 'legendary'
          : isFinal
            ? 'epic'
            : isNotable || isHub
              ? 'rare'
              : index % 3 === 0
                ? 'uncommon'
                : 'common',
        effects,
      } satisfies RpgConstellationStar;
    });
  });

const SHIFTED_BASE_STARS: RpgConstellationStar[] = BASE_CONSTELLATION_STARS.map((star) => ({
  ...star,
  nodeType:
    star.rarity === 'legendary'
      ? 'legendary'
      : star.rarity === 'epic'
        ? 'notable'
        : star.rarity === 'rare'
          ? 'medium'
          : 'small',
  position: {
    x: star.position.x + 800,
    y: star.position.y + 700,
  },
}));

const NODE_RADIUS: Record<NonNullable<RpgConstellationStar['nodeType']>, number> = {
  small: 15,
  medium: 20,
  notable: 28,
  hub: 32,
  legendary: 39,
};

const radiusFor = (star: RpgConstellationStar): number =>
  NODE_RADIUS[star.nodeType ?? 'medium'];

/**
 * Relaxamento global determinístico: compara todos os pares em várias passagens.
 * Isso evita que afastar uma estrela de um vizinho acabe aproximando-a demais de
 * outro. O núcleo permanece ancorado e todo o restante abre espaço ao redor dele.
 */
const resolveNodeCollisions = (
  sourceStars: RpgConstellationStar[],
): RpgConstellationStar[] => {
  const stars = sourceStars.map((star) => ({
    ...star,
    position: { ...star.position },
  }));
  const minimumVisualGap = 22;
  const anchoredIds = new Set(['destiny-core']);

  for (let pass = 0; pass < 64; pass++) {
    let largestCorrection = 0;

    for (let firstIndex = 0; firstIndex < stars.length; firstIndex++) {
      const first = stars[firstIndex];

      for (let secondIndex = firstIndex + 1; secondIndex < stars.length; secondIndex++) {
        const second = stars[secondIndex];
        const dx = second.position.x - first.position.x;
        const dy = second.position.y - first.position.y;
        const distance = Math.hypot(dx, dy);
        const minimumDistance =
          radiusFor(first) + radiusFor(second) + minimumVisualGap;

        if (distance >= minimumDistance) {
          continue;
        }

        const fallbackSeed = [...`${first.id}:${second.id}`].reduce(
          (sum, character) => sum + character.charCodeAt(0),
          0,
        );
        const fallbackAngle = fallbackSeed * 0.61803398875;
        const directionX = distance > 0.001 ? dx / distance : Math.cos(fallbackAngle);
        const directionY = distance > 0.001 ? dy / distance : Math.sin(fallbackAngle);
        const correction = minimumDistance - distance;
        const firstAnchored = anchoredIds.has(first.id);
        const secondAnchored = anchoredIds.has(second.id);
        const firstShare = firstAnchored ? 0 : secondAnchored ? 1 : 0.5;
        const secondShare = secondAnchored ? 0 : firstAnchored ? 1 : 0.5;

        first.position.x -= directionX * correction * firstShare;
        first.position.y -= directionY * correction * firstShare;
        second.position.x += directionX * correction * secondShare;
        second.position.y += directionY * correction * secondShare;
        largestCorrection = Math.max(largestCorrection, correction);
      }
    }

    if (largestCorrection < 0.15) {
      break;
    }
  }

  return stars;
};

export const RPG_CONSTELLATION_STARS: RpgConstellationStar[] =
  resolveNodeCollisions([
    ...SHIFTED_BASE_STARS,
    ...createExpandedStars(),
  ]);
