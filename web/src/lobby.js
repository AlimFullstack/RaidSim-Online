import { xpToLevel, xpForNextLevel, RAID_MODES, SHOP_ITEMS, buyShopItem, sellStashItem, applyRaidResult } from './profile.js';

export class Lobby {
  constructor(auth, storage, callbacks) {
    this.auth = auth;
    this.storage = storage;
    this.callbacks = callbacks;
    this.profile = null;
    this.selectedMode = 'standard';

    this.el = {
      auth: document.getElementById('auth-screen'),
      lobby: document.getElementById('lobby-screen'),
      stashModal: document.getElementById('stash-modal'),
      shopModal: document.getElementById('shop-modal'),
      avatar: document.getElementById('lobby-avatar'),
      name: document.getElementById('lobby-name'),
      level: document.getElementById('lobby-level'),
      xpBar: document.getElementById('lobby-xp-bar'),
      rubles: document.getElementById('lobby-rubles'),
      guestBadge: document.getElementById('guest-badge'),
      modeList: document.getElementById('mode-list'),
      stashGrid: document.getElementById('stash-grid'),
      shopList: document.getElementById('shop-list'),
      loadoutInfo: document.getElementById('loadout-info'),
      charCanvas: document.getElementById('lobby-char'),
    };

    this.bindEvents();
    this.renderModes();
    this.renderShop();
  }

  bindEvents() {
    document.getElementById('btn-guest')?.addEventListener('click', () => this.enterGuest());
    document.getElementById('btn-google')?.addEventListener('click', () => this.enterGoogle());
    document.getElementById('btn-play')?.addEventListener('click', () => this.play());
    document.getElementById('btn-stash')?.addEventListener('click', () => this.openStash());
    document.getElementById('btn-shop')?.addEventListener('click', () => this.openShop());
    document.getElementById('btn-logout')?.addEventListener('click', () => this.logout());
    document.getElementById('stash-close')?.addEventListener('click', () => this.closeModals());
    document.getElementById('shop-close')?.addEventListener('click', () => this.closeModals());

    if (!this.auth.isConfigured()) {
      const hint = document.getElementById('firebase-hint');
      if (hint) hint.classList.remove('hidden');
      const btn = document.getElementById('btn-google');
      if (btn) btn.title = 'Настройте Firebase (см. FIREBASE_SETUP.md)';
    }
  }

  renderModes() {
    if (!this.el.modeList) return;
    this.el.modeList.innerHTML = Object.values(RAID_MODES)
      .map(
        (m) => `
      <button type="button" class="mode-btn ${m.id === this.selectedMode ? 'active' : ''}" data-mode="${m.id}">
        <span class="mode-name">${m.name}</span>
        <span class="mode-desc">${m.desc}</span>
      </button>`
      )
      .join('');

    this.el.modeList.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedMode = btn.dataset.mode;
        this.renderModes();
      });
    });
  }

  renderShop() {
    if (!this.el.shopList) return;
    this.el.shopList.innerHTML = SHOP_ITEMS.map(
      (item) => `
      <button type="button" class="shop-item" data-shop="${item.id}">
        <span>${item.name}</span>
        <span class="shop-cost">${item.cost} ₽</span>
      </button>`
    ).join('');

    this.el.shopList.querySelectorAll('.shop-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const r = buyShopItem(this.profile, btn.dataset.shop);
        if (!r.ok) {
          this.flash(r.msg);
          return;
        }
        this.profile = r.profile;
        await this.storage.save(this.profile);
        this.render();
        this.renderShop();
        this.flash(r.msg);
      });
    });
  }

  async enterGuest() {
    await this.auth.signInGuest();
    this.profile = await this.storage.load();
    this.showLobby();
  }

  async enterGoogle() {
    try {
      await this.auth.signInGoogle();
      this.profile = await this.storage.load();
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
    this.closeModals();
  }

  showLobby() {
    this.el.auth?.classList.add('hidden');
    this.el.lobby?.classList.remove('hidden');
    document.getElementById('overlay')?.classList.add('hidden');
    this.render();
  }

  async onRaidEnd(result) {
    if (!this.profile) return;
    this.profile = applyRaidResult(this.profile, { ...result, mode: this.selectedMode });
    if (!this.auth.isGuest()) {
      await this.storage.save(this.profile);
      this.flash('Прогресс сохранён в облаке');
    } else {
      this.flash('Гость: прогресс не сохранится при обновлении страницы');
    }
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
    this.callbacks.onPlay(this.selectedMode, this.profile.loadout);
  }

  openStash() {
    this.renderStash();
    this.el.stashModal?.classList.remove('hidden');
  }

  openShop() {
    this.render();
    this.el.shopModal?.classList.remove('hidden');
  }

  closeModals() {
    this.el.stashModal?.classList.add('hidden');
    this.el.shopModal?.classList.add('hidden');
  }

  renderStash() {
    if (!this.el.stashGrid) return;
    const items = this.profile?.stash?.items || [];
    if (!items.length) {
      this.el.stashGrid.innerHTML = '<p class="empty-stash">Схрон пуст. Вынеси лут с рейда.</p>';
      return;
    }
    this.el.stashGrid.innerHTML = items
      .map(
        (item, i) => `
      <div class="stash-item">
        <span>${item.name}</span>
        <span>${item.value || 0} ₽</span>
        <button type="button" class="sell-btn" data-idx="${i}">Продать</button>
      </div>`
      )
      .join('');

    this.el.stashGrid.querySelectorAll('.sell-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const r = sellStashItem(this.profile, Number(btn.dataset.idx));
        if (!r.ok) return;
        this.profile = r.profile;
        await this.storage.save(this.profile);
        this.renderStash();
        this.render();
      });
    });
  }

  render() {
    if (!this.profile) return;
    const p = this.profile;
    const level = xpToLevel(p.xp);
    const nextXp = xpForNextLevel(level);
    const prevXp = xpForNextLevel(level - 1);
    const pct = ((p.xp - prevXp) / (nextXp - prevXp)) * 100;

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

    const ld = p.loadout || {};
    const parts = [];
    if (ld.extraMedkits) parts.push(`Аптечки: +${ld.extraMedkits}`);
    if (ld.extraAmmo) parts.push(`Патроны: +${ld.extraAmmo}`);
    if (ld.startArmor) parts.push(`Броня: ${ld.startArmor}`);
    if (this.el.loadoutInfo) {
      this.el.loadoutInfo.textContent = parts.length ? parts.join(' · ') : 'Стандартный выход';
    }

    this.drawCharacter();
  }

  drawCharacter() {
    const canvas = this.el.charCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const grd = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, 70);
    grd.addColorStop(0, 'rgba(201, 162, 39, 0.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.72, 28, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.55, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2c2418';
    ctx.fillRect(w / 2 + 8, h * 0.55 - 4, 20, 8);

    if (this.profile?.loadout?.startArmor) {
      ctx.strokeStyle = '#5dade2';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.55, 28, 0, Math.PI * 2);
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
