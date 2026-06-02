'use client';

import { useSyncExternalStore } from 'react';
import { indexedDBService, type UploadData } from '@/lib/indexeddb';
import { type ProcessedIAMData } from '@/lib/types';

type CurrentUploadStatus = 'loading' | 'ready' | 'missingUpload' | 'missingData' | 'error';

interface UseCurrentUploadResult {
  upload: UploadData | null;
  data: ProcessedIAMData | null;
  isLoading: boolean;
  error: string | null;
  status: CurrentUploadStatus;
  reload: () => Promise<void>;
}

type CurrentUploadSnapshot = {
  upload: UploadData | null;
  isLoading: boolean;
  error: string | null;
  status: CurrentUploadStatus;
};

let snapshot: CurrentUploadSnapshot = {
  upload: null,
  isLoading: true,
  error: null,
  status: 'loading',
};

let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((listener) => listener());
};

const setSnapshot = (next: CurrentUploadSnapshot) => {
  snapshot = next;
  notify();
};

const getSnapshot = () => snapshot;
const getServerSnapshot = (): CurrentUploadSnapshot => ({
  upload: null,
  isLoading: true,
  error: null,
  status: 'loading',
});

async function loadCurrentUpload(force = false) {
  if (!force && !snapshot.isLoading && snapshot.status !== 'loading') return;
  if (loadPromise) return loadPromise;

  setSnapshot({
    ...snapshot,
    isLoading: true,
    error: null,
    status: 'loading',
  });

  loadPromise = (async () => {
    try {
      const currentUploadId = await indexedDBService.getCurrentUploadId();
      if (!currentUploadId) {
        setSnapshot({
          upload: null,
          isLoading: false,
          error: null,
          status: 'missingUpload',
        });
        return;
      }

      const upload = await indexedDBService.getUpload(currentUploadId);
      if (!upload) {
        setSnapshot({
          upload: null,
          isLoading: false,
          error: null,
          status: 'missingData',
        });
        return;
      }

      setSnapshot({
        upload,
        isLoading: false,
        error: null,
        status: 'ready',
      });
    } catch (error) {
      console.error('Failed to load current upload:', error);
      setSnapshot({
        upload: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load IAM upload',
        status: 'error',
      });
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export function useCurrentUpload(): UseCurrentUploadResult {
  const state = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      void loadCurrentUpload();
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot,
    getServerSnapshot
  );

  return {
    upload: state.upload,
    data: state.upload?.data || null,
    isLoading: state.isLoading,
    error: state.error,
    status: state.status,
    reload: () => loadCurrentUpload(true),
  };
}
