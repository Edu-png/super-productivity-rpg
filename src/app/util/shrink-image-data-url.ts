/**
 * Downscales an image data URL so its longest side is at most `maxSide` and
 * re-encodes it as WebP. Uploaded photos are stored inline (and synced and
 * backed up with every save), so a 3 MB camera photo here costs far more than
 * the few hundred pixels it's ever shown at. Returns the input unchanged if it
 * can't be decoded or the result wouldn't be smaller.
 */
export const shrinkImageDataUrl = async (
  dataUrl: string,
  maxSide = 480,
  quality = 0.85,
): Promise<string> => {
  if (!dataUrl.startsWith('data:image/')) return dataUrl;
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const scale = Math.min(
      1,
      maxSide / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/webp', quality);
    return result.length < dataUrl.length ? result : dataUrl;
  } catch {
    return dataUrl;
  }
};

/** Rotates an image data URL 90° clockwise (re-encoded as WebP). */
export const rotateImageDataUrl = async (
  dataUrl: string,
  quality = 0.9,
): Promise<string> => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalHeight;
  canvas.height = image.naturalWidth;
  const context = canvas.getContext('2d');
  if (!context) return dataUrl;
  context.translate(canvas.width, 0);
  context.rotate(Math.PI / 2);
  context.drawImage(image, 0, 0);
  return canvas.toDataURL('image/webp', quality);
};

const mapStrings = (value: unknown, fn: (text: string) => string): unknown => {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, mapStrings(item, fn)]),
    );
  }
  return value;
};

/**
 * Shrinks every inline image above `minLength` chars found anywhere in
 * `value` (images stored before uploads were downscaled). Returns the
 * old -> new replacements, empty when there was nothing to shrink, so the
 * caller can apply them to its *current* state after the async work.
 */
export const shrinkLargeInlineImages = async (
  value: unknown,
  maxSide?: number,
  minLength = 200_000,
): Promise<Map<string, string>> => {
  const large = new Set<string>();
  mapStrings(value, (text) => {
    if (text.length > minLength && text.startsWith('data:image/')) large.add(text);
    return text;
  });
  const replacements = new Map<string, string>();
  for (const dataUrl of large) {
    const shrunk = await shrinkImageDataUrl(dataUrl, maxSide);
    if (shrunk !== dataUrl) replacements.set(dataUrl, shrunk);
  }
  return replacements;
};

export const applyImageReplacements = <T>(
  value: T,
  replacements: Map<string, string>,
): T => mapStrings(value, (text) => replacements.get(text) ?? text) as T;

export const readFileAsShrunkDataUrl = async (
  file: File,
  maxSide?: number,
): Promise<string> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return shrinkImageDataUrl(dataUrl, maxSide);
};
