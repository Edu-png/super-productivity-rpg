import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { CharacterRendererComponent } from './character-renderer.component';
import { RpgItem, RpgItemSlot } from './rpg-profile.model';
import { RpgProfileService } from './rpg-profile.service';
import { RPG_INVENTORY_CAPACITY } from './rpg-profile.service';

@Component({
  selector: 'rpg-inventory-panel',
  templateUrl: './inventory-panel.component.html',
  styleUrls: ['./inventory-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIcon, CharacterRendererComponent],
})
export class InventoryPanelComponent {
  readonly profile = inject(RpgProfileService);
  readonly draggedItemId = signal<string | null>(null);
  readonly draggedFromSlot = signal<RpgItemSlot | null>(null);
  readonly selectedItemIds = signal<string[]>([]);
  readonly message = signal('');
  readonly capacity = RPG_INVENTORY_CAPACITY;
  readonly slots: { id: RpgItemSlot; label: string; imageUrl: string }[] = [
    { id: 'head', label: 'Cabeça', imageUrl: 'assets/rpg/items-pack/item-0-6.png' },
    { id: 'neck', label: 'Pescoço', imageUrl: 'assets/rpg/items-pack/item-6-2.png' },
    { id: 'chest', label: 'Peitoral', imageUrl: 'assets/rpg/items-pack/item-0-7.png' },
    { id: 'hands', label: 'Mãos', imageUrl: 'assets/rpg/items-pack/item-2-5.png' },
    { id: 'mainHand', label: 'Arma principal', imageUrl: 'assets/rpg/items-pack/item-4-7.png' },
    { id: 'offHand', label: 'Escudo / segunda arma', imageUrl: 'assets/rpg/items-pack/item-0-4.png' },
    { id: 'ringLeft', label: 'Anel esquerdo', imageUrl: 'assets/rpg/items/ring-of-power.png' },
    { id: 'ringRight', label: 'Anel direito', imageUrl: 'assets/rpg/items/ring-of-power.png' },
    { id: 'boots', label: 'Botas', imageUrl: 'assets/rpg/items-pack/item-1-7.png' },
    { id: 'companion', label: 'Companheiro', imageUrl: 'assets/rpg/items-pack/item-0-2.png' },
    { id: 'pet', label: 'Mascote', imageUrl: 'assets/rpg/pets/mysterious-egg.png' },
    { id: 'relic', label: 'Relíquia', imageUrl: 'assets/rpg/items-pack/item-0-3.png' },
  ];
  readonly backpack = computed(() =>
    this.profile
      .state()
      .inventory.filter((item) => !this.profile.isItemEquipped(item.id)),
  );
  readonly emptySlots = computed(() =>
    Array.from(
      {
        length: Math.max(
          0,
          this.capacity - this.backpack().length,
        ),
      },
      (_, index) => index,
    ),
  );
  readonly overflowItem = computed(
    () => this.profile.state().overflowItems[0] ?? null,
  );
  readonly equipmentStats = computed(() => {
    const stats = this.profile.equipmentBonuses();
    return [
      { icon: 'swords', label: 'Poder', value: `${stats.power}` },
      { icon: 'psychology', label: 'Inteligência', value: `${stats.intelligence}` },
      { icon: 'casino', label: 'Sorte', value: `${stats.luck}` },
      {
        icon: 'auto_awesome',
        label: 'Bônus de XP',
        value: `+${Math.round(stats.xpMultiplier * 1000) / 10}%`,
      },
      {
        icon: 'paid',
        label: 'Bônus de ouro',
        value: `+${Math.round(stats.goldMultiplier * 1000) / 10}%`,
      },
      {
        icon: 'diamond',
        label: 'Drop raro',
        value: `+${Math.round(stats.rareDrop * 1000) / 10}%`,
      },
    ];
  });
  readonly selectedItems = computed(() =>
    this.selectedItemIds()
      .map((id) => this.profile.state().inventory.find((item) => item.id === id))
      .filter((item): item is RpgItem => !!item),
  );

  beginInventoryDrag(event: DragEvent, item: RpgItem): void {
    this._stop(event);
    if (!this.profile.canUseItem(item)) {
      event.preventDefault();
      this.message.set(this.itemRestriction(item));
      return;
    }
    this.draggedItemId.set(item.id);
    this.draggedFromSlot.set(null);
    event.dataTransfer?.setData('text/plain', item.id);
  }

  beginSlotDrag(event: DragEvent, slot: RpgItemSlot): void {
    this._stop(event);
    const item = this.profile.equippedItem(slot);
    if (!item) return;
    this.draggedItemId.set(item.id);
    this.draggedFromSlot.set(slot);
    event.dataTransfer?.setData('text/plain', item.id);
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  dropOnSlot(event: DragEvent, slot: RpgItemSlot): void {
    this.allowDrop(event);
    const itemId = this.draggedItemId() ?? event.dataTransfer?.getData('text/plain');
    if (!itemId) return;
    if (!this.profile.equipItem(itemId, slot)) {
      this.message.set('Este item não é compatível com esse slot.');
    } else {
      this.message.set('Item equipado.');
    }
    this.endDrag(event);
  }

  dropInBackpack(event: DragEvent): void {
    this.allowDrop(event);
    const slot = this.draggedFromSlot();
    if (slot) {
      this.profile.unequipSlot(slot);
      this.message.set('Item devolvido à mochila.');
    }
    this.endDrag(event);
  }

  equipByClick(event: MouseEvent, item: RpgItem): void {
    this._stop(event);
    if (!this.profile.equipItem(item.id)) {
      this.message.set(
        this.profile.canUseItem(item)
          ? 'Não foi possível equipar este item.'
          : this.itemRestriction(item),
      );
    } else {
      this.message.set('Item equipado.');
    }
  }

  toggleSelection(event: MouseEvent, item: RpgItem): void {
    this._stop(event);
    const selected = this.selectedItemIds();
    this.selectedItemIds.set(
      selected.includes(item.id)
        ? selected.filter((id) => id !== item.id)
        : [...selected, item.id],
    );
  }

  sellSelected(event: MouseEvent): void {
    this._stop(event);
    const item = this.selectedItems()[0];
    if (!item) return;
    const result = this.profile.sellItem(item.id);
    this.message.set(result.message);
    if (result.ok) this.selectedItemIds.set([]);
  }

  upgradeSelected(event: MouseEvent): void {
    this._stop(event);
    const item = this.selectedItems()[0];
    if (!item) return;
    this.message.set(this.profile.upgradeItem(item.id).message);
  }

  fuseSelected(event: MouseEvent): void {
    this._stop(event);
    const result = this.profile.fuseItems(this.selectedItemIds());
    this.message.set(result.message);
    if (result.ok) this.selectedItemIds.set(result.itemId ? [result.itemId] : []);
  }

  clearSelection(event: MouseEvent): void {
    this._stop(event);
    this.selectedItemIds.set([]);
  }

  replaceWithOverflow(event: MouseEvent, itemId: string): void {
    this._stop(event);
    this.message.set(this.profile.resolveOverflowByReplacing(itemId).message);
  }

  sellOverflow(event: MouseEvent): void {
    this._stop(event);
    this.message.set(this.profile.sellOverflowItem().message);
  }

  itemRestriction(item: RpgItem): string {
    if (item.requiredClass && item.requiredClass !== this.profile.state().classId) {
      return `Bloqueado: exclusivo da classe ${item.requiredClass}.`;
    }
    if (item.requiredLevel && item.requiredLevel > this.profile.level()) {
      return `Bloqueado: requer nível ${item.requiredLevel}.`;
    }
    return '';
  }

  unequipByClick(event: MouseEvent, slot: RpgItemSlot): void {
    this._stop(event);
    this.profile.unequipSlot(slot);
  }

  slotState(slot: RpgItemSlot): 'compatible' | 'incompatible' | null {
    const itemId = this.draggedItemId();
    if (!itemId) return null;
    const item = this.profile
      .state()
      .inventory.find((candidate) => candidate.id === itemId);
    return item && this.profile.canEquipItem(item, slot) ? 'compatible' : 'incompatible';
  }

  itemTooltip(item: RpgItem): string {
    const bonuses = this.profile.itemBonuses(item);
    return [
      item.name,
      `Raridade: ${item.rarity}`,
      item.description ?? 'Equipamento de produtividade.',
      `Poder: +${bonuses.power}`,
      `Inteligência: +${bonuses.intelligence}`,
      `Sorte: +${bonuses.luck}`,
      `XP: +${Math.round(bonuses.xpMultiplier * 1000) / 10}%`,
      `Ouro: +${Math.round(bonuses.goldMultiplier * 1000) / 10}%`,
      `Drop raro: +${Math.round(bonuses.rareDrop * 1000) / 10}%`,
      `Peso: ${item.weight ?? 0}`,
      `Valor: ${item.value ?? 0}`,
      `Classe: ${item.requiredClass ?? 'Qualquer'}`,
      `Nível: ${item.requiredLevel ?? 1}`,
      `Aprimoramento: +${item.upgradeLevel ?? 0}`,
      this.profile.canUseItem(item)
        ? 'Disponível para equipar'
        : this.itemRestriction(item),
    ].join('\n');
  }

  endDrag(event?: Event): void {
    if (event) this._stop(event);
    this.draggedItemId.set(null);
    this.draggedFromSlot.set(null);
  }

  private _stop(event: Event): void {
    event.stopPropagation();
  }
}
