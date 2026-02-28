/**
 * Hook for managing FleetClaim reports
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useGeotab } from '@/contexts';
import { IncidentReport, Severity } from '@/types';
import { loadReports, updateReport, deleteReport, ReportRecord } from '@/services';

export interface ReportFilters {
    search: string;
    severity: Severity | 'all';
    dateRange: 'day' | 'week' | 'month' | 'year' | 'all';
    vehicleId: string | 'all';
}

export interface SortOptions {
    field: 'date' | 'severity' | 'vehicle';
    direction: 'asc' | 'desc';
}

const DEFAULT_FILTERS: ReportFilters = {
    search: '',
    severity: 'all',
    dateRange: 'week',
    vehicleId: 'all'
};

const DEFAULT_SORT: SortOptions = {
    field: 'date',
    direction: 'desc'
};

const SEVERITY_ORDER: Record<Severity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1
};

export function useReports() {
    const { api, getGroupFilter, captureCredentials, credentials } = useGeotab();
    const [reports, setReports] = useState<ReportRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
    const [sort, setSort] = useState<SortOptions>(DEFAULT_SORT);
    const credentialsCapturedAfterLoad = useRef(false);

    const refresh = useCallback(async () => {
        if (!api) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
            const loaded = await loadReports(api);
            setReports(loaded);
            
            // Capture credentials AFTER successful API call (following Geotab's mg-media-files pattern)
            if (!credentials && !credentialsCapturedAfterLoad.current) {
                credentialsCapturedAfterLoad.current = true;
                captureCredentials().catch(() => {
                    // Credential capture is best-effort
                });
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load reports');
        } finally {
            setIsLoading(false);
        }
    }, [api, credentials, captureCredentials]);

    // Filter and sort reports
    const filteredReports = useMemo(() => {
        let result = [...reports];
        const groupFilter = getGroupFilter();
        
        // Apply search filter
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            result = result.filter(r => 
                r.report.deviceName?.toLowerCase().includes(searchLower) ||
                r.report.driverName?.toLowerCase().includes(searchLower) ||
                r.report.incidentAddress?.toLowerCase().includes(searchLower) ||
                r.report.incidentCity?.toLowerCase().includes(searchLower)
            );
        }
        
        // Apply severity filter
        if (filters.severity !== 'all') {
            result = result.filter(r => r.report.severity === filters.severity);
        }
        
        // Apply date range filter
        if (filters.dateRange !== 'all') {
            const now = new Date();
            let cutoff: Date;
            
            switch (filters.dateRange) {
                case 'day':
                    cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    break;
                case 'week':
                    cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                case 'year':
                    cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    cutoff = new Date(0);
            }
            
            result = result.filter(r => new Date(r.report.occurredAt) >= cutoff);
        }
        
        // Apply vehicle filter
        if (filters.vehicleId !== 'all') {
            result = result.filter(r => r.report.deviceId === filters.vehicleId);
        }
        
        // Apply sorting
        result.sort((a, b) => {
            let comparison = 0;
            
            switch (sort.field) {
                case 'date':
                    comparison = new Date(a.report.occurredAt).getTime() - new Date(b.report.occurredAt).getTime();
                    break;
                case 'severity':
                    comparison = SEVERITY_ORDER[a.report.severity] - SEVERITY_ORDER[b.report.severity];
                    break;
                case 'vehicle':
                    comparison = (a.report.deviceName || '').localeCompare(b.report.deviceName || '');
                    break;
            }
            
            return sort.direction === 'desc' ? -comparison : comparison;
        });
        
        return result;
    }, [reports, filters, sort, getGroupFilter]);

    // Stats
    const stats = useMemo(() => ({
        total: reports.length,
        filtered: filteredReports.length,
        critical: filteredReports.filter(r => r.report.severity === 'critical').length,
        high: filteredReports.filter(r => r.report.severity === 'high').length,
        newToday: filteredReports.filter(r => {
            const reportDate = new Date(r.report.generatedAt);
            const today = new Date();
            return reportDate.toDateString() === today.toDateString();
        }).length
    }), [reports, filteredReports]);

    const update = useCallback(async (reportId: string, updates: Partial<IncidentReport>) => {
        if (!api) {
            throw new Error('Geotab API not available');
        }
        
        const record = reports.find(r => r.report.id === reportId);
        if (!record) {
            throw new Error('Report not found');
        }
        
        const updatedReport: IncidentReport = {
            ...record.report,
            ...updates
        };
        
        await updateReport(api, record.addInDataId, updatedReport);
        
        // Update local state
        setReports(prev => prev.map(r => 
            r.report.id === reportId 
                ? { ...r, report: updatedReport }
                : r
        ));
    }, [api, reports]);

    const remove = useCallback(async (reportId: string) => {
        if (!api) return;
        
        const record = reports.find(r => r.report.id === reportId);
        if (!record) {
            throw new Error('Report not found');
        }
        
        await deleteReport(api, record.addInDataId);
        
        // Update local state
        setReports(prev => prev.filter(r => r.report.id !== reportId));
    }, [api, reports]);

    // Load on mount
    useEffect(() => {
        refresh();
    }, [refresh]);

    return {
        reports: filteredReports,
        allReports: reports,
        isLoading,
        error,
        stats,
        filters,
        setFilters,
        sort,
        setSort,
        refresh,
        update,
        remove
    };
}
