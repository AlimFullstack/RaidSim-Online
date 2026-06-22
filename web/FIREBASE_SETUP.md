# Firebase — RaidSim-Online

Проект **raidsim-online** подключён в коде. Конфиг в `web/src/firebase-config.js` и `web/.env`.

## Что уже сделано в коде

- Firebase SDK (Auth + Firestore + Analytics)
- Google-вход и сохранение профиля в `users/{uid}`
- Сборка GitHub Pages с ключами Firebase
- Правила Firestore: `firestore.rules`

## Один раз в Firebase Console

Если Google-вход ещё не работает, включи в [консоли](https://console.firebase.google.com/project/raidsim-online):

### 1. Authentication → Google → Enable

### 2. Authentication → Settings → Authorized domains

Добавь (если нет):

- `localhost`
- `alimfrontend.github.io`

### 3. Firestore Database → Create database

- Режим: **production** (правила уже в репозитории)
- Регион: `europe-west` или ближайший

Затем **Rules** → вставь содержимое файла `firestore.rules` из репозитория (включая `matchQueues`, `playerMatches`, `matches`).

> **Мультиплеер:** если видишь «Нет доступа к очереди» — в консоли всё ещё старые правила (только `users`). Обнови Rules и нажми **Publish**.

### 4. (Опционально) Задеплоить правила через CLI

```bash
npm install -g firebase-tools
firebase login
cd d:\AI\tarkov-cubes
firebase use raidsim-online
firebase deploy --only firestore:rules
```

## Локальный запуск

```bash
cd web
npm install
npm run dev
```

Файл `web/.env` уже создан.

## Режимы

| Режим | Сохранение |
|-------|------------|
| **Гость** | Только в памяти вкладки |
| **Google** | Firestore `users/{uid}` |

## Структура профиля

```
users/{uid}
  displayName, photoURL, email
  xp, rubles, stash, loadout, stats, quests, hideout
```
