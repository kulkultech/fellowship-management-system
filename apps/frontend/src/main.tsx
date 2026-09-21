import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { App } from './App';
import './index.css';

// Safely retrieve DSN from runtime window.__ENV__ (Kubernetes/Docker entrypoint) or Vite build-time import.meta.env
function getSentryDsn(): string {
  let dsn = '';
  if (typeof window !== 'undefined' && window.__ENV__) {
    dsn = window.__ENV__.VITE_SENTRY_DSN || window.__ENV__.SENTRY_DSN || window.__ENV__.FRONTEND_SENTRY_DSN || '';
  }
  if (!dsn) {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
    if (metaEnv) {
      dsn = metaEnv.VITE_SENTRY_DSN || metaEnv.SENTRY_DSN || '';
    }
  }
  return dsn ? dsn.trim().replace(/^["']|["']$/g, '') : '';
}

const sentryDsn = getSentryDsn();

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: (typeof window !== 'undefined' && window.__ENV__?.APP_ENV) || (import.meta.env.MODE as string) || 'production',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Tracing: 25% sampling rate for performance monitoring
    tracesSampleRate: 0.25,
    // Session Replay: 25% sampling rate for normal sessions, 100% on error
    replaysSessionSampleRate: 0.25,
    replaysOnErrorSampleRate: 1.0,
    dataCollection: {
      // userInfo: false,
      // httpBodies: []
    },
  });
  console.info('[Sentry] Crash analytics, Tracing (25%), and Session Replay (25%) initialized successfully');
} else {
  console.warn('[Sentry] No DSN provided via window.__ENV__ or VITE_SENTRY_DSN. Crash analytics is inactive.');
}

// Global console test helper: run testSentry() in Browser DevTools Console
if (typeof window !== 'undefined') {
  window.testSentry = () => {
    if (!sentryDsn) {
      console.warn('[Sentry] Cannot test: Sentry DSN is not set. Please ensure VITE_SENTRY_DSN is configured in your deployment environment.');
      return;
    }
    const eventId = Sentry.captureMessage('FellowHire Sentry Frontend Connection Test');
    console.info('[Sentry] Test event sent to Sentry! Event ID:', eventId);
    alert('Test event dispatched to Sentry!\nEvent ID: ' + eventId);
  };
}

const container = document.getElementById('root') || document.getElementById('app');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
