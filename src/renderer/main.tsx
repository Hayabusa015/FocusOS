import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import './styles/tokens.css';
import './styles/elements.css';
import { App } from './app/App';
import { CapturePage } from './pages/CapturePage';

// The quick-capture window loads this same page at #/capture and shows only the capture box.
const isCapture = window.location.hash === '#/capture';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>{isCapture ? <CapturePage /> : <App />}</StrictMode>,
);
