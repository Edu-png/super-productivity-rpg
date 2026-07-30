import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import {
  RPG_CONSTELLATION_CLUSTERS,
  RPG_CONSTELLATIONS,
  RPG_CONSTELLATION_STARS,
} from './rpg-constellations.data';
import { RpgConstellationStar } from './rpg-constellations.model';
import { RpgProfileService } from './rpg-profile.service';

@Component({
  selector: 'rpg-constellation-map',
  imports: [DecimalPipe, MatIcon],
  templateUrl: './rpg-constellation-map.component.html',
  styleUrls: ['./rpg-constellation-map.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RpgConstellationMapComponent {
  readonly profile = inject(RpgProfileService);
  readonly stars = RPG_CONSTELLATION_STARS;
  readonly constellations = RPG_CONSTELLATIONS;
  readonly connections = this.stars.flatMap((star) =>
    star.connections.map((parentId) => ({
      from: this.stars.find((candidate) => candidate.id === parentId)!,
      to: star,
    })),
  );
  readonly zoomLevel = computed(() =>
    this.zoom() < 0.34 ? 'far' : this.zoom() < 0.72 ? 'medium' : 'near',
  );
  readonly regionLabelPositions = Object.fromEntries(
    RPG_CONSTELLATIONS.map((constellation) => {
      if (constellation.id === 'destiny') {
        return [constellation.id, { x: 1600, y: 1200 }];
      }
      const matching = RPG_CONSTELLATION_CLUSTERS.filter(
        (cluster) => cluster.ring === 0 && cluster.region === constellation.id,
      );
      const count = Math.max(1, matching.length);
      return [
        constellation.id,
        {
          x: matching.reduce((sum, cluster) => sum + cluster.center.x, 0) / count,
          y: matching.reduce((sum, cluster) => sum + cluster.center.y, 0) / count,
        },
      ];
    }),
  ) as Record<string, { x: number; y: number }>;
  readonly transform = computed(
    () =>
      `translate(${this.panX()}px, ${this.panY()}px) ` +
      `scale(${this.zoom()}) translate(-1600px, -1200px)`,
  );

  selectedStar: RpgConstellationStar | null = null;
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly zoom = signal(0.42);
  private _dragging = false;
  private _lastPointer = { x: 0, y: 0 };

  constellationColor(star: RpgConstellationStar): string {
    return (
      this.constellations.find((item) => item.id === star.constellation)?.color ??
      '#f4d06f'
    );
  }

  starRank(star: RpgConstellationStar): number {
    return this.profile.starRank(star.id);
  }

  starState(star: RpgConstellationStar): string {
    if (star.id === 'destiny-core' || this.starRank(star) > 0) return 'purchased';
    return this.profile.canUnlockStar(star.id) ? 'available' : 'locked';
  }

  connectionState(
    parent: RpgConstellationStar,
    child?: RpgConstellationStar,
  ): string {
    if (parent.id === 'destiny-core' || this.starRank(parent) > 0) return 'active';
    return child && this.profile.canUnlockStar(child.id) ? 'available' : 'locked';
  }

  connectionPath(connection: {
    from: RpgConstellationStar;
    to: RpgConstellationStar;
  }): string {
    const { from, to } = connection;
    const dx = to.position.x - from.position.x;
    const dy = to.position.y - from.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 155) {
      return `M ${from.position.x} ${from.position.y} L ${to.position.x} ${to.position.y}`;
    }
    const midpointX = (from.position.x + to.position.x) / 2;
    const midpointY = (from.position.y + to.position.y) / 2;
    const hash = [...`${from.id}:${to.id}`].reduce(
      (sum, character) => sum + character.charCodeAt(0),
      0,
    );
    const direction = hash % 2 === 0 ? 1 : -1;
    const bend = Math.min(72, distance * 0.13) * direction;
    const controlX = midpointX + (-dy / distance) * bend;
    const controlY = midpointY + (dx / distance) * bend;
    return `M ${from.position.x} ${from.position.y} Q ${controlX} ${controlY} ${to.position.x} ${to.position.y}`;
  }

  isMainConnection(connection: {
    from: RpgConstellationStar;
    to: RpgConstellationStar;
  }): boolean {
    return (
      ['hub', 'legendary'].includes(connection.from.nodeType ?? '') ||
      ['hub', 'legendary'].includes(connection.to.nodeType ?? '')
    );
  }

  isHybridConnection(connection: {
    from: RpgConstellationStar;
    to: RpgConstellationStar;
  }): boolean {
    return connection.from.constellation !== connection.to.constellation;
  }

  selectStar(star: RpgConstellationStar): void {
    this.selectedStar = star;
  }

  unlock(star: RpgConstellationStar): void {
    this.selectedStar = star;
    this.profile.unlockStar(star.id);
  }

  prerequisiteNames(star: RpgConstellationStar): string {
    if (!star.connections.length) return 'Nenhum';
    return star.connections
      .map((id) => this.stars.find((candidate) => candidate.id === id)?.name ?? id)
      .join(', ');
  }

  effectSummary(star: RpgConstellationStar, nextRank = false): string {
    const rank = Math.min(star.maxLevel, this.starRank(star) + (nextRank ? 1 : 0));
    if (!rank) return 'Nenhum bônus ativo';
    const effects = star.effects;
    const parts: string[] = [];
    if (effects.xp_multiplier) {
      parts.push(`+${Math.round(effects.xp_multiplier * rank * 100)}% XP`);
    }
    if (effects.gold_multiplier) {
      parts.push(`+${Math.round(effects.gold_multiplier * rank * 100)}% ouro`);
    }
    if (effects.luck) parts.push(`+${effects.luck * rank} sorte`);
    if (effects.rare_drop) {
      parts.push(`+${Math.round(effects.rare_drop * rank * 100)}% drop raro`);
    }
    return parts.join(' · ') || star.description;
  }

  onPointerDown(event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('.star-node')) return;
    this._dragging = true;
    this._lastPointer = { x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this._dragging) return;
    this.panX.update((value) => value + event.clientX - this._lastPointer.x);
    this.panY.update((value) => value + event.clientY - this._lastPointer.y);
    this._lastPointer = { x: event.clientX, y: event.clientY };
  }

  onPointerUp(): void {
    this._dragging = false;
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const zoomDelta = event.deltaY * 0.0008;
    this.zoom.update((value) => Math.min(1.4, Math.max(0.18, value - zoomDelta)));
  }

  resetCamera(): void {
    this.panX.set(0);
    this.panY.set(0);
    this.zoom.set(0.42);
  }
}
