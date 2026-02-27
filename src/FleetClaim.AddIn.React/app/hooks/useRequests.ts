/**
 * Hook for managing FleetClaim report requests
 */

import { useState, useEffect, useCallback } from 'react';
import { useGeotab } from '@/contexts';
import { ReportRequest } from '@/types';
import { loadRequests, submitReportRequest, deleteRequest, RequestRecord } from '@/services';

export function useRequests() {
    const { api, session, currentUser } = useGeotab();
    const [requests, setRequests] = useState<RequestRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!api) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
            const loaded = await loadRequests(api);
            // Sort by requested date, newest first
            loaded.sort((a, b) => 
                new Date(b.request.requestedAt).getTime() - new Date(a.request.requestedAt).getTime()
            );
            setRequests(loaded);
        } catch (err) {
            console.error('Failed to load requests:', err);
            setError(err instanceof Error ? err.message : 'Failed to load requests');
        } finally {
            setIsLoading(false);
        }
    }, [api]);

    const submit = useCallback(async (
        deviceId: string,
        deviceName: string,
        rangeStart: Date,
        rangeEnd: Date,
        forceReport = false
    ) => {
        if (!api) return;
        
        // Get username from session or currentUser (fallback for external Add-Ins)
        const userName = session?.userName || currentUser?.name || 'Unknown User';
        console.log('[useRequests] Submitting request with userName:', userName);
        
        const request = {
            deviceId,
            deviceName,
            requestedBy: userName,
            rangeStart: rangeStart.toISOString(),
            rangeEnd: rangeEnd.toISOString(),
            forceReport
        };
        
        const addInDataId = await submitReportRequest(api, request);
        
        // Add to local state
        const newRecord: RequestRecord = {
            request: {
                ...request,
                id: `req_${Date.now()}`,
                status: 'pending',
                requestedAt: new Date().toISOString()
            },
            addInDataId
        };
        
        setRequests(prev => [newRecord, ...prev]);
        
        return newRecord.request.id;
    }, [api, session, currentUser]);

    const remove = useCallback(async (requestId: string) => {
        if (!api) return;
        
        const record = requests.find(r => r.request.id === requestId);
        if (!record) {
            throw new Error('Request not found');
        }
        
        await deleteRequest(api, record.addInDataId);
        
        // Update local state
        setRequests(prev => prev.filter(r => r.request.id !== requestId));
    }, [api, requests]);

    // Stats
    const stats = {
        total: requests.length,
        pending: requests.filter(r => r.request.status === 'pending').length,
        processing: requests.filter(r => r.request.status === 'processing').length,
        completed: requests.filter(r => r.request.status === 'completed').length,
        failed: requests.filter(r => r.request.status === 'failed').length
    };

    // Load on mount
    useEffect(() => {
        refresh();
    }, [refresh]);

    // Poll for updates every 30 seconds if there are pending requests
    useEffect(() => {
        const hasPending = requests.some(r => 
            r.request.status === 'pending' || r.request.status === 'processing'
        );
        
        if (!hasPending) return;
        
        const interval = setInterval(refresh, 30000);
        return () => clearInterval(interval);
    }, [requests, refresh]);

    return {
        requests,
        isLoading,
        error,
        stats,
        refresh,
        submit,
        remove
    };
}
