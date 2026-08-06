import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import App from './App';
import { initTheme } from './lib/theme';
import { initInstallCapture } from './lib/install';
import { initAuth } from './store/auth';
import { isTab, useStore } from './store/useStore';

initTheme();
initInstallCapture();

// PWA app shortcuts land on /?tab=…; seed the store before first render.
const requestedTab = new URLSearchParams(location.search).get('tab');
if (isTab(requestedTab)) {
  useStore.setState({ tab: requestedTab });
}

initAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
