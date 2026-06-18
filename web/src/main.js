import { Game, createUI } from './game.js';
import { FestiveBackground, Confetti, GameFx } from './fx.js';
import { AudioManager } from './audio.js';
import { AuthService, ProfileStorage } from './auth.js';
import { Lobby } from './lobby.js';
import { loadSettings, saveSettings } from './settings.js';
import { LoadingScreen } from './loading-screen.js';

const canvas = document.getElementById('game');
const ui = createUI();
const confetti = new Confetti();
const fx = new GameFx();
const audio = new AudioManager();
const festiveBg = new FestiveBackground(document.getElementById('festive-bg'));
festiveBg.loop();

const settings = loadSettings();
audio.applySettings(settings);

ui.updateMuteButton(audio.isMuted());

const auth = new AuthService();
const storage = new ProfileStorage(auth);
const game = new Game(canvas, ui, confetti, audio, fx);
game.applySettings(settings);

let lobby = null;
let audioUnlockBound = false;

function preferredMusicTrack() {
  if (game.state === 'raid') return 'raid';
  return 'lobby';
}

function bindAudioUnlock() {
  if (audioUnlockBound) return;
  audioUnlockBound = true;

  const unlock = () => {
    audio.unlock(preferredMusicTrack());
  };

  const opts = { once: true, passive: true };
  document.addEventListener('pointerdown', unlock, opts);
  document.addEventListener('keydown', unlock, opts);
}

function openSettings() {
  const el = document.getElementById('settings-modal');
  if (!el) return;
  el.classList.remove('hidden');
  ui.renderSettings(game.settings);
}

function closeSettings() {
  document.getElementById('settings-modal')?.classList.add('hidden');
  game.settingsOpen = false;
}

function persistSettingsFromUI() {
  const s = {
    masterVol: Number(document.getElementById('vol-master')?.value || 32) / 100,
    sfxVol: Number(document.getElementById('vol-sfx')?.value || 100) / 100,
    musicVol: Number(document.getElementById('vol-music')?.value || 14) / 100,
    mouseSens: Number(document.getElementById('mouse-sens')?.value || 100) / 100,
  };
  saveSettings(s);
  game.applySettings(s);
}

function bindSettingsUI() {
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    if (game.state === 'raid') game.toggleSettings();
    else openSettings();
  });
  document.getElementById('settings-close')?.addEventListener('click', closeSettings);
  document.getElementById('settings-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') closeSettings();
  });

  document.querySelectorAll('.settings-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.settings-pane').forEach((p) => p.classList.add('hidden'));
      document.getElementById(`stab-${tab.dataset.stab}`)?.classList.remove('hidden');
    });
  });

  for (const id of ['vol-master', 'vol-sfx', 'vol-music', 'mouse-sens']) {
    document.getElementById(id)?.addEventListener('input', persistSettingsFromUI);
  }
}

async function boot() {
  const loading = new LoadingScreen();
  loading.setProgress(8, 'Звук и настройки...');
  bindAudioUnlock();
  bindSettingsUI();

  loading.setProgress(22, 'Игровые системы...');
  lobby = new Lobby(auth, storage, {
    audio,
    unlockAudio: () => audio.unlock(preferredMusicTrack()),
    onPlay(mode, loadout, mapId) {
      audio.unlock('raid');
      audio.startMusic('raid');
      festiveBg.setActive(false);
      game.startRaid(mode, loadout, mapId);
    },
  });

  loading.setProgress(45, 'Подключение...');
  await auth.init();

  loading.setProgress(72, 'Загрузка профиля...');
  if (auth.isLoggedIn()) {
    await lobby.refreshProfile();
    loading.setProgress(92, 'Подготовка лобби...');
    lobby.showLobby();
  } else {
    loading.setProgress(92, 'Ожидание входа...');
    lobby.showAuth();
  }

  document.getElementById('overlay')?.classList.add('hidden');
  loading.setProgress(100, 'Готово');
  await loading.hide();
}

document.getElementById('btn-retry')?.addEventListener('click', async () => {
  const payload = game.getEndPayload();
  if (payload && lobby) {
    await lobby.onRaidEnd(payload);
  }
  ui.hideEnd();
  closeSettings();
  festiveBg.setActive(true);
  game.state = 'menu';
  audio.unlock('lobby');
});

document.getElementById('btn-mute')?.addEventListener('click', async () => {
  await audio.unlock(preferredMusicTrack());
  const muted = audio.toggleMute();
  ui.updateMuteButton(muted);
  if (!muted) audio.startMusic(preferredMusicTrack());
});

window.addEventListener('resize', () => game.resize());
game.resize();
requestAnimationFrame((t) => game.loop(t));

boot();
