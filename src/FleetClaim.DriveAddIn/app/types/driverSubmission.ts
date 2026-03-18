/**
 * Driver Submission Types
 * Represents data captured by drivers at the scene of an incident
 */

import { DamageAssessment, ThirdPartyInfo } from './report';

export type SubmissionStatus = 'draft' | 'pending_sync' | 'synced' | 'merged' | 'converted' | 'standalone';

export interface DriverSubmission {
    id: string;
    deviceId: string;
    deviceName: string;
    driverId?: string;
    driverName?: string;
    incidentTimestamp: string;
    latitude?: number;
    longitude?: number;
    locationAddress?: string;
    description?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    damageAssessment?: DamageAssessment;
    thirdPartyInfo?: ThirdPartyInfo;
    photos: SubmissionPhoto[];
    policeReportNumber?: string;
    policeAgency?: string;
    injuriesReported?: boolean;
    injuryDescription?: string;
    notes?: string;
    status: SubmissionStatus;
    createdAt: string;
    updatedAt: string;
    submittedAt?: string;
    mergedIntoReportId?: string;
    pendingPhotoUploads: number;
}

export interface SubmissionPhoto {
    localId: string;
    category: 'damage' | 'scene' | 'other';
    capturedAt: string;
    base64Data?: string;
    mimeType?: string;
    mediaFileId?: string;
    fileName?: string;
}

export function createEmptySubmission(deviceId: string, deviceName: string): DriverSubmission {
    const now = new Date().toISOString();
    const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const normalizedDeviceId = deviceId === 'unknown' ? '' : deviceId;
    const normalizedDeviceName = deviceName === 'Unknown Vehicle' ? '' : deviceName;
    return {
        id,
        deviceId: normalizedDeviceId,
        deviceName: normalizedDeviceName,
        incidentTimestamp: now,
        photos: [],
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        pendingPhotoUploads: 0
    };
}
