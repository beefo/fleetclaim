/**
 * Development Entry Point
 * 
 * This file initializes the Add-In in development mode with mock Geotab API.
 */

import '../app/index';

// Wait for the Add-In to be registered, then initialize it
document.addEventListener('DOMContentLoaded', () => {
    const addin = (window as any).geotab?.addin?.fleetclaim;
    
    if (!addin) {
        console.error('FleetClaim Add-In not registered');
        return;
    }
    
    // Get mock API and state from the HTML script
    const mockApi = {
        call: function<T>(method: string, params: object, success?: (result: T) => void, error?: (err: Error) => void): Promise<T> {
            console.log('[MockAPI] call:', method, params);
            
            return new Promise((resolve) => {
                setTimeout(() => {
                    let result: any;
                    
                    switch(method) {
                        case 'Get':
                            if ((params as any).typeName === 'Device') {
                                result = [
                                    { id: 'b1', name: 'Vehicle 001', serialNumber: 'G9001' },
                                    { id: 'b2', name: 'Vehicle 002', serialNumber: 'G9002' },
                                    { id: 'b3', name: 'Vehicle 003', serialNumber: 'G9003' }
                                ];
                            } else if ((params as any).typeName === 'AddInData') {
                                result = [
                                    {
                                        id: 'aid1',
                                        addInId: 'aji_jHQGE8k2TDodR8tZrpw',
                                        details: JSON.stringify({
                                            type: 'report',
                                            payload: {
                                                id: 'rpt_001',
                                                deviceId: 'b1',
                                                deviceName: 'Vehicle 001',
                                                driverName: 'John Smith',
                                                occurredAt: new Date(Date.now() - 3600000).toISOString(),
                                                generatedAt: new Date().toISOString(),
                                                latitude: 43.4516,
                                                longitude: -79.6877,
                                                incidentCity: 'Burlington',
                                                incidentState: 'ON',
                                                incidentCountry: 'Canada',
                                                severity: 'high',
                                                shareToken: 'mock_token_123',
                                                gpsTrail: [
                                                    { latitude: 43.4510, longitude: -79.6880, dateTime: new Date(Date.now() - 300000).toISOString(), speed: 45 },
                                                    { latitude: 43.4512, longitude: -79.6878, dateTime: new Date(Date.now() - 240000).toISOString(), speed: 50 },
                                                    { latitude: 43.4514, longitude: -79.6877, dateTime: new Date(Date.now() - 180000).toISOString(), speed: 55 },
                                                    { latitude: 43.4516, longitude: -79.6877, dateTime: new Date(Date.now() - 120000).toISOString(), speed: 30 },
                                                    { latitude: 43.4516, longitude: -79.6877, dateTime: new Date(Date.now() - 60000).toISOString(), speed: 0 }
                                                ],
                                                weather: {
                                                    temperature: 18,
                                                    conditions: 'Partly Cloudy',
                                                    visibility: 'Good'
                                                },
                                                photos: [
                                                    { id: 'p1', mediaFileId: 'mf1', fileName: 'front_damage.jpg', category: 'damage', uploadedAt: new Date().toISOString() }
                                                ]
                                            }
                                        })
                                    },
                                    {
                                        id: 'aid2',
                                        addInId: 'aji_jHQGE8k2TDodR8tZrpw',
                                        details: JSON.stringify({
                                            type: 'reportRequest',
                                            payload: {
                                                id: 'req_001',
                                                deviceId: 'b2',
                                                deviceName: 'Vehicle 002',
                                                requestedBy: 'testuser@geotab.com',
                                                requestedAt: new Date(Date.now() - 1800000).toISOString(),
                                                rangeStart: new Date(Date.now() - 7200000).toISOString(),
                                                rangeEnd: new Date(Date.now() - 3600000).toISOString(),
                                                status: 'pending'
                                            }
                                        })
                                    }
                                ];
                            } else if ((params as any).typeName === 'User') {
                                result = [{ id: 'u1', name: 'testuser@geotab.com', firstName: 'Test' }];
                            } else {
                                result = [];
                            }
                            break;
                        default:
                            result = null;
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
                database: 'demo_fleetclaim',
                userName: 'testuser@geotab.com',
                sessionId: 'mock_session_id_123',
                server: 'my.geotab.com'
            });
        }
    };
    
    const mockState = {
        getState: () => ({}),
        setState: () => {},
        gotoPage: () => true,
        hasAccessToPage: () => true,
        getGroupFilter: () => [],
        translate: (text: string | HTMLElement) => text
    };
    
    // Initialize the Add-In
    console.log('[Dev] Initializing FleetClaim Add-In...');
    addin.initialize(mockApi, mockState, () => {
        console.log('[Dev] Add-In initialized, calling focus...');
        addin.focus(mockApi, mockState);
    });
});
