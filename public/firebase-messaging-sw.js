// FCM background service worker (separate scope from the app's PWA worker;
// the two coexist). Notification-type payloads are displayed by the
// browser automatically — this worker just needs FCM initialized.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAO7YdkKkDtyKPM9fWGGB1FRmNx8oFV61k',
  authDomain: 'mend-467f5.web.app',
  databaseURL: 'https://mend-467f5-default-rtdb.firebaseio.com',
  projectId: 'mend-467f5',
  storageBucket: 'mend-467f5.firebasestorage.app',
  messagingSenderId: '238537262774',
  appId: '1:238537262774:web:56b7e27e4a184e44400817',
});

firebase.messaging();
