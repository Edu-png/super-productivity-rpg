import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  Excalidraw,
  exportToBlob,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import { ExcalidrawDrawing } from '../domain/academy.models';

@Component({
  selector: 'academy-excalidraw',
  standalone: true,
  template: '<div #host class="excalidraw-host"></div>',
  styles: `
    :host, .excalidraw-host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 560px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcademyExcalidrawComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
  @Input() drawing: ExcalidrawDrawing | null = null;
  @Output() drawingChange = new EventEmitter<ExcalidrawDrawing>();

  private root: Root | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private latest:
    | {
        elements: readonly unknown[];
        appState: Record<string, unknown>;
        files: Record<string, unknown>;
      }
    | undefined;

  ngAfterViewInit(): void {
    this.root = createRoot(this.host.nativeElement);
    this.root.render(
      React.createElement(Excalidraw, {
        initialData: this.drawing
          ? {
              elements: this.drawing.elements as never[],
              appState: this.drawing.appState,
              files: this.drawing.files as never,
            }
          : {
              appState: {
                theme: 'dark',
                viewBackgroundColor: '#0d1020',
              },
            },
        theme: 'dark',
        UIOptions: {
          canvasActions: {
            loadScene: false,
          },
        },
        onChange: (elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
          this.latest = { elements, appState, files };
          if (this.saveTimer) clearTimeout(this.saveTimer);
          this.saveTimer = setTimeout(() => {
            void this.emitDrawing(elements, appState, files);
          }, 600);
        },
      } as never),
    );
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.root?.unmount();
  }

  async flush(): Promise<void> {
    if (!this.latest) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.emitDrawing(
      this.latest.elements,
      this.latest.appState,
      this.latest.files,
    );
  }

  private async emitDrawing(
    elements: readonly unknown[],
    appState: Record<string, unknown>,
    files: Record<string, unknown>,
  ): Promise<void> {
    const safeElements = JSON.parse(
      serializeAsJSON(elements as never, appState as never, files as never, 'local'),
    ).elements as unknown[];
    const safeFiles = JSON.parse(JSON.stringify(files)) as Record<string, unknown>;
    let previewDataUrl: string | null = this.drawing?.previewDataUrl ?? null;

    if (safeElements.length) {
      const blob = await exportToBlob({
        elements: elements as never,
        appState: {
          ...appState,
          exportBackground: true,
          exportWithDarkMode: true,
          viewBackgroundColor:
            (appState['viewBackgroundColor'] as string | undefined) ?? '#0d1020',
        } as never,
        files: files as never,
        mimeType: 'image/png',
        getDimensions: (width, height) => {
          const scale = Math.min(1, 1000 / Math.max(width, height));
          return {
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale)),
            scale,
          };
        },
      });
      previewDataUrl = await this.blobToDataUrl(blob);
    } else {
      previewDataUrl = null;
    }

    if (this.destroyed) return;
    this.drawingChange.emit({
      version: 1,
      ownerNodeId: this.drawing?.ownerNodeId ?? '',
      elements: safeElements,
      appState: {
        viewBackgroundColor: appState['viewBackgroundColor'] as string | undefined,
        gridSize: appState['gridSize'] as number | null | undefined,
        theme: (appState['theme'] as 'light' | 'dark' | undefined) ?? 'dark',
      },
      files: safeFiles,
      previewDataUrl,
      updatedAt: Date.now(),
    });
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
}
