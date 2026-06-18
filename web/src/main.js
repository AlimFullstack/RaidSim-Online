import { Game, createUI } from './game.js';
import { FestiveBackground, Confetti, GameFx } from './fx.js';
import { AudioManager } from './audio.js';
import { AuthService, ProfileStorage } from './auth.js';
import { Lobby } from './lobby.js';

const canvas = document.getElementById('game');
const ui = createUI();
const confetti = new Confetti();
const fx = new GameFx();
const audio = new AudioManager();
const festiveBg = new FestiveBackground(document.getElementById('festive-bg'));
festiveBg.loop();

ui.updateMuteButton(audio.isMuted());

const auth = new AuthService();
const storage = new ProfileStorage(auth);
const game = new Game(canvas, ui, confetti, audio, fx);

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

async function boot() {
  bindAudioUnlock();

  lobby = new Lobby(auth, storage, {
    audio,
    unlockAudio: () => audio.unlock(preferredMusicTrack()),
    onPlay(mode, loadout, mapId) {
      audio.unlock('raid');
      festiveBg.setActive(false);
      game.startRaid(mode, loadout, mapId);
    },
  });

  await auth.init();

  if (auth.isLoggedIn()) {
    await lobby.refreshProfile();
    lobby.showLobby();
  } else {
    lobby.showAuth();
  }

  document.getElementById('overlay')?.classList.add('hidden');
}

document.getElementById('btn-retry')?.addEventListener('click', async () => {
  const payload = game.getEndPayload();
  if (payload && lobby) {
    await lobby.onRaidEnd(payload);
  }
  ui.hideEnd();
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
