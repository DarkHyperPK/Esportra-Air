import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
// The look is shared with Esportra Air (to move into a shared UI package).
import '../../../desktop/src/renderer/styles.css';

createRoot(document.getElementById('root')!).render(<App />);
