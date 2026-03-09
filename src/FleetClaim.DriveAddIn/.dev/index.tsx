/**
 * Development Entry Point for Drive Add-In
 * Initializes the Add-In with mock Geotab Drive API
 */

// Set up geotab global before importing the add-in (mimics Geotab framework)
(window as any).geotab = { addin: {} };

import '../app/index';

document.addEventListener('DOMContentLoaded', () => {
    const addin = (window as any).geotab?.addin?.FleetClaimDrive;

    if (!addin) {
        console.error('FleetClaim Drive Add-In not registered');
        return;
    }

    // Get mock API and state from the HTML script
    const mockApi = (window as any).mockApi || {
        call: function<T>(method: string, params: object, success?: (result: T) => void): Promise<T> {
            console.log('[MockAPI] call:', method, params);
            return new Promise((resolve) => {
                setTimeout(() => {
                    let result: any = null;
                    if ((params as any).typeName === 'Device') {
                        result = [{ id: 'b1', name: 'Vehicle 001' }];
                    } else if ((params as any).typeName === 'User') {
                        result = [{ id: 'u1', name: 'driver@fleet.com', firstName: 'John', lastName: 'Driver' }];
                    } else if (method === 'Add') {
                        result = 'mock_id_' + Date.now();
                    }
                    if (success) success(result);
                    resolve(result);
                }, 200);
            });
        },
        multiCall: function<T>(calls: Array<[string, object]>): Promise<T> {
            return Promise.all(calls.map(([method, params]) =>
                this.call(method, params)
            )) as Promise<T>;
        },
        getSession: function(success: (session: any) => void) {
            success({
                database: 'demo_drive',
                userName: 'driver@fleet.com',
                sessionId: 'mock_session_drive_123',
                server: 'my.geotab.com'
            });
        },
        mobile: {
            exists: () => true,
            camera: {
                takePicture: (): Promise<string> => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 200;
                    canvas.height = 200;
                    const ctx = canvas.getContext('2d')!;
                    ctx.fillStyle = '#3b82f6';
                    ctx.fillRect(0, 0, 200, 200);
                    ctx.fillStyle = 'white';
                    ctx.font = '14px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('Test Photo', 100, 100);
                    return Promise.resolve(canvas.toDataURL('image/jpeg'));
                }
            },
            geolocation: navigator.geolocation,
            speak: (msg: string) => console.log('[Mock] speak:', msg),
            notification: {
                notify: (msg: string, title: string) => {
                    console.log('[Mock] notification:', title, msg);
                    return Promise.resolve();
                }
            },
            user: { get: () => Promise.resolve([{ id: 'u1', name: 'John Driver', firstName: 'John', lastName: 'Driver' }]) },
            vehicle: { get: () => Promise.resolve({ id: 'b1', name: 'Vehicle 001' }) },
            listenTo: (callback: (state: any) => void) => {
                const checkbox = document.getElementById('dev-online') as HTMLInputElement;
                if (checkbox) {
                    checkbox.addEventListener('change', () => {
                        callback({
                            device: 'b1', driving: false, online: checkbox.checked,
                            charging: false, background: false,
                            getState: () => ({}), setState: () => {},
                            gotoPage: () => true, hasAccessToPage: () => true,
                            getGroupFilter: () => [], translate: (t: any) => t
                        });
                    });
                }
            }
        }
    };

    const mockState = {
        device: 'b1',
        driving: false,
        online: true,
        charging: false,
        background: false,
        getState: () => ({}),
        setState: () => {},
        gotoPage: () => true,
        hasAccessToPage: () => true,
        getGroupFilter: () => [],
        translate: (text: string | HTMLElement) => text
    };

    console.log('[Dev] Initializing FleetClaim Drive Add-In...');
    const lifecycle = addin();  // Call factory to get lifecycle object
    lifecycle.initialize(mockApi, mockState, () => {
        console.log('[Dev] Add-In initialized, calling focus...');
        lifecycle.focus(mockApi, mockState);
    });
});
