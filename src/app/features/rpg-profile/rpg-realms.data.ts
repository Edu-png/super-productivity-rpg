import { RpgRealmId } from './rpg-profile.model';

export interface RpgRealmDefinition {
  id: RpgRealmId;
  name: string;
  shortName: string;
  theme: string;
  icon: string;
  description: string;
  boss: string;
  npcs: string[];
  bonuses: { xp: number; gold: number; rareDrop: number };
  position: { x: number; y: number };
  color: string;
  requiredXp: number;
}

export const RPG_REALMS: readonly RpgRealmDefinition[] = [
  {
    id: 'village',
    name: 'Vila Inicial',
    shortName: 'Vila',
    theme: 'hub',
    icon: 'home',
    description: 'O coração da jornada e ponto de partida de todas as estradas.',
    boss: 'Nenhum',
    npcs: ['Guia', 'Mercador', 'Ferreiro'],
    bonuses: { xp: 0, gold: 0, rareDrop: 0 },
    position: { x: 50, y: 50 },
    color: '#e5b64c',
    requiredXp: 0,
  },
  {
    id: 'castle',
    name: 'Castelo do Rato',
    shortName: 'Castelo',
    theme: 'discipline',
    icon: 'castle',
    description: 'Reino das rotinas, hábitos e da disciplina diária.',
    boss: 'Rei da Procrastinação',
    npcs: ['Rei', 'Cavaleiro', 'Ferreiro'],
    bonuses: { xp: 0.1, gold: 0.03, rareDrop: 0 },
    position: { x: 50, y: 17 },
    color: '#d64b58',
    requiredXp: 10_000,
  },
  {
    id: 'library',
    name: 'Biblioteca de Alexandria',
    shortName: 'Biblioteca',
    theme: 'knowledge',
    icon: 'local_library',
    description: 'Leitura, idiomas e conhecimento preservado por magos.',
    boss: 'Guardião do Conhecimento',
    npcs: ['Bibliotecário', 'Arquivista', 'Mago'],
    bonuses: { xp: 0.12, gold: 0, rareDrop: 0.01 },
    position: { x: 20, y: 22 },
    color: '#4a9ee8',
    requiredXp: 20_000,
  },
  {
    id: 'digital-city',
    name: 'Cidade Digital dos Algoritmos',
    shortName: 'Cidade Digital',
    theme: 'technology',
    icon: 'memory',
    description: 'Programação, inteligência artificial e ciência de dados.',
    boss: 'Colosso do Legado',
    npcs: ['Cientista', 'Robô', 'Engenheiro'],
    bonuses: { xp: 0.12, gold: 0.04, rareDrop: 0 },
    position: { x: 81, y: 23 },
    color: '#39d4cd',
    requiredXp: 30_000,
  },
  {
    id: 'laboratory',
    name: 'Laboratório das Engrenagens',
    shortName: 'Laboratório',
    theme: 'projects',
    icon: 'precision_manufacturing',
    description: 'Projetos técnicos avançam entre máquinas e protótipos.',
    boss: 'Autômato Infinito',
    npcs: ['Artífice', 'Mecânico', 'Inventora'],
    bonuses: { xp: 0.08, gold: 0.06, rareDrop: 0.01 },
    position: { x: 20, y: 68 },
    color: '#da9846',
    requiredXp: 40_000,
  },
  {
    id: 'dragon-cave',
    name: 'Caverna do Dragão',
    shortName: 'Caverna',
    theme: 'health',
    icon: 'fitness_center',
    description: 'Academia, saúde e desafios físicos forjados em fogo.',
    boss: 'Dragão da Inércia',
    npcs: ['Treinadora', 'Alquimista', 'Caçador'],
    bonuses: { xp: 0.1, gold: 0.03, rareDrop: 0.01 },
    position: { x: 80, y: 69 },
    color: '#e15f36',
    requiredXp: 50_000,
  },
  {
    id: 'serene-temple',
    name: 'Templo da Alma Serena',
    shortName: 'Templo',
    theme: 'serenity',
    icon: 'self_improvement',
    description: 'Meditação, yoga e reflexão sob pétalas e incenso.',
    boss: 'Eco da Ansiedade',
    npcs: ['Monge', 'Sábia', 'Jardineira'],
    bonuses: { xp: 0.08, gold: 0.02, rareDrop: 0.01 },
    position: { x: 50, y: 84 },
    color: '#b983ed',
    requiredXp: 60_000,
  },
];
