import {
  xpToLevel,
  xpForNextLevel,
  RAID_MODES,
  SHOP_ITEMS,
  buyShopItem,
  sellStashItem,
  applyRaidResult,
  getSurvivalRate,
} from './profile.js';
import { getMapList, getMapById } from './map-loader.js';
import { pickRandomQuest, QUEST_POOL } from './quests.js';
import { getWeapon } from './weapons.js';

const SHOP_ICONS = { medkit: '💊', ammo: '🔋', armor: '🛡', shotgun: '🔫', ak: '🔫' };
const MODE_ICONS = { standard: '⏱', quick: '⚡', boss: '💀' };

export class Lobby {
  constructor(auth, storage, callbacks) {
    this.auth = auth;
    this.storage = storage;
    this.callbacks = callbacks;
    this.audio = callbacks.audio || null;
    this.profile = null;
    this.selectedMode = 'standard';
    this.selectedMap = 'factory';
    this.activeTab = 'raid';

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
      mapList: document.getElementById('map-list'),
      questPanel: document.getElementById('quest-panel'),
      briefing: document.getElementById('raid-briefing'),
      stashGrid: document.getElementById('stash-grid'),
      stashSummary: document.getElementById('stash-summary'),
      shopList: document.getElementById('shop-list'),
      hideoutStats: document.getElementById('hideout-stats'),
      slotsLeft: document.getElementById('loadout-slots'),
      slotsRight: null,
      charCanvas: document.getElementById('lobby-char'),
      deployBtn: document.getElementById('btn-play'),
    };

    this.bindEvents();
    this.renderModes();
    this.renderMaps();
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
    this.renderQuestCard();
    this.renderBriefing();
    this.updateDeployBtn();
    this.renderMaps();
    this.renderModes();
  }

  formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  renderMaps() {
    if (!this.el.mapList) return;
    this.el.mapList.innerHTML = getMapList()
      .map((m) => {
        const thumbClass = m.theme === 'night' ? 'map-thumb--night' : 'map-thumb--factory';
        const active = m.id === this.selectedMap ? 'active' : '';
        return `
      <button type="button" class="map-card ${active}" data-map="${m.id}">
        <div class="map-thumb ${thumbClass}">
          <span class="map-card-check">✓</span>
        </div>
        <div class="map-card-body">
          <span class="map-card-name">${m.name}</span>
          <span class="map-card-meta">${m.timeLabel} · ${m.threat}</span>
        </div>
      </button>`;
      })
      .join('');

    this.el.mapList.querySelectorAll('[data-map]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.uiClick();
        this.selectedMap = btn.dataset.map;
        this.renderMaps();
        this.renderBriefing();
        this.updateDeployBtn();
      });
    });
  }

  renderModes() {
    if (!this.el.modeList) return;
    this.el.modeList.innerHTML = Object.values(RAID_MODES)
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

  renderShop() {
    if (!this.el.shopList || !this.profile) return;
    const rubles = this.profile.rubles;
    const equippedWeapon = this.profile.loadout?.weapon || 'pm';
    this.el.shopList.innerHTML = SHOP_ITEMS.map((item) => {
      const afford = rubles >= item.cost;
      const equipped = item.type === 'weapon' && item.weaponId === equippedWeapon;
      return `
      <button type="button" class="shop-card${afford ? '' : ' shop-card--disabled'}${equipped ? ' shop-card--equipped' : ''}" data-shop="${item.id}" ${afford ? '' : 'disabled'}>
        <span class="shop-card-icon">${SHOP_ICONS[item.id] || '📦'}</span>
        <span class="shop-card-name">${item.name}${equipped ? ' ✓' : ''}</span>
        <span class="shop-card-desc">${this.shopEffectDesc(item)}</span>
        <span class="shop-card-cost">${item.cost} ₽</span>
      </button>`;
    }).join('');

    this.el.shopList.querySelectorAll('.shop-card:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', async () => {
        this.uiClick();
        const r = buyShopItem(this.profile, btn.dataset.shop);
        if (!r.ok) {
          this.flash(r.msg);
          return;
        }
        this.profile = r.profile;
        await this.persistProfile(null);
        this.onProfileChanged(r.msg);
      });
    });
  }

  shopEffectDesc(item) {
    if (item.type === 'weapon') {
      const w = getWeapon(item.weaponId);
      return `Оружие на рейд · урон ${w.damage} · маг. ${w.magSize}`;
    }
    if (item.loadoutKey === 'extraMedkits') return '+1 аптечка к рейду';
    if (item.loadoutKey === 'extraAmmo') return `+${item.amount} патронов`;
    if (item.loadoutKey === 'startArmor') return `+${item.amount} брони на старт`;
    return '';
  }

  async enterGuest() {
    await this.auth.signInGuest();
    this.profile = await this.storage.load();
    if (!this.profile.quests?.active) {
      this.profile.quests = { active: pickRandomQuest([]), completed: [] };
    }
    this.showLobby();
  }

  async enterGoogle() {
    try {
      await this.auth.signInGoogle();
      this.profile = await this.storage.load();
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
    this.profile = await this.storage.load();
    this.render();
  }

  play() {
    if (!this.profile) return;
    this.callbacks.onPlay(this.selectedMode, this.profile.loadout, this.selectedMap);
  }

  renderStash() {
    if (!this.el.stashGrid) return;
    const { count, totalValue } = this.getStashInfo();
    const items = this.profile?.stash?.items || [];

    if (this.el.stashSummary) {
      this.el.stashSummary.textContent = `${count}/24 · ${totalValue} ₽`;
    }

    if (!items.length) {
      this.el.stashGrid.innerHTML = '<p class="empty-stash">Схрон пуст. E — лут в слоты, кнопка РЮКЗАК — панель, экстракт — в схрон.</p>';
      return;
    }

    this.el.stashGrid.innerHTML = items
      .map(
        (item, i) => `
      <div class="stash-cell">
        <span class="stash-cell-name">${item.name}</span>
        <span class="stash-cell-value">${item.value || 0} ₽</span>
        <button type="button" class="sell-btn" data-idx="${i}">Продать</button>
      </div>`
      )
      .join('');

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
    const totalValue = items.reduce((s, i) => s + (i.value || 0), 0);
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
    if (!el) return;
    const ld = this.profile?.loadout || {};
    const weapon = getWeapon(ld.weapon || 'pm');
    const { count: stashCount } = this.getStashInfo();

    const slot = (icon, label, value, filled) => `
      <div class="equip-slot ${filled ? 'filled' : ''}" title="${label}: ${value}">
        <div class="slot-row">
          <span class="slot-icon">${icon}</span>
          <span class="slot-label">${label}</span>
        </div>
        <span class="slot-value">${value}</span>
      </div>`;

    el.innerHTML = [
      slot('🔫', 'ОРУЖИЕ', weapon.name, true),
      slot('🛡', 'БРОНЯ', ld.startArmor ? `${ld.startArmor} HP` : '—', !!ld.startArmor),
      slot('💊', 'АПТЕЧКИ', ld.extraMedkits ? `+${ld.extraMedkits}` : '—', !!ld.extraMedkits),
      slot('🔋', 'ПАТРОНЫ', ld.extraAmmo ? `+${ld.extraAmmo}` : '—', !!ld.extraAmmo),
      slot('🎒', 'РЮКЗАК', '6 слотов', true),
      slot('📦', 'СХРОН', `${stashCount}/24`, stashCount > 0),
    ].join('');
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
    const map = getMapById(this.selectedMap);
    const mode = RAID_MODES[this.selectedMode];
    const ld = this.profile.loadout || {};
    const weapon = getWeapon(ld.weapon || 'pm');

    const equipParts = [weapon.name];
    if (ld.extraMedkits) equipParts.push(`+${ld.extraMedkits} аптечки`);
    if (ld.extraAmmo) equipParts.push(`+${ld.extraAmmo} патронов`);
    if (ld.startArmor) equipParts.push(`броня ${ld.startArmor}`);

    const threat =
      this.selectedMode === 'boss'
        ? 'Босс + Scav'
        : `Scav × ${map.scavCount || 5}`;

    this.el.briefing.innerHTML = `
      <div class="briefing-title">БРИФИНГ РЕЙДА</div>
      <div class="briefing-row">
        <span class="briefing-label">Карта</span>
        <span class="briefing-value">${map.name} · ${map.timeLabel}</span>
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
        <span class="briefing-label">Описание</span>
        <span class="briefing-value">${map.desc}</span>
      </div>
      <div class="briefing-row">
        <span class="briefing-label">Экипировка</span>
        <span class="briefing-value">${equipParts.join(', ')}</span>
      </div>
    `;
  }

  updateDeployBtn() {
    if (!this.el.deployBtn) return;
    const map = getMapById(this.selectedMap);
    const mode = RAID_MODES[this.selectedMode];
    this.el.deployBtn.innerHTML = `В РЕЙД<span class="deploy-btn-sub">${map.name} · ${this.formatDuration(mode.duration)}</span>`;
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

    if (this.profile?.loadout?.startArmor) {
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
