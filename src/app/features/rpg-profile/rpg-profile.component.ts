import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { selectAllProjectsExceptInbox } from '../project/store/project.selectors';
import { RpgProfileService } from './rpg-profile.service';
import {
  RpgAppearance,
  RpgAttributeDefinition,
  RpgClassId,
  RpgItemSlot,
  RpgContract,
  RpgMedalTier,
  RpgPenalty,
  RpgPetType,
  RpgReward,
  RpgRealmId,
  RpgSpeciesId,
  RpgSubclassId,
  RPG_SUBCLASS_BONUSES,
  RPG_SUBCLASS_UNLOCK_LEVELS,
  formatSubclassBonus,
} from './rpg-profile.model';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatIconButton } from '@angular/material/button';
import { CharacterRendererComponent } from './character-renderer.component';
import { RpgConstellationMapComponent } from './rpg-constellation-map.component';
import { InventoryPanelComponent } from './inventory-panel.component';
import { TaskHabitService } from '../habit-tracker/task-habit.service';
import { RpgRealmMapComponent } from './rpg-realm-map.component';
import { RPG_REALMS } from './rpg-realms.data';
import { RpgMusicService } from './rpg-music.service';
import { RpgCharacterBackupService } from './rpg-character-backup.service';
import { MEDAL_TIER_THRESHOLD, penaltyWeekCount } from './rpg-contracts.util';
import { TagService } from '../tag/tag.service';
import { getDbDateStr } from '../../util/get-db-date-str';
import { readFileAsShrunkDataUrl } from '../../util/shrink-image-data-url';

@Component({
  selector: 'rpg-profile',
  templateUrl: './rpg-profile.component.html',
  styleUrls: ['./rpg-profile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    FormsModule,
    MatIcon,
    MatButton,
    MatIconButton,
    CharacterRendererComponent,
    RpgConstellationMapComponent,
    InventoryPanelComponent,
    RpgRealmMapComponent,
  ],
})
export class RpgProfileComponent implements OnInit {
  readonly profile = inject(RpgProfileService);
  readonly music = inject(RpgMusicService);
  private readonly _destroyRef = inject(DestroyRef);
  readonly habitTracker = inject(TaskHabitService);
  private readonly _characterBackup = inject(RpgCharacterBackupService);
  characterBackupMessage = '';
  characterBackupBusy = false;
  private readonly _store = inject(Store);
  private readonly _tagService = inject(TagService);
  readonly projects = this._store.selectSignal(selectAllProjectsExceptInbox);
  readonly realms = RPG_REALMS;

  displayName = this.profile.state().displayName;
  avatarDataUrl = this.profile.state().avatarDataUrl;
  rewardTitle = '';
  rewardCost = 10;
  shopMessage = '';
  classChangeMessage = '';
  newCharacterName = '';
  newCharacterSpecies: RpgSpeciesId = 'human';
  newCharacterClass: RpgClassId = 'adventurer';
  newCharacterSubclass: RpgSubclassId = 'none';
  showCharacterCreator = false;
  showPetCreator = false;
  showAllDisciplineHistory = false;
  newCharacterAppearance: RpgAppearance = {
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
  penaltyTitle = '';
  penaltyXp = 10;
  penaltyCoins = 1;
  penaltyMoney = 0;
  penaltyExercise = '';
  // Real-money punishment box (R$) - a separate ledger that never touches XP/coins.
  penaltyMoneyOwed = computed(() => this.profile.state().penaltyMoneyOwed ?? 0);
  penaltyMoneyTransferred = computed(
    () => this.profile.state().penaltyMoneyTransferred ?? 0,
  );
  penaltyMoneyPending = computed(() =>
    Math.max(0, this.penaltyMoneyOwed() - this.penaltyMoneyTransferred()),
  );
  editingPenaltyId = signal<string | null>(null);
  penaltyDraft = { title: '', xpLoss: 0, coinsLoss: 0, moneyLoss: 0, exercise: '' };
  editingRewardId = signal<string | null>(null);
  rewardDraft = { title: '', cost: 1 };
  private readonly _brl = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  // The dungeon only lists penalties the player defined themselves - the ones
  // markTaskAsFailed auto-creates for a task marked "not done" already fired
  // (timesApplied: 1, no further action needed), so they'd otherwise show up
  // asking to be "Aplicar"'d again for no reason. The title check catches
  // entries created before sourceTaskId existed on the model.
  // Sorted most expensive first (real money, then XP, then coins), so edits reorder automatically.
  manualPenalties = computed(() =>
    this.profile
      .state()
      .penalties.filter(
        (p) =>
          !p.sourceTaskId &&
          !p.sourceContractId &&
          !p.title.startsWith('Não concluída: '),
      )
      .sort(
        (a, b) =>
          (b.moneyLoss ?? 0) - (a.moneyLoss ?? 0) ||
          b.xpLoss - a.xpLoss ||
          b.coinsLoss - a.coinsLoss ||
          a.title.localeCompare(b.title),
      ),
  );
  petName = this.profile.state().pet.name;
  petType: RpgPetType = this.profile.state().pet.type;
  readonly petTypes: {
    id: RpgPetType;
    name: string;
    icon: string;
    description: string;
  }[] = [
    { id: 'tiger', name: 'Tigre Astral', icon: 'pets', description: 'Coragem e foco' },
    {
      id: 'dragon',
      name: 'Dragão Rúnico',
      icon: 'local_fire_department',
      description: 'Poder e disciplina',
    },
    {
      id: 'phoenix',
      name: 'Fênix Solar',
      icon: 'local_fire_department',
      description: 'Renovação e constância',
    },
    {
      id: 'wolf',
      name: 'Lobo Lunar',
      icon: 'dark_mode',
      description: 'Lealdade e resistência',
    },
    {
      id: 'griffin',
      name: 'Grifo Celestial',
      icon: 'flutter_dash',
      description: 'Sabedoria e ambição',
    },
  ];
  campaignTitle = '';
  campaignBoss = '';
  chapterTitle = '';
  chapterProjectId = '';
  chapterTarget = 10;
  selectedCampaignId = '';
  annualGoalTitle = '';
  annualGoalTarget = 100;
  annualGoalIconIndex = 1;
  // Signals (not plain fields) so this app's zoneless change detection
  // reliably re-renders the checkbox picker after every toggle - a plain
  // mutable Set field was the confirmed cause of clicks not visibly marking
  // a habit as selected.
  annualGoalHabitIds = signal(new Set<string>());
  editingAnnualGoalId: string | null = null;
  annualEditorPosition = signal<{ top: number; left: number } | null>(null);
  annualGoalEditTarget = 100;
  annualGoalEditCredit = 0;
  annualGoalEditHabitIds = signal(new Set<string>());
  editingMonthlyMedalId: string | null = null;
  monthlyEditorPosition = signal<{ top: number; left: number } | null>(null);
  monthlyMedalTarget = 80;
  monthlyMedalEditCredit = 0;
  monthlyMedalTitle = '';
  monthlyMedalDescription = '';
  monthlyMedalMode: 'habit' | 'value' = 'habit';
  monthlyMedalValueTarget = 0;
  monthlyMedalValueCurrent = 0;
  monthlyMedalValueUnit = '';
  monthlyMedalHabitIds = signal(new Set<string>());

  // Attributes a project can be mapped to (discipline is computed, not mapped).
  readonly attributes = computed(() =>
    this.profile
      .attributeDefinitions()
      .filter((attribute) => attribute.id !== 'discipline'),
  );
  readonly ATTRIBUTE_ICONS = [
    'favorite',
    'psychology',
    'savings',
    'groups',
    'military_tech',
    'fitness_center',
    'work',
    'code',
    'school',
    'auto_stories',
    'self_improvement',
    'spa',
    'bedtime',
    'restaurant',
    'palette',
    'music_note',
    'sports_esports',
    'home',
    'public',
    'bolt',
    'star',
  ];
  editingAttributeId = signal<string | null>(null);
  readonly editingAttribute = computed(() =>
    this.profile
      .attributeDefinitions()
      .find((attribute) => attribute.id === this.editingAttributeId()),
  );
  attributeDraft = { label: '', icon: 'star' };
  newAttributeLabel = '';
  readonly classes: {
    id: RpgClassId;
    name: string;
    icon: string;
    bonus: string;
  }[] = [
    {
      id: 'adventurer',
      name: 'Aventureiro',
      icon: 'explore',
      bonus: 'Sem bônus; caminho equilibrado.',
    },
    { id: 'mage', name: 'Mago', icon: 'menu_book', bonus: '+10% de XP de tarefas.' },
    {
      id: 'guardian',
      name: 'Guardião',
      icon: 'shield',
      bonus: '+15% nos pontos de Saúde.',
    },
    {
      id: 'merchant',
      name: 'Mercador',
      icon: 'paid',
      bonus: '+20% de moedas geradas por tarefas.',
    },
    {
      id: 'ranger',
      name: 'Patrulheiro',
      icon: 'forest',
      bonus: '+10% de XP das missões diárias.',
    },
    {
      id: 'warrior',
      name: 'Guerreiro',
      icon: 'swords',
      bonus: '+5% de XP de tarefas.',
    },
    {
      id: 'cleric',
      name: 'Clérigo',
      icon: 'local_hospital',
      bonus: 'Reduz penalidades de XP em 20%.',
    },
    {
      id: 'rogue',
      name: 'Ladino',
      icon: 'visibility_off',
      bonus: '+5% de chance de encontrar itens.',
    },
    {
      id: 'bard',
      name: 'Bardo',
      icon: 'music_note',
      bonus: '+1% de moedas por dia de streak, até 15%.',
    },
    {
      id: 'necromancer',
      name: 'Necromante',
      icon: 'skull',
      bonus: '+25% de XP ao derrotar chefes semanais.',
    },
    {
      id: 'archer',
      name: 'Arqueiro',
      icon: 'my_location',
      bonus: '+10% de XP das missões diárias.',
    },
    {
      id: 'barbarian',
      name: 'Bárbaro',
      icon: 'hardware',
      bonus: '+5% de XP e equipamento inicial pesado.',
    },
  ];
  readonly subclasses = (
    [
      {
        id: 'chronomancer',
        classId: 'mage',
        name: 'Cronomante',
      },
      {
        id: 'scholar',
        classId: 'mage',
        name: 'Erudito',
      },
      {
        id: 'paladin',
        classId: 'guardian',
        name: 'Paladino',
      },
      {
        id: 'alchemist',
        classId: 'merchant',
        name: 'Alquimista',
      },
      {
        id: 'pathfinder',
        classId: 'ranger',
        name: 'Desbravador',
      },
      {
        id: 'vanguard',
        classId: 'adventurer',
        name: 'Vanguarda',
      },
      {
        id: 'trailblazer',
        classId: 'adventurer',
        name: 'Pioneiro',
      },
      {
        id: 'battlemage',
        classId: 'mage',
        name: 'Mago de Batalha',
      },
      {
        id: 'archmage',
        classId: 'mage',
        name: 'Arquimago',
      },
      {
        id: 'sentinel',
        classId: 'guardian',
        name: 'Sentinela',
      },
      {
        id: 'templar',
        classId: 'guardian',
        name: 'Templário',
      },
      {
        id: 'artificer',
        classId: 'merchant',
        name: 'Artífice',
      },
      {
        id: 'tycoon',
        classId: 'merchant',
        name: 'Magnata',
      },
      {
        id: 'beastmaster',
        classId: 'ranger',
        name: 'Mestre das Feras',
      },
      {
        id: 'warden',
        classId: 'ranger',
        name: 'Guardião da Mata',
      },
      {
        id: 'berserker',
        classId: 'warrior',
        name: 'Berserker',
      },
      {
        id: 'warlord',
        classId: 'warrior',
        name: 'Senhor da Guerra',
      },
      {
        id: 'oracle',
        classId: 'cleric',
        name: 'Oráculo',
      },
      {
        id: 'saint',
        classId: 'cleric',
        name: 'Santo',
      },
      {
        id: 'assassin',
        classId: 'rogue',
        name: 'Assassino',
      },
      {
        id: 'shadowmaster',
        classId: 'rogue',
        name: 'Mestre das Sombras',
      },
      {
        id: 'minstrel',
        classId: 'bard',
        name: 'Menestrel',
      },
      {
        id: 'virtuoso',
        classId: 'bard',
        name: 'Virtuoso',
      },
      {
        id: 'reaper',
        classId: 'necromancer',
        name: 'Ceifador',
      },
      {
        id: 'lich',
        classId: 'necromancer',
        name: 'Lich',
      },
      {
        id: 'sniper',
        classId: 'archer',
        name: 'Atirador de Elite',
      },
      {
        id: 'falconer',
        classId: 'archer',
        name: 'Falcoeiro',
      },
      {
        id: 'juggernaut',
        classId: 'barbarian',
        name: 'Colosso',
      },
      {
        id: 'chieftain',
        classId: 'barbarian',
        name: 'Chefe Tribal',
      },
    ] as { id: RpgSubclassId; classId: RpgClassId; name: string }[]
  ).map((subclass) => ({
    ...subclass,
    bonus: formatSubclassBonus(RPG_SUBCLASS_BONUSES[subclass.id]),
  }));
  // Listed in unlock order (lowest level first) so the dropdown reads as a progression.
  readonly availableSubclasses = computed(() =>
    this._byUnlockLevel(
      this.subclasses.filter(
        (subclass) => subclass.classId === this.profile.state().classId,
      ),
    ),
  );
  readonly creatorSubclasses = computed(() =>
    this._byUnlockLevel(
      this.subclasses.filter((subclass) => subclass.classId === this.newCharacterClass),
    ),
  );
  // Most expensive first; new rewards fall into place automatically.
  readonly sortedRewards = computed(() =>
    [...this.profile.state().rewards].sort(
      (a, b) => b.cost - a.cost || a.title.localeCompare(b.title),
    ),
  );
  readonly selectedClass = computed(() =>
    this.classes.find((item) => item.id === this.profile.state().classId),
  );
  readonly selectedSubclass = computed(() =>
    this.subclasses.find((item) => item.id === this.profile.state().subclassId),
  );
  // Radar with one spoke per attribute (core + discipline + custom), so
  // attributes the player creates show up on it too.
  readonly radar = computed(() => {
    const attributes = this.profile.attributeDefinitions();
    const count = attributes.length;
    const at = (index: number, radius: number): { x: number; y: number } => {
      const fullTurn = (index / count) * Math.PI * 2;
      const quarterTurn = Math.PI / 2;
      const angle = fullTurn - quarterTurn;
      const dx = Math.cos(angle) * radius;
      const dy = Math.sin(angle) * radius;
      return { x: 100 + dx, y: 100 + dy };
    };
    const polygon = (radiusFor: (index: number) => number): string =>
      attributes
        .map((_, index) => {
          const point = at(index, radiusFor(index));
          return `${point.x},${point.y}`;
        })
        .join(' ');
    const values = attributes.map((_, index) =>
      at(index, (78 * attributes[index].rating) / 10),
    );
    return {
      grids: [78, 52, 26].map((radius) => polygon(() => radius)),
      axes: attributes.map((_, index) => at(index, 78)),
      value: values.map((point) => `${point.x},${point.y}`).join(' '),
      points: values,
      labels: attributes.map((attribute, index) => {
        const point = at(index, 90);
        const anchor = point.x < 96 ? 'end' : point.x > 104 ? 'start' : 'middle';
        return { ...point, anchor, text: attribute.label, id: attribute.id };
      }),
    };
  });
  readonly equipmentSlots: { id: RpgItemSlot; label: string }[] = [
    { id: 'head', label: 'Cabeça' },
    { id: 'chest', label: 'Armadura' },
    { id: 'mainHand', label: 'Arma' },
    { id: 'ringLeft', label: 'Anel' },
    { id: 'neck', label: 'Amuleto' },
    { id: 'pet', label: 'Companheiro' },
  ];
  readonly species: { id: RpgSpeciesId; name: string; trait: string }[] = [
    { id: 'human', name: 'Humano', trait: 'Versátil e determinado' },
    { id: 'elf', name: 'Elfo', trait: 'Afinidade com conhecimento' },
    { id: 'dwarf', name: 'Anão', trait: 'Resistente e constante' },
    { id: 'orc', name: 'Orc', trait: 'Força e disciplina' },
    { id: 'fae', name: 'Feérico', trait: 'Criatividade e sorte' },
    { id: 'tiefling', name: 'Tiefling', trait: 'Chifres, cauda e olhos arcanos' },
    { id: 'draconian', name: 'Draconato', trait: 'Escamas, chifres e força ancestral' },
  ];
  readonly skinPalette = [
    '#f2c7a5',
    '#dca77d',
    '#c68b62',
    '#a96f4b',
    '#805039',
    '#5b362b',
  ];
  readonly hairPalette = [
    '#211713',
    '#4a2c1c',
    '#74421f',
    '#c17b26',
    '#b83d2f',
    '#5c397f',
    '#c8c5bd',
  ];
  readonly eyePalette = [
    '#3d2b20',
    '#6f5a22',
    '#3a874e',
    '#3d78b9',
    '#7650b4',
    '#bfc7ce',
  ];
  readonly clothingPalette = [
    '#315a9c',
    '#246247',
    '#8a2e32',
    '#602c78',
    '#303640',
    '#e4dfca',
  ];
  readonly armorPalette = ['#3b414a', '#69717b', '#929ba3', '#8b6a32', '#d6b84f'];
  readonly detailPalette = ['#d8a62f', '#b8bdc4', '#b84028', '#4f9b62', '#6d49b5'];
  readonly hairChoices: {
    id: RpgAppearance['hairStyle'];
    label: string;
  }[] = [
    { id: 'short', label: 'Curto' },
    { id: 'long', label: 'Longo' },
    { id: 'curly', label: 'Cacheado' },
  ];
  readonly beardChoices: {
    id: RpgAppearance['beard'];
    label: string;
  }[] = [
    { id: 'none', label: 'Sem barba' },
    { id: 'short', label: 'Curta' },
    { id: 'full', label: 'Cheia' },
    { id: 'braided', label: 'Trançada' },
  ];
  readonly skills: {
    id: string;
    title: string;
    description: string;
    icon: string;
    branch: string;
    max: number;
    parent?: string;
    parentRank?: number;
  }[] = [
    {
      id: 'focus-mastery',
      title: 'Maestria do foco',
      description: '+2% de XP por nível',
      icon: 'bolt',
      branch: 'focus',
      max: 5,
    },
    {
      id: 'deep-work',
      title: 'Trabalho profundo',
      description: '+1,5% de XP por nível',
      icon: 'psychology',
      branch: 'focus',
      parent: 'focus-mastery',
      parentRank: 2,
      max: 5,
    },
    {
      id: 'wisdom-core',
      title: 'Núcleo da sabedoria',
      description: '+1% de XP por nível',
      icon: 'auto_stories',
      branch: 'focus',
      parent: 'deep-work',
      parentRank: 3,
      max: 3,
    },
    {
      id: 'treasure-hunter',
      title: 'Caçador de tesouros',
      description: '+2% de chance de drop por nível',
      icon: 'travel_explore',
      branch: 'fortune',
      max: 5,
    },
    {
      id: 'rare-instinct',
      title: 'Instinto raro',
      description: 'Abre o caminho para tesouros superiores',
      icon: 'diamond',
      branch: 'fortune',
      parent: 'treasure-hunter',
      parentRank: 2,
      max: 3,
    },
    {
      id: 'fortune-heart',
      title: 'Coração da fortuna',
      description: 'Nó mestre da trilha de recompensas',
      icon: 'workspace_premium',
      branch: 'fortune',
      parent: 'rare-instinct',
      parentRank: 2,
      max: 1,
    },
    {
      id: 'resilience',
      title: 'Resiliência',
      description: '-5% de perda de XP por nível',
      icon: 'shield',
      branch: 'defense',
      max: 5,
    },
    {
      id: 'iron-will',
      title: 'Vontade de ferro',
      description: 'Fortalece a trilha contra penalidades',
      icon: 'security',
      branch: 'defense',
      parent: 'resilience',
      parentRank: 2,
      max: 3,
    },
    {
      id: 'second-chance',
      title: 'Segunda chance',
      description: 'Nó mestre da trilha de resistência',
      icon: 'restart_alt',
      branch: 'defense',
      parent: 'iron-will',
      parentRank: 2,
      max: 1,
    },
  ];

  ngOnInit(): void {
    void this.profile.refresh();
    this.music.start();
    this._destroyRef.onDestroy(() => this.music.stop());
  }

  onMusicVolumeChange(value: string): void {
    this.music.setVolume(Number(value));
  }

  saveIdentity(): void {
    this.profile.updateIdentity(this.displayName, this.avatarDataUrl);
  }

  createCharacter(): void {
    this.profile.createCharacter(
      this.newCharacterName,
      this.newCharacterSpecies,
      this.newCharacterClass,
      this.newCharacterAppearance,
      this.newCharacterSubclass,
    );
    this.newCharacterName = '';
    this.newCharacterSpecies = 'human';
    this.newCharacterClass = 'adventurer';
    this.newCharacterSubclass = 'none';
    this.showCharacterCreator = false;
    this._syncIdentityFields();
  }

  switchCharacter(characterId: string): void {
    this.profile.switchCharacter(characterId);
    this._syncIdentityFields();
  }

  deleteActiveCharacter(): void {
    if (
      window.confirm(
        `Excluir ${this.profile.state().displayName}? O XP e as recompensas desse personagem serão apagados.`,
      )
    ) {
      this.profile.deleteCharacter(this.profile.activeCharacterId());
      this._syncIdentityFields();
    }
  }

  addPenalty(): void {
    this.profile.addPenalty(
      this.penaltyTitle,
      this.penaltyXp,
      this.penaltyCoins,
      this.penaltyMoney,
      this.penaltyExercise,
    );
    this.penaltyTitle = '';
    this.penaltyMoney = 0;
    this.penaltyExercise = '';
  }

  markPenaltyMoneyTransferred(): void {
    const pending = this.formatMoney(this.penaltyMoneyPending());
    if (confirm(`Confirmar que você separou ${pending} na caixinha de punições?`)) {
      this.profile.markPenaltyMoneyTransferred();
    }
  }

  formatMoney(value: number): string {
    return this._brl.format(value);
  }

  /** The nth application of a penalty within the same week costs n times its base values. */
  penaltyNextMultiplier(penalty: RpgPenalty): number {
    return penaltyWeekCount(penalty, Date.now()) + 1;
  }

  // ---- medal rarity ----
  readonly MEDAL_TIER_LABEL: Record<RpgMedalTier, string> = {
    bronze: 'BRONZE',
    silver: 'PRATA',
    gold: 'OURO',
  };

  /** e.g. "Prata com 24 dias" - null once gold is reached or the month is over. */
  medalNextTierHint(medal: {
    tier: RpgMedalTier | null;
    targetDays: number;
    metricType: string;
    unit: string;
    hasEnded: boolean;
  }): string | null {
    if (medal.hasEnded || medal.tier === 'gold') return null;
    const next: RpgMedalTier = medal.tier === 'silver' ? 'gold' : 'silver';
    const needed = Math.ceil(medal.targetDays * MEDAL_TIER_THRESHOLD[next]);
    const amount =
      medal.metricType === 'days'
        ? `${needed} dias`
        : this.formatMedalValue(needed, medal.unit);
    return `${next === 'gold' ? 'Ouro' : 'Prata'} com ${amount}`;
  }

  // ---- contracts ----
  contractTitle = '';
  contractMetric: RpgContract['metric'] = 'hours';
  contractTarget = 10;
  contractScope = 'all';
  contractDeadline = RpgProfileComponent._nextSunday();
  contractMoney = 0;
  contractXp = 100;
  contractCoins = 50;
  readonly today = getDbDateStr(new Date());
  readonly contractTags = this._tagService.tagsNoMyDayAndNoListSorted;
  // Active contracts first (closest deadline on top), then settled ones, newest first.
  readonly contracts = computed(() =>
    [...(this.profile.state().contracts ?? [])]
      .sort((a, b) => {
        if (a.status === 'active' && b.status === 'active') {
          return a.deadlineDay.localeCompare(b.deadlineDay);
        }
        if (a.status === 'active') return -1;
        if (b.status === 'active') return 1;
        return (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0);
      })
      .map((contract) => {
        const progress = this.profile.contractProgress(contract);
        return {
          contract,
          progress,
          percentage: Math.min(100, Math.round((progress / contract.target) * 100)),
        };
      }),
  );

  addContract(): void {
    const [scopeKind, scopeId] = this.contractScope.split(':') as [
      RpgContract['scopeKind'],
      string | undefined,
    ];
    this.profile.addContract({
      title: this.contractTitle,
      metric: this.contractMetric,
      target: Number(this.contractTarget),
      scopeKind: this.contractMetric === 'hours' ? scopeKind : 'all',
      scopeId: this.contractMetric === 'hours' ? scopeId : undefined,
      deadlineDay: this.contractDeadline,
      stakeMoney: Number(this.contractMoney),
      stakeXp: Number(this.contractXp),
      stakeCoins: Number(this.contractCoins),
    });
    this.contractTitle = '';
  }

  removeContract(contract: RpgContract): void {
    const message =
      contract.status === 'active'
        ? 'Cancelar este contrato? Nada será cobrado nem ganho.'
        : 'Remover este contrato do histórico?';
    if (confirm(message)) {
      this.profile.removeContract(contract.id);
    }
  }

  contractScopeLabel(contract: RpgContract): string {
    if (contract.metric === 'manual') return 'Contagem manual';
    if (contract.scopeKind === 'project') {
      const project = this.projects().find((item) => item.id === contract.scopeId);
      return `Projeto: ${project?.title ?? '?'}`;
    }
    if (contract.scopeKind === 'tag') {
      const tag = this.contractTags().find((item) => item.id === contract.scopeId);
      return `Tag: ${tag?.title ?? '?'}`;
    }
    return 'Todas as tarefas';
  }

  contractDaysLeft(contract: RpgContract): number {
    const [y, m, d] = contract.deadlineDay.split('-').map(Number);
    const deadline = new Date(y, m - 1, d).getTime();
    const [ty, tm, td] = this.today.split('-').map(Number);
    return Math.round((deadline - new Date(ty, tm - 1, td).getTime()) / 86400000);
  }

  formatDay(day: string): string {
    const [, m, d] = day.split('-');
    return `${d}/${m}`;
  }

  private static _nextSunday(): string {
    const date = new Date();
    date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
    return getDbDateStr(date);
  }

  startEditPenalty(penalty: RpgPenalty): void {
    this.penaltyDraft = {
      title: penalty.title,
      xpLoss: penalty.xpLoss,
      coinsLoss: penalty.coinsLoss,
      moneyLoss: penalty.moneyLoss ?? 0,
      exercise: penalty.exercise ?? '',
    };
    this.editingPenaltyId.set(penalty.id);
  }

  savePenaltyEdit(): void {
    const id = this.editingPenaltyId();
    if (!id || !this.penaltyDraft.title.trim()) {
      return;
    }
    this.profile.updatePenalty(id, this.penaltyDraft);
    this.editingPenaltyId.set(null);
  }

  startEditReward(reward: RpgReward): void {
    this.rewardDraft = { title: reward.title, cost: reward.cost };
    this.editingRewardId.set(reward.id);
  }

  saveRewardEdit(): void {
    const id = this.editingRewardId();
    if (!id || !this.rewardDraft.title.trim() || this.rewardDraft.cost < 1) {
      return;
    }
    this.profile.updateReward(id, this.rewardDraft);
    this.editingRewardId.set(null);
  }

  private static readonly PENALTY_ICON_RULES: Array<{
    match: RegExp;
    icon: string;
    color: string;
  }> = [
    { match: /dieta|comida|fast.?food/i, icon: 'no_food', color: '#7a2d2d' },
    { match: /dormi|sono|dormir/i, icon: 'bedtime', color: '#243a5e' },
    {
      match: /dinheiro|gastou|financ/i,
      icon: 'account_balance_wallet',
      color: '#6b5420',
    },
    { match: /academia|exerc[ií]cio|treino/i, icon: 'fitness_center', color: '#4a4030' },
    { match: /ler|leitura/i, icon: 'menu_book', color: '#4a3620' },
    { match: /estudar|estudo/i, icon: 'school', color: '#38304f' },
    { match: /h[aá]bito/i, icon: 'block', color: '#5c1c24' },
  ];
  private static readonly REWARD_ICON_RULES: Array<{
    match: RegExp;
    icon: string;
    color: string;
  }> = [
    { match: /filme|s[eé]rie|epis[oó]dio/i, icon: 'movie', color: '#5c1c24' },
    { match: /presente|vale/i, icon: 'card_giftcard', color: '#1d5a4a' },
    { match: /jogo|ps5|pc\b|game/i, icon: 'sports_esports', color: '#243a5e' },
  ];

  penaltyIcon(title: string): { icon: string; color: string } {
    return (
      RpgProfileComponent.PENALTY_ICON_RULES.find((rule) => rule.match.test(title)) ?? {
        icon: 'block',
        color: '#4a4460',
      }
    );
  }

  rewardIcon(title: string): { icon: string; color: string } {
    return (
      RpgProfileComponent.REWARD_ICON_RULES.find((rule) => rule.match.test(title)) ?? {
        icon: 'redeem',
        color: '#4a4460',
      }
    );
  }

  onRewardImageSelected(rewardId: string, event: Event): void {
    this._readCardImage(event, (imageUrl) =>
      this.profile.setRewardImage(rewardId, imageUrl),
    );
  }

  onPenaltyImageSelected(penaltyId: string, event: Event): void {
    this._readCardImage(event, (imageUrl) =>
      this.profile.setPenaltyImage(penaltyId, imageUrl),
    );
  }

  private _readCardImage(event: Event, save: (imageUrl: string) => void): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file?.type.startsWith('image/')) return;
    if (file.size > 2_500_000) {
      this.shopMessage = 'A imagem precisa ter no máximo 2,5 MB.';
      input.value = '';
      return;
    }
    void readFileAsShrunkDataUrl(file).then(save);
  }

  savePet(): void {
    if (this.profile.petIsBound()) {
      this.showPetCreator = false;
      return;
    }
    this.profile.updatePet(this.petName, this.petType);
    this.showPetCreator = false;
  }

  openPetCreator(): void {
    if (this.profile.petIsBound()) return;
    this.petName = this.profile.state().pet.name;
    this.petType = this.profile.state().pet.type;
    this.showPetCreator = true;
  }

  petAsset(type: RpgPetType, stage: string): string {
    return `assets/rpg/pets/evolutions/${type}-${stage}.png`;
  }

  onPetImageSelected(event: Event): void {
    this._readCardImage(event, (imageUrl) => this.profile.setPetImage(imageUrl));
  }

  createCampaign(): void {
    this.profile.addCampaign(this.campaignTitle, this.campaignBoss);
    this.campaignTitle = '';
    this.campaignBoss = '';
  }

  addChapter(): void {
    if (!this.selectedCampaignId) {
      return;
    }
    this.profile.addCampaignChapter(
      this.selectedCampaignId,
      this.chapterTitle,
      this.chapterProjectId || null,
      this.chapterTarget,
    );
    this.chapterTitle = '';
  }

  toggleAnnualGoalHabit(habitId: string): void {
    const next = new Set(this.annualGoalHabitIds());
    if (next.has(habitId)) {
      next.delete(habitId);
    } else {
      next.add(habitId);
    }
    this.annualGoalHabitIds.set(next);
  }

  createAnnualGoal(): void {
    this.profile.addAnnualGoal(
      this.annualGoalTitle,
      [...this.annualGoalHabitIds()],
      this.annualGoalTarget,
      this.annualGoalIconIndex,
    );
    this.annualGoalTitle = '';
    this.annualGoalTarget = 100;
    this.annualGoalHabitIds.set(new Set<string>());
    this.annualGoalIconIndex =
      this.annualGoalIconIndex >= 12 ? 1 : this.annualGoalIconIndex + 1;
  }

  editAnnualGoal(
    goal: {
      id: string;
      habitIds: string[];
      targetDays: number;
      startingCredit?: number;
    },
    event: MouseEvent,
  ): void {
    if (this.editingAnnualGoalId === goal.id) {
      this.editingAnnualGoalId = null;
      return;
    }
    this.editingAnnualGoalId = goal.id;
    this.annualGoalEditTarget = goal.targetDays;
    this.annualGoalEditCredit = goal.startingCredit ?? 50;
    this.annualGoalEditHabitIds.set(new Set(goal.habitIds));
    this.annualEditorPosition.set(this._computeEditorPosition(event));
  }

  toggleAnnualGoalEditHabit(habitId: string): void {
    const next = new Set(this.annualGoalEditHabitIds());
    next.has(habitId) ? next.delete(habitId) : next.add(habitId);
    this.annualGoalEditHabitIds.set(next);
  }

  saveAnnualGoalEdit(): void {
    if (!this.editingAnnualGoalId || !this.annualGoalEditHabitIds().size) return;
    this.profile.updateAnnualGoal(
      this.editingAnnualGoalId,
      [...this.annualGoalEditHabitIds()],
      this.annualGoalEditTarget,
      this.annualGoalEditCredit,
    );
    this.editingAnnualGoalId = null;
  }

  unlockedMonthlyMedals(): number {
    return this.profile.monthlyMedals().filter((medal) => medal.isUnlocked).length;
  }

  editMonthlyMedal(
    medal: {
      id: string;
      title: string;
      description: string;
      mode: 'habit' | 'value';
      unit: string;
      completedDays: number;
      habitIds: string[];
      targetDays: number;
      manualCredit?: number;
    },
    event: MouseEvent,
  ): void {
    if (this.editingMonthlyMedalId === medal.id) {
      this.editingMonthlyMedalId = null;
      return;
    }
    this.editingMonthlyMedalId = medal.id;
    this.monthlyMedalTitle = medal.title;
    this.monthlyMedalDescription = medal.description;
    this.monthlyMedalMode = medal.mode;
    this.monthlyMedalValueTarget = medal.mode === 'value' ? medal.targetDays : 0;
    this.monthlyMedalValueCurrent = medal.mode === 'value' ? medal.completedDays : 0;
    this.monthlyMedalValueUnit = medal.unit;
    this.monthlyMedalTarget = medal.mode === 'habit' ? medal.targetDays : 20;
    this.monthlyMedalEditCredit = medal.manualCredit ?? 0;
    this.monthlyMedalHabitIds.set(new Set(medal.habitIds));
    this.monthlyEditorPosition.set(this._computeEditorPosition(event));
  }

  // The editor popup used to be `position: absolute` inside the trophy card,
  // which put it at the mercy of the card's position in the grid: for cards
  // near the bottom of the (scrollable) grid, the popup's downward expansion
  // ran past the scroll container's clipping edge and the save button became
  // unreachable (#trophy-editor-off-screen). Positioning it as `position: fixed`
  // from the click's viewport coordinates, clamped to stay fully on-screen,
  // keeps every field - including the save button - reachable regardless of
  // where the trigger card sits on the page.
  private _computeEditorPosition(event: MouseEvent): { top: number; left: number } {
    const EDITOR_WIDTH = 320;
    const EDITOR_MAX_HEIGHT = 480;
    const MARGIN = 12;
    const button = (event.currentTarget as HTMLElement).getBoundingClientRect();

    const left = Math.min(
      Math.max(MARGIN, button.right - EDITOR_WIDTH),
      window.innerWidth - EDITOR_WIDTH - MARGIN,
    );
    const top = Math.min(
      button.bottom + 6,
      window.innerHeight - EDITOR_MAX_HEIGHT - MARGIN,
    );

    return { top: Math.max(MARGIN, top), left: Math.max(MARGIN, left) };
  }

  toggleMonthlyMedalHabit(habitId: string): void {
    const next = new Set(this.monthlyMedalHabitIds());
    next.has(habitId) ? next.delete(habitId) : next.add(habitId);
    this.monthlyMedalHabitIds.set(next);
  }

  canSaveMonthlyMedal(): boolean {
    return this.monthlyMedalMode === 'habit'
      ? this.monthlyMedalHabitIds().size > 0
      : Number(this.monthlyMedalValueTarget) > 0;
  }

  saveMonthlyMedalConfig(): void {
    if (!this.editingMonthlyMedalId || !this.canSaveMonthlyMedal()) return;
    this.profile.updateMonthlyMedal(this.editingMonthlyMedalId, {
      title: this.monthlyMedalTitle,
      description: this.monthlyMedalDescription,
      mode: this.monthlyMedalMode,
      habitIds: [...this.monthlyMedalHabitIds()],
      targetDays: this.monthlyMedalTarget,
      manualCredit: this.monthlyMedalEditCredit,
      valueTarget: Number(this.monthlyMedalValueTarget),
      valueCurrent: Number(this.monthlyMedalValueCurrent),
      valueUnit: this.monthlyMedalValueUnit,
    });
    this.editingMonthlyMedalId = null;
  }

  /** "R$ 4.000" for money, "12 km" for anything else. */
  formatMedalValue(value: number, unit: string): string {
    const number = value.toLocaleString('pt-BR');
    return unit === 'R$' ? `R$ ${number}` : `${number} ${unit}`.trim();
  }

  onCampaignImageSelected(campaignId: string, event: Event): void {
    this._readCardImage(event, (imageUrl) =>
      this.profile.setCampaignImage(campaignId, imageUrl),
    );
  }

  deleteCampaign(campaignId: string, title: string): void {
    if (
      window.confirm(
        `Excluir a campanha "${title}" e todos os capítulos dela? Esta ação não pode ser desfeita.`,
      )
    ) {
      this.profile.deleteCampaign(campaignId);
      if (this.selectedCampaignId === campaignId) {
        this.selectedCampaignId = '';
      }
    }
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      return;
    }
    if (file.size > 1_500_000) {
      this.shopMessage = 'A imagem precisa ter no máximo 1,5 MB.';
      return;
    }
    void readFileAsShrunkDataUrl(file, 384).then((dataUrl) => {
      this.avatarDataUrl = dataUrl;
      this.saveIdentity();
    });
  }

  async downloadCharacterBackup(): Promise<void> {
    this.characterBackupBusy = true;
    this.characterBackupMessage = '';
    try {
      await this._characterBackup.downloadCharacter(this.profile.state().id);
    } catch (err) {
      this.characterBackupMessage =
        err instanceof Error ? err.message : 'Não foi possível gerar o backup.';
    } finally {
      this.characterBackupBusy = false;
    }
  }

  async onCharacterBackupFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.characterBackupBusy = true;
    this.characterBackupMessage = '';
    try {
      await this._characterBackup.importCharacter(file);
      this.characterBackupMessage = 'Personagem restaurado com sucesso.';
    } catch (err) {
      this.characterBackupMessage =
        err instanceof Error ? err.message : 'Não foi possível restaurar esse arquivo.';
    } finally {
      this.characterBackupBusy = false;
      input.value = '';
    }
  }

  extraBackupDirMessage = '';

  extraBackupDir(): string | null {
    return this._characterBackup.extraBackupDir();
  }

  async chooseExtraBackupDir(): Promise<void> {
    const result = await this._characterBackup.chooseExtraBackupDir();
    this.extraBackupDirMessage = result.message;
  }

  clearExtraBackupDir(): void {
    this._characterBackup.clearExtraBackupDir();
    this.extraBackupDirMessage = 'Pasta extra removida.';
  }

  isVideoAvatar(value: string | null): boolean {
    return !!value && value.startsWith('data:video/');
  }

  isSkillLocked(skill: (typeof this.skills)[number]): boolean {
    if (!skill.parent) return false;
    return (this.profile.state().skills[skill.parent] ?? 0) < (skill.parentRank ?? 0);
  }

  onGenderChange(value: RpgAppearance['gender']): void {
    this.newCharacterAppearance = {
      ...this.newCharacterAppearance,
      gender: value,
      faceType: value === 'female' ? 'round' : 'square',
      hairStyle: value === 'female' ? 'long' : 'short',
      beard: 'none',
      beardColor: '#2b1712',
      beardSize: 'medium',
      hairSize: 'medium',
    };
  }

  setAppearance<K extends keyof RpgAppearance>(key: K, value: RpgAppearance[K]): void {
    this.newCharacterAppearance = { ...this.newCharacterAppearance, [key]: value };
  }

  onNewCharacterClassChange(value: RpgClassId): void {
    this.newCharacterClass = value;
    this.newCharacterSubclass = 'none';
  }

  appearancePreview<K extends keyof RpgAppearance>(
    key: K,
    value: RpgAppearance[K],
  ): RpgAppearance {
    return { ...this.newCharacterAppearance, [key]: value };
  }

  mapProject(projectId: string, value: string): void {
    this.profile.mapProject(projectId, value || null);
  }

  startEditAttribute(attribute: RpgAttributeDefinition): void {
    this.attributeDraft = { label: attribute.label, icon: attribute.icon };
    this.editingAttributeId.set(attribute.id);
  }

  saveAttributeEdit(): void {
    const id = this.editingAttributeId();
    if (!id || !this.attributeDraft.label.trim()) return;
    this.profile.updateAttribute(id, this.attributeDraft);
    this.editingAttributeId.set(null);
  }

  removeAttribute(attribute: RpgAttributeDefinition): void {
    if (
      confirm(
        `Excluir o atributo "${attribute.label}"? Os projetos associados a ele ficam sem atributo.`,
      )
    ) {
      this.profile.removeCustomAttribute(attribute.id);
      this.editingAttributeId.set(null);
    }
  }

  addAttribute(): void {
    const id = this.profile.addCustomAttribute(this.newAttributeLabel, 'star');
    if (!id) return;
    // Open it straight in edit mode so an icon can be picked right away.
    this.attributeDraft = { label: this.newAttributeLabel.trim(), icon: 'star' };
    this.editingAttributeId.set(id);
    this.newAttributeLabel = '';
  }

  mapProjectRealm(projectId: string, value: string): void {
    this.profile.mapProjectToRealm(projectId, value as RpgRealmId);
  }

  setAttributeRating(attribute: string, value: string | number): void {
    this.profile.setAttributeRating(attribute, Number(value));
  }

  subclassUnlockLevel(subclassId: RpgSubclassId): number {
    return RPG_SUBCLASS_UNLOCK_LEVELS[subclassId];
  }

  private _byUnlockLevel<T extends { id: RpgSubclassId }>(subclasses: T[]): T[] {
    return [...subclasses].sort(
      (a, b) => RPG_SUBCLASS_UNLOCK_LEVELS[a.id] - RPG_SUBCLASS_UNLOCK_LEVELS[b.id],
    );
  }

  chooseSubclass(value: string): void {
    const subclassId = value as RpgSubclassId;
    // Defense in depth alongside the disabled <option> - a still-locked
    // subclass must never actually be selectable.
    if (this.profile.level() < this.subclassUnlockLevel(subclassId)) return;
    this.profile.chooseSubclass(subclassId);
  }

  changeClassTo(value: string): void {
    if (!value) return;
    this.classChangeMessage = this.profile.changeClass(value as RpgClassId).message;
  }

  classIcon(classId: RpgClassId): string {
    return this.classes.find((item) => item.id === classId)?.icon ?? 'explore';
  }

  className(classId: RpgClassId): string {
    return this.classes.find((item) => item.id === classId)?.name ?? 'Aventureiro';
  }

  skillsForBranch(branch: string): (typeof this.skills)[number][] {
    return this.skills.filter((skill) => skill.branch === branch);
  }

  disciplineChartDays(): ReturnType<RpgProfileService['disciplineDays']> {
    // A 0% day (nothing done) reads as noise on this chart, not a data point
    // worth charting - show the full non-zero history instead of capping to
    // a recent window.
    return [...this.profile.disciplineDays()]
      .filter((day) => day.percentage > 0)
      .reverse();
  }

  // With many days plotted, a label under every point overlaps into
  // unreadable garble - thin them out to roughly 10 evenly-spaced labels
  // regardless of how much history is shown.
  shouldShowDateLabel(index: number, length: number): boolean {
    const maxLabels = 10;
    if (length <= maxLabels) return true;
    const step = Math.ceil(length / maxLabels);
    return index % step === 0 || index === length - 1;
  }

  disciplineHistoryMonths(): {
    key: string;
    label: string;
    days: ReturnType<RpgProfileService['disciplineDays']>;
  }[] {
    const groups = new Map<string, ReturnType<RpgProfileService['disciplineDays']>>();
    for (const day of this.profile.disciplineDays()) {
      const key = day.date.slice(0, 7);
      const current = groups.get(key) ?? [];
      current.push(day);
      groups.set(key, current);
    }
    return [...groups.entries()].map(([key, days]) => {
      const [year, month] = key.split('-').map(Number);
      const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
      });
      return { key, label, days };
    });
  }

  disciplineChartPoints(): string {
    const days = this.disciplineChartDays();
    if (!days.length) return '';
    return days
      .map(
        (day, index) =>
          `${this.disciplineChartX(index, days.length)},${this.disciplineChartY(day.percentage)}`,
      )
      .join(' ');
  }

  disciplineChartX(index: number, length: number): number {
    if (length <= 1) return 320;
    const offset = (index * 570) / (length - 1);
    return 35 + offset;
  }

  disciplineChartY(percentage: number): number {
    const height = Math.min(100, Math.max(0, percentage)) * 1.5;
    return 185 - height;
  }

  addReward(): void {
    if (!this.rewardTitle.trim() || this.rewardCost < 1) {
      return;
    }
    this.profile.addReward(this.rewardTitle, this.rewardCost);
    this.rewardTitle = '';
    this.rewardCost = 10;
  }

  buyReward(id: string): void {
    this.shopMessage = this.profile.buyReward(id)
      ? 'Recompensa resgatada!'
      : 'Moedas insuficientes.';
  }

  private _normalizeAttribute(value: number): number {
    return Math.min(100, Math.sqrt(Math.max(0, value)) * 8);
  }

  private _syncIdentityFields(): void {
    this.displayName = this.profile.state().displayName;
    this.avatarDataUrl = this.profile.state().avatarDataUrl;
    this.petName = this.profile.state().pet.name;
    this.petType = this.profile.state().pet.type;
  }
}
