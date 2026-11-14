import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './App';
import './i18n';
import './index.css';
import { keepUpdated } from './lib/sw-update';
import { applyTheme } from './lib/theme';
import { store } from './store';

// Before the first render, so a dark-mode phone never flashes white.
applyTheme();

// Production only: dev and e2e run without a service worker.
if (import.meta.env.PROD)
  void import('virtual:pwa-register').then((m) => keepUpdated(m.registerSW));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
