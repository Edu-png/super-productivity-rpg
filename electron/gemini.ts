import { app, ipcMain } from 'electron';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { IPC } from './shared-with-frontend/ipc-events.const';
import { error, log } from 'electron-log/main';

const API = 'https://generativelanguage.googleapis.com/v1beta';

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * Gemini calls run here, in the main process, so the API key never reaches
 * the renderer. The key comes from GEMINI_API_KEY in the environment or in a
 * `.env` file (gitignored) - checked in the working dir, in the project root
 * the release build lives in (releases/<app>/../../.env) and in userData.
 */
const envFileCandidates = (): string[] => [
  path.join(process.cwd(), '.env'),
  path.resolve(path.dirname(app.getPath('exe')), '..', '..', '.env'),
  path.join(app.getPath('userData'), '.env'),
];

const readEnvValue = (name: string): string | null => {
  if (process.env[name]) return process.env[name] as string;
  for (const file of envFileCandidates()) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && match[1] === name) return match[2].replace(/^["']|["']$/g, '');
    }
  }
  return null;
};

let cachedModel: string | null = null;

const pickModel = async (key: string): Promise<string> => {
  const configured = readEnvValue('GEMINI_MODEL');
  if (configured)
    return configured.startsWith('models/') ? configured : `models/${configured}`;
  if (cachedModel) return cachedModel;
  const response = await fetch(`${API}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': key },
  });
  if (!response.ok) throw new Error(`Chave do Gemini recusada (${response.status}).`);
  const body = (await response.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  };
  // Cheapest good option: the newest stable numbered "flash-lite" (reads
  // images too); plain "flash" only if no lite model is available.
  const version = (name: string): number => Number(/(\d+(\.\d+)?)/.exec(name)?.[1] ?? 0);
  const stable = (body.models ?? [])
    .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
    .map((model) => model.name)
    .filter(
      (name) =>
        /gemini-\d/.test(name) &&
        /flash/i.test(name) &&
        !/(tts|audio|image|live|exp|preview|thinking|latest)/i.test(name),
    )
    .sort((a, b) => version(b) - version(a) || a.length - b.length);
  const pick = stable.find((name) => /lite/i.test(name)) ?? stable[0];
  if (!pick) throw new Error('Nenhum modelo do Gemini disponível para esta chave.');
  cachedModel = pick;
  return cachedModel;
};

export const generate = async (
  parts: GeminiPart[],
  json: boolean,
): Promise<{ text: string; model: string }> => {
  const key = readEnvValue('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY não encontrada no .env.');
  const model = await pickModel(key);
  const response = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    }),
  });
  if (response.status === 429) {
    throw new Error('Limite de uso do Gemini atingido. Tente mais tarde.');
  }
  if (!response.ok) throw new Error(`Erro do Gemini (${response.status}).`);
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('');
  return { text, model };
};

export const initGeminiIpc = (): void => {
  ipcMain.handle(IPC.GEMINI_STATUS, async () => {
    const key = readEnvValue('GEMINI_API_KEY');
    if (!key)
      return { configured: false, model: null, message: 'Sem GEMINI_API_KEY no .env' };
    try {
      return { configured: true, model: await pickModel(key), message: '' };
    } catch (e) {
      return { configured: false, model: null, message: (e as Error).message };
    }
  });
  ipcMain.handle(
    IPC.GEMINI_GENERATE,
    async (_ev, args: { parts: GeminiPart[]; json?: boolean }) => {
      try {
        return { ok: true, ...(await generate(args.parts, !!args.json)) };
      } catch (e) {
        log('GEMINI_GENERATE failed');
        error(e);
        return { ok: false, text: '', error: (e as Error).message };
      }
    },
  );
};
