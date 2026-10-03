import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { CareerContent, CareerContentBlock } from '../career-quest.model';
import { CareerCodeBlockComponent } from './career-code-block.component';

/**
 * Renders quest content. Structured content → blocks (sections become
 * collapsibles, first two open); a legacy plain string → paragraphs with its
 * line breaks preserved. Everything is interpolated text (Angular escapes it),
 * so content can never inject HTML.
 */
@Component({
  selector: 'career-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, MatIcon, CareerCodeBlockComponent],
  template: `
    @if (legacyText(); as text) {
      <p class="legacy">{{ text }}</p>
    } @else if (content(); as body) {
      @if (body.sections?.length) {
        @for (section of body.sections; track $index) {
          <details
            class="section"
            [open]="$index < 2"
          >
            <summary>{{ section.title }}</summary>
            <div class="section-body">
              <ng-container
                [ngTemplateOutlet]="blockList"
                [ngTemplateOutletContext]="{ $implicit: section.blocks }"
              />
            </div>
          </details>
        }
      }
      @if (body.blocks?.length) {
        <ng-container
          [ngTemplateOutlet]="blockList"
          [ngTemplateOutletContext]="{ $implicit: body.blocks }"
        />
      }
    }

    <ng-template
      #blockList
      let-blocks
    >
      @for (block of asBlocks(blocks); track $index) {
        @switch (block.type) {
          @case ('heading') {
            <h4>{{ block.text }}</h4>
          }
          @case ('paragraph') {
            <p>{{ block.text }}</p>
          }
          @case ('list') {
            @if (block.ordered) {
              <ol>
                @for (item of block.items; track $index) {
                  <li>{{ item }}</li>
                }
              </ol>
            } @else {
              <ul>
                @for (item of block.items; track $index) {
                  <li>{{ item }}</li>
                }
              </ul>
            }
          }
          @case ('code') {
            <career-code-block
              [code]="block.code"
              [language]="block.language"
              [title]="block.title"
            />
          }
          @case ('callout') {
            <div [class]="'callout ' + block.tone">
              <mat-icon>{{
                block.tone === 'warning'
                  ? 'warning'
                  : block.tone === 'tip'
                    ? 'lightbulb'
                    : 'info'
              }}</mat-icon>
              <span>{{ block.text }}</span>
            </div>
          }
          @case ('divider') {
            <hr />
          }
          @case ('quote') {
            <blockquote>{{ block.text }}</blockquote>
          }
        }
      }
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
      color: #f1edf9;
      font-size: 14px;
      line-height: 1.55;
    }
    .legacy {
      margin: 0;
      white-space: pre-wrap;
    }
    .section {
      margin: 6px 0;
      border: 1px solid #3f3b56;
      border-radius: 4px;
      background: #1a1928;
    }
    .section summary {
      padding: 8px 12px;
      color: #ffe39b;
      font-weight: 700;
      cursor: pointer;
    }
    .section-body {
      padding: 0 14px 10px;
    }
    h4 {
      margin: 12px 0 4px;
      color: #f6c453;
      font-size: 13px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    p {
      margin: 6px 0;
    }
    ul,
    ol {
      margin: 6px 0;
      padding-left: 22px;
    }
    li {
      margin: 2px 0;
    }
    hr {
      margin: 12px 0;
      border: 0;
      border-top: 1px solid #3f3b56;
    }
    blockquote {
      margin: 8px 0;
      padding: 6px 12px;
      border-left: 3px solid #b99cff;
      color: #c9c0df;
      font-style: italic;
    }
    .callout {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin: 8px 0;
      padding: 8px 12px;
      border-left: 3px solid;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.04);
    }
    .callout mat-icon {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .callout.info {
      border-color: #8fb8ff;
    }
    .callout.info mat-icon {
      color: #8fb8ff;
    }
    .callout.warning {
      border-color: #ef6675;
    }
    .callout.warning mat-icon {
      color: #ef6675;
    }
    .callout.tip {
      border-color: #52df9d;
    }
    .callout.tip mat-icon {
      color: #52df9d;
    }
  `,
})
export class CareerContentComponent {
  /** Structured content, or a legacy plain-text description. */
  readonly source = input<CareerContent | string | null | undefined>(null);

  readonly legacyText = computed(() => {
    const source = this.source();
    return typeof source === 'string' ? source : null;
  });
  readonly content = computed(() => {
    const source = this.source();
    return source && typeof source !== 'string' ? source : null;
  });

  asBlocks(blocks: unknown): CareerContentBlock[] {
    return blocks as CareerContentBlock[];
  }
}
