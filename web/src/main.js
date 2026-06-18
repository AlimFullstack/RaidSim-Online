import { Game, createUI } from './game.js';
import { FestiveBackground, Confetti } from './fx.js';

const canvas = document.getElementById('game');
const ui = createUI();
const confetti = new Confetti();
const festiveBg = new FestiveBackground(document.getElementById('festive-bg'));
festiveBg.loop();

const game = new Game(canvas, ui, confetti);

document.getElementById('btn-start').addEventListener('click', () => {
  festiveBg.setActive(false);
  game.startRaid();
});

document.getElementById('btn-retry').addEventListener('click', () => {
  ui.hideEnd();
  ui.showOverlay();
  festiveBg.setActive(true);
  game.state = 'menu';
});

window.addEventListener('resize', () => game.resize());
game.resize();
requestAnimationFrame((t) => game.loop(t));
