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

if (typeof window !== 'undefined') {
  // Gracefully initialize webkit.messageHandlers if missing (iOS in-app browsers / WebViews)
  try {
    const win = window as unknown as { webkit?: { messageHandlers?: unknown } };
    if (!win.webkit) {
      win.webkit = {};
    }
    if (!win.webkit.messageHandlers) {
      const dummyHandler = { postMessage: () => {} };
      win.webkit.messageHandlers = typeof Proxy !== 'undefined'
        ? new Proxy({}, { get: () => dummyHandler })
        : {};
    }
  } catch {
    // Ignore restricted environments
  }

  // Gracefully handle benign browser/navigation fetch aborts so they do not trigger uncaught rejection errors
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason && typeof reason === 'object') {
      const r = reason as { name?: string; code?: string; message?: string };
      if (
        r.name === 'AbortError' ||
        r.name === 'CanceledError' ||
        r.code === 'ERR_CANCELED' ||
        (typeof r.message === 'string' &&
          (r.message.includes('The operation was aborted') ||
            r.message.includes('AbortError') ||
            r.message.includes('canceled') ||
            r.message.includes('cancelled')))
      ) {
        event.preventDefault();
      }
    }
  });
}

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
    // Benign errors that are normal browser lifecycle events (e.g. user navigation, tab unmount)
    // or third-party in-app browser injected scripts (e.g. iOS WebKit messageHandlers)
    ignoreErrors: [
      'AbortError',
      'The operation was aborted',
      'The operation was aborted.',
      'Fetch is aborted',
      'Request was aborted',
      'CanceledError',
      'canceled',
      'cancelled',
      'ResizeObserver loop completed with undelivered notifications.',
      'ResizeObserver loop limit exceeded',
      'Network request failed',
      'Load failed',
      "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
      /window\.webkit\.messageHandlers/i,
      /messageHandlers/i,
    ],
    beforeSend(event, hint) {
      const error = hint?.originalException;
      if (error && typeof error === 'object') {
        const errObj = error as { name?: string; code?: string; message?: string };
        if (
          errObj.name === 'AbortError' ||
          errObj.name === 'CanceledError' ||
          errObj.code === 'ERR_CANCELED' ||
          (typeof errObj.message === 'string' &&
            (errObj.message.includes('The operation was aborted') ||
              errObj.message.includes('AbortError') ||
              errObj.message.includes('canceled') ||
              errObj.message.includes('cancelled') ||
              errObj.message.includes('messageHandlers') ||
              errObj.message.includes('window.webkit')))
        ) {
          return null; // Suppress benign browser aborts & third-party in-app browser webview errors
        }
      }
      const eventMsg = typeof event.message === 'string' ? event.message : '';
      if (eventMsg.includes('messageHandlers') || eventMsg.includes('window.webkit')) {
        return null;
      }
      if (
        event.exception?.values?.some(
          (val) =>
            typeof val.value === 'string' &&
            (val.value.includes('messageHandlers') || val.value.includes('window.webkit')),
        )
      ) {
        return null;
      }
      return event;
    },
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
