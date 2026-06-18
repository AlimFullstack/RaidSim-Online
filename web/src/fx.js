const COLORS = ['#ffd700', '#ff6b6b', '#2ecc71', '#c9a227', '#e8d5b5', '#ffffff', '#ff9ff3'];

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
    grad.addColorStop(0, 'rgba(201, 162, 39, 0.08)');
    grad.addColorStop(0.5, 'rgba(20, 24, 16, 0.4)');
    grad.addColorStop(1, 'rgba(5, 7, 4, 0.9)');
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
