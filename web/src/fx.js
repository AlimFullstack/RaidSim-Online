import { getMapTheme } from './map-atmosphere.js';

const COLORS = ['#4a5a42', '#6a7264', '#3a4a38', '#8a9a7a', '#2a3228', '#5a6a52', '#7a8a6a'];

export class FestiveBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.active = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    for (let i = 0; i < 80; i++) {
      this.particles.push(this.spawn(true));
    }
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  spawn(randomY = false) {
    return {
      x: Math.random() * this.canvas.width,
      y: randomY ? Math.random() * this.canvas.height : -10,
      size: 1 + Math.random() * 3,
      speed: 0.3 + Math.random() * 1.2,
      drift: (Math.random() - 0.5) * 0.4,
      alpha: 0.2 + Math.random() * 0.6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      twinkle: Math.random() * Math.PI * 2,
    };
  }

  draw() {
    if (!this.active) return;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const grad = ctx.createRadialGradient(
      canvas.width * 0.5,
      canvas.height * 0.3,
      0,
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.width * 0.8
    );
    grad.addColorStop(0, 'rgba(58, 68, 52, 0.12)');
    grad.addColorStop(0.5, 'rgba(10, 12, 10, 0.5)');
    grad.addColorStop(1, 'rgba(4, 5, 4, 0.95)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const t = Date.now() / 1000;
    for (const p of this.particles) {
      p.y += p.speed;
      p.x += p.drift + Math.sin(t + p.twinkle) * 0.15;
      p.twinkle += 0.02;

      if (p.y > canvas.height + 10) Object.assign(p, this.spawn());

      const a = p.alpha * (0.6 + Math.sin(p.twinkle) * 0.4);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      if (p.size > 2) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = a * 0.5;
        const s = p.size * 3;
        ctx.beginPath();
        ctx.moveTo(p.x - s, p.y);
        ctx.lineTo(p.x + s, p.y);
        ctx.moveTo(p.x, p.y - s);
        ctx.lineTo(p.x, p.y + s);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  loop() {
    this.draw();
    requestAnimationFrame(() => this.loop());
  }

  setActive(v) {
    this.active = v;
    if (!v) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

export class Confetti {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'confetti';
    this.canvas.className = 'confetti-canvas';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.pieces = [];
    this.running = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  burst(count = 120) {
    this.running = true;
    this.canvas.classList.add('visible');
    for (let i = 0; i < count; i++) {
      this.pieces.push({
        x: this.canvas.width * 0.5 + (Math.random() - 0.5) * 200,
        y: this.canvas.height * 0.4,
        vx: (Math.random() - 0.5) * 12,
        vy: -4 - Math.random() * 10,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 8,
        h: 4 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 2 + Math.random() * 2,
      });
    }
    if (!this._looping) {
      this._looping = true;
      this.loop();
    }
  }

  loop() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.pieces = this.pieces.filter((p) => {
      p.life -= 0.016;
      p.vy += 0.25;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;

      if (p.life <= 0) return false;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      return true;
    });

    if (this.pieces.length > 0) {
      requestAnimationFrame(() => this.loop());
    } else {
      this.running = false;
      this._looping = false;
      this.canvas.classList.remove('visible');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

/** In-world and screen-space combat / interaction feedback */
export class GameFx {
  constructor() {
    this.particles = [];
    this.floats = [];
    this.rings = [];
    this.muzzles = [];
    this.screenFlash = 0;
    this.screenFlashColor = '#ff0000';
    this.vignette = 0;
    this.extractGlow = 0;
    this.camKickX = 0;
    this.camKickY = 0;
  }

  clear() {
    this.particles = [];
    this.floats = [];
    this.rings = [];
    this.muzzles = [];
    this.screenFlash = 0;
    this.vignette = 0;
    this.extractGlow = 0;
    this.camKickX = 0;
    this.camKickY = 0;
  }

  spawnParticles(x, y, opts = {}) {
    const {
      count = 8,
      color = '#f5e6a8',
      speed = 120,
      life = 0.4,
      size = 3,
      spread = Math.PI * 2,
      angle = 0,
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.8),
        color,
      });
    }
  }

  floatText(x, y, text, color = '#fff') {
    this.floats.push({ x, y, text, color, life: 1.4, vy: -40 });
  }

  muzzleFlash(x, y, angle, color = '#ffe08a', size = 1) {
    this.muzzles.push({ x, y, angle, life: 0.1, color, size });
    this.spawnParticles(x, y, {
      count: Math.round(5 * size),
      color,
      speed: 120 * size,
      life: 0.14,
      size: 2 * size,
      spread: 0.4,
      angle,
    });
  }

  kickCamera(strength, angle) {
    this.camKickX += Math.cos(angle + Math.PI) * strength * 0.35;
    this.camKickY += Math.sin(angle + Math.PI) * strength * 0.35;
  }

  shellCasing(x, y, angle) {
    this.spawnParticles(x, y, {
      count: 1,
      color: '#d4af37',
      speed: 90,
      life: 0.35,
      size: 2,
      spread: 0.8,
      angle: angle + Math.PI / 2,
    });
  }

  hitSparks(x, y) {
    this.spawnParticles(x, y, { count: 10, color: '#ff6b6b', speed: 160, life: 0.25, size: 3 });
    this.spawnParticles(x, y, { count: 6, color: '#ffe08a', speed: 100, life: 0.2, size: 2 });
  }

  bloodBurst(x, y) {
    this.spawnParticles(x, y, { count: 14, color: '#c0392b', speed: 90, life: 0.5, size: 4 });
  }

  lootSparkle(x, y) {
    this.spawnParticles(x, y, { count: 16, color: '#5dade2', speed: 70, life: 0.6, size: 3 });
    this.spawnParticles(x, y, { count: 8, color: '#ffd700', speed: 50, life: 0.5, size: 2 });
    this.rings.push({ x, y, r: 8, maxR: 40, life: 0.5, color: 'rgba(93, 173, 226, 0.6)' });
  }

  explosion(x, y, radius = 100) {
    this.rings.push({ x, y, r: 10, maxR: radius, life: 0.45, color: 'rgba(255, 120, 40, 0.7)' });
    this.rings.push({ x, y, r: 6, maxR: radius * 0.7, life: 0.35, color: 'rgba(255, 220, 100, 0.5)' });
    this.spawnParticles(x, y, { count: 24, color: '#ff6b35', speed: 200, life: 0.5, size: 5 });
    this.spawnParticles(x, y, { count: 12, color: '#555', speed: 80, life: 0.8, size: 6 });
    this.screenFlash = 0.15;
    this.screenFlashColor = 'rgba(255, 100, 40, 0.35)';
  }

  smokePuff(x, y) {
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 20,
        vy: -20 - Math.random() * 30,
        life: 1.2 + Math.random() * 0.8,
        maxLife: 2,
        size: 12 + Math.random() * 16,
        color: 'rgba(160, 160, 160, 0.5)',
        smoke: true,
      });
    }
  }

  noiseRipple(x, y, radius) {
    this.rings.push({ x, y, r: 12, maxR: radius, life: 0.8, color: 'rgba(255, 200, 80, 0.25)' });
  }

  healGlow(x, y) {
    this.rings.push({ x, y, r: 10, maxR: 50, life: 0.6, color: 'rgba(46, 204, 113, 0.5)' });
    this.spawnParticles(x, y, { count: 10, color: '#2ecc71', speed: 40, life: 0.5, size: 3 });
  }

  extractPulse(x, y) {
    this.rings.push({ x, y, r: 20, maxR: 55, life: 0.5, color: 'rgba(46, 204, 113, 0.4)' });
    this.extractGlow = 0.4;
  }

  damageScreen(amount = 14) {
    this.screenFlash = Math.min(0.45, this.screenFlash + 0.12);
    this.screenFlashColor = `rgba(220, 40, 40, ${0.25 + amount / 80})`;
    this.vignette = Math.min(0.7, this.vignette + 0.25);
  }

  wallHit(x, y) {
    this.spawnParticles(x, y, { count: 6, color: '#8a7a60', speed: 60, life: 0.2, size: 2 });
  }

  footDust(x, y) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + 10,
      vx: (Math.random() - 0.5) * 15,
      vy: -10,
      life: 0.25,
      maxLife: 0.25,
      size: 2,
      color: 'rgba(180, 160, 120, 0.4)',
    });
  }

  update(dt) {
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.smoke) {
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.size += dt * 8;
      } else {
        p.vy += 120 * dt;
      }
      return p.life > 0;
    });

    this.floats = this.floats.filter((f) => {
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.95;
      return f.life > 0;
    });

    this.rings = this.rings.filter((r) => {
      r.life -= dt;
      r.r += (r.maxR - r.r) * dt * 6;
      return r.life > 0;
    });

    this.muzzles = this.muzzles.filter((m) => {
      m.life -= dt;
      return m.life > 0;
    });

    if (this.screenFlash > 0) this.screenFlash = Math.max(0, this.screenFlash - dt * 1.8);
    if (this.vignette > 0) this.vignette = Math.max(0, this.vignette - dt * 0.8);
    if (this.extractGlow > 0) this.extractGlow = Math.max(0, this.extractGlow - dt * 1.2);
    this.camKickX *= Math.max(0, 1 - dt * 14);
    this.camKickY *= Math.max(0, 1 - dt * 14);
  }

  drawWorld(ctx) {
    for (const r of this.rings) {
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = r.life * 1.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const m of this.muzzles) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      const s = m.size || 1;
      ctx.globalAlpha = m.life / 0.1;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(22 * s, -8 * s);
      ctx.lineTo(28 * s, 0);
      ctx.lineTo(22 * s, 8 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = (m.life / 0.1) * 0.7;
      ctx.beginPath();
      ctx.arc(6 * s, 0, 4 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const f of this.floats) {
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.font = 'bold 13px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  drawRaidFog(ctx, game) {
    const p = game.player;
    if (!p || p.dead || game.state !== 'raid') return;

    const theme = getMapTheme(game.activeMap?.theme);
    const viewW = game.canvas.width / game.scale;
    const viewH = game.canvas.height / game.scale;
    const aim = p.angle;
    const vision = theme.visionRadius;
    const coneRange = theme.coneRange;
    const coneAngle = theme.coneAngle;

    ctx.save();
    ctx.fillStyle = theme.fogColor;
    ctx.fillRect(game.camX - 20, game.camY - 20, viewW + 40, viewH + 40);

    ctx.globalCompositeOperation = 'destination-out';

    const foot = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, vision);
    foot.addColorStop(0, 'rgba(0,0,0,1)');
    foot.addColorStop(0.35, 'rgba(0,0,0,0.92)');
    foot.addColorStop(0.65, 'rgba(0,0,0,0.5)');
    foot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = foot;
    ctx.beginPath();
    ctx.arc(p.x, p.y, vision, 0, Math.PI * 2);
    ctx.fill();

    const coneGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, coneRange);
    coneGrad.addColorStop(0, 'rgba(0,0,0,1)');
    coneGrad.addColorStop(0.5, 'rgba(0,0,0,0.75)');
    coneGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.arc(p.x, p.y, coneRange, aim - coneAngle, aim + coneAngle);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = theme.fogTint;
    ctx.fillRect(game.camX - 20, game.camY - 20, viewW + 40, viewH + 40);
    ctx.restore();
  }

  drawRaidVignette(ctx, w, h) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.04, w / 2, h / 2, Math.max(w, h) * 0.52);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.4, 'rgba(0,0,0,0.45)');
    g.addColorStop(0.75, 'rgba(0,0,0,0.78)');
    g.addColorStop(1, 'rgba(0,0,0,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  drawFilmGrain(ctx, w, h, time = 0) {
    const count = Math.floor((w * h) / 900);
    ctx.save();
    for (let i = 0; i < count; i++) {
      const x = (Math.sin(time * 17 + i * 1.7) * 0.5 + 0.5) * w;
      const y = (Math.cos(time * 13 + i * 2.3) * 0.5 + 0.5) * h;
      ctx.fillStyle = `rgba(255,255,255,${0.02 + (i % 5) * 0.008})`;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  drawScreen(ctx, w, h, opts = {}) {
    if (this.screenFlash > 0) {
      ctx.fillStyle = this.screenFlashColor.includes('rgba') ? this.screenFlashColor : this.screenFlashColor;
      ctx.globalAlpha = this.screenFlash;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    if (this.vignette > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(120, 0, 0, ${this.vignette * 0.55})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    if (this.extractGlow > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.5);
      g.addColorStop(0, `rgba(46, 204, 113, ${this.extractGlow * 0.12})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    if (opts.raid) {
      this.drawRaidVignette(ctx, w, h);
      this.drawFilmGrain(ctx, w, h, opts.time || 0);
      if (opts.fogTint) {
        ctx.fillStyle = opts.fogTint;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    }
  }
}
