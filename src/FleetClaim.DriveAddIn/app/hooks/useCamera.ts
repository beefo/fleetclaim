/**
 * Camera hook
 * Wraps api.mobile.camera.takePicture() with resize and IndexedDB save
 */

import { useCallback } from 'react';
import { useDrive } from '@/contexts';
import { SubmissionPhoto } from '@/types';
import { savePhotoData, resizeImage } from '@/services/storageService';

export function useCamera() {
    const { takePicture: mobileTakePicture, hasMobileApi } = useDrive();

    const capturePhoto = useCallback(async (
        category: 'damage' | 'scene' | 'other'
    ): Promise<SubmissionPhoto | null> => {
        let base64Data: string | null = null;

        if (hasMobileApi) {
            base64Data = await mobileTakePicture();
        } else {
            // Fallback: file input for desktop/dev
            base64Data = await pickFileAsBase64();
        }

        if (!base64Data) return null;

        // Resize to max 1920px
        const resized = await resizeImage(base64Data);

        const photo: SubmissionPhoto = {
            localId: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            category,
            capturedAt: new Date().toISOString(),
            base64Data: resized,
            mimeType: 'image/jpeg'
        };

        // Save to IndexedDB
        await savePhotoData(photo);

        return photo;
    }, [hasMobileApi, mobileTakePicture]);

    return { capturePhoto, hasMobileApi };
}

function pickFileAsBase64(): Promise<string | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) { resolve(null); return; }

            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        };
        input.click();
    });
}
