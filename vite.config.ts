import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        id: '/',
        name: 'Mend',
        short_name: 'Mend',
        description: 'Injury recovery tracker — meds, PT sessions, and appointments.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0f1413',
        background_color: '#0f1413',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        // main.tsx parses ?tab= on boot, so these actually navigate.
        shortcuts: [
          { name: 'Today', url: '/?tab=today' },
          { name: 'Meds', url: '/?tab=meds' },
          { name: 'Calendar', url: '/?tab=calendar' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        // Never intercept Firebase traffic (RTDB long-poll/websocket, auth).
        navigateFallbackDenylist: [/^\/__\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(.*\.)?(firebaseio\.com|googleapis\.com|firebaseapp\.com|gstatic\.com)\//,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  build: {
    sourcemap: true
  }
});
