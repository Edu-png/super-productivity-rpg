import { Injectable } from '@angular/core';
import { RpgClassId, RpgSpeciesId } from './rpg-profile.model';

export type CharacterLayerType =
  | 'shadow'
  | 'body'
  | 'ears'
  | 'eyes'
  | 'face'
  | 'clothes'
  | 'legs'
  | 'boots'
  | 'armor'
  | 'hair_back'
  | 'beard'
  | 'hair_front'
  | 'accessory'
  | 'helmet'
  | 'weapon'
  | 'shield'
  | 'effects';

export interface CharacterAssetEntry {
  id: string;
  type: string;
  path?: string;
  layers?: { back: string; front: string };
  compatibleBodies?: string[];
  compatibleRaces?: RpgSpeciesId[];
  paletteId?: string;
}

export interface CharacterAssetManifest {
  version: number;
  frame: { width: number; height: number; anchorX: number; anchorY: number };
  layerOrder: CharacterLayerType[];
  classLoadouts: Record<RpgClassId, Partial<Record<CharacterLayerType, string>>>;
  heroSheets?: Record<string, string>;
  heroPresets?: Record<
    RpgClassId,
    { masculine: { sheet: string; actor: number }; feminine: { sheet: string; actor: number } }
  >;
  assets: CharacterAssetEntry[];
}

export const validateCharacterManifest = (manifest: CharacterAssetManifest): void => {
  if (manifest.frame.width !== 64 || manifest.frame.height !== 64) {
    throw new Error('Every character layer must use the 64x64 frame.');
  }
  const ids = new Set<string>();
  for (const asset of manifest.assets) {
    if (ids.has(asset.id)) throw new Error(`Duplicate character asset id: ${asset.id}`);
    if (!asset.path && !asset.layers) {
      throw new Error(`Character asset ${asset.id} has no PNG path.`);
    }
    ids.add(asset.id);
  }
};

@Injectable({ providedIn: 'root' })
export class CharacterSpriteLoaderService {
  private _manifestPromise?: Promise<CharacterAssetManifest>;
  private readonly _images = new Map<string, Promise<HTMLImageElement>>();

  loadManifest(): Promise<CharacterAssetManifest> {
    this._manifestPromise ??= fetch('assets/characters/manifest.json').then(
      async (response) => {
        if (!response.ok) {
          throw new Error(`Character manifest failed with ${response.status}`);
        }
        const manifest = (await response.json()) as CharacterAssetManifest;
        validateCharacterManifest(manifest);
        return manifest;
      },
    );
    return this._manifestPromise;
  }

  async preload(): Promise<CharacterAssetManifest> {
    const manifest = await this.loadManifest();
    const paths = manifest.assets.flatMap((asset) =>
      asset.path
        ? [asset.path]
        : asset.layers
          ? [asset.layers.back, asset.layers.front]
          : [],
    );
    await Promise.all(paths.map((path) => this.loadImage(path)));
    return manifest;
  }

  loadImage(path: string): Promise<HTMLImageElement> {
    let pending = this._images.get(path);
    if (!pending) {
      pending = new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () =>
          reject(new Error(`Unable to load character layer: ${path}`));
        image.src = path;
      });
      this._images.set(path, pending);
    }
    return pending;
  }

  asset(
    manifest: CharacterAssetManifest,
    id: string | undefined,
  ): CharacterAssetEntry | null {
    return id ? (manifest.assets.find((candidate) => candidate.id === id) ?? null) : null;
  }
}
