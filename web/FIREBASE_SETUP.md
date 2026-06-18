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

Затем **Rules** → вставь из `firestore.rules` или:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

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
