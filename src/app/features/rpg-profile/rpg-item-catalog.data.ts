import { RpgClassId, RpgItemSlot, RpgPetType } from './rpg-profile.model';

/**
 * Themed drop catalog: 10 items per class plus treats/toys per pet type. Each
 * entry carries its own art (packs already shipped in assets/rpg), so a drop
 * looks like what its name says instead of a generic per-slot sprite.
 */
export interface RpgCatalogItem {
  name: string;
  slot: RpgItemSlot;
  icon: string;
  image: string;
}

const P = (id: string): string => `assets/rpg/items-pack/item-${id}.png`;
const R = (id: string): string => `assets/rpg/rare-items/item-${id}.png`;
const G = (id: string): string => `assets/rpg/generated-items/${id}.png`;

export const RPG_CLASS_ITEM_CATALOG: Record<RpgClassId, RpgCatalogItem[]> = {
  adventurer: [
    { name: 'Espada do Andarilho', slot: 'mainHand', icon: 'swords', image: P('4-7') },
    {
      name: 'Espada de Madeira Polida',
      slot: 'mainHand',
      icon: 'swords',
      image: P('4-5'),
    },
    { name: 'Bumerangue Errante', slot: 'mainHand', icon: 'swords', image: P('6-1') },
    { name: 'Escudo de Carvalho', slot: 'offHand', icon: 'shield', image: P('2-4') },
    { name: 'Capuz de Couro', slot: 'head', icon: 'sports_motorsports', image: P('0-4') },
    { name: 'Gibão de Viagem', slot: 'chest', icon: 'checkroom', image: P('0-5') },
    { name: 'Botas da Estrada', slot: 'boots', icon: 'ice_skating', image: P('1-5') },
    { name: 'Luvas do Explorador', slot: 'hands', icon: 'back_hand', image: P('2-5') },
    { name: 'Bússola de Topázio', slot: 'neck', icon: 'diamond', image: P('3-3') },
    { name: 'Chave do Mapa Antigo', slot: 'relic', icon: 'key', image: P('7-2') },
  ],
  mage: [
    {
      name: 'Tomo Púrpura dos Ecos',
      slot: 'mainHand',
      icon: 'book_2',
      image: G('ancient-tome'),
    },
    {
      name: 'Orbe Astral Menor',
      slot: 'mainHand',
      icon: 'brightness_7',
      image: G('arcane-orb'),
    },
    {
      name: 'Varinha da Lua Crescente',
      slot: 'mainHand',
      icon: 'nightlight',
      image: G('moon-wand'),
    },
    {
      name: 'Chapéu do Arcano Azul',
      slot: 'head',
      icon: 'sports_motorsports',
      image: G('wizard-hat'),
    },
    {
      name: 'Amuleto do Olho Místico',
      slot: 'neck',
      icon: 'diamond',
      image: G('purple-amulet'),
    },
    {
      name: 'Anel de Safira Arcana',
      slot: 'ringLeft',
      icon: 'radio_button_checked',
      image: P('7-1'),
    },
    { name: 'Cristal de Foco', slot: 'relic', icon: 'auto_awesome', image: P('3-2') },
    {
      name: 'Frasco de Mana Estelar',
      slot: 'relic',
      icon: 'science',
      image: G('mana-potion'),
    },
    {
      name: 'Luvas do Conjurador',
      slot: 'hands',
      icon: 'back_hand',
      image: G('leather-gloves'),
    },
    { name: 'Lua de Prata', slot: 'offHand', icon: 'nightlight', image: G('moon-charm') },
  ],
  guardian: [
    { name: 'Martelo da Muralha', slot: 'mainHand', icon: 'hardware', image: P('4-6') },
    { name: 'Malho do Bastião', slot: 'mainHand', icon: 'hardware', image: P('4-4') },
    { name: 'Escudo de Aço Polido', slot: 'offHand', icon: 'shield', image: P('2-6') },
    {
      name: 'Escudo do Cavaleiro Fiel',
      slot: 'offHand',
      icon: 'shield',
      image: G('knight-shield'),
    },
    {
      name: 'Elmo da Vigília',
      slot: 'head',
      icon: 'sports_motorsports',
      image: P('0-6'),
    },
    { name: 'Couraça de Aço', slot: 'chest', icon: 'checkroom', image: P('0-7') },
    { name: 'Manoplas de Ferro', slot: 'hands', icon: 'back_hand', image: P('2-7') },
    { name: 'Grevas de Aço', slot: 'boots', icon: 'ice_skating', image: P('1-7') },
    { name: 'Bigorna Sagrada', slot: 'relic', icon: 'auto_awesome', image: P('6-3') },
    { name: 'Coração Inabalável', slot: 'neck', icon: 'favorite', image: R('13-5') },
  ],
  merchant: [
    {
      name: 'Balança do Mercador',
      slot: 'mainHand',
      icon: 'business_center',
      image: G('travel-satchel'),
    },
    {
      name: 'Cutelo do Feirante',
      slot: 'mainHand',
      icon: 'content_cut',
      image: P('5-7'),
    },
    {
      name: 'Bolsa de Moedas Gordas',
      slot: 'offHand',
      icon: 'business_center',
      image: P('4-0'),
    },
    { name: 'Barra de Ouro da Guilda', slot: 'relic', icon: 'paid', image: P('4-2') },
    { name: 'Moeda da Sorte', slot: 'neck', icon: 'paid', image: P('5-1') },
    { name: 'Moeda de Prata Antiga', slot: 'ringRight', icon: 'paid', image: P('5-2') },
    {
      name: 'Anel de Rubi do Comércio',
      slot: 'ringLeft',
      icon: 'radio_button_checked',
      image: P('7-0'),
    },
    { name: 'Pepitas Douradas', slot: 'relic', icon: 'paid', image: R('16-2') },
    { name: 'Chave do Cofre', slot: 'relic', icon: 'key', image: P('7-3') },
    {
      name: 'Botas do Caixeiro',
      slot: 'boots',
      icon: 'ice_skating',
      image: G('pathfinder-boots'),
    },
  ],
  ranger: [
    { name: 'Arco de Teixo', slot: 'mainHand', icon: 'my_location', image: P('6-4') },
    { name: 'Arco de Aço Leve', slot: 'mainHand', icon: 'my_location', image: P('6-6') },
    { name: 'Faca de Caça', slot: 'mainHand', icon: 'content_cut', image: P('7-5') },
    { name: 'Flecha Rubra', slot: 'offHand', icon: 'my_location', image: P('6-5') },
    {
      name: 'Capuz do Bosque',
      slot: 'head',
      icon: 'sports_motorsports',
      image: P('0-4'),
    },
    {
      name: 'Colete de Couro Curtido',
      slot: 'chest',
      icon: 'checkroom',
      image: P('0-5'),
    },
    { name: 'Botas da Trilha', slot: 'boots', icon: 'ice_skating', image: P('1-5') },
    { name: 'Esmeralda da Floresta', slot: 'neck', icon: 'diamond', image: P('3-1') },
    {
      name: 'Anel de Orvalho Prateado',
      slot: 'ringLeft',
      icon: 'radio_button_checked',
      image: G('silver-blue-ring'),
    },
    { name: 'Flor do Orvalho', slot: 'relic', icon: 'local_florist', image: R('13-15') },
  ],
  warrior: [
    { name: 'Espada Flamejante', slot: 'mainHand', icon: 'swords', image: R('2-13') },
    { name: 'Machado Duplo', slot: 'mainHand', icon: 'hardware', image: P('5-6') },
    { name: 'Lâmina Gêmea', slot: 'mainHand', icon: 'swords', image: R('2-0') },
    { name: 'Escudo de Batalha', slot: 'offHand', icon: 'shield', image: P('2-6') },
    {
      name: 'Elmo do Campeão',
      slot: 'head',
      icon: 'sports_motorsports',
      image: G('steel-helmet'),
    },
    {
      name: 'Peitoral do Veterano',
      slot: 'chest',
      icon: 'checkroom',
      image: G('silver-breastplate'),
    },
    { name: 'Manoplas da Fúria', slot: 'hands', icon: 'back_hand', image: P('2-7') },
    { name: 'Botas de Marcha', slot: 'boots', icon: 'ice_skating', image: P('1-7') },
    { name: 'Rubi do Guerreiro', slot: 'neck', icon: 'diamond', image: P('3-0') },
    {
      name: 'Anel do Ímpeto',
      slot: 'ringRight',
      icon: 'radio_button_checked',
      image: P('7-0'),
    },
  ],
  cleric: [
    { name: 'Martelo da Luz', slot: 'mainHand', icon: 'hardware', image: P('4-4') },
    {
      name: 'Cajado da Aurora',
      slot: 'mainHand',
      icon: 'healing',
      image: G('wizard-staff'),
    },
    {
      name: 'Tomo das Preces',
      slot: 'mainHand',
      icon: 'book_2',
      image: G('ancient-tome'),
    },
    {
      name: 'Escudo Consagrado',
      slot: 'offHand',
      icon: 'shield',
      image: G('routine-shield'),
    },
    { name: 'Poção Curativa', slot: 'relic', icon: 'science', image: P('0-0') },
    { name: 'Elixir Verde', slot: 'relic', icon: 'science', image: P('0-1') },
    { name: 'Coração Bondoso', slot: 'neck', icon: 'favorite', image: R('13-5') },
    {
      name: 'Anel da Bênção',
      slot: 'ringLeft',
      icon: 'radio_button_checked',
      image: G('gold-purple-ring'),
    },
    {
      name: 'Túnica do Peregrino',
      slot: 'chest',
      icon: 'checkroom',
      image: G('traveler-tunic'),
    },
    {
      name: 'Sandálias do Santuário',
      slot: 'boots',
      icon: 'ice_skating',
      image: G('leather-boots'),
    },
  ],
  rogue: [
    { name: 'Adaga de Aço Fino', slot: 'mainHand', icon: 'content_cut', image: P('7-7') },
    { name: 'Shuriken Estelar', slot: 'mainHand', icon: 'star', image: R('2-8') },
    { name: 'Lâmina Púrpura', slot: 'mainHand', icon: 'swords', image: R('0-10') },
    { name: 'Bomba de Fumaça', slot: 'offHand', icon: 'whatshot', image: P('6-0') },
    {
      name: 'Capuz das Sombras',
      slot: 'head',
      icon: 'sports_motorsports',
      image: P('0-4'),
    },
    { name: 'Luvas Silenciosas', slot: 'hands', icon: 'back_hand', image: P('2-5') },
    { name: 'Gazua de Prata', slot: 'relic', icon: 'key', image: P('7-3') },
    {
      name: 'Anel do Ladino',
      slot: 'ringLeft',
      icon: 'radio_button_checked',
      image: R('10-13'),
    },
    { name: 'Safira Roubada', slot: 'neck', icon: 'diamond', image: P('3-2') },
    { name: 'Botas Sem Ruído', slot: 'boots', icon: 'ice_skating', image: P('1-5') },
  ],
  bard: [
    {
      name: 'Alaúde dos Viajantes',
      slot: 'mainHand',
      icon: 'music_note',
      image: G('fantasy-lute'),
    },
    {
      name: 'Varinha da Canção',
      slot: 'mainHand',
      icon: 'nightlight',
      image: G('moon-wand'),
    },
    {
      name: 'Bumerangue Cantante',
      slot: 'mainHand',
      icon: 'music_note',
      image: P('6-1'),
    },
    {
      name: 'Chapéu Emplumado',
      slot: 'head',
      icon: 'sports_motorsports',
      image: G('bard-hat'),
    },
    {
      name: 'Chapéu do Palco',
      slot: 'head',
      icon: 'sports_motorsports',
      image: G('bard-hat'),
    },
    { name: 'Moeda do Aplauso', slot: 'neck', icon: 'paid', image: P('5-1') },
    {
      name: 'Anel de Rubi Cantor',
      slot: 'ringLeft',
      icon: 'radio_button_checked',
      image: P('7-0'),
    },
    { name: 'Frasco da Inspiração', slot: 'relic', icon: 'science', image: P('0-3') },
    {
      name: 'Gibão Colorido',
      slot: 'chest',
      icon: 'checkroom',
      image: G('traveler-tunic'),
    },
    { name: 'Coração do Público', slot: 'relic', icon: 'favorite', image: R('13-5') },
  ],
  necromancer: [
    {
      name: 'Tomo das Almas',
      slot: 'mainHand',
      icon: 'book_2',
      image: G('ancient-tome'),
    },
    { name: 'Cutelo Sombrio', slot: 'mainHand', icon: 'swords', image: P('5-5') },
    {
      name: 'Orbe do Vazio',
      slot: 'mainHand',
      icon: 'brightness_7',
      image: G('arcane-orb'),
    },
    { name: 'Osso Ancestral', slot: 'offHand', icon: 'skull', image: P('4-3') },
    {
      name: 'Capuz do Ocultista',
      slot: 'head',
      icon: 'sports_motorsports',
      image: G('wizard-hat'),
    },
    {
      name: 'Amuleto Violeta das Trevas',
      slot: 'neck',
      icon: 'diamond',
      image: G('purple-amulet'),
    },
    {
      name: 'Anel do Olhar Gélido',
      slot: 'ringLeft',
      icon: 'radio_button_checked',
      image: R('13-2'),
    },
    {
      name: 'Relíquia Violeta',
      slot: 'relic',
      icon: 'auto_awesome',
      image: G('violet-relic'),
    },
    { name: 'Lua Negra', slot: 'relic', icon: 'nightlight', image: G('moon-charm') },
    { name: 'Poção Proibida', slot: 'relic', icon: 'science', image: P('0-1') },
  ],
  archer: [
    { name: 'Besta de Madeira', slot: 'mainHand', icon: 'my_location', image: P('7-4') },
    { name: 'Besta de Aço', slot: 'mainHand', icon: 'my_location', image: P('7-6') },
    { name: 'Arco Longo de Aço', slot: 'mainHand', icon: 'my_location', image: P('6-6') },
    { name: 'Aljava de Flechas', slot: 'offHand', icon: 'my_location', image: P('6-7') },
    {
      name: 'Elmo do Atirador',
      slot: 'head',
      icon: 'sports_motorsports',
      image: P('0-6'),
    },
    { name: 'Braçadeiras de Couro', slot: 'hands', icon: 'back_hand', image: P('2-5') },
    { name: 'Calças de Patrulha', slot: 'chest', icon: 'checkroom', image: P('1-4') },
    { name: 'Botas do Vigia', slot: 'boots', icon: 'ice_skating', image: P('1-5') },
    { name: 'Olho de Águia', slot: 'neck', icon: 'diamond', image: G('purple-amulet') },
    {
      name: 'Anel da Mira',
      slot: 'ringRight',
      icon: 'radio_button_checked',
      image: P('7-1'),
    },
  ],
  barbarian: [
    { name: 'Machado do Clã', slot: 'mainHand', icon: 'hardware', image: P('5-4') },
    {
      name: 'Machado de Guerra Duplo',
      slot: 'mainHand',
      icon: 'hardware',
      image: P('5-6'),
    },
    { name: 'Clava Pesada', slot: 'mainHand', icon: 'hardware', image: P('4-4') },
    { name: 'Escudo de Tronco', slot: 'offHand', icon: 'shield', image: P('2-4') },
    {
      name: 'Elmo de Couro Cru',
      slot: 'head',
      icon: 'sports_motorsports',
      image: P('0-4'),
    },
    { name: 'Couro de Fera', slot: 'chest', icon: 'checkroom', image: P('0-5') },
    { name: 'Botas de Pele', slot: 'boots', icon: 'ice_skating', image: P('1-5') },
    { name: 'Colar de Osso', slot: 'neck', icon: 'diamond', image: P('4-3') },
    { name: 'Rubi da Fúria', slot: 'relic', icon: 'diamond', image: P('3-0') },
    { name: 'Carne do Banquete', slot: 'relic', icon: 'restaurant', image: P('4-1') },
  ],
};

export type RpgPetItemAttribute = 'loyalty' | 'joy' | 'scent';

export interface RpgPetCatalogItem extends RpgCatalogItem {
  /** Which pet attribute this treat/toy feeds (see companionPetAttributes). */
  petAttribute: RpgPetItemAttribute;
}

const petItem = (
  name: string,
  image: string,
  petAttribute: RpgPetItemAttribute,
  icon = 'pets',
): RpgPetCatalogItem => ({ name, slot: 'companion', icon, image, petAttribute });

/** Treats and toys per pet type, equipped in the companion-accessory slot. */
export const RPG_PET_ITEM_CATALOG: Record<RpgPetType, RpgPetCatalogItem[]> = {
  wolf: [
    petItem('Osso do Lobo Lunar', P('4-3'), 'scent'),
    petItem('Carne da Matilha', P('4-1'), 'loyalty', 'restaurant'),
    petItem('Bagas da Lua', P('2-2'), 'joy', 'restaurant'),
    petItem('Lua de Brinquedo', G('moon-charm'), 'joy', 'nightlight'),
  ],
  tiger: [
    petItem('Bife do Caçador', R('20-5'), 'loyalty', 'restaurant'),
    petItem('Novelo Listrado', P('6-1'), 'joy'),
    petItem('Osso Polido', P('4-3'), 'scent'),
    petItem('Gema do Olho de Tigre', P('3-3'), 'scent', 'diamond'),
  ],
  dragon: [
    petItem('Rubi para Roer', P('3-0'), 'loyalty', 'diamond'),
    petItem('Pepitas do Tesouro', R('16-2'), 'joy', 'paid'),
    petItem('Brasa Comestível', P('6-2'), 'scent', 'whatshot'),
    petItem('Ovo de Ninhada', P('1-1'), 'loyalty', 'egg'),
  ],
  phoenix: [
    petItem('Cerejas do Sol', P('1-3'), 'joy', 'restaurant'),
    petItem('Maçã Rubra', P('2-0'), 'loyalty', 'restaurant'),
    petItem('Flor Renascida', R('13-15'), 'scent', 'local_florist'),
    petItem('Topázio Flamejante', P('3-3'), 'joy', 'diamond'),
  ],
  griffin: [
    petItem('Maçã Verde do Penhasco', P('2-1'), 'joy', 'restaurant'),
    petItem('Queijo das Alturas', P('1-0'), 'loyalty', 'restaurant'),
    petItem('Biscoito Celeste', P('5-0'), 'joy', 'cookie'),
    petItem('Pena-Bússola de Safira', P('3-2'), 'scent', 'diamond'),
  ],
};

/** name -> art, for re-pointing stored items at their catalog sprite on load. */
export const RPG_CATALOG_IMAGE_BY_NAME = new Map<string, string>(
  [
    ...Object.values(RPG_CLASS_ITEM_CATALOG).flat(),
    ...Object.values(RPG_PET_ITEM_CATALOG).flat(),
  ].map((item) => [item.name, item.image]),
);

export const RPG_PET_ITEM_ATTRIBUTE_BY_NAME = new Map<string, RpgPetItemAttribute>(
  Object.values(RPG_PET_ITEM_CATALOG)
    .flat()
    .map((item) => [item.name, item.petAttribute]),
);
