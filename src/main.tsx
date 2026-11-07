// src/main.tsx
import './utils/hostHandover';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';

// A deploy removes old route chunks; reload to pick up the new build (at most once per 10s, so offline can't loop).
window.addEventListener('vite:preloadError', () => {
  try {
    const last = Number(sessionStorage.getItem('chunk-reload-at') ?? 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem('chunk-reload-at', String(Date.now()));
  } catch { /* storage blocked: reload anyway */ }
  window.location.reload();
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.error('Service worker registration failed:', err));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)