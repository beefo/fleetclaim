import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { useReports } from '@/hooks/useReports';
import { GeotabProvider } from '@/contexts';
import { GeotabApi, GeotabPageState, IncidentReport } from '@/types';

// Mock report data
const mockReport: IncidentReport = {
    id: 'rpt_001',
    deviceId: 'b1',
    deviceName: 'Test Vehicle',
    occurredAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    latitude: 43.45,
    longitude: -79.68,
    severity: 'high'
};

// Create mock API
const createMockApi = (reports: IncidentReport[] = []): GeotabApi => ({
    call: jest.fn((method, params, success) => {
        if (method === 'Get' && (params as any).typeName === 'AddInData') {
            const addInData = reports.map((r, i) => ({
                id: `aid_${i}`,
                addInId: 'aji_jHQGE8k2TDodR8tZrpw',
                details: JSON.stringify({
                    type: 'report',
                    payload: r
                })
            }));
            if (success) success(addInData);
            return Promise.resolve(addInData);
        }
        if (success) success([]);
        return Promise.resolve([]);
    }),
    multiCall: jest.fn(() => Promise.resolve([])),
    getSession: jest.fn((success) => {
        success({
            database: 'test_db',
            userName: 'test@test.com',
            sessionId: 'test_session'
        });
    })
});

const createMockState = (): GeotabPageState => ({
    getState: () => ({}),
    setState: () => {},
    gotoPage: () => true,
    hasAccessToPage: () => true,
    getGroupFilter: () => [],
    translate: (t) => t
});

// Wrapper component for hook testing
const createWrapper = (api: GeotabApi, state: GeotabPageState) => {
    return ({ children }: { children: React.ReactNode }) => (
        React.createElement(GeotabProvider, { initialApi: api, initialState: state }, children)
    );
};

describe('useReports', () => {
    it('should load reports on mount', async () => {
        const mockApi = createMockApi([mockReport]);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useReports(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        // Initially loading
        expect(result.current.isLoading).toBe(true);
        
        // Wait for load to complete
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.reports).toHaveLength(1);
        expect(result.current.reports[0].report.id).toBe('rpt_001');
    });
    
    it('should filter reports by search', async () => {
        const reports = [
            { ...mockReport, id: 'rpt_001', deviceName: 'Truck Alpha' },
            { ...mockReport, id: 'rpt_002', deviceName: 'Van Beta' }
        ];
        
        const mockApi = createMockApi(reports);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useReports(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.reports).toHaveLength(2);
        
        // Apply search filter
        act(() => {
            result.current.setFilters({
                ...result.current.filters,
                search: 'Truck'
            });
        });
        
        expect(result.current.reports).toHaveLength(1);
        expect(result.current.reports[0].report.deviceName).toBe('Truck Alpha');
    });
    
    it('should filter reports by severity', async () => {
        const reports = [
            { ...mockReport, id: 'rpt_001', severity: 'critical' as const },
            { ...mockReport, id: 'rpt_002', severity: 'low' as const }
        ];
        
        const mockApi = createMockApi(reports);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useReports(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        // Apply severity filter
        act(() => {
            result.current.setFilters({
                ...result.current.filters,
                severity: 'critical'
            });
        });
        
        expect(result.current.reports).toHaveLength(1);
        expect(result.current.reports[0].report.severity).toBe('critical');
    });
    
    it('should calculate stats correctly', async () => {
        const reports = [
            { ...mockReport, id: 'rpt_001', severity: 'critical' as const },
            { ...mockReport, id: 'rpt_002', severity: 'high' as const },
            { ...mockReport, id: 'rpt_003', severity: 'low' as const }
        ];
        
        const mockApi = createMockApi(reports);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useReports(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.stats.total).toBe(3);
        expect(result.current.stats.critical).toBe(1);
        expect(result.current.stats.high).toBe(1);
    });
    
    it('should sort reports by date descending by default', async () => {
        const now = Date.now();
        const reports = [
            { ...mockReport, id: 'rpt_001', occurredAt: new Date(now - 3600000).toISOString() },
            { ...mockReport, id: 'rpt_002', occurredAt: new Date(now).toISOString() },
            { ...mockReport, id: 'rpt_003', occurredAt: new Date(now - 7200000).toISOString() }
        ];
        
        const mockApi = createMockApi(reports);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useReports(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        // Most recent should be first
        expect(result.current.reports[0].report.id).toBe('rpt_002');
        expect(result.current.reports[2].report.id).toBe('rpt_003');
    });
});
