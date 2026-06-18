# RaidSim-Online

**Браузерный рейд в духе Escape from Tarkov** — карта 4x4, кубики-укрытия, лут, Scav''ы и экстракт.

---

## Играть онлайн

### [Запустить RaidSim-Online](https://alimfrontend.github.io/RaidSim-Online/)

---

## Локальная разработка

```bash
cd web
npm install
npm run dev
```

## Деплой на GitHub Pages

При пуше в `main` GitHub Actions автоматически собирает игру и публикует ее.

В настройках репозитория: **Settings -> Pages -> Source: GitHub Actions**.

Ручная сборка:

```bash
cd web
npm run build:pages
```

---

## Управление

| Клавиша | Действие |
|---------|----------|
| WASD | Движение |
| Мышь + ЛКМ | Прицел и стрельба |
| R | Перезарядка |
| E (удерж.) | Поиск лута |
| F | Аптечка |

**Цель:** собрать лут, выжить и выйти через зеленую зону экстракта за 8 минут.

---

## Документация (настольная версия)

Правила физической игры на кубиках в комнате 4x4 м:

- [`01-map-layout.md`](01-map-layout.md) — схема карты
- [`02-rules.md`](02-rules.md) — правила
- [`03-items-and-loot.md`](03-items-and-loot.md) — предметы
- [`04-setup-checklist.md`](04-setup-checklist.md) — чеклист

Веб-игра в папке [`web/`](web/) — отдельный проект на Vite.