import { Game, createUI } from './game.js';

const canvas = document.getElementById('game');
const ui = createUI();
const game = new Game(canvas, ui);

document.getElementById('btn-start').addEventListener('click', () => {
  game.startRaid();
});

document.getElementById('btn-retry').addEventListener('click', () => {
  ui.hideEnd();
  ui.showOverlay();
  game.state = 'menu';
});

window.addEventListener('resize', () => game.resize());
game.resize();
requestAnimationFrame((t) => game.loop(t));
