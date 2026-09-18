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
  RpgAttributeId,
  RpgClassId,
  RpgItemSlot,
  RpgPetType,
  RpgRealmId,
  RpgSpeciesId,
  RpgSubclassId,
  RPG_SUBCLASS_UNLOCK_LEVELS,
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
  // The dungeon only lists penalties the player defined themselves - the ones
  // markTaskAsFailed auto-creates for a task marked "not done" already fired
  // (timesApplied: 1, no further action needed), so they'd otherwise show up
  // asking to be "Aplicar"'d again for no reason. The title check catches
  // entries created before sourceTaskId existed on the model.
  manualPenalties = computed(() =>
    this.profile
      .state()
      .penalties.filter((p) => !p.sourceTaskId && !p.title.startsWith('Não concluída: ')),
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
  annualGoalEditTarget = 100;
  annualGoalEditCredit = 0;
  annualGoalEditHabitIds = signal(new Set<string>());
  editingMonthlyMedalId: string | null = null;
  monthlyMedalTarget = 80;
  monthlyMedalEditCredit = 0;
  monthlyMedalHabitIds = signal(new Set<string>());

  readonly attributes: { id: RpgAttributeId; label: string; icon: string }[] = [
    { id: 'health', label: 'Saúde', icon: 'favorite' },
    { id: 'intelligence', label: 'Inteligência', icon: 'psychology' },
    { id: 'social', label: 'Social', icon: 'groups' },
    { id: 'finance', label: 'Finanças', icon: 'savings' },
  ];
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
  readonly subclasses: {
    id: RpgSubclassId;
    classId: RpgClassId;
    name: string;
    bonus: string;
  }[] = [
    {
      id: 'chronomancer',
      classId: 'mage',
      name: 'Cronomante',
      bonus: '+10% de XP das missões diárias.',
    },
    {
      id: 'scholar',
      classId: 'mage',
      name: 'Erudito',
      bonus: '+5% adicional de XP das tarefas.',
    },
    {
      id: 'paladin',
      classId: 'guardian',
      name: 'Paladino',
      bonus: '+10% adicional nos pontos de Saúde.',
    },
    {
      id: 'alchemist',
      classId: 'merchant',
      name: 'Alquimista',
      bonus: '+10% adicional de moedas.',
    },
    {
      id: 'pathfinder',
      classId: 'ranger',
      name: 'Desbravador',
      bonus: '+10% de XP das missões diárias.',
    },
    {
      id: 'vanguard',
      classId: 'adventurer',
      name: 'Vanguarda',
      bonus: '+5% de XP em tarefas difíceis.',
    },
    {
      id: 'trailblazer',
      classId: 'adventurer',
      name: 'Pioneiro',
      bonus: '+10% nas recompensas de campanha.',
    },
    {
      id: 'battlemage',
      classId: 'mage',
      name: 'Mago de Batalha',
      bonus: '+12% de XP em sessões de foco.',
    },
    {
      id: 'archmage',
      classId: 'mage',
      name: 'Arquimago',
      bonus: '+20% de XP em projetos concluídos.',
    },
    {
      id: 'sentinel',
      classId: 'guardian',
      name: 'Sentinela',
      bonus: '+15% de resistência a penalidades.',
    },
    {
      id: 'templar',
      classId: 'guardian',
      name: 'Templário',
      bonus: '+20% de Saúde e +5% de XP.',
    },
    {
      id: 'artificer',
      classId: 'merchant',
      name: 'Artífice',
      bonus: '+10% de ouro e chance de item adicional.',
    },
    {
      id: 'tycoon',
      classId: 'merchant',
      name: 'Magnata',
      bonus: '+25% de ouro em chefes semanais.',
    },
    {
      id: 'beastmaster',
      classId: 'ranger',
      name: 'Mestre das Feras',
      bonus: '+15% de XP com mascote equipado.',
    },
    {
      id: 'warden',
      classId: 'ranger',
      name: 'Guardião da Mata',
      bonus: '+10% de XP em streaks.',
    },
    {
      id: 'berserker',
      classId: 'warrior',
      name: 'Berserker',
      bonus: '+15% de XP em tarefas difíceis.',
    },
    {
      id: 'warlord',
      classId: 'warrior',
      name: 'Senhor da Guerra',
      bonus: '+20% de recompensa de chefes.',
    },
    {
      id: 'oracle',
      classId: 'cleric',
      name: 'Oráculo',
      bonus: '+10% de XP em missões diárias.',
    },
    {
      id: 'saint',
      classId: 'cleric',
      name: 'Santo',
      bonus: 'Reduz penalidades em mais 20%.',
    },
    {
      id: 'assassin',
      classId: 'rogue',
      name: 'Assassino',
      bonus: '+10% de chance de drop raro.',
    },
    {
      id: 'shadowmaster',
      classId: 'rogue',
      name: 'Mestre das Sombras',
      bonus: '+20% de XP na primeira tarefa do dia.',
    },
    {
      id: 'minstrel',
      classId: 'bard',
      name: 'Menestrel',
      bonus: '+10% de ouro em streaks.',
    },
    {
      id: 'virtuoso',
      classId: 'bard',
      name: 'Virtuoso',
      bonus: '+15% de XP ao concluir todas as missões diárias.',
    },
    {
      id: 'reaper',
      classId: 'necromancer',
      name: 'Ceifador',
      bonus: '+15% de XP de chefes semanais.',
    },
    {
      id: 'lich',
      classId: 'necromancer',
      name: 'Lich',
      bonus: '+25% de XP e drop em chefes.',
    },
    {
      id: 'sniper',
      classId: 'archer',
      name: 'Atirador de Elite',
      bonus: '+15% de XP em tarefas no prazo.',
    },
    {
      id: 'falconer',
      classId: 'archer',
      name: 'Falcoeiro',
      bonus: '+10% de XP com companheiro equipado.',
    },
    {
      id: 'juggernaut',
      classId: 'barbarian',
      name: 'Colosso',
      bonus: '+20% de Saúde e resistência.',
    },
    {
      id: 'chieftain',
      classId: 'barbarian',
      name: 'Chefe Tribal',
      bonus: '+20% de recompensa semanal.',
    },
  ];
  readonly availableSubclasses = computed(() =>
    this.subclasses.filter(
      (subclass) => subclass.classId === this.profile.state().classId,
    ),
  );
  readonly unlockedSubclasses = computed(() =>
    this.availableSubclasses().filter(
      (subclass) => this.profile.level() >= this.subclassUnlockLevel(subclass.id),
    ),
  );
  readonly creatorSubclasses = computed(() =>
    this.subclasses.filter((subclass) => subclass.classId === this.newCharacterClass),
  );
  readonly selectedClass = computed(() =>
    this.classes.find((item) => item.id === this.profile.state().classId),
  );
  readonly selectedSubclass = computed(() =>
    this.subclasses.find((item) => item.id === this.profile.state().subclassId),
  );
  readonly radarAxes = [
    { label: 'Saúde', x: 100, y: 15 },
    { label: 'Inteligência', x: 181, y: 74 },
    { label: 'Finanças', x: 150, y: 170 },
    { label: 'Social', x: 50, y: 170 },
    { label: 'Disciplina', x: 19, y: 74 },
  ];
  readonly radarPoints = computed(() => {
    const ratings = this.profile.state().attributeRatings;
    const values = [
      ratings.health * 10,
      ratings.intelligence * 10,
      ratings.finance * 10,
      ratings.social * 10,
      ratings.discipline * 10,
    ];
    return values
      .map((value, index) => {
        const fullCircle = Math.PI * 2;
        const position = index * fullCircle;
        const turn = position / values.length;
        const halfPi = Math.PI / 2;
        const angle = turn - halfPi;
        const radius = 78 * (value / 100);
        const xOffset = Math.cos(angle) * radius;
        const yOffset = Math.sin(angle) * radius;
        return `${100 + xOffset},${100 + yOffset}`;
      })
      .join(' ');
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
    this.profile.addPenalty(this.penaltyTitle, this.penaltyXp, this.penaltyCoins);
    this.penaltyTitle = '';
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
    const reader = new FileReader();
    reader.onload = () => save(reader.result as string);
    reader.readAsDataURL(file);
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

  editAnnualGoal(goal: {
    id: string;
    habitIds: string[];
    targetDays: number;
    startingCredit?: number;
  }): void {
    if (this.editingAnnualGoalId === goal.id) {
      this.editingAnnualGoalId = null;
      return;
    }
    this.editingAnnualGoalId = goal.id;
    this.annualGoalEditTarget = goal.targetDays;
    this.annualGoalEditCredit = goal.startingCredit ?? 50;
    this.annualGoalEditHabitIds.set(new Set(goal.habitIds));
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

  editMonthlyMedal(medal: {
    id: string;
    habitIds: string[];
    targetDays: number;
    manualCredit?: number;
  }): void {
    if (this.editingMonthlyMedalId === medal.id) {
      this.editingMonthlyMedalId = null;
      return;
    }
    this.editingMonthlyMedalId = medal.id;
    this.monthlyMedalTarget = medal.targetDays;
    this.monthlyMedalEditCredit = medal.manualCredit ?? 0;
    this.monthlyMedalHabitIds.set(new Set(medal.habitIds));
  }

  toggleMonthlyMedalHabit(habitId: string): void {
    const next = new Set(this.monthlyMedalHabitIds());
    next.has(habitId) ? next.delete(habitId) : next.add(habitId);
    this.monthlyMedalHabitIds.set(next);
  }

  saveMonthlyMedalConfig(): void {
    if (!this.editingMonthlyMedalId || !this.monthlyMedalHabitIds().size) return;
    this.profile.updateMonthlyMedalConfig(
      this.editingMonthlyMedalId,
      [...this.monthlyMedalHabitIds()],
      this.monthlyMedalTarget,
      this.monthlyMedalEditCredit,
    );
    this.editingMonthlyMedalId = null;
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
    const reader = new FileReader();
    reader.onload = () => {
      this.avatarDataUrl = reader.result as string;
      this.saveIdentity();
    };
    reader.readAsDataURL(file);
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
    this.profile.mapProject(projectId, (value || null) as RpgAttributeId | null);
  }

  mapProjectRealm(projectId: string, value: string): void {
    this.profile.mapProjectToRealm(projectId, value as RpgRealmId);
  }

  setAttributeRating(attribute: RpgAttributeId, value: string | number): void {
    this.profile.setAttributeRating(attribute, Number(value));
  }

  subclassUnlockLevel(subclassId: RpgSubclassId): number {
    return RPG_SUBCLASS_UNLOCK_LEVELS[subclassId];
  }

  nextSubclassUnlockLevel(): number | null {
    const lockedLevels = this.availableSubclasses()
      .map((subclass) => this.subclassUnlockLevel(subclass.id))
      .filter((level) => level > this.profile.level());
    return lockedLevels.length ? Math.min(...lockedLevels) : null;
  }

  chooseSubclass(value: string): void {
    if (value !== 'none') {
      this.profile.chooseSubclass(value as RpgSubclassId);
    }
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
    return this.profile.disciplineDays().slice(0, 7).reverse();
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
