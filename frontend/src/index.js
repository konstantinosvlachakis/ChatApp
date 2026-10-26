import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { initCsrfProtection } from './utils/csrf';
import { logger } from './lib/logger';
import { scheduleSentryInit } from './lib/sentry';
import './index.css';  // Ensure this line is present to import Tailwind CSS

const root = ReactDOM.createRoot(document.getElementById('root'));

initCsrfProtection()
  .catch((error) => {
    logger.error("Failed to initialise CSRF protection", error);
  })
  .finally(() => {
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
