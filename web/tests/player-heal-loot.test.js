import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities.js';
import { SHOP_ITEMS } from '../src/profile.js';
import { RAID_LOOT_VALUE_MULT as LOOT_MULT } from '../src/weapons.js';

describe('player heal and loot', () => {
  it('bandage heals over 1 second not instantly', () => {
    const p = new Player(100, 100, []);
    p.hotbar[0] = { id: 'bandage', name: 'Бинт', heal: 20, healDuration: 1, consumable: true };
    p.selectedSlot = 0;
    p.hp = 50;

    const start = p.useSelectedHeal();
    expect(start.ok).toBe(true);
    expect(p.hp).toBe(50);
    expect(p.activeHeal).toBeTruthy();

    p.tickHeal(0.5);
    expect(p.hp).toBe(60);

    p.tickHeal(0.5);
    expect(p.hp).toBe(70);
    expect(p.activeHeal).toBeNull();
  });

  it('addLoot multiplies value by 5, ammo unchanged', () => {
    const p = new Player(100, 100, []);
    const coin = p.addLoot({ id: 'coin', name: 'Монета', value: 1, uid: 'c1' });
    expect(coin.ok).toBe(true);
    const coinItem = [...p.hotbar, ...p.backpack].find((i) => i?.id === 'coin');
    expect(coinItem?.value).toBe(1 * LOOT_MULT);

    const ammo = p.addLoot({ id: 'ammo', name: 'Патроны', ammo: 18, uid: 'a1' });
    expect(ammo.ok).toBe(true);
    const ammoItem = [...p.hotbar, ...p.backpack].find((i) => i?.ammo);
    expect(ammoItem?.ammo).toBe(18);
  });

  it('shop has bandage 20 and medkit 75', () => {
    const bandage = SHOP_ITEMS.find((i) => i.id === 'bandage');
    const medkit = SHOP_ITEMS.find((i) => i.id === 'medkit');
    const sniper = SHOP_ITEMS.find((i) => i.id === 'sniper');
    expect(bandage?.cost).toBe(20);
    expect(bandage?.item.heal).toBe(20);
    expect(medkit?.cost).toBe(75);
    expect(medkit?.item.heal).toBe(75);
    expect(sniper?.cost).toBe(500);
  });
});
