import { Game, createUI } from './game.js';
import { FestiveBackground, Confetti } from './fx.js';
import { AudioManager } from './audio.js';

const canvas = document.getElementById('game');
const ui = createUI();
const confetti = new Confetti();
const audio = new AudioManager();
const festiveBg = new FestiveBackground(document.getElementById('festive-bg'));
festiveBg.loop();

ui.updateMuteButton(audio.isMuted());

const game = new Game(canvas, ui, confetti, audio);

document.getElementById('btn-start').addEventListener('click', () => {
  audio.init();
  festiveBg.setActive(false);
  game.startRaid();
});

document.getElementById('btn-retry').addEventListener('click', () => {
  ui.hideEnd();
  ui.showOverlay();
  festiveBg.setActive(true);
  game.state = 'menu';
});

document.getElementById('btn-mute')?.addEventListener('click', () => {
  audio.init();
  const muted = audio.toggleMute();
  ui.updateMuteButton(muted);
});

window.addEventListener('resize', () => game.resize());
game.resize();
requestAnimationFrame((t) => game.loop(t));
