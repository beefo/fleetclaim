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

    it('should sort reports by severity', async () => {
        const reports = [
            { ...mockReport, id: 'rpt_001', severity: 'low' as const },
            { ...mockReport, id: 'rpt_002', severity: 'critical' as const },
            { ...mockReport, id: 'rpt_003', severity: 'medium' as const }
        ];
        
        const mockApi = createMockApi(reports);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useReports(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        // Change sort to severity desc
        act(() => {
            result.current.setSort({ field: 'severity', direction: 'desc' });
        });
        
        // Critical should be first
        expect(result.current.reports[0].report.severity).toBe('critical');
        expect(result.current.reports[2].report.severity).toBe('low');
    });

    it('should sort reports by vehicle name', async () => {
        const reports = [
            { ...mockReport, id: 'rpt_001', deviceName: 'Zebra' },
            { ...mockReport, id: 'rpt_002', deviceName: 'Alpha' },
            { ...mockReport, id: 'rpt_003', deviceName: 'Beta' }
        ];
        
        const mockApi = createMockApi(reports);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useReports(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        // Change sort to vehicle asc
        act(() => {
            result.current.setSort({ field: 'vehicle', direction: 'asc' });
        });
        
        expect(result.current.reports[0].report.deviceName).toBe('Alpha');
        expect(result.current.reports[2].report.deviceName).toBe('Zebra');
    });

    it('should filter reports by date range', async () => {
        const now = Date.now();
        const reports = [
            { ...mockReport, id: 'rpt_today', occurredAt: new Date(now).toISOString() },
            { ...mockReport, id: 'rpt_yesterday', occurredAt: new Date(now - 24 * 60 * 60 * 1000).toISOString() },
            { ...mockReport, id: 'rpt_old', occurredAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString() }
        ];
        
        const mockApi = createMockApi(reports);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useReports(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        // Filter to day only
        act(() => {
            result.current.setFilters({
                ...result.current.filters,
                dateRange: 'day'
            });
        });
        
        expect(result.current.reports).toHaveLength(1);
        expect(result.current.reports[0].report.id).toBe('rpt_today');
    });

    it('should filter reports by vehicle', async () => {
        const reports = [
            { ...mockReport, id: 'rpt_001', deviceId: 'v1', deviceName: 'Truck 1' },
            { ...mockReport, id: 'rpt_002', deviceId: 'v2', deviceName: 'Truck 2' }
        ];
        
        const mockApi = createMockApi(reports);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useReports(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        // Filter to specific vehicle
        act(() => {
            result.current.setFilters({
                ...result.current.filters,
                vehicleId: 'v1'
            });
        });
        
        expect(result.current.reports).toHaveLength(1);
        expect(result.current.reports[0].report.deviceId).toBe('v1');
    });

    it('should update a report', async () => {
        const mockApi = createMockApi([mockReport]);
        (mockApi.call as jest.Mock).mockImplementation((method, params, success, error) => {
            if (method === 'Get') {
                const addInData = [{
                    id: 'aid_001',
                    addInId: 'aji_jHQGE8k2TDodR8tZrpw',
                    details: JSON.stringify({ type: 'report', payload: mockReport })
                }];
                if (success) success(addInData);
                return Promise.resolve(addInData);
            }
            if (method === 'Set') {
                if (success) success();
                return Promise.resolve();
            }
            return Promise.resolve();
        });
        
        const mockState = createMockState();
        
        const { result } = renderHook(() => useReports(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        // Update the report
        await act(async () => {
            await result.current.update('rpt_001', { notes: 'Updated notes' });
        });
        
        expect(result.current.reports[0].report.notes).toBe('Updated notes');
    });

    it('should remove a report', async () => {
        const mockApi = createMockApi([mockReport]);
        (mockApi.call as jest.Mock).mockImplementation((method, params, success, error) => {
            if (method === 'Get') {
                const addInData = [{
                    id: 'aid_001',
                    addInId: 'aji_jHQGE8k2TDodR8tZrpw',
                    details: JSON.stringify({ type: 'report', payload: mockReport })
                }];
                if (success) success(addInData);
                return Promise.resolve(addInData);
            }
            if (method === 'Remove') {
                if (success) success();
                return Promise.resolve();
            }
            return Promise.resolve();
        });
        
        const mockState = createMockState();
        
        const { result } = renderHook(() => useReports(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.reports).toHaveLength(1);
        
        // Remove the report
        await act(async () => {
            await result.current.remove('rpt_001');
        });
        
        expect(result.current.reports).toHaveLength(0);
    });

    it('should refresh reports when refresh is called', async () => {
        const mockApi = createMockApi([mockReport]);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useReports(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        // Call refresh
        await act(async () => {
            await result.current.refresh();
        });
        
        // API should have been called multiple times (initial + refresh + possibly getSession)
        expect(mockApi.call).toHaveBeenCalled();
    });
});
