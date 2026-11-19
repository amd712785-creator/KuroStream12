import { createRoot } from 'react-dom/client';
import { initCapacitorNativeUI } from './lib/capacitor';
import './services/themeService';
import App from './App';
import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[KuroStream Runtime Error]', event.message || event.error);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[KuroStream Unhandled Rejection]', event.reason);
  });
}

void initCapacitorNativeUI();
createRoot(document.getElementById('root')!).render(<App />);
