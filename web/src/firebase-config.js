/** RaidSim-Online — Firebase (raidsim-online) */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyA-3aRyouBJxo1zf9VJh3ZVTANp5OOimYI',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'raidsim-online.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'raidsim-online',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'raidsim-online.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '101518243281',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:101518243281:web:ee83a6accfd7b4b0fe1cf0',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-8T1LBN9MSS',
};

export function isFirebaseConfigured() {
  const { apiKey, projectId, appId } = firebaseConfig;
  if (!apiKey || !projectId || !appId) return false;
  if (apiKey === 'YOUR_API_KEY' || projectId === 'YOUR_PROJECT_ID') return false;
  return true;
}
