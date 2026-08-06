import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';

// TODO(sterling): replace with the real config from Firebase console →
// Project settings → General → Your apps. Keep authDomain on .web.app:
// Hosting serves the same-origin /__/auth/* handler; the cross-origin
// firebaseapp.com domain breaks redirect sign-in under storage partitioning.
const firebaseConfig = {
  apiKey: 'MEND_API_KEY',
  authDomain: 'MEND_PROJECT_ID.web.app',
  databaseURL: 'https://MEND_PROJECT_ID-default-rtdb.firebaseio.com',
  projectId: 'MEND_PROJECT_ID',
  storageBucket: 'MEND_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'MEND_SENDER_ID',
  appId: 'MEND_APP_ID',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

if (import.meta.env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, 'localhost', 9000);
}
