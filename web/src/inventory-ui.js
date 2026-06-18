import { GroundItem } from './entities.js';

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
  if (item.weapon) return `${item.name} — выбери, ЛКМ стрелять`;
  if (item.heal) return `${item.name} — выбери, F лечиться`;
  if (item.grenade) return `${item.name} — выбери, G бросить`;
  if (item.smoke) return `${item.name} — выбери, V дым`;
  if (item.armor) return `${item.name} — выбери, F надеть`;
  if (item.value) return `${item.name} · ${item.value}₽ — на экстракт`;
  return item.name;
}

/** Можно ли «использовать» предмет из рюкзака (в развёрнутом виде — только выброс) */
export function itemActionLabel(item) {
  return null;
}

export class RaidInventoryUI {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.el = document.getElementById('inv-overlay');
    this.listEl = document.getElementById('inv-overlay-list');
    this.countEl = document.getElementById('inv-overlay-count');
    this.bind();
  }

  bind() {
    document.getElementById('inv-overlay-close')?.addEventListener('click', () => this.toggle(false));
    document.getElementById('btn-inv-expand')?.addEventListener('click', () => this.toggle());
  }

  toggle(force) {
    this.open = force !== undefined ? force : !this.open;
    this.el?.classList.toggle('hidden', !this.open);
    if (this.open) this.render();
  }

  render() {
    const p = this.game.player;
    if (!p || !this.listEl) return;

    if (this.countEl) {
      const val = p.inventory.reduce((s, i) => s + (i.value || 0), 0);
      this.countEl.textContent = `${p.inventory.length}/${p.maxInv} · ${val}₽ в рюкзаке`;
    }

    const rows = [];
    for (let i = 0; i < p.maxInv; i++) {
      const item = p.inventory[i];
      const selected = i === p.selectedSlot;
      rows.push(`
        <div class="inv-row ${selected ? 'selected' : ''} ${item ? '' : 'empty'}" data-idx="${i}">
          <span class="inv-row-num">${i + 1}</span>
          <span class="inv-row-icon">${itemIcon(item)}</span>
          <div class="inv-row-info">
            <span class="inv-row-name">${item ? item.name : 'Пусто'}</span>
            <span class="inv-row-meta">${item ? slotItemHint(item) : '—'}</span>
          </div>
          <div class="inv-row-actions">
            ${item && !item.starter ? `<button type="button" class="inv-drop-btn" data-drop="${i}">Выброс</button>` : ''}
          </div>
        </div>`);
    }
    this.listEl.innerHTML = rows.join('');

    this.listEl.querySelectorAll('.inv-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        p.selectSlot(Number(row.dataset.idx));
        this.game._hudCache = '';
        this.game.setStatus(p.getSlotActionHint(), 1.5, 'loot');
        this.render();
      });
    });

    this.listEl.querySelectorAll('[data-drop]').forEach((btn) => {
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
