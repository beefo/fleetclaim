/**
 * Online status hook
 * Triggers sync when transitioning from offline to online
 * Also refreshes submission statuses from AddInData periodically
 */

import { useEffect, useRef, useCallback } from 'react';
import { useDrive } from '@/contexts';
import { syncAllPending, refreshSubmissionStatuses } from '@/services/syncService';

const STATUS_REFRESH_INTERVAL = 60000; // Check for status updates every 60 seconds

export function useOnlineStatus(
    onSyncComplete?: (result: { synced: number; failed: number }) => void
) {
    const { api, credentials, geotabHost, isOnline } = useDrive();
    const wasOffline = useRef(!isOnline);
    const isSyncing = useRef(false);

    const doSync = useCallback(async () => {
        if (!api || !credentials?.sessionId || isSyncing.current) return;

        isSyncing.current = true;
        try {
            const result = await syncAllPending(api, credentials, geotabHost);
            if (result.synced > 0 || result.failed > 0) {
                onSyncComplete?.(result);
            }
            
            // Also refresh statuses of already-synced submissions
            await refreshSubmissionStatuses(api);
        } catch (err) {
            console.error('[useOnlineStatus] Sync error:', err);
        } finally {
            isSyncing.current = false;
        }
    }, [api, credentials, geotabHost, onSyncComplete]);

    useEffect(() => {
        if (isOnline && wasOffline.current) {
            // Transitioned from offline to online
            doSync();
        }
        wasOffline.current = !isOnline;
    }, [isOnline, doSync]);

    // Also sync on mount if online and there are pending submissions
    useEffect(() => {
        if (isOnline) {
            doSync();
        }
    }, []);
    
    // Periodically refresh submission statuses when online
    useEffect(() => {
        if (!isOnline || !api) return;
        
        const interval = setInterval(async () => {
            try {
                await refreshSubmissionStatuses(api);
            } catch (err) {
                console.warn('[useOnlineStatus] Status refresh error:', err);
            }
        }, STATUS_REFRESH_INTERVAL);
        
        return () => clearInterval(interval);
    }, [isOnline, api]);

    return { isOnline, syncNow: doSync };
}
