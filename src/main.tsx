import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// The heading face; see --font-display in tokens.css.
import '@fontsource-variable/manrope/wght.css';
import './styles/global.css';
// The shared components' look, before any screen's own stylesheet — see kit.css.
import './styles/kit.css';
import App from './App';
import { restoreLocale } from './i18n/i18n';
import { restoreDisplay } from './settings/display';

// the language chosen on an earlier visit (i18n/): English until its words arrive
restoreLocale();
// and the display settings chosen then (settings/display.ts)
restoreDisplay();

// A temporary log for the headset, only with ?vrdebug in the address — see vrDebug.ts.
if (new URLSearchParams(location.search).has('vrdebug')) {
  void import('./vrDebug').then((debug) => debug.installVrDebug());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
