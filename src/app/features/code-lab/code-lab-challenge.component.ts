import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { CodeLabRunnerService } from './code-lab-runner.service';
import { outputMatches } from './code-lab-output';
import { CodeLabChallenge, CodeLabRun, CodeLabTestResult } from './code-lab.model';

export interface CodeLabGrade {
  passed: boolean;
  passedCount: number;
  total: number;
  code: string;
}

const DRAFT_PREFIX = 'code-lab-draft:';

const readDraft = (id: string): string | null => {
  try {
    return localStorage.getItem(DRAFT_PREFIX + id);
  } catch {
    return null;
  }
};

const writeDraft = (id: string, code: string): void => {
  try {
    localStorage.setItem(DRAFT_PREFIX + id, code);
  } catch {
    // Drafts are a convenience; without storage the code just isn't kept.
  }
};

/**
 * Interview-style coding exercise: statement, editor, "Executar" (shows the
 * program's output) and "Testar" (runs every test case and shows passed /
 * failed, expected × obtained). The code draft is kept per challenge.
 */
@Component({
  selector: 'code-lab-challenge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon],
  template: `
    @let ch = challenge();
    <div class="lab">
      <p class="prompt">{{ ch.prompt }}</p>
      <div class="editor-head">
        <span class="lang">{{
          ch.language === 'python' ? 'Python' : 'SQL (SQLite)'
        }}</span>
        <button
          type="button"
          class="link"
          title="Voltar ao código inicial"
          [disabled]="locked()"
          (click)="reset()"
        >
          <mat-icon>restart_alt</mat-icon> Código inicial
        </button>
      </div>
      <textarea
        class="editor"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        [rows]="editorRows()"
        [value]="code()"
        [readOnly]="locked()"
        (input)="setCode($any($event.target).value)"
        (keydown)="onKey($event)"
      ></textarea>
      @if (ch.language === 'python') {
        <details class="stdin">
          <summary>Entrada (stdin) para o Executar</summary>
          <textarea
            rows="3"
            spellcheck="false"
            placeholder="Uma linha por input()"
            [value]="stdin()"
            (input)="stdin.set($any($event.target).value)"
          ></textarea>
        </details>
      }
      <div class="actions">
        <button
          type="button"
          class="run"
          [disabled]="!!busy()"
          (click)="run()"
        >
          <mat-icon>play_arrow</mat-icon> Executar
        </button>
        <button
          type="button"
          class="test"
          [disabled]="!!busy() || locked()"
          title="Ctrl+Enter"
          (click)="test()"
        >
          <mat-icon>fact_check</mat-icon> Testar
        </button>
        @if (busy()) {
          <span class="hint">{{
            firstRun() ? 'Carregando o interpretador (só na 1ª vez)…' : 'Executando…'
          }}</span>
        }
      </div>

      @if (consoleRun(); as run) {
        <div class="console">
          <span class="console-title">Output</span>
          @if (run.columns?.length) {
            <pre class="columns">{{ run.columns!.join(' | ') }}</pre>
          }
          @if (run.output) {
            <pre>{{ run.output }}</pre>
          } @else if (!run.error) {
            <pre class="muted">(sem saída)</pre>
          }
          @if (run.error) {
            <pre class="error">{{ run.error }}</pre>
          }
        </div>
      }

      @if (results(); as list) {
        <div
          class="verdict"
          [class.ok]="allPassed()"
        >
          <mat-icon>{{ allPassed() ? 'verified' : 'cancel' }}</mat-icon>
          {{ allPassed() ? 'Passou!' : 'Não passou' }} · {{ passedCount() }}/{{
            list.length
          }}
          testes
        </div>
        <ul class="tests">
          @for (result of list; track $index) {
            <li [class.ok]="result.passed">
              <div class="test-name">
                <mat-icon>{{
                  result.passed ? 'check_circle' : 'highlight_off'
                }}</mat-icon>
                {{ result.test.name }}
                @if (result.test.hidden) {
                  <small>(oculto)</small>
                }
              </div>
              @if (!result.passed && !result.test.hidden) {
                <div class="diff">
                  @if (result.test.stdin) {
                    <span>Entrada</span>
                    <pre>{{ result.test.stdin }}</pre>
                  }
                  <span>Esperado</span>
                  <pre>{{ result.test.expected }}</pre>
                  <span>Obtido</span>
                  <pre>{{ result.output || '(sem saída)' }}</pre>
                  @if (result.error) {
                    <span>Erro</span>
                    <pre class="error">{{ result.error }}</pre>
                  }
                </div>
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .lab {
      display: grid;
      gap: 8px;
      padding: 12px;
      border: 1px solid #3f3b56;
      border-radius: 6px;
      background: #14131f;
      color: #f1edf9;
      font-size: 14px;
    }
    .prompt {
      margin: 0;
      white-space: pre-wrap;
      line-height: 1.5;
    }
    .editor-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .lang {
      color: #b99cff;
      font: 11px monospace;
      text-transform: uppercase;
    }
    button {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border: 1px solid #4b4668;
      border-radius: 4px;
      background: #1f1d2e;
      color: #f1edf9;
      font: inherit;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    button mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .link {
      padding: 2px 6px;
      border-color: transparent;
      background: none;
      color: #c9c0df;
      font-size: 12px;
    }
    .run {
      border-color: #3f7cff;
    }
    .test {
      border-color: #2fae6b;
      background: #173326;
    }
    textarea {
      box-sizing: border-box;
      width: 100%;
      padding: 10px;
      border: 1px solid #3f3b56;
      border-radius: 4px;
      background: #0d0c15;
      color: #e8e4f5;
      font:
        13px/1.5 'Fira Code',
        Consolas,
        monospace;
      tab-size: 4;
      resize: vertical;
    }
    .stdin summary {
      color: #c9c0df;
      font-size: 12px;
      cursor: pointer;
    }
    .stdin textarea {
      margin-top: 6px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .hint {
      color: #9d98ae;
      font-size: 12px;
    }
    .console {
      border: 1px solid #2c2a3d;
      border-radius: 4px;
      background: #0d0c15;
    }
    .console-title {
      display: block;
      padding: 4px 10px;
      border-bottom: 1px solid #2c2a3d;
      color: #9d98ae;
      font-size: 11px;
      text-transform: uppercase;
    }
    pre {
      margin: 0;
      padding: 8px 10px;
      overflow-x: auto;
      color: #e8e4f5;
      font:
        12px/1.5 Consolas,
        monospace;
      white-space: pre;
    }
    pre.columns {
      padding-bottom: 0;
      color: #b99cff;
    }
    pre.muted {
      color: #6f6a85;
    }
    pre.error {
      color: #ff8f9b;
    }
    .verdict {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      border-radius: 4px;
      background: #3a1820;
      color: #ff8f9b;
      font-weight: 700;
    }
    .verdict.ok {
      background: #173326;
      color: #6bd68f;
    }
    .tests {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tests li {
      border: 1px solid #5a2a35;
      border-radius: 4px;
    }
    .tests li.ok {
      border-color: #24543b;
    }
    .test-name {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      color: #ff8f9b;
    }
    li.ok .test-name {
      color: #6bd68f;
    }
    .test-name mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .test-name small {
      color: #9d98ae;
    }
    .diff {
      display: grid;
      padding: 0 10px 8px;
    }
    .diff span {
      margin-top: 4px;
      color: #9d98ae;
      font-size: 11px;
      text-transform: uppercase;
    }
    .diff pre {
      border-radius: 4px;
      background: #0d0c15;
    }
  `,
})
export class CodeLabChallengeComponent {
  readonly challenge = input.required<CodeLabChallenge>();
  /** After a quiz is submitted the code is frozen (Executar still works). */
  readonly locked = input(false);
  readonly graded = output<CodeLabGrade>();

  private readonly _runner = inject(CodeLabRunnerService);
  private static _warm = new Set<string>();

  readonly code = signal('');
  readonly stdin = signal('');
  readonly busy = signal<'run' | 'test' | null>(null);
  readonly consoleRun = signal<(CodeLabRun & { columns?: string[] }) | null>(null);
  readonly results = signal<CodeLabTestResult[] | null>(null);
  readonly firstRun = signal(false);

  readonly passedCount = computed(
    () => (this.results() ?? []).filter((result) => result.passed).length,
  );
  readonly allPassed = computed(() => {
    const results = this.results();
    return !!results?.length && results.every((result) => result.passed);
  });
  readonly editorRows = computed(() =>
    Math.min(24, Math.max(6, this.code().split('\n').length + 1)),
  );

  constructor() {
    effect(() => {
      const challenge = this.challenge();
      untracked(() => {
        this.code.set(readDraft(challenge.id) ?? challenge.starterCode);
        this.consoleRun.set(null);
        this.results.set(null);
      });
    });
  }

  setCode(code: string): void {
    this.code.set(code);
    writeDraft(this.challenge().id, code);
  }

  reset(): void {
    this.setCode(this.challenge().starterCode);
  }

  /** Tab indents instead of leaving the editor; Ctrl+Enter runs the tests. */
  onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void this.test();
      return;
    }
    if (event.key !== 'Tab' || this.locked()) return;
    event.preventDefault();
    const area = event.target as HTMLTextAreaElement;
    const { selectionStart, selectionEnd, value } = area;
    const next = `${value.slice(0, selectionStart)}    ${value.slice(selectionEnd)}`;
    this.setCode(next);
    area.value = next;
    area.selectionStart = area.selectionEnd = selectionStart + 4;
  }

  async run(): Promise<void> {
    const challenge = this.challenge();
    this.busy.set('run');
    this.firstRun.set(!CodeLabChallengeComponent._warm.has(challenge.language));
    try {
      const run = await this._runner.run(challenge.language, this.code(), {
        stdin: this.stdin(),
        setup: challenge.setup,
      });
      this.consoleRun.set(run);
    } finally {
      CodeLabChallengeComponent._warm.add(challenge.language);
      this.busy.set(null);
    }
  }

  async test(): Promise<void> {
    const challenge = this.challenge();
    if (this.busy() || this.locked()) return;
    this.busy.set('test');
    this.firstRun.set(!CodeLabChallengeComponent._warm.has(challenge.language));
    try {
      const code = this.code();
      const results: CodeLabTestResult[] = [];
      for (const test of challenge.tests) {
        const run = await this._runner.run(challenge.language, code, {
          stdin: test.stdin,
          setup: challenge.setup,
          after: test.after,
        });
        const ordered = challenge.language === 'python' || !!challenge.ordered;
        results.push({
          test,
          passed: !run.error && outputMatches(run.output, test.expected, ordered),
          output: run.output,
          error: run.error,
        });
      }
      this.results.set(results);
      const passedCount = results.filter((result) => result.passed).length;
      this.graded.emit({
        passed: passedCount === results.length,
        passedCount,
        total: results.length,
        code,
      });
    } finally {
      CodeLabChallengeComponent._warm.add(challenge.language);
      this.busy.set(null);
    }
  }
}
