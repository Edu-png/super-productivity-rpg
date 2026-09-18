import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RpgProfileService } from './rpg-profile.service';
import { RPG_REALMS } from './rpg-realms.data';
import { CharacterRendererComponent } from './character-renderer.component';

@Component({
  selector: 'rpg-realm-map',
  templateUrl: './rpg-realm-map.component.html',
  styleUrls: ['./rpg-realm-map.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, CharacterRendererComponent],
})
export class RpgRealmMapComponent implements OnDestroy {
  readonly profile = inject(RpgProfileService);
  readonly realms = RPG_REALMS;
  readonly realmMapBackground = "url('./assets/rpg/realms/realms-overworld-v1.png')";
  readonly currentRealm = computed(
    () =>
      this.realms.find((realm) => realm.id === this.profile.state().currentRealmId) ??
      this.realms[0],
  );
  private readonly initialRealm =
    RPG_REALMS.find((realm) => realm.id === this.profile.state().currentRealmId) ??
    RPG_REALMS[0];
  readonly playerX = signal(this.initialRealm.position.x);
  readonly playerY = signal(this.initialRealm.position.y);
  readonly isWalking = signal(false);
  readonly travelMessage = signal('');
  private walkTimer?: number;

  move(event: KeyboardEvent): void {
    const movements: Record<string, [number, number]> = {
      ArrowUp: [0, -3],
      w: [0, -3],
      ArrowDown: [0, 3],
      s: [0, 3],
      ArrowLeft: [-3, 0],
      a: [-3, 0],
      ArrowRight: [3, 0],
      d: [3, 0],
    };
    const movement = movements[event.key];
    if (!movement) return;
    event.preventDefault();
    this._walkTo(this.playerX() + movement[0], this.playerY() + movement[1]);
  }

  moveToClick(event: MouseEvent): void {
    const map = event.currentTarget as HTMLElement;
    const rect = map.getBoundingClientRect();
    this._walkTo(
      ((event.clientX - rect.left) / rect.width) * 100,
      ((event.clientY - rect.top) / rect.height) * 100,
    );
    this.travelMessage.set('');
  }

  visitRealm(event: MouseEvent, realm: (typeof RPG_REALMS)[number]): void {
    event.stopPropagation();
    this._walkTo(realm.position.x, realm.position.y);
    if (this.profile.totalXp() < realm.requiredXp) {
      const missing = realm.requiredXp - this.profile.totalXp();
      this.travelMessage.set(
        `${realm.name} está bloqueado. Faltam ${missing.toLocaleString('pt-BR')} XP.`,
      );
      return;
    }
    this.travelMessage.set(`Viajando para ${realm.name}...`);
    window.setTimeout(() => {
      this.profile.travelToRealm(realm.id);
      this.travelMessage.set(`Agora você está vivendo em ${realm.name}.`);
    }, 520);
  }

  unlockProgress(requiredXp: number): number {
    if (!requiredXp) return 100;
    return Math.min(100, (this.profile.totalXp() / requiredXp) * 100);
  }

  formatXp(value: number): string {
    return value.toLocaleString('pt-BR');
  }

  ngOnDestroy(): void {
    if (this.walkTimer) window.clearTimeout(this.walkTimer);
  }

  private _walkTo(x: number, y: number): void {
    this.playerX.set(Math.max(3, Math.min(97, x)));
    this.playerY.set(Math.max(5, Math.min(95, y)));
    this.isWalking.set(true);
    if (this.walkTimer) window.clearTimeout(this.walkTimer);
    this.walkTimer = window.setTimeout(() => this.isWalking.set(false), 560);
  }
}
