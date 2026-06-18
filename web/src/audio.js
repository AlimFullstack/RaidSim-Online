const STORAGE_KEY = 'raidsim-muted';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = 0.3;
    this.muted = localStorage.getItem(STORAGE_KEY) === '1';
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  play(name) {
    if (this.muted || !this.ctx) return;
    const fn = SOUNDS[name];
    if (fn) fn(this.ctx, this.master);
  }

  playRaidEnd(success) {
    this.play(success ? 'raidWin' : 'raidLose');
  }
}

function tone(ctx, master, freq, type, duration, vol = 1, freqEnd = null) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
  gain.gain.setValueAtTime(master * vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function noise(ctx, master, duration, vol = 1) {
  const t = ctx.currentTime;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(master * vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(t);
}

const SOUNDS = {
  shoot(ctx, m) {
    noise(ctx, m, 0.06, 0.5);
    tone(ctx, m, 180, 'square', 0.05, 0.35, 80);
  },
  shootEnemy(ctx, m) {
    noise(ctx, m, 0.05, 0.3);
    tone(ctx, m, 120, 'square', 0.06, 0.25, 60);
  },
  hit(ctx, m) {
    tone(ctx, m, 90, 'triangle', 0.08, 0.4, 40);
  },
  kill(ctx, m) {
    tone(ctx, m, 55, 'sine', 0.15, 0.5, 30);
    noise(ctx, m, 0.1, 0.2);
  },
  reload(ctx, m) {
    tone(ctx, m, 400, 'square', 0.04, 0.25);
    tone(ctx, m, 600, 'square', 0.05, 0.2, 300);
  },
  loot(ctx, m) {
    tone(ctx, m, 520, 'sine', 0.1, 0.35, 780);
  },
  extract(ctx, m) {
    tone(ctx, m, 330, 'sine', 0.12, 0.2, 440);
  },
  raidWin(ctx, m) {
    tone(ctx, m, 440, 'sine', 0.15, 0.35);
    setTimeout(() => tone(ctx, m, 554, 'sine', 0.2, 0.35), 120);
    setTimeout(() => tone(ctx, m, 659, 'sine', 0.3, 0.35), 280);
  },
  raidLose(ctx, m) {
    tone(ctx, m, 220, 'sine', 0.25, 0.4, 110);
  },
  empty(ctx, m) {
    tone(ctx, m, 800, 'square', 0.03, 0.15, 400);
  },
};
