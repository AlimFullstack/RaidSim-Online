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

async function boot() {
  audio.init();
  audio.startMusic('lobby');

  lobby = new Lobby(auth, storage, {
    audio,
    onPlay(mode, loadout, mapId) {
      audio.init();
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
  audio.init();
  audio.startMusic('lobby');
});

document.getElementById('btn-mute')?.addEventListener('click', () => {
  audio.init();
  const muted = audio.toggleMute();
  ui.updateMuteButton(muted);
  if (!muted && game.state === 'raid') audio.startMusic('raid');
  else if (!muted && game.state !== 'raid') audio.startMusic('lobby');
});

window.addEventListener('resize', () => game.resize());
game.resize();
requestAnimationFrame((t) => game.loop(t));

boot();
