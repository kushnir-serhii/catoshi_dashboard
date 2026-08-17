'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ForecastSnapshot, ProjectionData } from '@/data/types';
import { PROJECTION_SCHEMA_VERSION } from '@/consts/projections';

const DB_NAME = 'catoshi-db';
const STORE_NAME = 'catoshi-snapshots';
const DB_VERSION = 1;
const MAX_SNAPSHOTS = 5;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

function getAllFromStore(db: IDBDatabase): Promise<ForecastSnapshot[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as ForecastSnapshot[]);
    req.onerror = () => reject(req.error);
  });
}

function putRecord(db: IDBDatabase, record: ForecastSnapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function deleteRecord(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function useForecastSnapshots(): {
  snapshots: ForecastSnapshot[];
  save: (name: string, coin: string, projection: ProjectionData) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  load: (id: string) => ForecastSnapshot | null;
} {
  const [snapshots, setSnapshots] = useState<ForecastSnapshot[]>([]);
  const dbRef = useRef<IDBDatabase | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.indexedDB) return;
    let cancelled = false;

    openDB()
      .then(async (db) => {
        if (cancelled) {
          db.close();
          return;
        }
        dbRef.current = db;
        try {
          const all = await getAllFromStore(db);
          if (!cancelled) {
            const valid = all.filter(
              (s) => s.projection.schemaVersion === PROJECTION_SCHEMA_VERSION,
            );
            setSnapshots(valid.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
          }
        } catch {
          // IDB read failed — leave snapshots empty
        }
      })
      .catch(() => {
        // IDB unavailable (private browsing, etc.) — gracefully disabled
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    async (name: string, coin: string, projection: ProjectionData): Promise<string | null> => {
      if (snapshots.length >= MAX_SNAPSHOTS) {
        return 'Delete a saved forecast to save a new one';
      }
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2);

      const record: ForecastSnapshot = {
        id,
        name,
        savedAt: new Date().toISOString(),
        coin,
        service: projection.service,
        model: projection.model,
        projection,
      };

      try {
        if (dbRef.current) {
          await putRecord(dbRef.current, record);
        }
      } catch {
        // IDB write failed — still update local state
      }

      setSnapshots((prev) =>
        [record, ...prev].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
      );
      return null;
    },
    [snapshots.length],
  );

  const remove = useCallback(async (id: string): Promise<void> => {
    try {
      if (dbRef.current) {
        await deleteRecord(dbRef.current, id);
      }
    } catch {
      // IDB delete failed — still update local state
    }
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const rename = useCallback(async (id: string, name: string): Promise<void> => {
    setSnapshots((prev) => {
      const updated = prev.map((s) => (s.id === id ? { ...s, name } : s));
      if (dbRef.current) {
        const record = updated.find((s) => s.id === id);
        if (record) {
          putRecord(dbRef.current, record).catch(() => {});
        }
      }
      return updated;
    });
  }, []);

  const load = useCallback(
    (id: string): ForecastSnapshot | null => {
      return snapshots.find((s) => s.id === id) ?? null;
    },
    [snapshots],
  );

  return { snapshots, save, remove, rename, load };
}
