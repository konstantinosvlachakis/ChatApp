import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { initCsrfProtection } from './utils/csrf';
import { logger } from './lib/logger';
import { scheduleSentryInit } from './lib/sentry';
import { preloadRoute } from './routes/routeModules';
import './styles/tokens.css';
import './index.css';  // Ensure this line is present to import Tailwind CSS

const root = ReactDOM.createRoot(document.getElementById('root'));

// Boot: the page is never held on the network for CSRF. initCsrfProtection() patches
// fetch/axios synchronously (before the first render) and fetches the token in the
// background; unsafe requests await that same in-flight token (utils/csrf.ts
// ensureCsrfToken, retried on the next unsafe request if this fetch fails).
initCsrfProtection().catch((error) => {
  logger.error("Failed to initialise CSRF protection", error);
});

// Load the current route's lazy chunk first (max ROUTE_PRELOAD_TIMEOUT_MS) so the first
// commit renders the final page: the prerendered markup is replaced by the same page
// instead of a Suspense fallback.
preloadRoute(window.location.pathname).then(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  // Error reporting (only with REACT_APP_SENTRY_DSN) loads after first paint so the
  // SDK never sits on the critical path.
  scheduleSentryInit();
});

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
