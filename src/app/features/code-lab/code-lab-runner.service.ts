import { Injectable } from '@angular/core';
import { CodeLabLanguage, CodeLabRun } from './code-lab.model';
import { formatSqlRows } from './code-lab-output';
import { PYTHON_WORKER, SQL_WORKER } from './code-lab-workers';

/** First load downloads the interpreter (~10 MB for Python), so it gets its own budget. */
const LOAD_TIMEOUT_MS = 120_000;
const RUN_TIMEOUT_MS = 10_000;

interface WorkerSlot {
  worker: Worker;
  ready: Promise<void>;
}

interface WorkerResult {
  id: number;
  output?: string;
  rows?: unknown[][];
  columns?: string[];
  error: string | null;
}

/**
 * Runs player code off the main thread: Python on Pyodide, SQL on sql.js
 * (SQLite), both loaded from a CDN on first use. A run that exceeds the time
 * limit (infinite loop) kills its worker; the next run starts a fresh one.
 */
@Injectable({ providedIn: 'root' })
export class CodeLabRunnerService {
  private readonly _slots = new Map<CodeLabLanguage, WorkerSlot>();
  private readonly _queues = new Map<CodeLabLanguage, Promise<unknown>>();
  private _nextId = 1;

  run(
    language: CodeLabLanguage,
    code: string,
    options: { stdin?: string; setup?: string; after?: string } = {},
  ): Promise<CodeLabRun & { columns?: string[] }> {
    // One run at a time per language - they share the interpreter's stdout.
    const previous = this._queues.get(language) ?? Promise.resolve();
    const next = previous.then(
      () => this._runNow(language, code, options),
      () => this._runNow(language, code, options),
    );
    this._queues.set(language, next);
    return next;
  }

  private async _runNow(
    language: CodeLabLanguage,
    code: string,
    options: { stdin?: string; setup?: string; after?: string },
  ): Promise<CodeLabRun & { columns?: string[] }> {
    let slot: WorkerSlot;
    try {
      slot = this._slot(language);
      await slot.ready;
    } catch (e) {
      this._kill(language);
      return { output: '', error: (e as Error).message, timedOut: false };
    }
    const id = this._nextId++;
    return new Promise((resolve) => {
      const expire = (message: string): void => {
        slot.worker.removeEventListener('message', onMessage);
        this._kill(language);
        resolve({ output: '', error: message, timedOut: true });
      };
      // Downloading imported packages gets the load budget; the run limit
      // only starts once the worker says the code itself is running.
      let timer = setTimeout(
        () => expire('Não consegui baixar as bibliotecas importadas (sem internet?).'),
        LOAD_TIMEOUT_MS,
      );
      const onMessage = (event: MessageEvent): void => {
        const data = event.data as WorkerResult & { type: string };
        if (data.id !== id) return;
        if (data.type === 'running') {
          clearTimeout(timer);
          timer = setTimeout(
            () =>
              expire(
                `Tempo limite de ${RUN_TIMEOUT_MS / 1000}s excedido (loop infinito?).`,
              ),
            RUN_TIMEOUT_MS,
          );
          return;
        }
        if (data.type !== 'result') return;
        clearTimeout(timer);
        slot.worker.removeEventListener('message', onMessage);
        resolve({
          output: data.rows ? formatSqlRows(data.rows) : (data.output ?? ''),
          columns: data.columns,
          error: data.error,
          timedOut: false,
        });
      };
      slot.worker.addEventListener('message', onMessage);
      slot.worker.postMessage({ id, code, ...options });
    });
  }

  private _slot(language: CodeLabLanguage): WorkerSlot {
    const existing = this._slots.get(language);
    if (existing) return existing;
    const source = language === 'python' ? PYTHON_WORKER : SQL_WORKER;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(url);
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Não consegui carregar o interpretador (sem internet?).')),
        LOAD_TIMEOUT_MS,
      );
      worker.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as { type: string; error?: string };
        if (data.type !== 'ready') return;
        clearTimeout(timer);
        if (data.error)
          reject(new Error(`Falha ao carregar o interpretador: ${data.error}`));
        else resolve();
      });
      worker.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Não consegui carregar o interpretador (sem internet?).'));
      });
    });
    const slot = { worker, ready };
    this._slots.set(language, slot);
    return slot;
  }

  private _kill(language: CodeLabLanguage): void {
    this._slots.get(language)?.worker.terminate();
    this._slots.delete(language);
  }
}
