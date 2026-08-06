import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyAO7YdkKkDtyKPM9fWGGB1FRmNx8oFV61k',
  // Same-origin auth handler (Hosting serves /__/auth/*); the cross-origin
  // firebaseapp.com domain breaks redirect sign-in under storage partitioning.
  authDomain: 'mend-467f5.web.app',
  databaseURL: 'https://mend-467f5-default-rtdb.firebaseio.com',
  projectId: 'mend-467f5',
  storageBucket: 'mend-467f5.firebasestorage.app',
  messagingSenderId: '238537262774',
  appId: '1:238537262774:web:56b7e27e4a184e44400817',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

if (import.meta.env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, 'localhost', 9000);
}
