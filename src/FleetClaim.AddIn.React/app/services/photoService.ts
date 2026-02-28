/**
 * FleetClaim Photo Service
 * 
 * Handles photo upload and management via Geotab MediaFile API
 */

import { GeotabApi, MediaFile, Photo } from '@/types';
import { GeotabCredentials } from '@/contexts/GeotabContext';

const ADDIN_ID = 'aji_jHQGE8k2TDodR8tZrpw';

export interface UploadResult {
    mediaFileId: string;
    photo: Photo;
}

/**
 * Upload a photo directly via Geotab MediaFile API
 * Uses raw XMLHttpRequest like the vanilla Add-In
 * 
 * @param api - The Geotab API object
 * @param credentials - Pre-captured credentials from GeotabContext (via api.getSession after warmup)
 * @param geotabHost - The Geotab host (e.g., my.geotab.com)
 * @param file - The file to upload
 * @param deviceId - The device ID (not used for MediaFile, but kept for future use)
 * @param reportId - The report ID to tag the photo with
 * @param category - The photo category
 */
export async function uploadPhoto(
    api: GeotabApi,
    credentials: GeotabCredentials,
    geotabHost: string,
    file: File,
    deviceId: string,
    reportId: string,
    category: 'damage' | 'scene' | 'other'
): Promise<UploadResult> {
    // Create MediaFile entity via API
    // Add timestamp to filename to avoid DuplicateException
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
    
    const mediaFileId = await new Promise<string>((resolve, reject) => {
        api.call('Add', {
            typeName: 'MediaFile',
            entity: mediaFile
        }, resolve, reject);
    });
    
    // Upload binary via raw XMLHttpRequest (matching Geotab's official example)
    try {
        await uploadBinaryToGeotab(file, mediaFileId, fileName, credentials, geotabHost);
    } catch (uploadErr) {
        // Clean up the MediaFile entity on failure
        try {
            await new Promise<void>((resolve, reject) => {
                api.call('Remove', { typeName: 'MediaFile', entity: { id: mediaFileId } }, resolve, reject);
            });
        } catch (e) {
            // Ignore cleanup errors
        }
        throw uploadErr;
    }
    
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
}

/**
 * Upload binary to Geotab using XMLHttpRequest (matching Geotab's official example exactly)
 */
function uploadBinaryToGeotab(
    file: File,
    mediaFileId: string,
    fileName: string,
    credentials: GeotabCredentials,
    host: string
): Promise<any> {
    return new Promise((resolve, reject) => {
        const fd = new FormData();
        
        // JSON-RPC parameters (MUST be URL encoded per Geotab example)
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
        
        xhr.addEventListener('load', function(e: any) {
            if (e.target && e.target.responseText) {
                try {
                    const jsonResponse = JSON.parse(e.target.responseText);
                    if (jsonResponse.error) {
                        reject(new Error(jsonResponse.error.message || JSON.stringify(jsonResponse.error)));
                    } else {
                        resolve(jsonResponse);
                    }
                } catch (parseErr) {
                    // Non-JSON response might be OK
                    resolve(e.target.responseText);
                }
            } else {
                reject(new Error('Empty response from upload'));
            }
        });
        
        xhr.addEventListener('error', function() {
            reject(new Error('Network error during upload'));
        });
        
        const uploadUrl = `https://${host}/apiv1/`;
        
        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('Accept', 'application/json, */*;q=0.8');
        xhr.send(fd);
    });
}

/**
 * Get a download URL for a MediaFile
 * Uses Geotab's DownloadMediaFile API with credentials in URL
 */
export function getDownloadUrl(
    mediaFileId: string,
    credentials: GeotabCredentials | null,
    host: string = 'my.geotab.com'
): string {
    if (!credentials || !credentials.sessionId) {
        // Return a placeholder if no credentials
        return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23ccc" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%23666">📷</text></svg>';
    }
    
    // Build DownloadMediaFile URL with credentials
    const userName = encodeURIComponent(credentials.userName);
    const database = encodeURIComponent(credentials.database);
    const sessionId = encodeURIComponent(credentials.sessionId);
    
    return `https://${host}/apiv1/DownloadMediaFile?` +
        `mediaFile={"id":"${mediaFileId}"}` +
        `&credentials={"userName":"${userName}","database":"${database}","sessionId":"${sessionId}"}`;
}

/**
 * Get a thumbnail URL for a MediaFile (alias for getDownloadUrl)
 */
export function getThumbnailUrl(
    mediaFileId: string,
    credentials: GeotabCredentials | null,
    host: string = 'my.geotab.com'
): string {
    return getDownloadUrl(mediaFileId, credentials, host);
}

/**
 * Get a full-size image URL for a MediaFile (alias for getDownloadUrl)
 */
export function getFullImageUrl(
    mediaFileId: string,
    credentials: GeotabCredentials | null,
    host: string = 'my.geotab.com'
): string {
    return getDownloadUrl(mediaFileId, credentials, host);
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
