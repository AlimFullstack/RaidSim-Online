import {
  xpToLevel,
  xpForNextLevel,
  RAID_MODES,
  PARTY_TYPES,
  getModesForParty,
  defaultModeForParty,
  SHOP_ITEMS,
  buyShopItem,
  sellStashItem,
  applyRaidResult,
  getSurvivalRate,
  ensureMigratedProfile,
  createBetaTestLoadout,
  isSandboxMode,
} from './profile.js';
import { pickRandomMapId } from './map-loader.js';
import { pickRandomQuest, QUEST_POOL } from './quests.js';
import { getWeapon } from './weapons.js';
import { normalizeLoadout, emptyLoadout, loadoutHasWeapon, cloneEquipped, BACKPACK_SIZE, HOTBAR_SIZE, loadoutUsed } from './inventory-core.js';
import { itemIcon } from './inventory-ui.js';
import { setupLobbyDrag, renderInvSlotContent } from './lobby-drag.js';
import { Matchmaking } from './matchmaking.js';
import { getFirestoreDb } from './auth.js';

const SHOP_ICONS = { pm: '🔫', pp: '🔫', medkit: '💊', ammo: '🔋', armor: '🛡', shotgun: '🔫', ak: '🔫' };
const MODE_ICONS = { standard: '⏱', quick: '⚡', boss: '💀', betatest: '🧪' };

export class Lobby {
  constructor(auth, storage, callbacks) {
    this.auth = auth;
    this.storage = storage;
    this.callbacks = callbacks;
    this.audio = callbacks.audio || null;
    this.profile = null;
    this.playType = 'solo';
    this.selectedMode = defaultModeForParty('solo');
    this.activeTab = 'raid';
    this.selectedShopId = null;
    this.matchmaking = null;
    this.pendingLoadout = null;

    this.el = {
      auth: document.getElementById('auth-screen'),
      lobby: document.getElementById('lobby-screen'),
      avatar: document.getElementById('lobby-avatar'),
      name: document.getElementById('lobby-name'),
      level: document.getElementById('lobby-level'),
      xpBar: document.getElementById('lobby-xp-bar'),
      statsMini: document.getElementById('lobby-stats-mini'),
      rubles: document.getElementById('lobby-rubles'),
      guestBadge: document.getElementById('guest-badge'),
      modeList: document.getElementById('mode-list'),
      questPanel: document.getElementById('quest-panel'),
      briefing: document.getElementById('raid-briefing'),
      stashGrid: document.getElementById('stash-grid'),
      stashSummary: document.getElementById('stash-summary'),
      shopList: document.getElementById('shop-list'),
      shopHint: document.getElementById('shop-hint'),
      hideoutStats: document.getElementById('hideout-stats'),
      slotsLeft: document.getElementById('loadout-slots'),
      slotsRight: null,
      charCanvas: document.getElementById('lobby-char'),
      deployBtn: document.getElementById('btn-play'),
      partyTypeList: document.getElementById('party-type-list'),
      matchmakingOverlay: document.getElementById('matchmaking-overlay'),
      mmStatus: document.getElementById('mm-status'),
      mmCount: document.getElementById('mm-count'),
      mmRoster: document.getElementById('mm-roster'),
      mmCancelBtn: document.getElementById('btn-mm-cancel'),
    };

    this.bindEvents();
    setupLobbyDrag(this);
    this.renderModes();
    this.renderShop();
  }

  async persistProfile(successMsg = 'Прогресс сохранён в облаке') {
    if (this.auth.isGuest()) return { ok: true };
    const r = await this.storage.save(this.profile);
    if (r.ok) {
      if (successMsg) this.flash(successMsg);
    } else {
      this.flash(r.msg || 'Ошибка сохранения');
    }
    return r;
  }

  uiClick() {
    this.callbacks.unlockAudio?.();
    this.audio?.play('uiClick');
  }

  bindEvents() {
    const uiClick = () => this.uiClick();

    document.getElementById('btn-guest')?.addEventListener('click', () => {
      uiClick();
      this.enterGuest();
    });
    document.getElementById('btn-google')?.addEventListener('click', () => {
      uiClick();
      this.enterGoogle();
    });
    document.getElementById('btn-play')?.addEventListener('click', () => {
      uiClick();
      this.play();
    });
    document.getElementById('btn-mm-cancel')?.addEventListener('click', () => {
      uiClick();
      this.cancelMatchmaking();
    });
    document.getElementById('btn-logout')?.addEventListener('click', () => this.logout());

    document.querySelectorAll('.lobby-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        uiClick();
        this.switchTab(tab.dataset.tab);
      });
    });

    if (!this.auth.isConfigured()) {
      const hint = document.getElementById('firebase-hint');
      if (hint) hint.classList.remove('hidden');
      const btn = document.getElementById('btn-google');
      if (btn) btn.title = 'Настройте Firebase (см. FIREBASE_SETUP.md)';
    }
  }

  switchTab(tabId) {
    if (tabId !== 'shop') this.selectedShopId = null;
    this.activeTab = tabId;
    document.querySelectorAll('.lobby-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-pane').forEach((pane) => {
      const id = pane.id.replace('tab-', '');
      pane.classList.toggle('hidden', id !== tabId);
      pane.classList.toggle('active', id === tabId);
    });
    this.renderTabPanels();
  }

  /** После любого изменения профиля — обновить все зависимые панели */
  onProfileChanged(toastMsg = null) {
    if (toastMsg) this.flash(toastMsg);
    this.render();
  }

  renderTabPanels() {
    this.renderStash();
    this.renderHideout();
    this.renderShop();
  }

  renderHeader() {
    if (!this.profile) return;
    const p = this.profile;
    const level = xpToLevel(p.xp);
    const nextXp = xpForNextLevel(level);
    const prevXp = xpForNextLevel(level - 1);
    const pct = ((p.xp - prevXp) / (nextXp - prevXp)) * 100;
    const survival = getSurvivalRate(p);

    if (this.el.avatar) {
      if (p.photoURL) {
        this.el.avatar.innerHTML = `<img src="${p.photoURL}" alt="" />`;
      } else {
        this.el.avatar.textContent = p.isGuest ? '?' : p.displayName.charAt(0).toUpperCase();
      }
    }
    if (this.el.name) this.el.name.textContent = p.displayName;
    if (this.el.level) this.el.level.textContent = `Ур. ${level}`;
    if (this.el.xpBar) this.el.xpBar.style.width = `${Math.min(100, pct)}%`;
    if (this.el.rubles) this.el.rubles.textContent = `${p.rubles} ₽`;
    if (this.el.guestBadge) this.el.guestBadge.classList.toggle('hidden', !p.isGuest);
    if (this.el.statsMini) {
      this.el.statsMini.textContent = `Рейдов: ${p.stats.raids} · Выжил: ${survival}% · Убийств: ${p.stats.kills}`;
    }
  }

  renderRaidTab() {
    this.renderPartyTypes();
    this.renderQuestCard();
    this.renderBriefing();
    this.updateDeployBtn();
    this.renderModes();
  }

  renderPartyTypes() {
    if (!this.el.partyTypeList) return;
    this.el.partyTypeList.innerHTML = Object.values(PARTY_TYPES)
      .map((pt) => {
        const active = pt.id === this.playType ? 'active' : '';
        return `
      <button type="button" class="party-type-card ${active}" data-party="${pt.id}">
        <span class="party-type-name">${pt.name}</span>
        <span class="party-type-desc">${pt.desc}</span>
      </button>`;
      })
      .join('');

    this.el.partyTypeList.querySelectorAll('[data-party]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.uiClick();
        const next = btn.dataset.party;
        if (next === this.playType) return;
        this.playType = next;
        const modes = getModesForParty(this.playType);
        if (!modes.some((m) => m.id === this.selectedMode)) {
          this.selectedMode = defaultModeForParty(this.playType);
        }
        this.renderRaidTab();
      });
    });
  }

  formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  renderModes() {
    if (!this.el.modeList) return;
    const modes = getModesForParty(this.playType);
    this.el.modeList.innerHTML = modes
      .map((m) => {
        const active = m.id === this.selectedMode ? 'active' : '';
        const bossClass = m.id === 'boss' ? 'mode-card--boss' : '';
        return `
      <button type="button" class="mode-card ${active} ${bossClass}" data-mode="${m.id}">
        <span class="mode-card-icon">${MODE_ICONS[m.id] || '⏱'}</span>
        <div class="mode-card-body">
          <span class="mode-card-name">${m.name}${m.id === 'boss' ? ' <small>БОСС</small>' : ''}</span>
          <span class="mode-card-meta">${this.formatDuration(m.duration)} · ${m.desc}</span>
        </div>
        <span class="mode-card-check">✓</span>
      </button>`;
      })
      .join('');

    this.el.modeList.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.uiClick();
        this.selectedMode = btn.dataset.mode;
        this.renderModes();
        this.renderBriefing();
        this.updateDeployBtn();
      });
    });
  }

  formatShopCost(cost) {
    return cost <= 0 ? 'Бесплатно' : `${cost} ₽`;
  }

  renderShop() {
    if (!this.el.shopList || !this.profile) return;
    const rubles = this.profile.rubles;
    const selected = this.selectedShopId;
    const selectedItem = SHOP_ITEMS.find((i) => i.id === selected);

    if (this.el.shopHint) {
      if (selectedItem) {
        const afford = rubles >= selectedItem.cost;
        this.el.shopHint.classList.add('shop-hint-bar--active');
        const buyLabel = selectedItem.cost <= 0
          ? 'нажми ещё раз, чтобы забрать бесплатно'
          : `нажми ещё раз, чтобы купить за ${selectedItem.cost} ₽`;
        this.el.shopHint.innerHTML = afford
          ? `<strong>${selectedItem.name}</strong> выбран — <span class="shop-hint-buy">${buyLabel}</span>`
          : `<strong>${selectedItem.name}</strong> выбран — <span class="shop-hint-warn">не хватает рублей (${rubles} / ${selectedItem.cost} ₽)</span>`;
      } else {
        this.el.shopHint.classList.remove('shop-hint-bar--active');
        this.el.shopHint.textContent = 'Клик — выбрать товар · повторный клик по выбранному — покупка в схрон';
      }
    }

    this.el.shopList.innerHTML = SHOP_ITEMS.map((item) => {
      const afford = rubles >= item.cost;
      const isSelected = item.id === selected;
      const classes = [
        'shop-card',
        !afford ? 'shop-card--disabled' : '',
        isSelected ? 'shop-card--selected' : '',
      ].filter(Boolean).join(' ');
      return `
      <button type="button" class="${classes}" data-shop="${item.id}" ${afford ? '' : 'disabled'} aria-pressed="${isSelected}">
        <span class="shop-card-icon">${SHOP_ICONS[item.id] || '📦'}</span>
        <span class="shop-card-name">${item.name}</span>
        <span class="shop-card-desc">${this.shopEffectDesc(item)}</span>
        <span class="shop-card-cost">${this.formatShopCost(item.cost)}</span>
        ${isSelected ? '<span class="shop-card-action">КУПИТЬ</span>' : '<span class="shop-card-pick">Выбрать</span>'}
      </button>`;
    }).join('');

    this.el.shopList.querySelectorAll('.shop-card:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', () => this.handleShopClick(btn.dataset.shop));
    });
  }

  async handleShopClick(shopId) {
    this.uiClick();
    if (this.selectedShopId !== shopId) {
      this.selectedShopId = shopId;
      this.renderShop();
      return;
    }

    const r = buyShopItem(this.profile, shopId);
    if (!r.ok) {
      this.flash(r.msg);
      this.renderShop();
      return;
    }
    this.selectedShopId = null;
    this.profile = r.profile;
    await this.persistProfile(null);
    this.onProfileChanged(r.msg);
  }

  shopEffectDesc(item) {
    if (item.item?.weapon) {
      const w = getWeapon(item.item.weapon);
      return `В схрон · урон ${w.damage} · маг. ${w.magSize}`;
    }
    if (item.item?.heal) return 'В схрон · аптечка';
    if (item.item?.ammo) return `В схрон · +${item.item.ammo} патронов`;
    if (item.item?.armor) return `В схрон · броня +${item.item.armor}`;
    return 'В схрон';
  }

  async enterGuest() {
    await this.auth.signInGuest();
    this.profile = ensureMigratedProfile(await this.storage.load());
    if (!this.profile.quests?.active) {
      this.profile.quests = { active: pickRandomQuest([]), completed: [] };
    }
    this.showLobby();
  }

  async enterGoogle() {
    try {
      await this.auth.signInGoogle();
      this.profile = ensureMigratedProfile(await this.storage.load());
      if (!this.profile.quests?.active) {
        this.profile.quests = {
          active: pickRandomQuest(this.profile.quests?.completed || []),
          completed: this.profile.quests?.completed || [],
        };
        await this.persistProfile(null);
      }
      this.showLobby();
    } catch (e) {
      console.error(e);
      this.flash(e.message || 'Ошибка входа через Google');
    }
  }

  async logout() {
    await this.auth.signOut();
    this.profile = null;
    this.showAuth();
  }

  showAuth() {
    this.el.auth?.classList.remove('hidden');
    this.el.lobby?.classList.add('hidden');
  }

  showLobby() {
    this.el.auth?.classList.add('hidden');
    this.el.lobby?.classList.remove('hidden');
    document.getElementById('overlay')?.classList.add('hidden');
    this.switchTab('raid');
    this.render();
  }

  async onRaidEnd(result) {
    if (!this.profile) return;
    if (isSandboxMode(result.mode) || result.sandbox) {
      this.flash('Бета-тест: инвентарь и схрон не изменились');
      this.showLobby();
      return;
    }
    const questId = this.profile.quests?.active?.id;
    const stashBefore = this.profile.stash?.items?.length || 0;
    const rublesBefore = this.profile.rubles || 0;
    this.profile = applyRaidResult(this.profile, { ...result, mode: this.selectedMode });
    const questDone = questId && !this.profile.quests?.active;
    if (questDone) this.audio?.play('questDone');

    if (result.type === 'extracted') {
      const added = Math.max(0, (this.profile.stash?.items?.length || 0) - stashBefore);
      const rublesGain = (this.profile.rubles || 0) - rublesBefore;
      const lootNames = (result.loot || []).map((i) => i.name).join(', ') || '—';
      if (!this.auth.isGuest()) {
        await this.persistProfile(null);
        this.flash(`Сохранено в облако: ${added} предм. в схрон · +${rublesGain}₽ (${lootNames})`);
      } else {
        this.flash(`Гость: ${added} предм. в схрон · +${rublesGain}₽ — пропадёт при F5`);
      }
    } else if (!this.auth.isGuest()) {
      await this.persistProfile(null);
      this.flash('Статистика сохранена в облако');
    } else {
      this.flash('Гость: прогресс не сохранится при обновлении страницы');
    }

    if (questDone) setTimeout(() => this.flash('Квест выполнен!'), 3200);
    this.showLobby();
  }

  getProfile() {
    return this.profile;
  }

  async refreshProfile() {
    this.profile = ensureMigratedProfile(await this.storage.load());
    this.render();
  }

  async play() {
    if (!this.profile) return;
    const isBeta = this.selectedMode === 'betatest';
    const ld = normalizeLoadout(this.profile.loadout || {});
    if (!isBeta && !loadoutHasWeapon(ld)) {
      this.flash('Надень оружие на персонажа или положи в рюкзак');
      return;
    }

    if (this.playType === 'multi') {
      if (this.auth.isGuest()) {
        this.flash('Мультиплеер доступен после входа через Google');
        return;
      }
      const db = getFirestoreDb();
      if (!db) {
        this.flash('Firebase не настроен — мультиплеер недоступен');
        return;
      }
      await this.startMatchmaking(ld, db);
      return;
    }

    if (isBeta) {
      const mapId = pickRandomMapId();
      this.callbacks.onPlay({
        mode: 'betatest',
        loadout: createBetaTestLoadout(),
        mapId,
        partyType: 'solo',
        sandbox: true,
        displayName: this.profile.displayName,
      });
      return;
    }

    this.profile = {
      ...this.profile,
      loadout: emptyLoadout(),
    };
    if (!this.auth.isGuest()) await this.persistProfile(null);
    const mapId = pickRandomMapId();
    this.callbacks.onPlay({
      mode: this.selectedMode,
      loadout: ld,
      mapId,
      partyType: 'solo',
      displayName: this.profile.displayName,
    });
  }

  showMatchmakingOverlay(show) {
    this.el.matchmakingOverlay?.classList.toggle('hidden', !show);
  }

  updateMatchmakingUI(status) {
    if (!status) return;
    const { count, min, max, players, phase, countdownSec } = status;
    if (this.el.mmStatus) {
      if (phase === 'found' || phase === 'starting') {
        this.el.mmStatus.textContent = 'Запускаем рейд...';
      } else if (count < min) {
        this.el.mmStatus.textContent = `Ищем игроков… нужно минимум ${min}`;
      } else if (phase === 'full') {
        this.el.mmStatus.textContent = 'Отряд полон — старт!';
      } else if (phase === 'countdown' && countdownSec > 0) {
        const slotsLeft = Math.max(0, max - count);
        this.el.mmStatus.textContent =
          slotsLeft > 0
            ? `Старт через ${countdownSec} сек · можно присоединиться ещё ${slotsLeft}`
            : `Старт через ${countdownSec} сек`;
      } else if (count >= min && phase === 'waiting') {
        this.el.mmStatus.textContent = 'Синхронизация отсчёта...';
      } else {
        this.el.mmStatus.textContent = 'Набираем отряд...';
      }
    }
    if (this.el.mmCount) {
      if (phase === 'countdown' && countdownSec > 0) {
        this.el.mmCount.textContent = String(countdownSec);
        this.el.mmCount.classList.add('mm-count--timer');
      } else {
        this.el.mmCount.classList.remove('mm-count--timer');
        this.el.mmCount.textContent = `${count} / ${max}`;
      }
    }
    if (this.el.mmRoster) {
      this.el.mmRoster.innerHTML = (players || [])
        .map(
          (p) =>
            `<li class="${p.uid === this.auth.getUid() ? 'mm-you' : ''}">${p.displayName || 'Оператор'}${p.uid === this.auth.getUid() ? ' (ты)' : ''}</li>`
        )
        .join('');
    }
  }

  async startMatchmaking(loadout, db) {
    this.pendingLoadout = loadout;
    this.showMatchmakingOverlay(true);
    this.updateMatchmakingUI({ phase: 'searching', count: 1, min: 2, max: 4, players: [{ uid: this.auth.getUid(), displayName: this.profile.displayName }] });

    if (this.matchmaking) await this.matchmaking.cancel();

    this.matchmaking = new Matchmaking(db, {
      uid: this.auth.getUid(),
      displayName: this.profile.displayName,
    });

    this.matchmaking.onStatus = (status) => this.updateMatchmakingUI(status);
    this.matchmaking.onError = (e) => {
      console.error(e);
      const msg =
        e?.code === 'permission-denied'
          ? 'Нет доступа к очереди. Обновите правила Firestore.'
          : e?.message || 'Ошибка поиска игроков';
      this.flash(msg);
      this.cancelMatchmaking();
    };
    this.matchmaking.onReady = async (match) => {
      this.updateMatchmakingUI({ phase: 'found', count: match.players.length, min: 2, max: 4, players: match.players, countdownSec: 0 });
      await this.launchMultiplayerRaid(match);
    };

    try {
      await this.matchmaking.search(this.selectedMode);
    } catch (e) {
      this.matchmaking.onError(e);
    }
  }

  async cancelMatchmaking() {
    if (this.matchmaking) {
      await this.matchmaking.cancel();
      this.matchmaking = null;
    }
    this.pendingLoadout = null;
    this.showMatchmakingOverlay(false);
  }

  async launchMultiplayerRaid(match) {
    const ld = this.pendingLoadout;
    if (!ld) return;

    this.profile = {
      ...this.profile,
      loadout: emptyLoadout(),
    };
    if (!this.auth.isGuest()) await this.persistProfile(null);

    this.showMatchmakingOverlay(false);
    this.matchmaking = null;
    this.pendingLoadout = null;

    this.callbacks.onPlay({
      mode: match.mode,
      loadout: ld,
      mapId: match.mapId,
      partyType: 'multi',
      matchId: match.matchId,
      uid: this.auth.getUid(),
      players: match.players,
      displayName: this.profile.displayName,
    });
  }

  renderStash() {
    if (!this.el.stashGrid) return;
    const { count, totalValue } = this.getStashInfo();
    const items = this.profile?.stash?.items || [];

    if (this.el.stashSummary) {
      this.el.stashSummary.textContent = `${count}/24 · ${totalValue} ₽`;
    }

    if (!items.length) {
      this.el.stashGrid.innerHTML = `
        <div class="stash-drop-bin" data-drop-zone="stash">
          <span class="stash-drop-icon">↩</span>
          <span class="stash-drop-title">Схрон пуст</span>
          <span class="stash-drop-hint">Перетащи сюда из рюкзака оператора</span>
        </div>`;
      return;
    }

    this.el.stashGrid.innerHTML = `
      <div class="stash-drop-bin stash-drop-bin--compact" data-drop-zone="stash">
        <span class="stash-drop-hint">↩ Перетащи из оператора — вернуть в схрон</span>
      </div>
      ${items
        .map(
          (item, i) => `
      <div class="stash-cell inv-slot filled" draggable="true" data-stash-idx="${i}" data-drop-zone="stash" title="Перетащи в рюкзак оператора">
        <span class="slot-ico">${itemIcon(item)}</span>
        <span class="stash-cell-name">${item.name}${item.count > 1 ? ' ×' + item.count : ''}</span>
        <span class="stash-cell-value">${(item.value || 0) * (item.count || 1)} ₽</span>
        <button type="button" class="sell-btn" data-idx="${i}">Продать</button>
      </div>`
        )
        .join('')}
    `;

    this.el.stashGrid.querySelectorAll('.sell-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        this.uiClick();
        const r = sellStashItem(this.profile, Number(btn.dataset.idx));
        if (!r.ok) {
          this.flash(r.msg || 'Не удалось продать');
          return;
        }
        this.profile = r.profile;
        await this.persistProfile(null);
        this.onProfileChanged(r.msg);
      });
    });
  }

  getStashInfo() {
    const items = this.profile?.stash?.items || [];
    const totalValue = items.reduce((s, i) => s + (i.value || 0) * (i.count || 1), 0);
    return { count: items.length, totalValue };
  }

  renderHideout() {
    const el = this.el.hideoutStats;
    if (!el || !this.profile) return;
    const s = this.profile.stats;
    const { count: stashCount, totalValue: stashValue } = this.getStashInfo();
    const survival = getSurvivalRate(this.profile);

    el.innerHTML = `
      <div class="hideout-stat-grid">
        <div class="hideout-stat">
          <span class="hideout-stat-value">${this.profile.rubles}₽</span>
          <span class="hideout-stat-label">РУБЛИ</span>
        </div>
        <div class="hideout-stat">
          <span class="hideout-stat-value">${s.raids}</span>
          <span class="hideout-stat-label">РЕЙДОВ</span>
        </div>
        <div class="hideout-stat">
          <span class="hideout-stat-value">${s.extracts}</span>
          <span class="hideout-stat-label">ЭКСТРАКТОВ</span>
        </div>
        <div class="hideout-stat">
          <span class="hideout-stat-value">${survival}%</span>
          <span class="hideout-stat-label">ВЫЖИВАНИЕ</span>
        </div>
        <div class="hideout-stat">
          <span class="hideout-stat-value">${s.kills}</span>
          <span class="hideout-stat-label">УБИЙСТВ</span>
        </div>
        <div class="hideout-stat">
          <span class="hideout-stat-value">${s.totalLootValue}₽</span>
          <span class="hideout-stat-label">ЛУТ ВСЕГО</span>
        </div>
        <div class="hideout-stat">
          <span class="hideout-stat-value">${stashCount}/24</span>
          <span class="hideout-stat-label">СХРОН</span>
        </div>
        <div class="hideout-stat">
          <span class="hideout-stat-value">${stashValue}₽</span>
          <span class="hideout-stat-label">ЦЕННОСТЬ СХРОНА</span>
        </div>
        <div class="hideout-stat">
          <span class="hideout-stat-value">${this.profile.hideout?.level || 1}</span>
          <span class="hideout-stat-label">УБЕЖИЩЕ</span>
        </div>
      </div>
      ${this.profile.isGuest ? '<p class="guest-warn">Гость — прогресс не сохранится при F5</p>' : '<p class="save-ok">Прогресс в облаке</p>'}
    `;
  }

  renderOperatorSlots() {
    const el = this.el.slotsLeft;
    if (!el || !this.profile) return;
    const ld = normalizeLoadout(this.profile.loadout || {});
    const eq = ld.equipped || { weapon: null, armor: null };
    const used = loadoutUsed(ld);

    const equipSlot = (type, item, label) => `
      <div class="inv-slot equip-slot operator-equip-slot ${item ? 'filled' : ''}"
           data-drop-zone="equip-${type}"
           data-equip-type="${type}"
           draggable="${item ? 'true' : 'false'}"
           title="${item ? item.name : label}">
        <span class="slot-label">${label}</span>
        ${renderInvSlotContent(item)}
      </div>`;

    const slot = (zone, item, i) => `
      <div class="inv-slot loadout-slot ${item ? 'filled' : ''}"
           data-loadout-zone="${zone}"
           data-loadout-idx="${i}"
           data-drop-zone="${zone}"
           data-slot="${i}"
           draggable="${item ? 'true' : 'false'}"
           title="${item ? item.name : 'Пустой слот'}">
        <span class="slot-num">${i + 1}</span>
        ${renderInvSlotContent(item)}
      </div>`;

    el.innerHTML = `
      <p class="operator-pack-label">ЭКИПИРОВКА</p>
      <div class="operator-equip-grid">
        ${equipSlot('weapon', eq.weapon, 'ОРУЖИЕ')}
        ${equipSlot('armor', eq.armor, 'БРОНЯ')}
      </div>
      <p class="operator-pack-label">БЫСТРЫЙ ДОСТУП <span>${ld.hotbar.filter(Boolean).length}/${HOTBAR_SIZE}</span></p>
      <div class="loadout-hotbar-grid">
        ${ld.hotbar.map((item, i) => slot('hotbar', item, i)).join('')}
      </div>
      <p class="operator-pack-label">РЮКЗАК <span>${ld.backpack.filter(Boolean).length}/${BACKPACK_SIZE}</span></p>
      <p class="operator-pack-hint">Из схрона → рюкзак / панель / персонаж · перетаскивание между слотами</p>
      <div class="loadout-slots-grid loadout-slots-grid--9">
        ${ld.backpack.map((item, i) => slot('backpack', item, i)).join('')}
      </div>
      <div class="stash-return-zone" data-drop-zone="stash" title="Перетащи предмет из рюкзака или экипировки">
        <span class="stash-return-icon">↩</span>
        <span class="stash-return-text">ВЕРНУТЬ В СХРОН</span>
        <span class="stash-return-hint">панель, рюкзак или экипировка · по 1 шт.</span>
      </div>`;
  }

  renderQuestCard() {
    if (!this.el.questPanel) return;
    const q = this.profile?.quests?.active;
    if (!q) {
      this.el.questPanel.innerHTML = '<p class="section-label">ЗАДАНИЕ</p><p class="quest-desc">Нет активного задания</p>';
      return;
    }

    const def = QUEST_POOL.find((d) => d.id === q.id);
    const reward = def?.reward;
    const rewardText = reward ? `+${reward.rubles}₽ · +${reward.xp} XP` : '';

    this.el.questPanel.innerHTML = `
      <div class="quest-header">
        <div>
          <p class="section-label">ЗАДАНИЕ</p>
          <div class="quest-title">${q.title}</div>
        </div>
        <span class="quest-reward">${rewardText}</span>
      </div>
      <p class="quest-desc">${q.desc}</p>
      <div class="quest-progress"><div class="quest-progress-fill" style="width:0%"></div></div>
    `;
  }

  renderBriefing() {
    if (!this.el.briefing || !this.profile) return;
    const mode = RAID_MODES[this.selectedMode];
    const ld = normalizeLoadout(this.profile.loadout || {});
    const eq = ld.equipped || {};
    const packItems = [...ld.hotbar, ...ld.backpack].filter(Boolean).map((i) => `${i.name}${i.count > 1 ? ` ×${i.count}` : ''}`);
    const equipParts = [];
    if (eq.weapon) equipParts.push(eq.weapon.name);
    else {
      const w = [...ld.hotbar, ...ld.backpack].find((i) => i?.weapon);
      if (w) equipParts.push(`${w.name} (рюкзак)`);
    }
    if (eq.armor) equipParts.push(eq.armor.name);
    for (const name of packItems) {
      const base = name.split(' ×')[0];
      if (!equipParts.includes(base) && !equipParts.some((p) => p.startsWith(base))) {
        equipParts.push(name);
      }
    }

    const threat =
      this.selectedMode === 'boss' ? 'Босс + Scav' : 'Scav на карте — как в стандартном рейде';
    const party = PARTY_TYPES[this.playType];
    const betaNote =
      this.selectedMode === 'betatest'
        ? '<div class="briefing-row"><span class="briefing-label">Песочница</span><span class="briefing-value warn">Лут не сохраняется · инвентарь до рейда не трогаем</span></div>'
        : '';
    const loadoutLine =
      this.selectedMode === 'betatest'
        ? 'АК-74, броня, патроны ×1, бинты ×3'
        : equipParts.length
          ? equipParts.join(', ')
          : 'Нет оружия — рейд недоступен';
    const pvpNote =
      this.playType === 'multi' ? '<div class="briefing-row"><span class="briefing-label">PvP</span><span class="briefing-value warn">Можно убивать игроков и лутать трупы · при смерти лут теряется</span></div>' : '';

    this.el.briefing.innerHTML = `
      <div class="briefing-title">БРИФИНГ РЕЙДА</div>
      <div class="briefing-row">
        <span class="briefing-label">Тип</span>
        <span class="briefing-value">${party.name}${this.playType === 'multi' ? ' · 2–4 игрока' : ''}</span>
      </div>
      ${pvpNote}
      ${betaNote}
      <div class="briefing-row">
        <span class="briefing-label">Карта</span>
        <span class="briefing-value">Случайная при старте</span>
      </div>
      <div class="briefing-row">
        <span class="briefing-label">Режим</span>
        <span class="briefing-value">${mode.name} · ${this.formatDuration(mode.duration)}</span>
      </div>
      <div class="briefing-row">
        <span class="briefing-label">Угроза</span>
        <span class="briefing-value">${threat}</span>
      </div>
      <div class="briefing-row">
        <span class="briefing-label">Рюкзак</span>
        <span class="briefing-value">${loadoutLine}</span>
      </div>
    `;
  }

  updateDeployBtn() {
    if (!this.el.deployBtn) return;
    const mode = RAID_MODES[this.selectedMode];
    if (this.playType === 'multi') {
      this.el.deployBtn.innerHTML = `НАЙТИ ИГРУ<span class="deploy-btn-sub">случайная карта · ${this.formatDuration(mode.duration)} · 2–4 игрока</span>`;
    } else {
      this.el.deployBtn.innerHTML = `В РЕЙД<span class="deploy-btn-sub">случайная карта · ${this.formatDuration(mode.duration)}</span>`;
    }
  }

  render() {
    if (!this.profile) return;
    this.renderHeader();
    this.renderRaidTab();
    this.renderOperatorSlots();
    this.renderTabPanels();
    this.drawCharacter();
  }

  drawCharacter() {
    const canvas = this.el.charCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const grd = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.45, 120);
    grd.addColorStop(0, 'rgba(74, 90, 66, 0.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.78, 42, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyY = h * 0.42;
    ctx.fillStyle = '#2a3228';
    ctx.fillRect(w / 2 - 28, bodyY + 20, 56, 70);

    ctx.fillStyle = '#3a4438';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 32, bodyY + 22);
    ctx.lineTo(w / 2 + 32, bodyY + 22);
    ctx.lineTo(w / 2 + 24, bodyY + 88);
    ctx.lineTo(w / 2 - 24, bodyY + 88);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#4a5a42';
    ctx.beginPath();
    ctx.arc(w / 2, bodyY, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1a1e18';
    ctx.fillRect(w / 2 - 20, bodyY - 8, 40, 12);

    ctx.fillStyle = '#2a3228';
    ctx.fillRect(w / 2 - 38, bodyY + 30, 14, 50);
    ctx.fillRect(w / 2 + 24, bodyY + 30, 14, 50);

    ctx.fillStyle = '#1a1e18';
    ctx.fillRect(w / 2 + 30, bodyY + 48, 36, 8);

    if (this.profile?.loadout?.equipped?.armor
      || normalizeLoadout(this.profile.loadout).hotbar.some((i) => i?.armor)
      || normalizeLoadout(this.profile.loadout).backpack.some((i) => i?.armor)) {
      ctx.strokeStyle = '#5a7a8a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 30, bodyY + 24);
      ctx.lineTo(w / 2 + 30, bodyY + 24);
      ctx.lineTo(w / 2 + 22, bodyY + 82);
      ctx.lineTo(w / 2 - 22, bodyY + 82);
      ctx.closePath();
      ctx.stroke();
    }
  }

  flash(msg) {
    const el = document.getElementById('lobby-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2500);
  }
}
