/**
 * Offline-First Storage Service
 *
 * Two-tier storage:
 * - localStorage for submission metadata (small, fast, synchronous)
 * - IndexedDB for photo binary data (large, async)
 */

import { DriverSubmission, SubmissionPhoto } from '@/types';

const STORAGE_PREFIX = 'fleetclaim_drive';
const SUBMISSIONS_INDEX_KEY = `${STORAGE_PREFIX}_submissions`;
const ACTIVE_KEY = `${STORAGE_PREFIX}_active`;
export const SUBMISSIONS_CHANGED_EVENT = 'fleetclaim:submissions-changed';
const DB_NAME = 'fleetclaim_drive';
const PHOTOS_STORE = 'photos';
const DB_VERSION = 1;

const MAX_IMAGE_DIMENSION = 1920;

// localStorage operations for submission metadata

export function getSubmissionIndex(): string[] {
    const raw = localStorage.getItem(SUBMISSIONS_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
}

function setSubmissionIndex(ids: string[]) {
    localStorage.setItem(SUBMISSIONS_INDEX_KEY, JSON.stringify(ids));
}

function notifySubmissionsChanged() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(SUBMISSIONS_CHANGED_EVENT));
    }
}

export function saveSubmission(submission: DriverSubmission) {
    const key = `${STORAGE_PREFIX}_sub_${submission.id}`;
    // Store without photo base64 data (that goes to IndexedDB)
    const stripped: DriverSubmission = {
        ...submission,
        photos: submission.photos.map(p => ({ ...p, base64Data: undefined }))
    };
    localStorage.setItem(key, JSON.stringify(stripped));

    const index = getSubmissionIndex();
    if (!index.includes(submission.id)) {
        index.unshift(submission.id);
        setSubmissionIndex(index);
    }
    notifySubmissionsChanged();
}

export function loadSubmission(id: string): DriverSubmission | null {
    const key = `${STORAGE_PREFIX}_sub_${id}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
}

export function deleteSubmission(id: string) {
    const key = `${STORAGE_PREFIX}_sub_${id}`;
    localStorage.removeItem(key);
    const index = getSubmissionIndex().filter(i => i !== id);
    setSubmissionIndex(index);

    // Clear active if this was the active submission
    if (getActiveSubmissionId() === id) {
        clearActiveSubmission();
    }
    notifySubmissionsChanged();
}

export function getAllSubmissions(): DriverSubmission[] {
    return getSubmissionIndex()
        .map(id => loadSubmission(id))
        .filter((s): s is DriverSubmission => s !== null);
}

export function getActiveSubmissionId(): string | null {
    return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveSubmission(id: string) {
    localStorage.setItem(ACTIVE_KEY, id);
}

export function clearActiveSubmission() {
    localStorage.removeItem(ACTIVE_KEY);
}

export function getPendingSyncSubmissions(): DriverSubmission[] {
    return getAllSubmissions().filter(s => s.status === 'pending_sync');
}

// IndexedDB operations for photo data

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
                db.createObjectStore(PHOTOS_STORE, { keyPath: 'localId' });
            }
        };
    });
}

export async function savePhotoData(photo: SubmissionPhoto): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTOS_STORE, 'readwrite');
        const store = tx.objectStore(PHOTOS_STORE);
        store.put({
            localId: photo.localId,
            base64Data: photo.base64Data,
            mimeType: photo.mimeType,
            category: photo.category,
            capturedAt: photo.capturedAt
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function loadPhotoData(localId: string): Promise<SubmissionPhoto | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTOS_STORE, 'readonly');
        const store = tx.objectStore(PHOTOS_STORE);
        const request = store.get(localId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

export async function deletePhotoData(localId: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTOS_STORE, 'readwrite');
        const store = tx.objectStore(PHOTOS_STORE);
        store.delete(localId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function deleteAllPhotosForSubmission(photos: SubmissionPhoto[]): Promise<void> {
    for (const photo of photos) {
        await deletePhotoData(photo.localId);
    }
}

/**
 * Resize image using canvas to max dimension, returns base64 JPEG
 */
export function resizeImage(base64Data: string, maxDimension: number = MAX_IMAGE_DIMENSION): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;

            if (width <= maxDimension && height <= maxDimension) {
                resolve(base64Data);
                return;
            }

            if (width > height) {
                height = Math.round(height * (maxDimension / width));
                width = maxDimension;
            } else {
                width = Math.round(width * (maxDimension / height));
                height = maxDimension;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Failed to get canvas context'));
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = base64Data;
    });
}
