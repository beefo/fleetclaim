/**
 * Tests for useRequests hook
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { useRequests } from '@/hooks/useRequests';
import { GeotabProvider } from '@/contexts';
import { GeotabApi, GeotabPageState, ReportRequest } from '@/types';

// Mock request data
const mockRequest: ReportRequest = {
    id: 'req_001',
    deviceId: 'b1',
    deviceName: 'Test Vehicle',
    requestedBy: 'test@test.com',
    requestedAt: new Date().toISOString(),
    fromDate: new Date(Date.now() - 3600000).toISOString(),
    toDate: new Date().toISOString(),
    status: 'pending'
};

// Create mock API
const createMockApi = (requests: ReportRequest[] = []): GeotabApi => ({
    call: jest.fn((method, params, success) => {
        if (method === 'Get' && (params as any).typeName === 'AddInData') {
            const addInData = requests.map((r, i) => ({
                id: `aid_${i}`,
                addInId: 'aji_jHQGE8k2TDodR8tZrpw',
                details: JSON.stringify({
                    type: 'reportRequest',
                    payload: r
                })
            }));
            if (success) success(addInData);
            return Promise.resolve(addInData);
        }
        if (method === 'Get' && (params as any).typeName === 'User') {
            if (success) success([{ id: 'u1', name: 'test@test.com' }]);
            return Promise.resolve([{ id: 'u1', name: 'test@test.com' }]);
        }
        if (method === 'Add') {
            if (success) success('new_aid_123');
            return Promise.resolve('new_aid_123');
        }
        if (method === 'Remove') {
            if (success) success();
            return Promise.resolve();
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

describe('useRequests', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should load requests on mount', async () => {
        const mockApi = createMockApi([mockRequest]);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useRequests(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        expect(result.current.isLoading).toBe(true);
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.requests).toHaveLength(1);
        expect(result.current.requests[0].request.id).toBe('req_001');
    });

    it('should calculate stats correctly', async () => {
        const requests = [
            { ...mockRequest, id: 'req_001', status: 'pending' as const },
            { ...mockRequest, id: 'req_002', status: 'processing' as const },
            { ...mockRequest, id: 'req_003', status: 'completed' as const },
            { ...mockRequest, id: 'req_004', status: 'failed' as const }
        ];
        
        const mockApi = createMockApi(requests);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useRequests(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.stats.total).toBe(4);
        expect(result.current.stats.pending).toBe(1);
        expect(result.current.stats.processing).toBe(1);
        expect(result.current.stats.completed).toBe(1);
        expect(result.current.stats.failed).toBe(1);
    });

    it('should sort requests by date descending', async () => {
        const now = Date.now();
        const requests = [
            { ...mockRequest, id: 'req_old', requestedAt: new Date(now - 7200000).toISOString() },
            { ...mockRequest, id: 'req_new', requestedAt: new Date(now).toISOString() },
            { ...mockRequest, id: 'req_mid', requestedAt: new Date(now - 3600000).toISOString() }
        ];
        
        const mockApi = createMockApi(requests);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useRequests(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        // Newest should be first
        expect(result.current.requests[0].request.id).toBe('req_new');
        expect(result.current.requests[2].request.id).toBe('req_old');
    });

    it('should submit a new request', async () => {
        const mockApi = createMockApi([]);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useRequests(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        await act(async () => {
            await result.current.submit(
                'b1',
                'Test Vehicle',
                new Date(Date.now() - 3600000),
                new Date(),
                false
            );
        });
        
        expect(result.current.requests).toHaveLength(1);
        expect(result.current.requests[0].request.deviceId).toBe('b1');
        expect(result.current.requests[0].request.status).toBe('pending');
    });

    it('should submit a force report request', async () => {
        const mockApi = createMockApi([]);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useRequests(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        await act(async () => {
            await result.current.submit(
                'b1',
                'Test Vehicle',
                new Date(),
                new Date(),
                true // forceReport
            );
        });
        
        expect(result.current.requests[0].request.forceReport).toBe(true);
    });

    it('should remove a request', async () => {
        const mockApi = createMockApi([mockRequest]);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useRequests(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        expect(result.current.requests).toHaveLength(1);
        
        await act(async () => {
            await result.current.remove('req_001');
        });
        
        expect(result.current.requests).toHaveLength(0);
    });

    it('should throw error when removing non-existent request', async () => {
        const mockApi = createMockApi([mockRequest]);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useRequests(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        await expect(
            act(async () => {
                await result.current.remove('non_existent');
            })
        ).rejects.toThrow('Request not found');
    });

    it('should refresh requests', async () => {
        const mockApi = createMockApi([mockRequest]);
        const mockState = createMockState();
        
        const { result } = renderHook(() => useRequests(), {
            wrapper: createWrapper(mockApi, mockState)
        });
        
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        
        await act(async () => {
            await result.current.refresh();
        });
        
        expect(mockApi.call).toHaveBeenCalled();
    });
});
