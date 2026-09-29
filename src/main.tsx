import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// The heading face; see --font-display in tokens.css.
import '@fontsource-variable/manrope/wght.css';
import './styles/global.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
