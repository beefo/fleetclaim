/**
 * Hook for managing FleetClaim report requests
 */

import { useState, useEffect, useCallback } from 'react';
import { useGeotab } from '@/contexts';
import { ReportRequest } from '@/types';
import { loadRequests, submitReportRequest, deleteRequest, RequestRecord, auditReportRequested } from '@/services';

export function useRequests() {
    const { api, session, currentUser, credentials } = useGeotab();
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
        forceReport = false,
        linkedSubmissionId?: string
    ) => {
        if (!api) return;
        
        // Get username - prefer credentials.userName (email) over currentUser.name (short name)
        // credentials comes from getSession() and has the full email
        const userName = credentials?.userName || session?.userName || currentUser?.name || 'Unknown User';
        
        const request: any = {
            deviceId,
            deviceName,
            requestedBy: userName,
            fromDate: rangeStart.toISOString(),
            toDate: rangeEnd.toISOString(),
            forceReport: forceReport || !!linkedSubmissionId // Force report if linking to submission
        };
        
        // Add linkedSubmissionId if provided
        if (linkedSubmissionId) {
            request.linkedSubmissionId = linkedSubmissionId;
        }
        
        const addInDataId = await submitReportRequest(api, request);
        
        // Audit the request (best-effort, don't block)
        const dateRange = `${rangeStart.toLocaleDateString()} - ${rangeEnd.toLocaleDateString()}`;
        auditReportRequested(api, deviceName, dateRange, forceReport);
        
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
    }, [api, credentials, session, currentUser]);

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
