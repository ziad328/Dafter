import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './App';
import './i18n';
import './index.css';
import { applyTheme } from './lib/theme';
import { store } from './store';

// Before the first render, so a dark-mode phone never flashes white.
applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
