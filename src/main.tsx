import {createRoot} from 'react-dom/client';
import { initCapacitorNativeUI } from './lib/capacitor';
import App from './App';
import './index.css';

void initCapacitorNativeUI();
createRoot(document.getElementById('root')!).render(<App />);
