import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Applies a waiting service worker automatically, but at most once per
// cooldown window. Two guards, because getting this wrong is expensive:
// an in-page ref (no double-apply within a render session) and a
// timestamped localStorage key (no reload loop ACROSS reloads — that loop
// flashed the sign-in screen repeatedly and killed in-flight writes).

const LAST_APPLIED_KEY = 'mend:sw-applied-at';
const COOLDOWN_MS = 10 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 60 * 1000;

function recentlyApplied(): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_APPLIED_KEY) ?? 0);
    return Number.isFinite(last) && Date.now() - last < COOLDOWN_MS;
  } catch {
    return false; // private mode: fall back to the in-page guard alone
  }
}

export function UpdatePrompt() {
  const applied = useRef(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => void registration.update(), CHECK_EVERY_MS);
    },
  });

  useEffect(() => {
    if (!needRefresh || applied.current || recentlyApplied()) return;
    applied.current = true;
    try {
      localStorage.setItem(LAST_APPLIED_KEY, String(Date.now()));
    } catch {
      /* private mode — the ref guard still prevents a same-session loop */
    }
    void updateServiceWorker(true);
  }, [needRefresh, updateServiceWorker]);

  return null;
}
