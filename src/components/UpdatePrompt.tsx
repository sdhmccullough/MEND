import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** With registerType 'autoUpdate' the new worker installs itself; this
 * just applies it immediately and checks hourly, so a phone left open for
 * days can't drift onto stale code. No prompt to miss or dismiss. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (needRefresh) void updateServiceWorker(true);
  }, [needRefresh, updateServiceWorker]);

  return null;
}
