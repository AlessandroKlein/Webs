import React from 'react';
import ReactDOM from 'react-dom/client';
import '@webs/ui/styles.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './tailwind.css';
import './styles.css';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Service worker (PWA / Capacitor) en producción.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
