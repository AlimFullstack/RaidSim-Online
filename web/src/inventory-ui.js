import { GroundItem } from './entities.js';
import { BACKPACK_SIZE } from './inventory-core.js';
import { renderInvSlotContent } from './lobby-drag.js';

/** Иконка типа предмета для UI */
export function itemIcon(item) {
  if (!item) return '·';
  if (item.weapon) return '🔫';
  if (item.armor) return '🛡';
  if (item.grenade) return '💣';
  if (item.smoke) return '💨';
  if (item.heal) return '💊';
  if (item.ammo) return '🔋';
  if ((item.value || 0) >= 10) return '💎';
  return '📦';
}

/** Подсказка действия для предмета в слоте */
export function slotItemHint(item) {
  if (!item) return 'Пустой слот';
  if (item.weapon) return `${item.name} — перетащи на оружие`;
  if (item.heal) return `${item.name} — F лечиться`;
  if (item.grenade) return `${item.name} — G бросить`;
  if (item.smoke) return `${item.name} — V дым`;
  if (item.armor) return `${item.name} — перетащи на броню`;
  if (item.ammo) return `${item.name} — R в запас`;
  if (item.value) return `${item.name} · ${item.value}₽ — на экстракт`;
  return item.name;
}

const RAID_DRAG = 'application/x-raidsim-raid-inv';

export class RaidInventoryUI {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.el = document.getElementById('inv-overlay');
    this.gridEl = document.getElementById('inv-overlay-grid');
    this.equipEl = document.getElementById('inv-overlay-equip');
    this.countEl = document.getElementById('inv-overlay-count');
    this.dragPayload = null;
    this.bind();
  }

  bind() {
    document.getElementById('inv-overlay-close')?.addEventListener('click', () => this.toggle(false));
    document.getElementById('btn-inv-expand')?.addEventListener('click', () => this.toggle());
    this.setupDrag();
  }

  setupDrag() {
    this.el?.addEventListener('dragstart', (e) => {
      const bp = e.target.closest('[data-bp-idx]');
      const eq = e.target.closest('[data-equip-type]');
      if (bp) {
        const idx = Number(bp.dataset.bpIdx);
        if (!this.game.player?.backpack[idx]) {
          e.preventDefault();
          return;
        }
        this.dragPayload = { source: 'backpack', index: idx };
      } else if (eq && eq.dataset.equipType) {
        const type = eq.dataset.equipType;
        const item = this.game.player?.equipped?.[type];
        if (!item || (type === 'weapon' && item.starter)) {
          e.preventDefault();
          return;
        }
        this.dragPayload = { source: 'equip', type };
      } else return;

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(RAID_DRAG, JSON.stringify(this.dragPayload));
      e.target.closest('.inv-slot')?.classList.add('dragging');
    });

    this.el?.addEventListener('dragend', () => {
      this.dragPayload = null;
      this.el?.querySelectorAll('.dragging, .drop-target').forEach((n) => {
        n.classList.remove('dragging', 'drop-target');
      });
    });

    this.el?.addEventListener('dragover', (e) => {
      const zone = e.target.closest('[data-raid-drop]');
      if (!zone) return;
      e.preventDefault();
      zone.classList.add('drop-target');
    });

    this.el?.addEventListener('dragleave', (e) => {
      const zone = e.target.closest('[data-raid-drop]');
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drop-target');
    });

    this.el?.addEventListener('drop', (e) => {
      const zone = e.target.closest('[data-raid-drop]');
      if (!zone) return;
      e.preventDefault();
      zone.classList.remove('drop-target');
      const p = this.game.player;
      if (!p) return;

      let payload = this.dragPayload;
      try {
        const raw = e.dataTransfer?.getData(RAID_DRAG);
        if (raw) payload = JSON.parse(raw);
      } catch { /* use cached */ }

      if (!payload) return;
      const drop = zone.dataset.raidDrop;
      let r = { ok: false, msg: 'Нельзя' };

      if (payload.source === 'backpack' && drop === 'weapon') {
        r = p.equipWeaponFromBackpack(payload.index);
      } else if (payload.source === 'backpack' && drop === 'armor') {
        r = p.equipArmorFromBackpack(payload.index);
      } else if (payload.source === 'equip' && drop === 'backpack') {
        const slot = Number(zone.dataset.bpIdx);
        if (payload.type === 'weapon') r = p.unequipWeaponToBackpack(slot);
        else if (payload.type === 'armor') r = p.unequipArmorToBackpack(slot);
      } else if (payload.source === 'backpack' && drop === 'backpack') {
        const to = Number(zone.dataset.bpIdx);
        if (to !== payload.index) {
          const tmp = p.backpack[to];
          p.backpack[to] = p.backpack[payload.index];
          p.backpack[payload.index] = tmp;
          r = { ok: true, msg: 'Перемещено' };
        }
      }

      if (r.ok) {
        this.game._hudCache = '';
        if (r.msg) this.game.setStatus(r.msg, 1.5, 'loot');
      } else if (r.msg) {
        this.game.setStatus(r.msg, 1.5, 'fail');
      }
      this.render();
    });
  }

  toggle(force) {
    this.open = force !== undefined ? force : !this.open;
    this.el?.classList.toggle('hidden', !this.open);
    if (this.open) this.render();
  }

  renderEquipSlot(type, item, label) {
    const canDrag = item && !(type === 'weapon' && item.starter);
    return `
      <div class="inv-slot equip-slot ${item ? 'filled' : ''}"
           data-raid-drop="${type}"
           data-equip-type="${type}"
           draggable="${canDrag ? 'true' : 'false'}"
           title="${item ? item.name : label}">
        <span class="slot-label">${label}</span>
        ${item ? renderInvSlotContent(item) : '<span class="slot-empty">—</span>'}
      </div>`;
  }

  render() {
    const p = this.game.player;
    if (!p || !this.gridEl) return;

    const filled = p.backpackFilledCount();
    if (this.countEl) {
      this.countEl.textContent = `${filled}/${BACKPACK_SIZE} · ${p.getLootValue()}₽`;
    }

    if (this.equipEl) {
      this.equipEl.innerHTML = `
        <p class="inv-section-label">ПЕРСОНАЖ</p>
        ${this.renderEquipSlot('weapon', p.equipped.weapon, 'ОРУЖИЕ')}
        ${this.renderEquipSlot('armor', p.equipped.armor, 'БРОНЯ')}
      `;
    }

    this.gridEl.innerHTML = `
      <p class="inv-section-label">РЮКЗАК</p>
      <div class="inv-backpack-grid">
        ${p.backpack.map((item, i) => `
          <div class="inv-slot bp-slot ${item ? 'filled' : ''} ${i === p.selectedSlot ? 'selected' : ''}"
               data-bp-idx="${i}"
               data-raid-drop="backpack"
               draggable="${item ? 'true' : 'false'}"
               title="${item ? slotItemHint(item) : 'Пусто'}">
            <span class="slot-num">${i + 1}</span>
            ${renderInvSlotContent(item)}
            ${item ? `<button type="button" class="inv-drop-btn" data-drop="${i}">Выброс</button>` : ''}
          </div>`).join('')}
      </div>`;

    this.gridEl.querySelectorAll('.bp-slot').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        p.selectSlot(Number(row.dataset.bpIdx));
        this.game._hudCache = '';
        this.game.setStatus(p.getSlotActionHint(), 1.5, 'loot');
        this.render();
      });
    });

    this.gridEl.querySelectorAll('[data-drop]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        p.selectSlot(Number(btn.dataset.drop));
        const drop = p.dropSelected();
        if (drop.ok && drop.item) {
          const dx = Math.cos(p.angle) * 28;
          const dy = Math.sin(p.angle) * 28;
          this.game.groundItems.push(new GroundItem(p.x + dx, p.y + dy, drop.item));
          this.game.setStatus(drop.msg, 2, 'loot');
          this.game._hudCache = '';
        }
        this.render();
      });
    });
  }
}
