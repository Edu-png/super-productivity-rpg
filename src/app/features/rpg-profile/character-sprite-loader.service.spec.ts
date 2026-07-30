import {
  CharacterAssetManifest,
  validateCharacterManifest,
} from './character-sprite-loader.service';

const manifest = (): CharacterAssetManifest => ({
  version: 1,
  frame: { width: 64, height: 64, anchorX: 32, anchorY: 58 },
  layerOrder: ['body', 'hair_back', 'hair_front', 'weapon'],
  classLoadouts: {} as CharacterAssetManifest['classLoadouts'],
  assets: [
    { id: 'body_human_masculine', type: 'body', path: 'body.png' },
    {
      id: 'hair_short',
      type: 'hair',
      layers: { back: 'hair-back.png', front: 'hair-front.png' },
    },
    { id: 'weapon_sword', type: 'weapon', path: 'sword.png' },
  ],
});

describe('character asset manifest', () => {
  it('accepts aligned PNG layers and split hair layers', () => {
    expect(() => validateCharacterManifest(manifest())).not.toThrow();
  });

  it('rejects duplicate assets', () => {
    const invalid = manifest();
    invalid.assets.push({ ...invalid.assets[0] });

    expect(() => validateCharacterManifest(invalid)).toThrowError(
      /Duplicate character asset id/,
    );
  });

  it('rejects layers that do not use the shared 64x64 frame', () => {
    const invalid = manifest();
    invalid.frame.width = 96;

    expect(() => validateCharacterManifest(invalid)).toThrowError(/64x64 frame/);
  });
});
