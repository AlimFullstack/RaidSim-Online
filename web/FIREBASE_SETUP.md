# Настройка Google-входа и облачного сохранения

RaidSim использует **Firebase Authentication** (Google) и **Cloud Firestore** для профиля, схрона и прогресса.

## 1. Создай проект Firebase

1. Открой [Firebase Console](https://console.firebase.google.com/)
2. **Add project** → имя, например `raidsim-online`
3. Отключи Google Analytics (не обязательно)

## 2. Web-приложение

1. Project Overview → **Web** (`</>`)
2. Скопируй `firebaseConfig`
3. Создай файл `web/.env` из `web/.env.example` и вставь значения:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## 3. Authentication

1. **Build → Authentication → Get started**
2. **Sign-in method → Google → Enable**
3. **Settings → Authorized domains** — добавь:
   - `localhost`
   - `alimfrontend.github.io`

## 4. Firestore

1. **Build → Firestore Database → Create database**
2. Режим: **Start in test mode** (для разработки) или production rules ниже
3. Регион: ближайший к игрокам

### Правила безопасности (production)

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

## 5. GitHub Pages (CI)

В репозитории GitHub: **Settings → Secrets and variables → Actions** — добавь те же `VITE_FIREBASE_*` как secrets.

Обнови `.github/workflows/deploy.yml`:

```yaml
      - name: Install & build
        working-directory: web
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
        run: |
          npm ci
          npm run build:pages
```

## 6. Локальная проверка

```bash
cd web
cp .env.example .env
# заполни .env
npm install
npm run dev
```

## Режимы игры

| Режим | Сохранение |
|-------|------------|
| **Гость** | Только в памяти вкладки. F5 = всё пропало |
| **Google** | Профиль в Firestore. Сохраняется после рейда |

## Структура профиля в Firestore

```
users/{uid}
  displayName, photoURL, email
  xp, rubles
  stash: { items: [...] }
  loadout: { extraMedkits, extraAmmo, startArmor }
  stats: { raids, extracts, kills, totalLootValue }
```
