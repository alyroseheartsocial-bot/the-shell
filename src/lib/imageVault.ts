const DB_NAME = 'companion_visual_vault';
const STORE_NAME = 'assets';
const DB_VERSION = 1;
const TX_TIMEOUT_MS = 5000;
const MAX_MEMORY_CACHE_ITEMS = 25;

// Memory LRU cache to prevent redundant IDB transaction locks and heavy string re-allocations
const memoryCache = new Map<string, string>();

let dbInstance: IDBDatabase | null = null;
let dbOpeningPromise: Promise<IDBDatabase | null> | null = null;

function touchMemoryCache(key: string, value: string): void {
  if (memoryCache.has(key)) {
    memoryCache.delete(key);
  } else if (memoryCache.size >= MAX_MEMORY_CACHE_ITEMS) {
    // Evict oldest entry to prevent bitmap memory bloat
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, value);
}

function getVaultDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (dbOpeningPromise) {
    return dbOpeningPromise;
  }

  dbOpeningPromise = new Promise<IDBDatabase | null>((resolve) => {
    let resolved = false;
    const finish = (db: IDBDatabase | null) => {
      if (!resolved) {
        resolved = true;
        dbOpeningPromise = null;
        resolve(db);
      }
    };

    const timeoutTimer = setTimeout(() => {
      console.warn('Vault IDB open timeout, falling back to memory cache');
      finish(null);
    }, TX_TIMEOUT_MS);

    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      req.onsuccess = () => {
        clearTimeout(timeoutTimer);
        const db = req.result;
        dbInstance = db;

        db.onversionchange = () => {
          try {
            db.close();
          } catch {}
          dbInstance = null;
        };

        db.onclose = () => {
          dbInstance = null;
        };

        finish(db);
      };

      req.onerror = () => {
        clearTimeout(timeoutTimer);
        console.warn('Vault IDB open error:', req.error);
        finish(null);
      };

      req.onblocked = () => {
        console.warn('Vault IDB open blocked by pending connection');
        clearTimeout(timeoutTimer);
        finish(null);
      };
    } catch (err) {
      clearTimeout(timeoutTimer);
      console.warn('Vault IDB exception:', err);
      finish(null);
    }
  });

  return dbOpeningPromise;
}

export async function saveAssetDataUrl(assetId: string, dataUrl: string): Promise<void> {
  if (!assetId || !dataUrl) return;

  // Immediately store in fast memory cache
  touchMemoryCache(assetId, dataUrl);

  try {
    const db = await getVaultDb();
    if (!db) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const safeResolve = () => {
        if (!settled) {
          settled = true;
          clearTimeout(txTimer);
          resolve();
        }
      };

      const txTimer = setTimeout(() => {
        console.warn(`Vault write timeout for asset: ${assetId}`);
        safeResolve();
      }, TX_TIMEOUT_MS);

      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.oncomplete = () => safeResolve();
        tx.onerror = (e) => {
          console.warn('Vault write transaction error:', e);
          safeResolve();
        };
        tx.onabort = () => safeResolve();

        const store = tx.objectStore(STORE_NAME);
        store.put(dataUrl, assetId);
      } catch (err) {
        console.warn('Vault write put exception:', err);
        safeResolve();
      }
    });
  } catch (err) {
    console.warn('Vault write skipped:', err);
  }
}

export async function loadAssetDataUrl(assetId: string): Promise<string | null> {
  if (!assetId) return null;

  // Check memory cache first (instant, zero lock)
  const cached = memoryCache.get(assetId);
  if (cached) {
    return cached;
  }

  try {
    const db = await getVaultDb();
    if (!db) return null;

    return await new Promise<string | null>((resolve) => {
      let settled = false;
      const safeResolve = (val: string | null) => {
        if (!settled) {
          settled = true;
          clearTimeout(txTimer);
          resolve(val);
        }
      };

      const txTimer = setTimeout(() => {
        console.warn(`Vault read timeout for asset: ${assetId}`);
        safeResolve(null);
      }, TX_TIMEOUT_MS);

      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        tx.onerror = () => safeResolve(null);
        tx.onabort = () => safeResolve(null);

        const store = tx.objectStore(STORE_NAME);
        const req = store.get(assetId);
        req.onsuccess = () => {
          const val = (req.result as string) || null;
          if (val) touchMemoryCache(assetId, val);
          safeResolve(val);
        };
        req.onerror = () => safeResolve(null);
      } catch (err) {
        console.warn('Vault read transaction exception:', err);
        safeResolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function deleteAssetDataUrl(assetId: string): Promise<void> {
  if (!assetId) return;

  memoryCache.delete(assetId);

  try {
    const db = await getVaultDb();
    if (!db) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const safeResolve = () => {
        if (!settled) {
          settled = true;
          clearTimeout(txTimer);
          resolve();
        }
      };

      const txTimer = setTimeout(() => safeResolve(), TX_TIMEOUT_MS);

      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.oncomplete = () => safeResolve();
        tx.onerror = () => safeResolve();
        tx.onabort = () => safeResolve();

        const store = tx.objectStore(STORE_NAME);
        store.delete(assetId);
      } catch {
        safeResolve();
      }
    });
  } catch {
    // ignore
  }
}

export function disposeVaultMemory(): void {
  memoryCache.clear();
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {}
    dbInstance = null;
  }
  dbOpeningPromise = null;
}

