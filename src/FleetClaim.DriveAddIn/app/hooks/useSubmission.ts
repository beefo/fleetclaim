/**
 * Submission lifecycle hook
 * Manages active submission, auto-save, and status transitions
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { DriverSubmission, createEmptySubmission } from '@/types';
import {
    saveSubmission,
    loadSubmission,
    deleteSubmission,
    getActiveSubmissionId,
    setActiveSubmission,
    clearActiveSubmission,
    deleteAllPhotosForSubmission
} from '@/services/storageService';

const AUTO_SAVE_DELAY = 2000;

export function useSubmission(deviceId: string, deviceName: string) {
    const [submission, setSubmission] = useState<DriverSubmission | null>(null);
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load active submission on mount
    useEffect(() => {
        const activeId = getActiveSubmissionId();
        if (activeId) {
            const loaded = loadSubmission(activeId);
            if (loaded && loaded.status === 'draft') {
                setSubmission(loaded);
            } else {
                clearActiveSubmission();
            }
        }
    }, []);

    // Auto-save when submission changes
    useEffect(() => {
        if (!submission) return;

        if (autoSaveTimer.current) {
            clearTimeout(autoSaveTimer.current);
        }

        autoSaveTimer.current = setTimeout(() => {
            submission.updatedAt = new Date().toISOString();
            saveSubmission(submission);
        }, AUTO_SAVE_DELAY);

        return () => {
            if (autoSaveTimer.current) {
                clearTimeout(autoSaveTimer.current);
            }
        };
    }, [submission]);

    const startNew = useCallback(() => {
        const sub = createEmptySubmission(deviceId, deviceName);
        setSubmission(sub);
        setActiveSubmission(sub.id);
        saveSubmission(sub);
        return sub;
    }, [deviceId, deviceName]);

    const update = useCallback((updates: Partial<DriverSubmission>) => {
        setSubmission(prev => {
            if (!prev) return prev;
            return { ...prev, ...updates };
        });
    }, []);

    const markPendingSync = useCallback(() => {
        setSubmission(prev => {
            if (!prev) return prev;
            const updated = { ...prev, status: 'pending_sync' as const, updatedAt: new Date().toISOString() };
            saveSubmission(updated);
            clearActiveSubmission();
            return updated;
        });
    }, []);

    const discard = useCallback(async () => {
        if (!submission) return;
        await deleteAllPhotosForSubmission(submission.photos);
        deleteSubmission(submission.id);
        clearActiveSubmission();
        setSubmission(null);
    }, [submission]);

    const resume = useCallback((id: string) => {
        const loaded = loadSubmission(id);
        if (loaded) {
            setSubmission(loaded);
            setActiveSubmission(id);
        }
    }, []);

    return {
        submission,
        startNew,
        update,
        markPendingSync,
        discard,
        resume,
        isActive: submission !== null && submission.status === 'draft'
    };
}
