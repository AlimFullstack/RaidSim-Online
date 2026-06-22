import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';
import { createDefaultProfile, ensureMigratedProfile } from './profile.js';
import { normalizeLoadout } from './inventory-core.js';
import { normalizeQuestRef } from './quests.js';

let app = null;
let auth = null;
let db = null;
let analytics = null;

function ensureFirebase() {
  if (!isFirebaseConfigured()) return false;
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    if (typeof window !== 'undefined') {
      isSupported()
        .then((ok) => {
          if (ok) {
            try {
              analytics = getAnalytics(app);
            } catch {
              /* blocked by adblock / network */
            }
          }
        })
        .catch(() => {});
    }
  }
  return true;
}

function stripUndefined(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = stripUndefined(v);
  }
  return out;
}

/** Prepare profile for Firestore — no client-only fields, no functions. */
export function serializeProfile(profile) {
  const { isGuest, ...rest } = profile;
  const data = stripUndefined({
    ...rest,
    quests: {
      completed: profile.quests?.completed || [],
      active: normalizeQuestRef(profile.quests?.active),
    },
    loadout: normalizeLoadout(profile.loadout || {}),
  });
  return data;
}

function hydrateProfile(data, user) {
  const base = createDefaultProfile();
  const quests = data.quests || base.quests;
  const merged = ensureMigratedProfile({
    ...base,
    ...data,
    isGuest: false,
    displayName: data.displayName || user.displayName,
    photoURL: data.photoURL || user.photoURL,
    quests: {
      completed: quests.completed || [],
      active: normalizeQuestRef(quests.active),
    },
  });
  return merged;
}

export class AuthService {
  constructor() {
    this.user = null;
    this.mode = null;
    this.listeners = [];
    this.guestProfile = null;
  }

  onChange(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  emit() {
    for (const fn of this.listeners) fn({ user: this.user, mode: this.mode });
  }

  async init() {
    if (!ensureFirebase()) {
      this.emit();
      return;
    }

    return new Promise((resolve) => {
      onAuthStateChanged(auth, (user) => {
        this.user = user;
        if (user) {
          this.mode = 'google';
        } else if (this.mode !== 'guest') {
          this.mode = null;
        }
        this.emit();
        resolve();
      });
    });
  }

  isConfigured() {
    return isFirebaseConfigured();
  }

  isGuest() {
    return this.mode === 'guest';
  }

  isLoggedIn() {
    return this.mode === 'google' && !!this.user;
  }

  async signInGuest() {
    this.user = null;
    this.mode = 'guest';
    this.guestProfile = createDefaultProfile({ displayName: 'Гость', isGuest: true });
    this.emit();
    return this.guestProfile;
  }

  async signInGoogle() {
    if (!ensureFirebase()) {
      throw new Error('Firebase не настроен. См. web/FIREBASE_SETUP.md');
    }
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    this.user = result.user;
    this.mode = 'google';
    this.emit();
    return result.user;
  }

  async signOut() {
    this.guestProfile = null;
    this.mode = null;
    if (auth && this.user) await firebaseSignOut(auth);
    this.user = null;
    this.emit();
  }

  getUid() {
    if (this.isGuest()) return 'guest';
    return this.user?.uid || null;
  }
}

export function getFirestoreDb() {
  if (!ensureFirebase()) return null;
  return db;
}

export class ProfileStorage {
  constructor(authService) {
    this.auth = authService;
  }

  async load() {
    if (this.auth.isGuest()) {
      const g = this.auth.guestProfile || createDefaultProfile({ displayName: 'Гость', isGuest: true });
      return ensureMigratedProfile(g);
    }

    if (!this.auth.isLoggedIn() || !ensureFirebase()) {
      return null;
    }

    const uid = this.auth.user.uid;
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return hydrateProfile(snap.data(), this.auth.user);
    }

    const fresh = createDefaultProfile({
      isGuest: false,
      displayName: this.auth.user.displayName || 'Оператор',
      photoURL: this.auth.user.photoURL,
      email: this.auth.user.email,
    });
    const saved = await this.save(fresh);
    if (!saved.ok) console.error('Profile save failed:', saved.msg);
    return fresh;
  }

  /** @returns {Promise<{ ok: boolean, msg?: string }>} */
  async save(profile) {
    if (this.auth.isGuest()) {
      this.auth.guestProfile = profile;
      return { ok: true };
    }

    if (!this.auth.isLoggedIn() || !ensureFirebase()) {
      return { ok: false, msg: 'Не авторизован' };
    }

    const uid = this.auth.user.uid;
    const ref = doc(db, 'users', uid);
    const payload = serializeProfile({
      ...profile,
      displayName: profile.displayName || this.auth.user.displayName,
      photoURL: profile.photoURL || this.auth.user.photoURL,
      email: this.auth.user.email,
      updatedAt: Date.now(),
    });

    try {
      await setDoc(ref, payload, { merge: true });
      return { ok: true };
    } catch (e) {
      console.error('Firestore save error:', e);
      const msg =
        e.code === 'permission-denied'
          ? 'Нет доступа к Firestore. Проверьте правила в Firebase Console.'
          : e.message || 'Ошибка сохранения';
      return { ok: false, msg };
    }
  }
}
