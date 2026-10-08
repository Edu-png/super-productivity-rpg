import { Injectable, signal } from '@angular/core';
import { IS_ELECTRON } from '../../app.constants';
import { parseModelJson } from './parse-model-json';

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * Gemini access for the UI. The calls (and the API key, read from
 * GEMINI_API_KEY in the project's gitignored `.env`) live in the Electron
 * main process - see electron/gemini.ts. Desktop only.
 */
@Injectable({ providedIn: 'root' })
export class GeminiService {
  readonly configured = signal(false);
  readonly model = signal<string | null>(null);
  readonly statusMessage = signal('');

  constructor() {
    void this.refreshStatus();
  }

  async refreshStatus(): Promise<void> {
    if (!IS_ELECTRON) {
      this.statusMessage.set('IA disponível só na versão desktop.');
      return;
    }
    const status = await window.ea.geminiStatus();
    this.configured.set(status.configured);
    this.model.set(status.model);
    this.statusMessage.set(status.message);
  }

  /** One request; throws with a readable message on failure. */
  async generate(
    parts: GeminiPart[],
    options: { json?: boolean; search?: boolean } = {},
  ): Promise<string> {
    if (!IS_ELECTRON) throw new Error('IA disponível só na versão desktop.');
    const result = await window.ea.geminiGenerate({
      parts,
      json: options.json,
      search: options.search,
    });
    if (!result.ok) throw new Error(result.error ?? 'Erro do Gemini.');
    return result.text;
  }

  /** generate() with a JSON response, parsed. */
  async generateJson<T>(
    parts: GeminiPart[],
    options: { search?: boolean } = {},
  ): Promise<T> {
    const text = await this.generate(parts, { json: true, search: options.search });
    return parseModelJson<T>(text);
  }
}
