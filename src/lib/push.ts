// Real push reminders via FCM — the piece local notifications can't do
// (fire with the app closed). Each device opts in from Settings; tokens
// live under settings/fcmTokens and the scheduled Cloud Function fans out.
//
// TODO(sterling): replace with the Web Push certificate key pair from
// Firebase console → Project settings → Cloud Messaging (needs Blaze).

import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { app } from './firebase';
import { removeFcmToken, saveFcmToken } from '../store/sync';
import { toast } from '../components/ui/Toast';

export const VAPID_KEY = 'MEND_VAPID_KEY';

const ENABLED_KEY = 'mend:push';
const DEVICE_KEY = 'mend:push:device';

export function isPushConfigured(): boolean {
  return !VAPID_KEY.startsWith('MEND_');
}

/** Stable per-device id so each phone owns one token slot. */
function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function isPushEnabledHere(): boolean {
  return (
    localStorage.getItem(ENABLED_KEY) === '1' &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted'
  );
}

let foregroundListening = false;

export async function enablePushHere(): Promise<boolean> {
  if (!isPushConfigured() || !(await isSupported().catch(() => false))) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return false;

  await saveFcmToken(deviceId(), token);
  localStorage.setItem(ENABLED_KEY, '1');

  if (!foregroundListening) {
    foregroundListening = true;
    onMessage(messaging, (payload) => {
      toast(payload.notification?.title ?? 'Mend', payload.notification?.body);
    });
  }
  return true;
}

export async function disablePushHere(): Promise<void> {
  localStorage.removeItem(ENABLED_KEY);
  await removeFcmToken(deviceId()).catch(() => undefined);
}
