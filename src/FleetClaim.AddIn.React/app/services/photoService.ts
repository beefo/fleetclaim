/**
 * FleetClaim Photo Service
 * 
 * Handles photo upload and management via backend API proxy.
 * Direct Geotab MediaFile binary upload not possible since Add-In 
 * can't access sessionId (api.getSession throws MethodNotSupported).
 * 
 * Flow:
 * 1. Add-In creates MediaFile entity via api.call('Add', ...) - works via proxy
 * 2. Add-In sends binary to backend API with database + mediaFileId
 * 3. Backend uses service account credentials to upload binary to Geotab
 */

import { GeotabApi, MediaFile, Photo } from '@/types';

const ADDIN_ID = 'aji_jHQGE8k2TDodR8tZrpw';
const API_BASE_URL = 'https://fleetclaim-api-589116575765.us-central1.run.app';

export interface UploadResult {
    mediaFileId: string;
    photo: Photo;
}

/**
 * Upload a photo via Add-In API + backend proxy
 * 
 * @param api - The Geotab API object
 * @param database - The Geotab database name
 * @param file - The file to upload
 * @param reportId - The report ID to tag the photo with
 * @param category - The photo category
 */
export async function uploadPhoto(
    api: GeotabApi,
    database: string,
    file: File,
    reportId: string,
    category: 'damage' | 'scene' | 'other'
): Promise<UploadResult> {
    console.log('[photoService] Starting upload:', { 
        database, 
        reportId,
        category,
        fileName: file.name,
        fileSize: file.size
    });
    
    // Step 1: Create MediaFile entity via Add-In API (this works without sessionId)
    const baseName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
    const ext = baseName.includes('.') ? baseName.substring(baseName.lastIndexOf('.')) : '';
    const nameWithoutExt = baseName.includes('.') ? baseName.substring(0, baseName.lastIndexOf('.')) : baseName;
    const fileName = `${nameWithoutExt}_${Date.now()}${ext}`;
    
    const mediaFile: any = {
        name: fileName,
        solutionId: ADDIN_ID,
        fromDate: new Date().toISOString(),
        toDate: new Date().toISOString(),
        mediaType: 'Image',
        metaData: JSON.stringify({
            reportId,
            category,
            uploadedAt: new Date().toISOString(),
            originalName: file.name,
            size: file.size
        })
    };
    
    console.log('[photoService] Creating MediaFile entity via Add-In API');
    
    let mediaFileId: string;
    try {
        mediaFileId = await new Promise<string>((resolve, reject) => {
            api.call('Add', {
                typeName: 'MediaFile',
                entity: mediaFile
            }, resolve, reject);
        });
    } catch (addErr: any) {
        console.error('[photoService] Failed to create MediaFile entity:', addErr);
        throw new Error(`Failed to create MediaFile: ${addErr?.message || addErr}`);
    }
    
    console.log('[photoService] MediaFile created:', mediaFileId);
    
    // Step 2: Upload binary via backend proxy (it has service credentials)
    try {
        console.log('[photoService] Uploading binary via backend');
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mediaFileId', mediaFileId);
        formData.append('database', database);
        
        const response = await fetch(`${API_BASE_URL}/api/photo/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[photoService] Backend upload failed:', response.status, errorText);
            throw new Error(`Upload failed: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('[photoService] Upload complete:', result);
        
        return {
            mediaFileId,
            photo: {
                id: mediaFileId,
                mediaFileId,
                fileName: file.name,
                category,
                uploadedAt: new Date().toISOString()
            }
        };
    } catch (uploadErr) {
        console.error('[photoService] Binary upload failed:', uploadErr);
        // Clean up the MediaFile entity
        try {
            await new Promise<void>((resolve, reject) => {
                api.call('Remove', { typeName: 'MediaFile', entity: { id: mediaFileId } }, resolve, reject);
            });
            console.log('[photoService] Cleaned up MediaFile entity');
        } catch (e) {
            console.warn('[photoService] Could not clean up MediaFile:', e);
        }
        throw uploadErr;
    }
}

/**
 * Get a download URL for a MediaFile
 * Uses backend proxy since Add-In can't authenticate directly
 */
export function getDownloadUrl(
    mediaFileId: string,
    database: string
): string {
    return `${API_BASE_URL}/api/photo/${encodeURIComponent(database)}/${encodeURIComponent(mediaFileId)}`;
}

/**
 * Get a thumbnail URL for a MediaFile
 */
export function getThumbnailUrl(
    mediaFileId: string,
    database: string
): string {
    return getDownloadUrl(mediaFileId, database);
}

/**
 * Get a full-size image URL for a MediaFile
 */
export function getFullImageUrl(
    mediaFileId: string,
    database: string
): string {
    return getDownloadUrl(mediaFileId, database);
}

/**
 * Delete a MediaFile
 */
export async function deletePhoto(
    api: GeotabApi,
    mediaFileId: string
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        api.call(
            'Remove',
            {
                typeName: 'MediaFile',
                entity: { id: mediaFileId }
            },
            () => resolve(),
            (error: Error) => reject(error)
        );
    });
}

/**
 * Load MediaFile details
 */
export async function getMediaFile(
    api: GeotabApi,
    mediaFileId: string
): Promise<MediaFile | null> {
    return new Promise<MediaFile | null>((resolve, reject) => {
        api.call(
            'Get',
            {
                typeName: 'MediaFile',
                search: { id: mediaFileId }
            },
            (result: MediaFile[]) => resolve(result[0] || null),
            (error: Error) => reject(error)
        );
    });
}

/**
 * Format photo category for display
 */
export function formatPhotoCategory(category: string): string {
    const categories: Record<string, string> = {
        damage: '🚗 Vehicle Damage',
        scene: '📍 Accident Scene',
        other: '📎 Other'
    };
    return categories[category] || category;
}
