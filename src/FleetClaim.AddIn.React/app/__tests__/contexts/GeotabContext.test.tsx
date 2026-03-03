/**
 * Tests for GeotabContext
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { GeotabProvider, useGeotab, GeotabCredentials } from '@/contexts/GeotabContext';
import { GeotabApi, GeotabPageState } from '@/types';

// Create mock API
const createMockApi = (): GeotabApi => ({
    call: jest.fn((method, params, success, error) => {
        if (method === 'Get' && (params as any).typeName === 'User') {
            const users = [{ id: 'u1', name: 'test@test.com', firstName: 'Test', lastName: 'User' }];
            if (success) success(users);
            return Promise.resolve(users);
        }
        if (method === 'Get' && (params as any).typeName === 'Device') {
            const devices = [{ id: 'd1', name: 'Test Vehicle' }];
            if (success) success(devices);
            return Promise.resolve(devices);
        }
        if (method === 'Get' && (params as any).typeName === 'Group') {
            const groups = [{ id: 'g1', name: 'Test Group' }];
            if (success) success(groups);
            return Promise.resolve(groups);
        }
        if (success) success([]);
        return Promise.resolve([]);
    }),
    multiCall: jest.fn((calls, success, error) => {
        const results = calls.map(() => []);
        if (success) success(results);
        return Promise.resolve(results);
    }),
    getSession: jest.fn((success, error) => {
        const session = {
            database: 'test_db',
            userName: 'test@test.com',
            sessionId: 'session-123'
        };
        if (success) success(session);
        return Promise.resolve(session);
    })
});

const createMockState = (): GeotabPageState => ({
    getState: jest.fn(() => ({ database: 'test_db' })),
    setState: jest.fn(),
    gotoPage: jest.fn(() => true),
    hasAccessToPage: jest.fn(() => true),
    getGroupFilter: jest.fn(() => [{ id: 'g1' }]),
    translate: jest.fn((t) => t)
});

const wrapper = ({ children, api, state }: { children: React.ReactNode; api?: GeotabApi; state?: GeotabPageState }) => (
    <GeotabProvider initialApi={api} initialState={state}>
        {children}
    </GeotabProvider>
);

describe('GeotabContext', () => {
    describe('useGeotab hook', () => {
        it('should throw error when used outside provider', () => {
            // Suppress console.error for this test
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            
            expect(() => {
                renderHook(() => useGeotab());
            }).toThrow('useGeotab must be used within a GeotabProvider');
            
            consoleSpy.mockRestore();
        });

        it('should provide context values within provider', () => {
            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => <GeotabProvider>{children}</GeotabProvider>
            });

            expect(result.current.api).toBeNull();
            expect(result.current.state).toBeNull();
            expect(result.current.devices).toEqual([]);
            expect(result.current.groups).toEqual([]);
            expect(result.current.isLoading).toBe(false);
        });
    });

    describe('setGeotabApi', () => {
        it('should set api and state', async () => {
            const mockApi = createMockApi();
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => <GeotabProvider>{children}</GeotabProvider>
            });

            act(() => {
                result.current.setGeotabApi(mockApi, mockState);
            });

            await waitFor(() => {
                expect(result.current.api).toBe(mockApi);
                expect(result.current.state).toBe(mockState);
            });
        });
    });

    describe('with initial API', () => {
        it('should load current user on mount', async () => {
            const mockApi = createMockApi();
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => (
                    <GeotabProvider initialApi={mockApi} initialState={mockState}>
                        {children}
                    </GeotabProvider>
                )
            });

            await waitFor(() => {
                expect(result.current.currentUser).not.toBeNull();
            });

            expect(result.current.currentUser?.name).toBe('test@test.com');
        });
    });

    describe('call method', () => {
        it('should call API and return result', async () => {
            const mockApi = createMockApi();
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => (
                    <GeotabProvider initialApi={mockApi} initialState={mockState}>
                        {children}
                    </GeotabProvider>
                )
            });

            await waitFor(() => {
                expect(result.current.api).not.toBeNull();
            });

            const users = await result.current.call('Get', { typeName: 'User' });
            
            expect(mockApi.call).toHaveBeenCalledWith(
                'Get',
                { typeName: 'User' },
                expect.any(Function),
                expect.any(Function)
            );
        });

        it('should throw when api is not available', async () => {
            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => <GeotabProvider>{children}</GeotabProvider>
            });

            await expect(result.current.call('Get', {})).rejects.toThrow('Geotab API not initialized');
        });
    });

    describe('multiCall method', () => {
        it('should call API multiCall', async () => {
            const mockApi = createMockApi();
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => (
                    <GeotabProvider initialApi={mockApi} initialState={mockState}>
                        {children}
                    </GeotabProvider>
                )
            });

            await waitFor(() => {
                expect(result.current.api).not.toBeNull();
            });

            await result.current.multiCall([['Get', { typeName: 'Device' }]]);
            
            expect(mockApi.multiCall).toHaveBeenCalled();
        });

        it('should throw when api is not available', async () => {
            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => <GeotabProvider>{children}</GeotabProvider>
            });

            await expect(result.current.multiCall([['Get', {}]])).rejects.toThrow('Geotab API not initialized');
        });
    });

    describe('loadDevices', () => {
        it('should load devices from API', async () => {
            const mockApi = createMockApi();
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => (
                    <GeotabProvider initialApi={mockApi} initialState={mockState}>
                        {children}
                    </GeotabProvider>
                )
            });

            await waitFor(() => {
                expect(result.current.api).not.toBeNull();
            });

            await act(async () => {
                await result.current.loadDevices();
            });

            expect(result.current.devices).toHaveLength(1);
            expect(result.current.devices[0].name).toBe('Test Vehicle');
        });
    });

    describe('loadGroups', () => {
        it('should load groups from API', async () => {
            const mockApi = createMockApi();
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => (
                    <GeotabProvider initialApi={mockApi} initialState={mockState}>
                        {children}
                    </GeotabProvider>
                )
            });

            await waitFor(() => {
                expect(result.current.api).not.toBeNull();
            });

            await act(async () => {
                await result.current.loadGroups();
            });

            expect(result.current.groups).toHaveLength(1);
            expect(result.current.groups[0].name).toBe('Test Group');
        });
    });

    describe('getGroupFilter', () => {
        it('should return group filter from state', async () => {
            const mockApi = createMockApi();
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => (
                    <GeotabProvider initialApi={mockApi} initialState={mockState}>
                        {children}
                    </GeotabProvider>
                )
            });

            await waitFor(() => {
                expect(result.current.state).not.toBeNull();
            });

            const filter = result.current.getGroupFilter();
            expect(filter).toEqual([{ id: 'g1' }]);
        });

        it('should return empty array when state is null', () => {
            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => <GeotabProvider>{children}</GeotabProvider>
            });

            const filter = result.current.getGroupFilter();
            expect(filter).toEqual([]);
        });
    });

    describe('captureCredentials', () => {
        it('should capture credentials via getSession', async () => {
            const mockApi = createMockApi();
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => (
                    <GeotabProvider initialApi={mockApi} initialState={mockState}>
                        {children}
                    </GeotabProvider>
                )
            });

            await waitFor(() => {
                expect(result.current.api).not.toBeNull();
            });

            await act(async () => {
                await result.current.captureCredentials();
            });

            expect(result.current.credentials).not.toBeNull();
            expect(result.current.credentials?.database).toBe('test_db');
            expect(result.current.credentials?.sessionId).toBe('session-123');
        });

        it('should include all required credential fields', async () => {
            const mockApi = createMockApi();
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => (
                    <GeotabProvider initialApi={mockApi} initialState={mockState}>
                        {children}
                    </GeotabProvider>
                )
            });

            await waitFor(() => {
                expect(result.current.api).not.toBeNull();
            });

            await act(async () => {
                await result.current.captureCredentials();
            });

            // All fields required for MediaFile operations
            expect(result.current.credentials).toHaveProperty('database');
            expect(result.current.credentials).toHaveProperty('userName');
            expect(result.current.credentials).toHaveProperty('sessionId');
            expect(result.current.credentials?.database).toBeTruthy();
            expect(result.current.credentials?.userName).toBeTruthy();
            expect(result.current.credentials?.sessionId).toBeTruthy();
        });

        it('should require sessionId to be present in credentials', async () => {
            // Create API that returns credentials without sessionId
            const mockApi: GeotabApi = {
                ...createMockApi(),
                getSession: jest.fn((success) => {
                    // Return credentials without sessionId - should not be stored
                    if (success) success({ database: 'test_db', userName: 'test@test.com', sessionId: '' });
                    return Promise.resolve();
                })
            };
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => (
                    <GeotabProvider initialApi={mockApi} initialState={mockState}>
                        {children}
                    </GeotabProvider>
                )
            });

            await waitFor(() => {
                expect(result.current.api).not.toBeNull();
            });

            await act(async () => {
                await result.current.captureCredentials();
            });

            // Should not have stored credentials with empty sessionId
            expect(result.current.credentials?.sessionId).toBeFalsy();
        });

        it('should not re-capture if already have valid credentials', async () => {
            const mockApi = createMockApi();
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => (
                    <GeotabProvider initialApi={mockApi} initialState={mockState}>
                        {children}
                    </GeotabProvider>
                )
            });

            await waitFor(() => {
                expect(result.current.api).not.toBeNull();
            });

            // First capture
            await act(async () => {
                await result.current.captureCredentials();
            });

            const callCountAfterFirst = (mockApi.getSession as jest.Mock).mock.calls.length;

            // Second capture - should be skipped
            await act(async () => {
                await result.current.captureCredentials();
            });

            const callCountAfterSecond = (mockApi.getSession as jest.Mock).mock.calls.length;

            // getSession should not be called again
            expect(callCountAfterSecond).toBe(callCountAfterFirst);
        });

        it('should handle getSession with nested credentials object', async () => {
            const mockApi: GeotabApi = {
                ...createMockApi(),
                getSession: jest.fn((success) => {
                    // Some Geotab versions return { credentials: { ... }, server: '...' }
                    if (success) success({
                        credentials: {
                            database: 'nested_db',
                            userName: 'nested@test.com',
                            sessionId: 'nested-session'
                        },
                        server: 'https://my123.geotab.com'
                    });
                    return Promise.resolve();
                })
            };
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => (
                    <GeotabProvider initialApi={mockApi} initialState={mockState}>
                        {children}
                    </GeotabProvider>
                )
            });

            await waitFor(() => {
                expect(result.current.api).not.toBeNull();
            });

            await act(async () => {
                await result.current.captureCredentials();
            });

            expect(result.current.credentials?.database).toBe('nested_db');
            expect(result.current.credentials?.sessionId).toBe('nested-session');
            // geotabHost comes from window.location.hostname (localhost in jsdom)
            expect(result.current.geotabHost).toBe('localhost');
        });
    });

    describe('geotabHost', () => {
        it('should default to my.geotab.com', () => {
            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => <GeotabProvider>{children}</GeotabProvider>
            });

            expect(result.current.geotabHost).toBe('my.geotab.com');
        });
    });

    describe('refreshCredentials', () => {
        it('should force-refresh credentials bypassing cache', async () => {
            let callCount = 0;
            const mockApi = {
                ...createMockApi(),
                getSession: jest.fn((callback) => {
                    callCount++;
                    const session = {
                        database: 'test_db',
                        userName: 'test@test.com',
                        sessionId: `session-v${callCount}`  // Different session each time
                    };
                    if (callback) callback(session);
                    return Promise.resolve(session);
                })
            };
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => <GeotabProvider>{children}</GeotabProvider>
            });

            await act(async () => {
                result.current.setGeotabApi(mockApi, mockState);
            });

            await waitFor(() => {
                expect(result.current.api).not.toBeNull();
            });

            // First capture
            await act(async () => {
                await result.current.captureCredentials();
            });

            const afterFirstCapture = callCount;
            const firstSessionId = result.current.credentials?.sessionId;

            // Second capture - should be cached
            await act(async () => {
                await result.current.captureCredentials();
            });

            expect(callCount).toBe(afterFirstCapture);  // No new call - cached

            // refreshCredentials - should force a new call
            let freshCreds: any;
            await act(async () => {
                freshCreds = await result.current.refreshCredentials();
            });

            expect(callCount).toBe(afterFirstCapture + 1);  // New call made
            expect(freshCreds?.sessionId).not.toBe(firstSessionId);  // Different session
            expect(result.current.credentials?.sessionId).toBe(freshCreds?.sessionId);
        });

        it('should return fresh credentials on success', async () => {
            const mockApi = {
                ...createMockApi(),
                getSession: jest.fn((callback) => {
                    const session = {
                        database: 'refreshed_db',
                        userName: 'refreshed@test.com',
                        sessionId: 'refreshed-session-456',
                        server: 'alpha.geotab.com'
                    };
                    if (callback) callback(session);
                    return Promise.resolve(session);
                })
            };
            const mockState = createMockState();

            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => <GeotabProvider>{children}</GeotabProvider>
            });

            await act(async () => {
                result.current.setGeotabApi(mockApi, mockState);
            });

            await waitFor(() => {
                expect(result.current.api).not.toBeNull();
            });

            let freshCreds: any;
            await act(async () => {
                freshCreds = await result.current.refreshCredentials();
            });

            expect(freshCreds).toEqual({
                database: 'refreshed_db',
                userName: 'refreshed@test.com',
                sessionId: 'refreshed-session-456',
                server: 'localhost'  // window.location.hostname in jsdom
            });
        });

        it('should return null when api is not available', async () => {
            const { result } = renderHook(() => useGeotab(), {
                wrapper: ({ children }) => <GeotabProvider>{children}</GeotabProvider>
            });

            let freshCreds: any;
            await act(async () => {
                freshCreds = await result.current.refreshCredentials();
            });

            expect(freshCreds).toBeNull();
        });
    });
});
