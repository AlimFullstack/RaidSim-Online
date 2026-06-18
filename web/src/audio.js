const STORAGE_KEY = 'raidsim-muted';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = 0.32;
    this.musicVol = 0.14;
    this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    this.musicGain = null;
    this.sfxGain = null;
    this.currentTrack = null;
    this.musicNodes = [];
    this.musicTimer = null;
    this.footstepTimer = 0;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain.connect(this.ctx.destination);
    this._applyVolumes();
  }

  _applyVolumes() {
    if (!this.musicGain) return;
    const m = this.muted ? 0 : 1;
    this.musicGain.gain.value = this.master * this.musicVol * m;
    this.sfxGain.gain.value = this.master * m;
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    this._applyVolumes();
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  play(name, opts = {}) {
    if (this.muted || !this.ctx) return;
    const fn = SOUNDS[name];
    if (fn) fn(this.ctx, this.sfxGain, opts);
  }

  playRaidEnd(success) {
    this.stopMusic();
    this.play(success ? 'raidWin' : 'raidLose');
  }

  startMusic(track = 'lobby') {
    if (!this.ctx) return;
    if (this.currentTrack === track) return;
    this.stopMusic();
    this.currentTrack = track;
    const fn = MUSIC[track];
    if (fn) fn(this);
  }

  stopMusic() {
    this.currentTrack = null;
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    for (const n of this.musicNodes) {
      try {
        n.stop?.();
        n.disconnect?.();
      } catch {
        /* already stopped */
      }
    }
    this.musicNodes = [];
  }

  tickFootsteps(dt, sprinting) {
    if (this.muted || !this.ctx) return;
    this.footstepTimer -= dt;
    if (this.footstepTimer <= 0) {
      this.play(sprinting ? 'sprintStep' : 'footstep');
      this.footstepTimer = sprinting ? 0.22 : 0.38;
    }
  }
}

function tone(ctx, dest, freq, type, duration, vol = 1, freqEnd = null, delay = 0) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + duration);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(t);
  osc.stop(t + duration + 0.02);
  return { osc, gain };
}

function noise(ctx, dest, duration, vol = 1, delay = 0) {
  const t = ctx.currentTime + delay;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(gain);
  gain.connect(dest);
  src.start(t);
  return { src, gain };
}

const SOUNDS = {
  shoot(ctx, dest, opts = {}) {
    const w = opts.weapon || 'pm';
    if (w === 'shotgun') {
      noise(ctx, dest, 0.12, 0.55);
      tone(ctx, dest, 90, 'square', 0.08, 0.4, 40);
    } else if (w === 'ak') {
      noise(ctx, dest, 0.05, 0.45);
      tone(ctx, dest, 140, 'sawtooth', 0.06, 0.35, 70);
      tone(ctx, dest, 280, 'square', 0.04, 0.15, 120);
    } else {
      noise(ctx, dest, 0.06, 0.5);
      tone(ctx, dest, 180, 'square', 0.05, 0.35, 80);
    }
  },
  shootEnemy(ctx, dest) {
    noise(ctx, dest, 0.05, 0.3);
    tone(ctx, dest, 120, 'square', 0.06, 0.25, 60);
  },
  hit(ctx, dest) {
    tone(ctx, dest, 90, 'triangle', 0.08, 0.4, 40);
    noise(ctx, dest, 0.04, 0.2);
  },
  hitArmor(ctx, dest) {
    tone(ctx, dest, 200, 'square', 0.06, 0.35, 100);
    noise(ctx, dest, 0.03, 0.25);
  },
  kill(ctx, dest) {
    tone(ctx, dest, 55, 'sine', 0.15, 0.5, 30);
    noise(ctx, dest, 0.1, 0.2);
  },
  reload(ctx, dest) {
    tone(ctx, dest, 400, 'square', 0.04, 0.25);
    tone(ctx, dest, 600, 'square', 0.05, 0.2, 300, 0.06);
    noise(ctx, dest, 0.03, 0.15, 0.1);
  },
  reloadDone(ctx, dest) {
    tone(ctx, dest, 520, 'sine', 0.05, 0.15, 600);
  },
  loot(ctx, dest) {
    tone(ctx, dest, 520, 'sine', 0.1, 0.35, 780);
    tone(ctx, dest, 780, 'sine', 0.08, 0.2, 980, 0.05);
  },
  search(ctx, dest) {
    noise(ctx, dest, 0.06, 0.08);
    tone(ctx, dest, 300, 'sine', 0.05, 0.1, 400);
  },
  extract(ctx, dest) {
    tone(ctx, dest, 330, 'sine', 0.12, 0.2, 440);
    tone(ctx, dest, 440, 'sine', 0.1, 0.15, 550, 0.08);
  },
  extractZone(ctx, dest) {
    tone(ctx, dest, 220, 'sine', 0.2, 0.12, 280);
  },
  raidWin(ctx, dest) {
    tone(ctx, dest, 440, 'sine', 0.15, 0.35);
    tone(ctx, dest, 554, 'sine', 0.2, 0.35, null, 0.12);
    tone(ctx, dest, 659, 'sine', 0.3, 0.35, null, 0.28);
  },
  raidLose(ctx, dest) {
    tone(ctx, dest, 220, 'sine', 0.25, 0.4, 110);
    tone(ctx, dest, 165, 'sine', 0.35, 0.3, 80, 0.2);
  },
  death(ctx, dest) {
    tone(ctx, dest, 150, 'sawtooth', 0.4, 0.35, 40);
    noise(ctx, dest, 0.2, 0.25);
  },
  empty(ctx, dest) {
    tone(ctx, dest, 800, 'square', 0.03, 0.15, 400);
  },
  medkit(ctx, dest) {
    tone(ctx, dest, 400, 'sine', 0.1, 0.25, 600);
    tone(ctx, dest, 500, 'sine', 0.15, 0.2, 700, 0.08);
  },
  grenade(ctx, dest) {
    noise(ctx, dest, 0.25, 0.6);
    tone(ctx, dest, 60, 'sine', 0.3, 0.5, 20);
    tone(ctx, dest, 40, 'triangle', 0.4, 0.3, 15, 0.05);
  },
  smoke(ctx, dest) {
    noise(ctx, dest, 0.2, 0.2);
    tone(ctx, dest, 180, 'sine', 0.15, 0.15, 120);
  },
  equip(ctx, dest) {
    tone(ctx, dest, 440, 'square', 0.06, 0.2, 660);
    tone(ctx, dest, 660, 'sine', 0.08, 0.15, 880, 0.04);
  },
  fail(ctx, dest) {
    tone(ctx, dest, 180, 'square', 0.1, 0.25, 120);
  },
  alert(ctx, dest) {
    tone(ctx, dest, 440, 'square', 0.08, 0.2, 330);
    tone(ctx, dest, 330, 'square', 0.08, 0.2, 440, 0.1);
  },
  footstep(ctx, dest) {
    noise(ctx, dest, 0.03, 0.06);
    tone(ctx, dest, 80, 'sine', 0.03, 0.05, 50);
  },
  sprintStep(ctx, dest) {
    noise(ctx, dest, 0.04, 0.1);
    tone(ctx, dest, 100, 'sine', 0.03, 0.07, 60);
  },
  uiClick(ctx, dest) {
    tone(ctx, dest, 600, 'sine', 0.04, 0.12, 800);
  },
  wallHit(ctx, dest) {
    noise(ctx, dest, 0.04, 0.15);
    tone(ctx, dest, 120, 'triangle', 0.05, 0.15, 60);
  },
  questDone(ctx, dest) {
    tone(ctx, dest, 523, 'sine', 0.12, 0.25);
    tone(ctx, dest, 659, 'sine', 0.12, 0.25, null, 0.1);
    tone(ctx, dest, 784, 'sine', 0.2, 0.25, null, 0.2);
  },
};

function startDrone(audio, freq, type, vol) {
  const { ctx, musicGain } = audio;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = vol;
  osc.connect(gain);
  gain.connect(musicGain);
  osc.start();
  audio.musicNodes.push(osc, gain);
  return { osc, gain };
}

const MUSIC = {
  lobby(audio) {
    const { ctx, musicGain } = audio;
    startDrone(audio, 55, 'sine', 0.08);
    startDrone(audio, 82, 'triangle', 0.04);

    const notes = [220, 262, 294, 330, 294, 262];
    let i = 0;
    const playNote = () => {
      if (audio.currentTrack !== 'lobby') return;
      const freq = notes[i % notes.length];
      tone(ctx, musicGain, freq, 'sine', 1.8, 0.06, freq * 1.01);
      i += 1;
    };
    playNote();
    audio.musicTimer = setInterval(playNote, 2200);
  },

  raid(audio) {
    const { ctx, musicGain } = audio;
    startDrone(audio, 45, 'sine', 0.1);
    startDrone(audio, 48, 'triangle', 0.05);

    const notes = [110, 123, 130, 123, 98, 110];
    let i = 0;
    const playNote = () => {
      if (audio.currentTrack !== 'raid') return;
      const freq = notes[i % notes.length];
      tone(ctx, musicGain, freq, 'triangle', 2.2, 0.05, freq * 0.98);
      i += 1;
    };
    playNote();
    audio.musicTimer = setInterval(playNote, 2800);
  },
};
