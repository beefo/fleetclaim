import React from 'react';
import { Banner } from '@geotab/zenith';
import { getPendingSyncSubmissions } from '@/services/storageService';

interface SyncStatusBannerProps {
    isOnline: boolean;
    syncNow: () => void;
}

export const SyncStatusBanner: React.FC<SyncStatusBannerProps> = ({ isOnline, syncNow }) => {
    const pendingCount = getPendingSyncSubmissions().length;

    if (isOnline && pendingCount === 0) return null;

    if (!isOnline) {
        return (
            <Banner type="warning" header="Offline">
                You are currently offline. Submissions will be saved locally and synced when connectivity is restored.
                {pendingCount > 0 && ` (${pendingCount} pending)`}
            </Banner>
        );
    }

    if (pendingCount > 0) {
        return (
            <Banner type="info" header={`${pendingCount} Pending Sync`}>
                {pendingCount} submission{pendingCount > 1 ? 's' : ''} waiting to sync.{' '}
                <button
                    onClick={syncNow}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--zen-color-primary, #0070f3)',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0,
                        font: 'inherit'
                    }}
                >
                    Sync now
                </button>
            </Banner>
        );
    }

    return null;
};
