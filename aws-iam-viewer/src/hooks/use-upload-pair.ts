'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { indexedDBService, type UploadData } from '@/lib/indexeddb';

type UploadPairSnapshot = {
  beforeId: string;
  afterId: string;
  beforeUpload: UploadData | null;
  afterUpload: UploadData | null;
  isLoading: boolean;
  error: string | null;
};

let snapshot: UploadPairSnapshot = {
  beforeId: '',
  afterId: '',
  beforeUpload: null,
  afterUpload: null,
  isLoading: false,
  error: null,
};

let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((listener) => listener());
};

const setSnapshot = (next: UploadPairSnapshot) => {
  snapshot = next;
  notify();
};

const getSnapshot = () => snapshot;
const getServerSnapshot = (): UploadPairSnapshot => ({
  beforeId: '',
  afterId: '',
  beforeUpload: null,
  afterUpload: null,
  isLoading: false,
  error: null,
});

async function loadUploadPair(beforeId: string, afterId: string, force = false) {
  const idsUnchanged = snapshot.beforeId === beforeId && snapshot.afterId === afterId;
  const hasResolvedState =
    !snapshot.isLoading &&
    idsUnchanged &&
    (beforeId === '' || snapshot.beforeUpload !== null) &&
    (afterId === '' || snapshot.afterUpload !== null);

  if (!force && hasResolvedState) return;
  if (loadPromise) return loadPromise;

  setSnapshot({
    ...snapshot,
    beforeId,
    afterId,
    isLoading: true,
    error: null,
  });

  loadPromise = (async () => {
    try {
      const [beforeUpload, afterUpload] = await Promise.all([
        beforeId ? indexedDBService.getUpload(beforeId) : Promise.resolve(null),
        afterId ? indexedDBService.getUpload(afterId) : Promise.resolve(null),
      ]);

      setSnapshot({
        beforeId,
        afterId,
        beforeUpload,
        afterUpload,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to load selected uploads:', error);
      setSnapshot({
        beforeId,
        afterId,
        beforeUpload: null,
        afterUpload: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load selected uploads.',
      });
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export function useUploadPair(beforeId: string, afterId: string) {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    void loadUploadPair(beforeId, afterId);
    return () => {
      listeners.delete(listener);
    };
  }, [beforeId, afterId]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    beforeUpload: state.beforeId === beforeId ? state.beforeUpload : null,
    afterUpload: state.afterId === afterId ? state.afterUpload : null,
    isLoading: state.isLoading && state.beforeId === beforeId && state.afterId === afterId,
    error: state.beforeId === beforeId && state.afterId === afterId ? state.error : null,
    reload: () => loadUploadPair(beforeId, afterId, true),
  };
}
