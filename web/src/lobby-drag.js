import {
  moveStashToLoadout,
  moveLoadoutToStash,
  lobbyEquipWeapon,
  lobbyEquipArmor,
  lobbyEquipWeaponFromStash,
  lobbyEquipArmorFromStash,
  lobbyUnequipWeapon,
  lobbyUnequipArmor,
  lobbyEquipToStash,
} from './inventory-core.js';
import { itemIcon } from './inventory-ui.js';

const DRAG_MIME = 'application/x-raidsim-inv';

/** @param {import('./lobby.js').Lobby} lobby */
export function setupLobbyDrag(lobby) {
  let dragPayload = null;

  const parsePayload = (e) => {
    try {
      const raw = e.dataTransfer?.getData(DRAG_MIME);
      return raw ? JSON.parse(raw) : dragPayload;
    } catch {
      return dragPayload;
    }
  };

  document.addEventListener('dragstart', (e) => {
    if (e.target.closest('.sell-btn')) {
      e.preventDefault();
      return;
    }
    const stashEl = e.target.closest('[data-stash-idx]');
    const loadoutEl = e.target.closest('[data-loadout-idx]');
    const equipEl = e.target.closest('.operator-equip-slot[data-equip-type]');

    if (stashEl) {
      dragPayload = { source: 'stash', index: Number(stashEl.dataset.stashIdx) };
    } else if (loadoutEl && loadoutEl.dataset.loadoutIdx !== undefined) {
      const idx = Number(loadoutEl.dataset.loadoutIdx);
      const item = lobby.profile?.loadout?.backpack?.[idx];
      if (!item) {
        e.preventDefault();
        return;
      }
      dragPayload = { source: 'loadout', index: idx };
    } else if (equipEl) {
      const type = equipEl.dataset.equipType;
      const item = lobby.profile?.loadout?.equipped?.[type];
      if (!item) {
        e.preventDefault();
        return;
      }
      dragPayload = { source: 'equip', type };
    } else {
      return;
    }

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragPayload));
    stashEl?.classList.add('dragging');
    loadoutEl?.classList.add('dragging');
    equipEl?.classList.add('dragging');
  });

  document.addEventListener('dragend', () => {
    dragPayload = null;
    document.querySelectorAll('.dragging, .drop-target').forEach((el) => {
      el.classList.remove('dragging', 'drop-target');
    });
  });

  document.addEventListener('dragover', (e) => {
    const zone = e.target.closest('[data-drop-zone]');
    if (!zone) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    zone.classList.add('drop-target');
  });

  document.addEventListener('dragleave', (e) => {
    const zone = e.target.closest('[data-drop-zone]');
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drop-target');
  });

  document.addEventListener('drop', async (e) => {
    const zone = e.target.closest('[data-drop-zone]');
    if (!zone || !lobby.profile) return;
    e.preventDefault();
    zone.classList.remove('drop-target');

    const payload = parsePayload(e);
    if (!payload) return;

    const zoneType = zone.dataset.dropZone;
    let r = { ok: false, msg: 'Нельзя переместить' };

    if (payload.source === 'stash' && zoneType === 'loadout') {
      r = moveStashToLoadout(lobby.profile, payload.index, Number(zone.dataset.slot), 1);
    } else if (payload.source === 'stash' && zoneType === 'equip-weapon') {
      r = lobbyEquipWeaponFromStash(lobby.profile, payload.index);
    } else if (payload.source === 'stash' && zoneType === 'equip-armor') {
      r = lobbyEquipArmorFromStash(lobby.profile, payload.index);
    } else if (payload.source === 'loadout' && zoneType === 'stash') {
      r = moveLoadoutToStash(lobby.profile, payload.index, 1);
    } else if (payload.source === 'loadout' && zoneType === 'loadout') {
      const toSlot = Number(zone.dataset.slot);
      if (toSlot !== payload.index) {
        const bp = lobby.profile.loadout.backpack;
        const tmp = bp[toSlot];
        bp[toSlot] = bp[payload.index];
        bp[payload.index] = tmp;
        r = { ok: true, profile: lobby.profile, msg: 'Перемещено' };
      }
    } else if (payload.source === 'loadout' && zoneType === 'equip-weapon') {
      r = lobbyEquipWeapon(lobby.profile, payload.index);
    } else if (payload.source === 'loadout' && zoneType === 'equip-armor') {
      r = lobbyEquipArmor(lobby.profile, payload.index);
    } else if (payload.source === 'equip' && zoneType === 'loadout') {
      const slot = Number(zone.dataset.slot);
      if (payload.type === 'weapon') r = lobbyUnequipWeapon(lobby.profile, slot);
      else if (payload.type === 'armor') r = lobbyUnequipArmor(lobby.profile, slot);
    } else if (payload.source === 'equip' && zoneType === 'stash') {
      r = lobbyEquipToStash(lobby.profile, payload.type);
    }

    if (!r.ok) {
      lobby.flash(r.msg || 'Не удалось переместить');
      return;
    }
    if (r.profile) lobby.profile = r.profile;
    await lobby.persistProfile(null);
    lobby.onProfileChanged(r.msg);
  });
}

/** @param {object|null} item */
export function renderInvSlotContent(item) {
  if (!item) return '<span class="slot-empty">—</span>';
  const count = item.count > 1 ? `<span class="stack-badge">×${item.count}</span>` : '';
  return `<span class="slot-ico">${itemIcon(item)}</span><span class="slot-name">${item.name}</span>${count}`;
}
