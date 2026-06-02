'use client';

import { useSyncExternalStore } from 'react';
import { indexedDBService, type UploadMetadata } from '@/lib/indexeddb';

type UploadsSnapshot = {
  uploads: Record<string, UploadMetadata> | undefined;
  currentUploadId: string | null;
  isLoading: boolean;
  error: string | null;
};

let snapshot: UploadsSnapshot = {
  uploads: undefined,
  currentUploadId: null,
  isLoading: true,
  error: null,
};

const listeners = new Set<() => void>();
let loadPromise: Promise<void> | null = null;

const notify = () => {
  listeners.forEach((listener) => listener());
};

const toUploadsMap = (uploadsList: UploadMetadata[]): Record<string, UploadMetadata> => {
  const uploadsMap: Record<string, UploadMetadata> = {};
  uploadsList.forEach((upload) => {
    uploadsMap[upload.id] = upload;
  });
  return uploadsMap;
};

const setSnapshot = (next: UploadsSnapshot) => {
  snapshot = next;
  notify();
};

const loadUploads = async (force = false) => {
  if (!force && !snapshot.isLoading && !loadPromise) return;
  if (loadPromise) return;

  loadPromise = (async () => {
    try {
      const uploadsList = await indexedDBService.getAllUploads();
      const currentUploadId = await indexedDBService.getCurrentUploadId();
      setSnapshot({
        uploads: toUploadsMap(uploadsList),
        currentUploadId,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to load uploads:', error);
      setSnapshot({
        ...snapshot,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load uploads.',
      });
    } finally {
      loadPromise = null;
    }
  })();

  await loadPromise;
};

const getSnapshot = () => snapshot;
const getServerSnapshot = (): UploadsSnapshot => ({
  uploads: undefined,
  currentUploadId: null,
  isLoading: true,
  error: null,
});

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  void loadUploads();
  return () => {
    listeners.delete(listener);
  };
};

const resetCurrentUpload = async (uploadId: string) => {
  await indexedDBService.setCurrentUploadId(uploadId);
  setSnapshot({ ...snapshot, currentUploadId: uploadId, isLoading: false });
};

const removeUpload = async (uploadId: string) => {
  await indexedDBService.deleteUpload(uploadId);

  const wasCurrentUpload = snapshot.currentUploadId === uploadId;
  if (wasCurrentUpload) {
    await indexedDBService.setCurrentUploadId(null);
  }

  const uploads = { ...(snapshot.uploads ?? {}) };
  delete uploads[uploadId];

  setSnapshot({
    ...snapshot,
    uploads,
    currentUploadId: wasCurrentUpload ? null : snapshot.currentUploadId,
    isLoading: false,
    error: null,
  });
};

export function useUploads() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    uploads: state.uploads,
    currentUploadId: state.currentUploadId,
    isLoading: state.isLoading,
    error: state.error,
    setCurrentUpload: resetCurrentUpload,
    deleteUpload: removeUpload,
    reload: () => loadUploads(true),
  };
}
