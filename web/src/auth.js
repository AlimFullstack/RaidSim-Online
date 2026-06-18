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
import { createDefaultProfile } from './profile.js';

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
      isSupported().then((ok) => {
        if (ok) analytics = getAnalytics(app);
      });
    }
  }
  return true;
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

export class ProfileStorage {
  constructor(authService) {
    this.auth = authService;
  }

  async load() {
    if (this.auth.isGuest()) {
      return this.auth.guestProfile || createDefaultProfile({ displayName: 'Гость', isGuest: true });
    }

    if (!this.auth.isLoggedIn() || !ensureFirebase()) {
      return null;
    }

    const uid = this.auth.user.uid;
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      return {
        ...createDefaultProfile(),
        ...data,
        isGuest: false,
        displayName: data.displayName || this.auth.user.displayName,
        photoURL: data.photoURL || this.auth.user.photoURL,
      };
    }

    const fresh = createDefaultProfile({
      isGuest: false,
      displayName: this.auth.user.displayName || 'Оператор',
      photoURL: this.auth.user.photoURL,
      email: this.auth.user.email,
    });
    await this.save(fresh);
    return fresh;
  }

  async save(profile) {
    if (this.auth.isGuest()) {
      this.auth.guestProfile = profile;
      return;
    }

    if (!this.auth.isLoggedIn() || !ensureFirebase()) return;

    const uid = this.auth.user.uid;
    const ref = doc(db, 'users', uid);
    await setDoc(
      ref,
      {
        ...profile,
        displayName: profile.displayName || this.auth.user.displayName,
        photoURL: profile.photoURL || this.auth.user.photoURL,
        email: this.auth.user.email,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  }
}
