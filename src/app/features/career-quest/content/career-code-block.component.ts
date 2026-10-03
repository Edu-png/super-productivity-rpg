import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { CareerCodeLanguage } from '../career-quest.model';
import { highlightCode } from './career-code-highlight';

/**
 * Code block for quest content: monospace, exact indentation and line breaks,
 * horizontal scroll, language label, copy button and light highlighting.
 * Code is always rendered as text - never executed or parsed as HTML.
 */
@Component({
  selector: 'career-code-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon],
  template: `
    <figure class="code-block">
      <figcaption>
        <span class="lang">{{ title() || language() }}</span>
        <button
          type="button"
          class="copy"
          [attr.aria-label]="'Copiar código ' + language()"
          (click)="copy()"
        >
          <mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
          {{ copied() ? 'Copiado' : 'Copiar' }}
        </button>
      </figcaption>
      <pre><code>@for (token of tokens(); track $index) {<span [class]="'tok-' + token.kind">{{ token.text }}</span>}</code></pre>
    </figure>
  `,
  styles: `
    :host {
      display: block;
    }
    .code-block {
      margin: 8px 0;
      overflow: hidden;
      border: 1px solid #3f3b56;
      border-radius: 6px;
      background: #11101b;
    }
    figcaption {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 6px 4px 12px;
      border-bottom: 1px solid #2c2a3d;
      background: #1a1928;
    }
    .lang {
      color: #b99cff;
      font: 11px monospace;
      text-transform: uppercase;
    }
    .copy {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      padding: 3px 8px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      color: #aaa3c2;
      font-size: 12px;
      cursor: pointer;
    }
    .copy:hover {
      border-color: #f6c453;
      color: #f1edf9;
    }
    .copy mat-icon {
      width: 15px;
      height: 15px;
      font-size: 15px;
    }
    pre {
      margin: 0;
      padding: 12px 14px;
      overflow-x: auto;
      color: #e8e4f4;
      font:
        13px/1.55 'JetBrains Mono',
        Consolas,
        'Courier New',
        monospace;
      tab-size: 4;
      white-space: pre;
    }
    .tok-keyword {
      color: #c792ea;
    }
    .tok-string {
      color: #c3e88d;
    }
    .tok-comment {
      color: #7f7a96;
      font-style: italic;
    }
    .tok-number {
      color: #f78c6c;
    }
  `,
})
export class CareerCodeBlockComponent {
  readonly code = input.required<string>();
  readonly language = input<CareerCodeLanguage>('text');
  readonly title = input<string | undefined>(undefined);
  readonly copied = signal(false);
  readonly tokens = computed(() => highlightCode(this.code(), this.language()));

  copy(): void {
    void navigator.clipboard?.writeText(this.code()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }
}
