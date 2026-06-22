import { GroundItem } from './entities.js';
import { BACKPACK_SIZE, HOTBAR_SIZE } from './inventory-core.js';
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
export function slotItemHint(item, opts = {}) {
  if (!item) return 'Пустой слот';
  const hotbar = opts.hotbar ? ' · 1–3 выбор' : '';
  if (item.weapon) return `${item.name} — перетащи на оружие${hotbar}`;
  if (item.heal) return `${item.name} — F лечиться${hotbar}`;
  if (item.grenade) return `${item.name} — G бросить${hotbar}`;
  if (item.smoke) return `${item.name} — V дым${hotbar}`;
  if (item.armor) return `${item.name} — перетащи на броню`;
  if (item.ammo) return `${item.name} — R в запас${hotbar}`;
  if (item.value) return `${item.name} · ${item.value}₽ — на экстракт${hotbar}`;
  return item.name + hotbar;
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
    this.dropHandled = false;
    this.bind();
  }

  bind() {
    document.getElementById('inv-overlay-close')?.addEventListener('click', () => this.toggle(false));
    document.getElementById('btn-inv-expand')?.addEventListener('click', () => this.toggle());
    this.setupDrag();
    this.game.canvas?.addEventListener('dragover', (e) => {
      if (!this.dragPayload || this.game.state !== 'raid') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    this.game.canvas?.addEventListener('drop', (e) => {
      if (!this.dragPayload || this.game.state !== 'raid') return;
      e.preventDefault();
      this.dropHandled = true;
      this.dropPayloadToGround(this.dragPayload);
      this.dragPayload = null;
      this.render();
    });
  }

  spawnGroundItem(item) {
    const p = this.game.player;
    if (!p || !item) return;
    const dx = Math.cos(p.angle) * 28;
    const dy = Math.sin(p.angle) * 28;
    this.game.groundItems.push(new GroundItem(p.x + dx, p.y + dy, item));
    this.game.setStatus(`Выброшено: ${item.name}`, 2, 'loot');
    this.game._hudCache = '';
  }

  dropPayloadToGround(payload) {
    const p = this.game.player;
    if (!p || !payload) return;
    let r = { ok: false };
    if (payload.source === 'hotbar') r = p.dropFromSlot('hotbar', payload.index);
    else if (payload.source === 'backpack') r = p.dropFromSlot('backpack', payload.index);
    else if (payload.source === 'equip') r = p.dropEquipped(payload.type);
    if (r.ok && r.item) this.spawnGroundItem(r.item);
    else if (r.msg) this.game.setStatus(r.msg, 1.5, 'fail');
  }

  setupDrag() {
    this.el?.addEventListener('dragstart', (e) => {
      if (e.target.closest('button')) {
        e.preventDefault();
        return;
      }
      const bp = e.target.closest('[data-bp-idx]');
      const hb = e.target.closest('[data-hb-idx]');
      const eq = e.target.closest('[data-equip-type]');
      if (hb) {
        const idx = Number(hb.dataset.hbIdx);
        if (!this.game.player?.hotbar[idx]) {
          e.preventDefault();
          return;
        }
        this.dragPayload = { source: 'hotbar', index: idx };
      } else if (bp) {
        const idx = Number(bp.dataset.bpIdx);
        if (!this.game.player?.backpack[idx]) {
          e.preventDefault();
          return;
        }
        this.dragPayload = { source: 'backpack', index: idx };
      } else if (eq && eq.dataset.equipType) {
        const type = eq.dataset.equipType;
        const item = this.game.player?.equipped?.[type];
        if (!item) {
          e.preventDefault();
          return;
        }
        this.dragPayload = { source: 'equip', type };
      } else return;

      this.dropHandled = false;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(RAID_DRAG, JSON.stringify(this.dragPayload));
      e.target.closest('.inv-slot')?.classList.add('dragging');
    });

    this.el?.addEventListener('dragend', (e) => {
      if (!this.dropHandled && this.dragPayload && this.game.state === 'raid') {
        const overOverlay = this.el?.contains(document.elementFromPoint(e.clientX, e.clientY));
        if (!overOverlay) this.dropPayloadToGround(this.dragPayload);
      }
      this.dragPayload = null;
      this.dropHandled = false;
      this.el?.querySelectorAll('.dragging, .drop-target').forEach((n) => {
        n.classList.remove('dragging', 'drop-target');
      });
      if (this.open) this.render();
    });

    this.el?.addEventListener('dragover', (e) => {
      if (!this.dragPayload) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const zone = e.target.closest('[data-raid-drop]');
      this.el?.querySelectorAll('.drop-target').forEach((n) => {
        if (!zone || n !== zone) n.classList.remove('drop-target');
      });
      zone?.classList.add('drop-target');
    });

    this.el?.addEventListener('dragleave', (e) => {
      const zone = e.target.closest('[data-raid-drop]');
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drop-target');
    });

    this.el?.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dropHandled = true;
      const zone = e.target.closest('[data-raid-drop]');
      this.el?.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
      const p = this.game.player;
      if (!p || !zone) return;

      let payload = this.dragPayload;
      try {
        const raw = e.dataTransfer?.getData(RAID_DRAG);
        if (raw) payload = JSON.parse(raw);
      } catch { /* use cached */ }

      if (!payload) return;
      const drop = zone.dataset.raidDrop;
      let r = { ok: false, msg: 'Нельзя' };

      if (payload.source === 'hotbar' && drop === 'weapon') {
        r = p.equipWeaponFromSlot('hotbar', payload.index);
      } else if (payload.source === 'backpack' && drop === 'weapon') {
        r = p.equipWeaponFromSlot('backpack', payload.index);
      } else if (payload.source === 'hotbar' && drop === 'armor') {
        r = p.equipArmorFromSlot('hotbar', payload.index);
      } else if (payload.source === 'backpack' && drop === 'armor') {
        r = p.equipArmorFromSlot('backpack', payload.index);
      } else if (payload.source === 'equip' && drop === 'hotbar') {
        const slot = Number(zone.dataset.hbIdx);
        if (payload.type === 'weapon') r = p.unequipWeaponToSlot('hotbar', slot);
        else if (payload.type === 'armor') r = p.unequipArmorToSlot('hotbar', slot);
      } else if (payload.source === 'equip' && drop === 'backpack') {
        const slot = Number(zone.dataset.bpIdx);
        if (payload.type === 'weapon') r = p.unequipWeaponToSlot('backpack', slot);
        else if (payload.type === 'armor') r = p.unequipArmorToSlot('backpack', slot);
      } else if (payload.source === 'hotbar' && drop === 'hotbar') {
        const to = Number(zone.dataset.hbIdx);
        if (to !== payload.index) r = p.swapInventorySlots('hotbar', payload.index, 'hotbar', to);
      } else if (payload.source === 'backpack' && drop === 'backpack') {
        const to = Number(zone.dataset.bpIdx);
        if (to !== payload.index) r = p.swapInventorySlots('backpack', payload.index, 'backpack', to);
      } else if (payload.source === 'hotbar' && drop === 'backpack') {
        const to = Number(zone.dataset.bpIdx);
        r = p.swapInventorySlots('hotbar', payload.index, 'backpack', to);
      } else if (payload.source === 'backpack' && drop === 'hotbar') {
        const to = Number(zone.dataset.hbIdx);
        r = p.swapInventorySlots('backpack', payload.index, 'hotbar', to);
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
    const canDrag = !!item;
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

  renderSlot(zone, item, i, selected = false) {
    const isHotbar = zone === 'hotbar';
    const dataAttr = isHotbar ? `data-hb-idx="${i}"` : `data-bp-idx="${i}"`;
    const drop = isHotbar ? 'hotbar' : 'backpack';
    return `
      <div class="inv-slot ${isHotbar ? 'hb-slot' : 'bp-slot'} ${item ? 'filled' : ''} ${selected ? 'selected' : ''}"
           ${dataAttr}
           data-raid-drop="${drop}"
           draggable="${item ? 'true' : 'false'}"
           title="${item ? slotItemHint(item, { hotbar: isHotbar }) : 'Пусто'}">
        <span class="slot-num">${i + 1}</span>
        ${renderInvSlotContent(item)}
        ${item ? `<button type="button" class="inv-drop-btn" data-drop-zone="${zone}" data-drop-idx="${i}">Q</button>` : ''}
      </div>`;
  }

  render() {
    const p = this.game.player;
    if (!p || !this.gridEl || this.dragPayload) return;

    const filled = p.backpackFilledCount();
    if (this.countEl) {
      this.countEl.textContent = `${filled}/${HOTBAR_SIZE + BACKPACK_SIZE} · ${p.getLootValue()}₽`;
    }

    if (this.equipEl) {
      this.equipEl.innerHTML = `
        <p class="inv-section-label">ПЕРСОНАЖ</p>
        ${this.renderEquipSlot('weapon', p.equipped.weapon, 'ОРУЖИЕ')}
        ${this.renderEquipSlot('armor', p.equipped.armor, 'БРОНЯ')}
        <p class="inv-section-label">БЫСТРЫЙ ДОСТУП <span>1–3</span></p>
        <div class="inv-hotbar-grid">
          ${p.hotbar.map((item, i) => this.renderSlot('hotbar', item, i, i === p.selectedSlot)).join('')}
        </div>
      `;
    }

    this.gridEl.innerHTML = `
      <p class="inv-section-label">РЮКЗАК <span>${p.backpack.filter(Boolean).length}/${BACKPACK_SIZE}</span></p>
      <div class="inv-backpack-grid inv-backpack-grid--9">
        ${p.backpack.map((item, i) => this.renderSlot('backpack', item, i)).join('')}
      </div>
      <p class="inv-footer-note">Перетащи за пределы окна — выбросить на карту</p>`;

    this.equipEl?.querySelectorAll('.hb-slot').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        p.selectSlot(Number(row.dataset.hbIdx));
        this.game._hudCache = '';
        this.game.setStatus(p.getSlotActionHint(), 1.5, 'loot');
        this.render();
      });
    });

    this.el?.querySelectorAll('[data-drop-idx]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const zone = btn.dataset.dropZone;
        const idx = Number(btn.dataset.dropIdx);
        const drop = p.dropFromSlot(zone, idx);
        if (drop.ok && drop.item) this.spawnGroundItem(drop.item);
        this.render();
      });
    });
  }
}
