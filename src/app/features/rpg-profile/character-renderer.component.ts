import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  HostBinding,
  inject,
  input,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import {
  CharacterAssetEntry,
  CharacterAssetManifest,
  CharacterLayerType,
  CharacterSpriteLoaderService,
} from './character-sprite-loader.service';
import {
  RpgAppearance,
  RpgClassId,
  RpgItemSlot,
  RpgSpeciesId,
} from './rpg-profile.model';

export type CharacterEquipmentLayers = Partial<Record<RpgItemSlot, string>>;

@Component({
  selector: 'character-renderer',
  templateUrl: './character-renderer.component.html',
  styleUrls: ['./character-renderer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharacterRendererComponent implements OnDestroy {
  private readonly _loader = inject(CharacterSpriteLoaderService);
  readonly appearance = input.required<RpgAppearance>();
  readonly species = input.required<RpgSpeciesId>();
  readonly characterClass = input.required<RpgClassId>();
  readonly equipment = input<CharacterEquipmentLayers>({});
  readonly compact = input(false);
  readonly portrait = input(false);
  readonly headerIcon = input(false);
  readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  readonly isReady = signal(false);
  private readonly _frame = signal(0);
  private readonly _animationTimer: ReturnType<typeof setInterval>;
  private _renderVersion = 0;

  @HostBinding('class.compact-host')
  get isCompact(): boolean {
    return this.compact();
  }

  @HostBinding('class.portrait-host')
  get isPortrait(): boolean {
    return this.portrait();
  }

  @HostBinding('class.header-icon-host')
  get isHeaderIcon(): boolean {
    return this.headerIcon();
  }

  constructor() {
    effect(() => {
      const canvas = this.canvas()?.nativeElement;
      const appearance = this.appearance();
      const species = this.species();
      const characterClass = this.characterClass();
      const equipment = this.equipment();
      const frame = this._frame();
      if (canvas) {
        void this._compose(canvas, appearance, species, characterClass, equipment, frame);
      }
    });
    this._animationTimer = setInterval(
      () => this._frame.update((value) => value + 1),
      600,
    );
  }

  ngOnDestroy(): void {
    clearInterval(this._animationTimer);
  }

  private async _compose(
    canvas: HTMLCanvasElement,
    appearance: RpgAppearance,
    species: RpgSpeciesId,
    characterClass: RpgClassId,
    equipment: CharacterEquipmentLayers,
    frame: number,
  ): Promise<void> {
    const version = ++this._renderVersion;
    const manifest = await this._loader.preload();
    const heroPreset =
      manifest.heroPresets?.[characterClass]?.[
        appearance.gender === 'female' ? 'feminine' : 'masculine'
      ];
    const heroSheetPath = heroPreset
      ? manifest.heroSheets?.[heroPreset.sheet]
      : undefined;
    if (heroPreset && heroSheetPath) {
      const heroSheet = await this._loader.loadImage(heroSheetPath);
      if (version !== this._renderVersion) return;
      this._drawHeroFrame(
        canvas,
        heroSheet,
        heroPreset.actor,
        frame,
        appearance,
        species,
      );
      if (!this.portrait()) {
        await this._drawEquippedLayers(canvas, manifest, equipment);
      }
      if (version !== this._renderVersion) return;
      this.isReady.set(true);
      return;
    }
    const selected = this._selectLayers(
      manifest,
      appearance,
      species,
      characterClass,
      equipment,
    );
    const resolved = await Promise.all(
      manifest.layerOrder.map(async (layer) => ({
        layer,
        image: await this._imageForLayer(selected[layer], layer),
      })),
    );
    if (version !== this._renderVersion) return;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, manifest.frame.width, manifest.frame.height);
    const idleOffset = frame % 4 < 2 ? 0 : 1;
    for (const item of resolved) {
      if (!item.image) continue;
      const animatedLayer = ['hair_back', 'hair_front', 'effects'].includes(item.layer);
      context.drawImage(item.image, 0, animatedLayer ? idleOffset : 0);
    }
    this.isReady.set(true);
  }

  private _drawHeroFrame(
    canvas: HTMLCanvasElement,
    sheet: HTMLImageElement,
    actor: number,
    frame: number,
    appearance: RpgAppearance,
    species: RpgSpeciesId,
  ): void {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const actorColumn = actor % 4;
    const actorRow = Math.floor(actor / 4);
    // Portraits must never drift between walk frames: the face remains anchored.
    const walkFrame = this.portrait()
      ? 1
      : frame % 4 < 2
        ? 1
        : frame % 4 === 2
          ? 0
          : 2;
    const sourceX = actorColumn * 216;
    const frameOffsetX = walkFrame * 72;
    const animatedSourceX = sourceX + frameOffsetX;
    const sourceY = actorRow * 384;
    if (this.portrait()) {
      const cropTop: Record<RpgSpeciesId, number> = {
        human: 18,
        dwarf: 20,
        elf: 17,
        orc: 17,
        fae: 16,
        tiefling: 14,
        draconian: 14,
      };
      // A real head-and-shoulders crop. The actor's nose sits at the center,
      // instead of enlarging and clipping the already reduced full-body canvas.
      context.drawImage(
        sheet,
        animatedSourceX + 12,
        sourceY + cropTop[species],
        48,
        48,
        0,
        0,
        64,
        64,
      );
      this._applyHeroColors(context, appearance, true);
      return;
    }
    context.drawImage(sheet, animatedSourceX, sourceY, 72, 96, 8, 0, 48, 64);
    this._applyHeroColors(context, appearance, false);
  }

  private async _drawEquippedLayers(
    canvas: HTMLCanvasElement,
    manifest: CharacterAssetManifest,
    equipment: CharacterEquipmentLayers,
  ): Promise<void> {
    const layerAssets: [CharacterLayerType, string | undefined][] = [
      ['boots', equipment.boots],
      ['armor', equipment.chest],
      ['accessory', equipment.neck],
      ['helmet', equipment.head],
      ['weapon', equipment.mainHand],
      ['shield', equipment.offHand],
    ];
    const resolved = await Promise.all(
      layerAssets.map(async ([layer, assetId]) => {
        if (
          assetId?.startsWith('rpg-item-') ||
          assetId?.startsWith('rare-item-')
        ) {
          const [, , row, column] = assetId.split('-');
          const folder = assetId.startsWith('rare-item-')
            ? 'rare-items'
            : 'items-pack';
          return {
            layer,
            image: await this._loader.loadImage(
              `assets/rpg/${folder}/item-${row}-${column}.png`,
            ),
            isItemPack: true,
          };
        }
        const asset = this._loader.asset(manifest, assetId);
        return {
          layer,
          image: await this._imageForLayer(asset ?? undefined, layer),
          isItemPack: false,
        };
      }),
    );
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;
    context.imageSmoothingEnabled = false;
    for (const item of resolved) {
      if (!item.image) continue;
      if (!item.isItemPack) {
        context.drawImage(item.image, 0, 0);
        continue;
      }
      // Inventory pack images are standalone icons, not wearable sprite layers.
      // Drawing a breastplate/helmet icon over the actor hides the face and body.
      // The actor sheet already contains the class outfit. A chest item may be
      // blended into the torso, while weapons are presented separately by the
      // inventory UI instead of floating over the character.
      if (item.layer !== 'armor' && item.layer !== 'shield') continue;
      const placement: Record<
        CharacterLayerType,
        { x: number; y: number; width: number; height: number }
      > = {
        shadow: { x: 24, y: 48, width: 16, height: 16 },
        body: { x: 24, y: 22, width: 16, height: 16 },
        ears: { x: 24, y: 18, width: 16, height: 16 },
        clothes: { x: 24, y: 28, width: 16, height: 16 },
        legs: { x: 24, y: 39, width: 16, height: 16 },
        hair_back: { x: 24, y: 8, width: 16, height: 16 },
        boots: { x: 24, y: 47, width: 16, height: 16 },
        armor: { x: 20, y: 31, width: 24, height: 22 },
        face: { x: 24, y: 17, width: 16, height: 16 },
        eyes: { x: 24, y: 17, width: 16, height: 16 },
        beard: { x: 24, y: 22, width: 16, height: 16 },
        hair_front: { x: 24, y: 8, width: 16, height: 16 },
        accessory: { x: 26, y: 24, width: 12, height: 12 },
        helmet: { x: 24, y: 7, width: 16, height: 16 },
        // The actor's hands are around y=38. Keeping the icons below the face
        // makes the equipment read as held instead of floating near the head.
        weapon: { x: 42, y: 34, width: 16, height: 22 },
        shield: { x: 7, y: 35, width: 17, height: 19 },
        effects: { x: 24, y: 24, width: 16, height: 16 },
      };
      const target = placement[item.layer];
      if (item.layer === 'armor') {
        // Restrict the standalone breastplate icon to the torso. This makes it
        // read as clothing without ever painting over the actor's face or hair.
        context.save();
        context.beginPath();
        context.rect(19, 31, 26, 21);
        context.clip();
      }
      context.drawImage(
        item.image,
        target.x,
        target.y,
        target.width,
        target.height,
      );
      if (item.layer === 'armor') context.restore();
    }
  }

  private _applyHeroColors(
    context: CanvasRenderingContext2D,
    appearance: RpgAppearance,
    portrait: boolean,
  ): void {
    const pixels = context.getImageData(0, 0, 64, 64);
    const hair = this._hexToRgb(appearance.hairColor);
    const eyes = this._hexToRgb(appearance.eyeColor);
    const skin = this._hexToRgb(appearance.skinColor);
    const data = pixels.data;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const rowOffset = y * 64;
        const index = (rowOffset + x) * 4;
        if (data[index + 3] === 0) continue;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const brightness = (red + green + blue) / 3;
        if (this._isSkinColor(red, green, blue)) {
          this._tintPixel(
            data,
            index,
            skin,
            Math.min(1.35, Math.max(0.52, brightness / 145)),
          );
        }
        const hairTop = portrait ? 3 : appearance.hairSize === 'large' ? 11 : 14;
        const hairBottom = portrait ? 32 : appearance.hairSize === 'small' ? 29 : 33;
        const hairLeft = portrait ? 7 : appearance.hairSize === 'large' ? 15 : 18;
        const hairRight = portrait ? 57 : appearance.hairSize === 'large' ? 49 : 46;
        const isHairPixel =
          y >= hairTop &&
          y <= hairBottom &&
          x >= hairLeft &&
          x <= hairRight &&
          brightness > 8 &&
          brightness < 205 &&
          !this._isSkinColor(red, green, blue);
        if (isHairPixel) {
          this._tintPixel(data, index, hair, Math.max(0.3, brightness / 120));
        }
        const isFaceDarkPixel =
          y >= (portrait ? 31 : 29) &&
          y <= (portrait ? 38 : 34) &&
          (portrait
            ? (x >= 23 && x <= 27) || (x >= 37 && x <= 41)
            : (x >= 26 && x <= 29) || (x >= 34 && x <= 37)) &&
          brightness < 80 &&
          this._hasSkinNeighbor(data, x, y);
        if (isFaceDarkPixel) {
          this._tintPixel(data, index, eyes, Math.max(0.55, brightness / 90));
        }
      }
    }
    if (appearance.gender === 'male' && appearance.beard !== 'none') {
      this._drawBeardPixels(pixels, appearance, portrait);
    }
    context.putImageData(pixels, 0, 0);
  }

  private _drawBeardPixels(
    pixels: ImageData,
    appearance: RpgAppearance,
    portrait: boolean,
  ): void {
    const color = this._hexToRgb(appearance.beardColor || appearance.hairColor);
    const size = appearance.beardSize ?? 'medium';
    const centerX = 32;
    const top = portrait ? 39 : 35;
    const styleHeight =
      appearance.beard === 'short' || appearance.beard === 'stubble'
        ? 3
        : appearance.beard === 'braided' || appearance.beard === 'long'
          ? 10
          : 6;
    const sizeDelta = size === 'small' ? -2 : size === 'large' ? 3 : 0;
    const height = Math.max(2, styleHeight + sizeDelta);
    const halfWidth =
      appearance.beard === 'goatee' || appearance.beard === 'braided'
        ? 3
        : size === 'large'
          ? 11
          : 8;
    for (let y = top; y < Math.min(64, top + height); y++) {
      const taper = Math.floor((y - top) / 2);
      for (let x = centerX - halfWidth + taper; x <= centerX + halfWidth - taper; x++) {
        const index = (y * 64 + x) * 4;
        if (pixels.data[index + 3] === 0) continue;
        const red = pixels.data[index];
        const green = pixels.data[index + 1];
        const blue = pixels.data[index + 2];
        if (!this._isSkinColor(red, green, blue)) continue;
        this._tintPixel(pixels.data, index, color, y % 2 === 0 ? 0.8 : 0.62);
      }
    }
  }

  private _hasSkinNeighbor(data: Uint8ClampedArray, x: number, y: number): boolean {
    let skinPixels = 0;
    for (let offsetY = -2; offsetY <= 2; offsetY++) {
      for (let offsetX = -2; offsetX <= 2; offsetX++) {
        const neighborX = x + offsetX;
        const neighborY = y + offsetY;
        if (neighborX < 0 || neighborX >= 64 || neighborY < 0 || neighborY >= 64) {
          continue;
        }
        const neighborRowOffset = neighborY * 64;
        const index = (neighborRowOffset + neighborX) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        if (this._isSkinColor(red, green, blue)) {
          skinPixels++;
        }
      }
    }
    return skinPixels >= 2;
  }

  private _isSkinColor(red: number, green: number, blue: number): boolean {
    return red > 90 && green > 50 && red > green && green >= blue && red - blue > 25;
  }

  private _tintPixel(
    data: Uint8ClampedArray,
    index: number,
    color: [number, number, number],
    intensity: number,
  ): void {
    data[index] = Math.min(255, color[0] * intensity);
    data[index + 1] = Math.min(255, color[1] * intensity);
    data[index + 2] = Math.min(255, color[2] * intensity);
  }

  private _hexToRgb(value: string): [number, number, number] {
    const hex = value.replace('#', '');
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }

  private _selectLayers(
    manifest: CharacterAssetManifest,
    appearance: RpgAppearance,
    species: RpgSpeciesId,
    characterClass: RpgClassId,
    equipment: CharacterEquipmentLayers,
  ): Partial<Record<CharacterLayerType, CharacterAssetEntry>> {
    const gender = appearance.gender === 'female' ? 'feminine' : 'masculine';
    const bodySpecies = species === 'fae' ? 'elf' : species;
    const bodyId = `body_${bodySpecies}_${gender}`;
    const hairId =
      appearance.hairStyle === 'long'
        ? 'hair_long_01'
        : appearance.hairStyle === 'curly'
          ? 'hair_curly_01'
          : appearance.hairStyle === 'bald' || species === 'draconian'
            ? undefined
            : 'hair_short_01';
    const beardId =
      appearance.beard === 'none'
        ? undefined
        : appearance.beard === 'braided'
          ? 'beard_braided_01'
          : appearance.beard === 'short' || appearance.beard === 'stubble'
            ? 'beard_short_01'
            : 'beard_full_01';
    const loadout = manifest.classLoadouts[characterClass] ?? {};
    const selectedIds: Partial<Record<CharacterLayerType, string>> = {
      shadow: 'shadow_01',
      body: bodyId,
      ears:
        species === 'fae'
          ? 'ears_elf'
          : manifest.assets.some((asset) => asset.id === `ears_${species}`)
            ? `ears_${species}`
            : 'ears_human',
      eyes: `eyes_${appearance.eyeStyle}`,
      face:
        appearance.marking === 'scar'
          ? 'face_scar'
          : appearance.mouthStyle === 'smile'
            ? 'face_smile'
            : 'face_neutral',
      hair_back: hairId,
      hair_front: hairId,
      beard: appearance.gender === 'male' ? beardId : undefined,
      accessory:
        equipment.neck ??
        loadout.accessory ??
        (appearance.accessory === 'glasses' ? 'accessory_glasses' : undefined),
      ...loadout,
      armor: equipment.chest ?? loadout.armor,
      helmet: equipment.head ?? loadout.helmet,
      boots: equipment.boots ?? loadout.boots,
      weapon: equipment.mainHand ?? loadout.weapon,
      shield: equipment.offHand ?? loadout.shield,
    };
    return Object.fromEntries(
      Object.entries(selectedIds).map(([layer, id]) => [
        layer,
        this._loader.asset(manifest, id),
      ]),
    ) as Partial<Record<CharacterLayerType, CharacterAssetEntry>>;
  }

  private async _imageForLayer(
    asset: CharacterAssetEntry | undefined,
    layer: CharacterLayerType,
  ): Promise<HTMLImageElement | null> {
    if (!asset) return null;
    const path =
      layer === 'hair_back'
        ? asset.layers?.back
        : layer === 'hair_front'
          ? asset.layers?.front
          : asset.path;
    return path ? this._loader.loadImage(path) : null;
  }
}
