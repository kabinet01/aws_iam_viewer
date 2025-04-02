import { ProcessedIAMData } from './types';

const DB_NAME = 'IAMViewerDB';
const DB_VERSION = 2; // Increment version for new store
const UPLOADS_STORE = 'uploads';
const METADATA_STORE = 'metadata';
const CURRENT_UPLOAD_STORE = 'currentUpload';

export interface UploadData {
  id: string;
  name: string;
  originalFilename: string;
  uploadedAt: string;
  size: number;
  data: ProcessedIAMData;
}

export interface UploadMetadata {
  id: string;
  name: string;
  originalFilename: string;
  uploadedAt: string;
  size: number;
}

class IndexedDBService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create uploads store for the actual IAM data
        if (!db.objectStoreNames.contains(UPLOADS_STORE)) {
          const uploadsStore = db.createObjectStore(UPLOADS_STORE, { keyPath: 'id' });
          uploadsStore.createIndex('uploadedAt', 'uploadedAt', { unique: false });
        }

        // Create metadata store for quick access to upload information
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          const metadataStore = db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
          metadataStore.createIndex('uploadedAt', 'uploadedAt', { unique: false });
        }

        // Create current upload store for storing the active upload ID
        if (!db.objectStoreNames.contains(CURRENT_UPLOAD_STORE)) {
          db.createObjectStore(CURRENT_UPLOAD_STORE, { keyPath: 'id' });
        }
      };
    });
  }

  async saveUpload(uploadData: UploadData): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([UPLOADS_STORE, METADATA_STORE], 'readwrite');
      
      // Store the full data
      const uploadsStore = transaction.objectStore(UPLOADS_STORE);
      uploadsStore.put(uploadData);
      
      // Store metadata separately for quick access
      const metadataStore = transaction.objectStore(METADATA_STORE);
      const metadata: UploadMetadata = {
        id: uploadData.id,
        name: uploadData.name,
        originalFilename: uploadData.originalFilename,
        uploadedAt: uploadData.uploadedAt,
        size: uploadData.size,
      };
      metadataStore.put(metadata);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getUpload(id: string): Promise<UploadData | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([UPLOADS_STORE], 'readonly');
      const store = transaction.objectStore(UPLOADS_STORE);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllUploads(): Promise<UploadMetadata[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([METADATA_STORE], 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const index = store.index('uploadedAt');
      const request = index.getAll();

      request.onsuccess = () => {
        const uploads = request.result || [];
        // Sort by upload date (newest first)
        uploads.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        resolve(uploads);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteUpload(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([UPLOADS_STORE, METADATA_STORE], 'readwrite');
      
      const uploadsStore = transaction.objectStore(UPLOADS_STORE);
      uploadsStore.delete(id);
      
      const metadataStore = transaction.objectStore(METADATA_STORE);
      metadataStore.delete(id);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async clearAllData(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([UPLOADS_STORE, METADATA_STORE, CURRENT_UPLOAD_STORE], 'readwrite');
      
      const uploadsStore = transaction.objectStore(UPLOADS_STORE);
      uploadsStore.clear();
      
      const metadataStore = transaction.objectStore(METADATA_STORE);
      metadataStore.clear();

      const currentUploadStore = transaction.objectStore(CURRENT_UPLOAD_STORE);
      currentUploadStore.clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getCurrentUploadId(): Promise<string | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CURRENT_UPLOAD_STORE], 'readonly');
      const store = transaction.objectStore(CURRENT_UPLOAD_STORE);
      const request = store.get('current');

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.uploadId : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setCurrentUploadId(id: string | null): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CURRENT_UPLOAD_STORE], 'readwrite');
      const store = transaction.objectStore(CURRENT_UPLOAD_STORE);
      
      if (id) {
        const request = store.put({ id: 'current', uploadId: id });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } else {
        const request = store.delete('current');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }
    });
  }
}

export const indexedDBService = new IndexedDBService(); 