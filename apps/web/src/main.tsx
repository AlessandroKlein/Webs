import React from 'react';
import ReactDOM from 'react-dom/client';
import '@webs/ui/styles.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './tailwind.css';
import './styles/bootstrap-vendor.scss';
import './styles.css';
import { App } from './App';

// PWA: solo en build de producción, para no interferir con el HMR de Vite.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* sin service worker la app funciona igual */
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
