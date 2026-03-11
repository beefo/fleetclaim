/**
 * Sync Service
 * Handles localStorage -> AddInData sync when online
 */

import { GeotabApi, GeotabCredentials } from '@/types/geotab';
import { DriverSubmission, SubmissionPhoto, AddInDataWrapper } from '@/types';
import {
    loadSubmission,
    saveSubmission,
    loadPhotoData,
    deletePhotoData,
    getPendingSyncSubmissions
} from './storageService';

const ADDIN_ID = 'aji_jHQGE8k2TDodR8tZrpw';

function apiCall<T>(api: GeotabApi, method: string, params: object): Promise<T> {
    return new Promise((resolve, reject) => {
        api.call<T>(method, params, resolve, reject);
    });
}

function mapDamageLevel(level?: 'none' | 'minor' | 'moderate' | 'severe' | 'total'): string | undefined {
    if (!level) return undefined;
    if (level === 'total') return 'totalLoss';
    return level;
}

function mapPhotoCategory(category: SubmissionPhoto['category']): string {
    switch (category) {
        case 'damage':
            return 'vehicleDamage';
        case 'scene':
            return 'sceneOverview';
        default:
            return 'general';
    }
}

export interface SyncedDriverSubmissionPayload {
    [key: string]: unknown;
}

export function buildDriverSubmissionPayload(submission: DriverSubmission): SyncedDriverSubmissionPayload {
    const thirdPartyInfo = submission.thirdPartyInfo || {};
    const damageAssessment = submission.damageAssessment || {};

    return {
        id: submission.id,
        deviceId: submission.deviceId,
        deviceName: submission.deviceName,
        driverId: submission.driverId,
        driverName: submission.driverName,
        incidentTimestamp: submission.incidentTimestamp,
        latitude: submission.latitude,
        longitude: submission.longitude,
        locationAddress: submission.locationAddress,
        description: submission.description,
        severity: submission.severity,
        damageDescription: damageAssessment.description,
        damageLevel: mapDamageLevel(damageAssessment.damageLevel),
        vehicleDriveable: damageAssessment.isDriveable,
        estimatedRepairCost: damageAssessment.estimatedRepairCost,
        policeReportNumber: submission.policeReportNumber || thirdPartyInfo.policeReportNumber,
        policeAgency: submission.policeAgency,
        injuriesReported: submission.injuriesReported,
        injuryDescription: submission.injuryDescription,
        notes: [submission.notes, thirdPartyInfo.additionalNotes].filter(Boolean).join('\n').trim() || undefined,
        photos: submission.photos
            .filter(p => !!p.mediaFileId)
            .map(p => ({
                mediaFileId: p.mediaFileId!,
                fileName: p.fileName || `drive_${submission.id}_${p.localId}.jpg`,
                contentType: p.mimeType || 'image/jpeg',
                category: mapPhotoCategory(p.category),
                uploadedAt: p.capturedAt || new Date().toISOString()
            })),
        status: submission.status,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
        submittedAt: submission.submittedAt,
        mergedIntoReportId: submission.mergedIntoReportId,
        otherDriverName: thirdPartyInfo.otherDriverName,
        otherDriverPhone: thirdPartyInfo.otherDriverPhone,
        otherDriverInsurance: thirdPartyInfo.otherDriverInsurance,
        otherDriverPolicyNumber: thirdPartyInfo.otherDriverPolicyNumber,
        otherVehicleMake: thirdPartyInfo.otherVehicleMake,
        otherVehicleModel: thirdPartyInfo.otherVehicleModel,
        otherVehiclePlate: thirdPartyInfo.otherVehiclePlate,
        otherVehicleColor: thirdPartyInfo.otherVehicleColor,
        witnesses: thirdPartyInfo.witnesses
    };
}

/**
 * Upload a single photo to Geotab MediaFile
 */
async function uploadSubmissionPhoto(
    api: GeotabApi,
    credentials: GeotabCredentials,
    geotabHost: string,
    photo: SubmissionPhoto,
    submissionId: string
): Promise<string> {
    // Load base64 data from IndexedDB
    const photoData = await loadPhotoData(photo.localId);
    if (!photoData?.base64Data) {
        throw new Error(`No photo data found for ${photo.localId}`);
    }

    // Convert base64 to Blob
    const base64 = photoData.base64Data.split(',')[1] || photoData.base64Data;
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([array], { type: photoData.mimeType || 'image/jpeg' });
    const fileName = `drive_${submissionId}_${photo.localId}_${Date.now()}.jpg`;
    const file = new File([blob], fileName, { type: blob.type });

    // Create MediaFile entity
    const mediaFile = {
        name: fileName,
        solutionId: ADDIN_ID,
        fromDate: new Date().toISOString(),
        toDate: new Date().toISOString(),
        mediaType: 'Image',
        metaData: JSON.stringify({
            submissionId,
            category: photo.category,
            uploadedAt: new Date().toISOString(),
            source: 'drive'
        })
    };

    const mediaFileId = await apiCall<string>(api, 'Add', {
        typeName: 'MediaFile',
        entity: mediaFile
    });

    // Upload binary via XHR
    try {
        await uploadBinaryToGeotab(file, mediaFileId, fileName, credentials, geotabHost);
    } catch (err) {
        // Clean up MediaFile on failure
        try {
            await apiCall<void>(api, 'Remove', { typeName: 'MediaFile', entity: { id: mediaFileId } });
        } catch {
            // Ignore cleanup errors
        }
        throw err;
    }

    return mediaFileId;
}

function uploadBinaryToGeotab(
    file: File,
    mediaFileId: string,
    fileName: string,
    credentials: GeotabCredentials,
    host: string
): Promise<any> {
    return new Promise((resolve, reject) => {
        const fd = new FormData();
        const parameters = {
            method: 'UploadMediaFile',
            params: {
                credentials: {
                    database: credentials.database,
                    userName: credentials.userName,
                    sessionId: credentials.sessionId
                },
                mediaFile: { id: mediaFileId }
            }
        };

        fd.append('JSON-RPC', encodeURIComponent(JSON.stringify(parameters)));
        fd.append(fileName, file, fileName);

        const xhr = new XMLHttpRequest();
        xhr.addEventListener('load', function (e: any) {
            if (e.target?.responseText) {
                try {
                    const json = JSON.parse(e.target.responseText);
                    if (json.error) {
                        reject(new Error(json.error.message || JSON.stringify(json.error)));
                    } else {
                        resolve(json);
                    }
                } catch {
                    resolve(e.target.responseText);
                }
            } else {
                reject(new Error('Empty response from upload'));
            }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));

        xhr.open('POST', `https://${host}/apiv1/`);
        xhr.setRequestHeader('Accept', 'application/json, */*;q=0.8');
        xhr.send(fd);
    });
}

/**
 * Sync a single submission: upload photos, then save to AddInData
 */
export async function syncSubmission(
    api: GeotabApi,
    credentials: GeotabCredentials,
    geotabHost: string,
    submissionId: string
): Promise<boolean> {
    const submission = loadSubmission(submissionId);
    if (!submission || submission.status !== 'pending_sync') return false;

    // 1. Upload photos that haven't been uploaded yet
    for (const photo of submission.photos) {
        if (photo.mediaFileId) continue;

        try {
            const mediaFileId = await uploadSubmissionPhoto(
                api, credentials, geotabHost, photo, submissionId
            );
            photo.mediaFileId = mediaFileId;
            photo.fileName = `drive_${submissionId}_${photo.localId}.jpg`;
            // Clear base64 from IndexedDB after successful upload
            await deletePhotoData(photo.localId);
            // Save progress
            submission.pendingPhotoUploads = submission.photos.filter(p => !p.mediaFileId).length;
            saveSubmission(submission);
        } catch (err) {
            console.error(`[Sync] Failed to upload photo ${photo.localId}:`, err);
            return false;
        }
    }

    // 2. Save submission to AddInData
    const wrapper: AddInDataWrapper<SyncedDriverSubmissionPayload> = {
        type: 'driverSubmission',
        payload: {
            ...buildDriverSubmissionPayload(submission),
            status: 'synced',
            submittedAt: new Date().toISOString(),
        }
    };

    try {
        await apiCall<any>(api, 'Add', {
            typeName: 'AddInData',
            entity: {
                addInId: ADDIN_ID,
                details: wrapper
            }
        });

        // Update local status
        submission.status = 'synced';
        submission.submittedAt = new Date().toISOString();
        submission.pendingPhotoUploads = 0;
        saveSubmission(submission);
        return true;
    } catch (err) {
        console.error(`[Sync] Failed to save submission ${submissionId} to AddInData:`, err);
        return false;
    }
}

/**
 * Sync all pending submissions
 */
export async function syncAllPending(
    api: GeotabApi,
    credentials: GeotabCredentials,
    geotabHost: string
): Promise<{ synced: number; failed: number }> {
    const pending = getPendingSyncSubmissions();
    let synced = 0;
    let failed = 0;

    for (const submission of pending) {
        const success = await syncSubmission(api, credentials, geotabHost, submission.id);
        if (success) {
            synced++;
        } else {
            failed++;
        }
    }

    return { synced, failed };
}
