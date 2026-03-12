import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { DriveProvider, useDrive } from '@/contexts';
import { GeotabApi, GeotabPageState } from '@/types';

function ContextProbe() {
    const { currentDevice, currentDriver } = useDrive();
    return (
        <div>
            <div data-testid="device">{currentDevice?.name || ''}</div>
            <div data-testid="driver">{currentDriver?.name || ''}</div>
        </div>
    );
}

describe('DriveContext', () => {
    it('populates current device and driver from state in browser mode (no mobile API)', async () => {
        const mockApi: GeotabApi = {
            call: jest.fn().mockImplementation((method: string, params: { typeName?: string }) => {
                if (method !== 'Get') return Promise.resolve([]);
                if (params.typeName === 'Device') {
                    return Promise.resolve([{ id: 'b1', name: 'Truck 001' }]);
                }
                if (params.typeName === 'User') {
                    return Promise.resolve([{ id: 'u1', name: 'Driver One' }]);
                }
                return Promise.resolve([]);
            }),
            multiCall: jest.fn().mockResolvedValue([]),
            getSession: jest.fn((success: (session: { database: string; userName: string; sessionId: string; server: string }) => void) => {
                success({
                    database: 'demo_fleetclaim',
                    userName: 'driver.one',
                    sessionId: 'session-1',
                    server: 'my.geotab.com'
                });
            })
        };

        const mockState: GeotabPageState = {
            getState: jest.fn(() => ({ device: 'b1', driver: 'u1' })),
            setState: jest.fn(),
            gotoPage: jest.fn(() => true),
            hasAccessToPage: jest.fn(() => true),
            getGroupFilter: jest.fn(() => []),
            translate: jest.fn((value: string | HTMLElement) => value)
        };

        render(
            <DriveProvider initialApi={mockApi} initialState={mockState}>
                <ContextProbe />
            </DriveProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('device')).toHaveTextContent('Truck 001');
            expect(screen.getByTestId('driver')).toHaveTextContent('Driver One');
        });
    });
});
