import { createRoot } from 'react-dom/client';
import { initCapacitorNativeUI } from './lib/capacitor';
import './services/themeService';
import App from './App';
import './index.css';

const isViteHmrNoise = (reason: unknown, filename?: string): boolean => {
  const msg =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : '';
  const stack = reason instanceof Error ? reason.stack || '' : '';
  return (
    msg.includes('WebSocket closed without opened') ||
    (stack.includes('@vite/client') && msg.toLowerCase().includes('websocket')) ||
    Boolean(filename && filename.includes('@vite/client') && msg.toLowerCase().includes('websocket'))
  );
};

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (isViteHmrNoise(event.error || event.message, event.filename)) {
      event.preventDefault();
      return;
    }
    console.error('[KuroStream Runtime Error]', event.message || event.error);
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isViteHmrNoise(event.reason)) {
      event.preventDefault();
      return;
    }
    console.error('[KuroStream Unhandled Rejection]', event.reason);
  });
}

void initCapacitorNativeUI();
createRoot(document.getElementById('root')!).render(<App />);
