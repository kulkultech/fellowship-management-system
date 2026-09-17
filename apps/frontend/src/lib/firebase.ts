import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported, logEvent, Analytics } from 'firebase/analytics';

declare global {
  interface Window {
    __ENV__?: Record<string, string>;
  }
}

/**
 * Safely retrieve environment variable from runtime window.__ENV__
 * (injected in Kubernetes via staging/prod .env) or fallback to Vite's build-time import.meta.env
 */
export function getClientEnv(key: string, defaultValue = ''): string {
  if (typeof window !== 'undefined' && window.__ENV__ && window.__ENV__[key]) {
    return window.__ENV__[key];
  }
  const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
  if (metaEnv && metaEnv[key]) {
    return metaEnv[key];
  }
  return defaultValue;
}

export function getFirebaseConfig() {
  return {
    apiKey: getClientEnv('VITE_FIREBASE_API_KEY'),
    authDomain: getClientEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: getClientEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: getClientEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getClientEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getClientEnv('VITE_FIREBASE_APP_ID'),
    measurementId: getClientEnv('VITE_FIREBASE_MEASUREMENT_ID'),
  };
}

let firebaseApp: FirebaseApp | null = null;
let analyticsInstance: Analytics | null = null;
let initPromise: Promise<Analytics | null> | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  const config = getFirebaseConfig();
  if (!config.apiKey || !config.projectId) {
    return null;
  }
  if (!firebaseApp) {
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(config);
  }
  return firebaseApp;
}

/**
 * Initializes Firebase Analytics if running in a supported browser environment
 * and valid Measurement ID is configured.
 */
export async function initFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined') return null;
  if (analyticsInstance) return analyticsInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const config = getFirebaseConfig();
      const app = getFirebaseApp();
      if (!app || !config.measurementId) {
        return null;
      }

      const supported = await isSupported();
      if (supported) {
        analyticsInstance = getAnalytics(app);
        if (import.meta.env.DEV) {
          console.info('[Firebase Analytics] Initialized with ID:', config.measurementId);
        }
      }
    } catch (err) {
      console.warn('[Firebase Analytics] Initialization failed:', err);
    }
    return analyticsInstance;
  })();

  return initPromise;
}

/**
 * Log a custom business or telemetry event to Firebase Analytics
 */
export async function trackFirebaseEvent(
  eventName: string,
  params?: Record<string, unknown>
) {
  try {
    const analytics = await initFirebaseAnalytics();
    if (analytics) {
      logEvent(analytics, eventName, params);
      if (import.meta.env.DEV) {
        console.debug(`[Firebase Analytics] Event "${eventName}":`, params);
      }
    }
  } catch (err) {
    console.warn(`[Firebase Analytics] Failed to log event "${eventName}":`, err);
  }
}

/**
 * Track route changes and page views in SPA
 */
export async function trackFirebasePageView(pagePath: string, pageTitle?: string) {
  trackFirebaseEvent('page_view', {
    page_path: pagePath,
    page_title: pageTitle || (typeof document !== 'undefined' ? document.title : ''),
    page_location: typeof window !== 'undefined' ? window.location.href : '',
  });
}
