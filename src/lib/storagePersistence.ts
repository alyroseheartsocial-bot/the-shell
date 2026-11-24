/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StoragePersistenceStatus {
  isPersisted: boolean;
  isSupported: boolean;
  quotaBytes?: number;
  usageBytes?: number;
  isStandalone: boolean;
}

const LAST_UID_KEY = 'companion_last_known_uid';
const LAST_EMAIL_KEY = 'companion_last_known_email';
const DB_NAME = 'companion_offline_store';
const DB_VERSION = 1;
const STORE_NAME = 'ecosystem_snapshots';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('IndexedDB open error, fallback to memory');
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

/**
 * Persist an arbitrary object snapshot to durable IndexedDB
 */
export async function saveToIndexedDB(key: string, value: unknown): Promise<void> {
  try {
    const db = await getIDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
  } catch (err) {
    console.warn('IDB save error:', err);
  }
}

/**
 * Load an object snapshot from durable IndexedDB
 */
export async function loadFromIndexedDB<T>(key: string): Promise<T | null> {
  try {
    const db = await getIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

/**
 * Request durable storage persistence from the browser/OS to prevent
 * mobile containers (iOS Safari / Android PWA) from evicting local data.
 */
export async function requestPersistentStorage(): Promise<StoragePersistenceStatus> {
  const isStandalone = isStandalonePWA();

  if (typeof window === 'undefined' || !navigator.storage) {
    return {
      isPersisted: false,
      isSupported: false,
      isStandalone,
    };
  }

  let isPersisted = false;
  let quotaBytes: number | undefined;
  let usageBytes: number | undefined;

  try {
    // Check if already persisted
    if (navigator.storage.persisted) {
      isPersisted = await navigator.storage.persisted();
    }

    // If not persisted yet, explicitly request persistence
    if (!isPersisted && navigator.storage.persist) {
      isPersisted = await navigator.storage.persist();
    }

    // Query storage quota & usage
    if (navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      quotaBytes = estimate.quota;
      usageBytes = estimate.usage;
    }
  } catch (err) {
    console.warn('Storage persistence check notice:', err);
  }

  return {
    isPersisted,
    isSupported: typeof navigator.storage.persist === 'function',
    quotaBytes,
    usageBytes,
    isStandalone,
  };
}

/**
 * Detect whether the web app is running as an installed PWA on a mobile home screen
 * (standalone display mode in Chrome/Android or window.navigator.standalone on iOS Safari).
 */
export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    Boolean((window.navigator as unknown as { standalone?: boolean }).standalone)
  );
}

/**
 * Persist last known authenticated user UID across storage barriers
 * so an isolated PWA container can immediately identify the user on startup.
 */
export function recordLastKnownUser(uid: string, email?: string | null): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    localStorage.setItem(LAST_UID_KEY, uid);
    sessionStorage.setItem(LAST_UID_KEY, uid);
    if (email) {
      localStorage.setItem(LAST_EMAIL_KEY, email);
      sessionStorage.setItem(LAST_EMAIL_KEY, email);
    }
  } catch {
    // ignore
  }
  // Also write to IndexedDB asynchronously
  void saveToIndexedDB(LAST_UID_KEY, uid);
  if (email) void saveToIndexedDB(LAST_EMAIL_KEY, email);
}

/**
 * Clear last known user identity on explicit logout
 */
export function clearLastKnownUser(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LAST_UID_KEY);
    sessionStorage.removeItem(LAST_UID_KEY);
    localStorage.removeItem(LAST_EMAIL_KEY);
    sessionStorage.removeItem(LAST_EMAIL_KEY);
  } catch {
    // ignore
  }
  void saveToIndexedDB(LAST_UID_KEY, null);
  void saveToIndexedDB(LAST_EMAIL_KEY, null);
}

/**
 * Retrieve last known user UID from localStorage, sessionStorage, or IndexedDB
 */
export function getLastKnownUser(): { uid: string | null; email: string | null } {
  if (typeof window === 'undefined') return { uid: null, email: null };
  try {
    const uid = localStorage.getItem(LAST_UID_KEY) || sessionStorage.getItem(LAST_UID_KEY);
    const email = localStorage.getItem(LAST_EMAIL_KEY) || sessionStorage.getItem(LAST_EMAIL_KEY);
    return { uid, email };
  } catch {
    return { uid: null, email: null };
  }
}
