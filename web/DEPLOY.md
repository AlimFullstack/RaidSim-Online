# Tarkov Cubes — веб-игра

Браузерный рейд в духе Escape from Tarkov: карта 4×4, укрытия, лут, Scav'ы, экстракт.

## Локальный запуск

```bash
cd web
npm install
npm run dev
```

Откройте адрес из терминала (обычно http://localhost:5173).

## Сборка для деплоя

```bash
cd web
npm install
npm run build
```

Готовый сайт будет в папке **`web/dist`**.

## Деплой

### Netlify
1. Зарегистрируйтесь на [netlify.com](https://netlify.com)
2. «Add new site» → «Deploy manually»
3. Перетащите папку `dist`

Или через CLI:
```bash
npm i -g netlify-cli
cd web && npm run build
netlify deploy --prod --dir=dist
```

### Vercel
```bash
npm i -g vercel
cd web
vercel --prod
```
Укажите **Output Directory**: `dist`, **Build Command**: `npm run build`.

### GitHub Pages
1. Загрузите репозиторий на GitHub
2. В `web/vite.config.js` уже стоит `base: './'` — подходит для Pages
3. Actions / или в Settings → Pages → source: папка `dist` из ветки

Ручная публикация:
```bash
cd web && npm run build
# содержимое dist — в gh-pages ветку или в docs/
```

### Любой хостинг
Залейте **всё содержимое** `dist` на любой статический хостинг (Cloudflare Pages, Firebase Hosting и т.д.).

## Управление

| Клавиша | Действие |
|---------|----------|
| WASD | Движение |
| Мышь | Прицел |
| ЛКМ | Стрельба |
| R | Перезарядка |
| E (удерж.) | Поиск лута |
| F | Аптечка |

Цель: дожить до **зелёной зоны экстракта** внизу по центру и постоять там 5 секунд.
