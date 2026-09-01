import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted so no font CDN appears in the content security policy when this
// is served from Cloudflare.
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';

import './styles/global.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
