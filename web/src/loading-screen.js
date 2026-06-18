export class LoadingScreen {
  constructor() {
    this.el = document.getElementById('loading-screen');
    this.bar = document.getElementById('loading-bar');
    this.status = document.getElementById('loading-status');
    this.percent = document.getElementById('loading-percent');
    this.progress = 0;
  }

  setProgress(value, message) {
    this.progress = Math.max(this.progress, Math.min(100, value));
    if (this.bar) this.bar.style.width = `${this.progress}%`;
    if (this.percent) this.percent.textContent = `${Math.round(this.progress)}%`;
    if (this.status && message) this.status.textContent = message;
  }

  async hide() {
    if (!this.el) return;
    this.setProgress(100, 'Готово');
    this.el.classList.add('loading-screen--out');
    await new Promise((r) => setTimeout(r, 520));
    this.el.classList.add('hidden');
  }
}
