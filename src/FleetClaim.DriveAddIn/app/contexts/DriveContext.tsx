/**
 * Drive Context
 * Provides Geotab API, Drive state, and mobile API wrappers
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { GeotabApi, GeotabCredentials, DriveGeotabApi, DriveState, GeotabPageState, SessionInfo } from '@/types/geotab';

interface DriveContextValue {
    api: GeotabApi | null;
    state: GeotabPageState | null;
    credentials: GeotabCredentials | null;
    geotabHost: string;
    currentDevice: { id: string; name: string } | null;
    currentDriver: { id: string; name: string } | null;
    isOnline: boolean;
    isDriving: boolean;
    isCharging: boolean;
    isBackground: boolean;
    hasMobileApi: boolean;
    captureCredentials: () => Promise<GeotabCredentials | null>;
    takePicture: () => Promise<string | null>;
    getCurrentLocation: () => Promise<{ latitude: number; longitude: number } | null>;
}

const DriveContext = createContext<DriveContextValue>({
    api: null,
    state: null,
    credentials: null,
    geotabHost: 'my.geotab.com',
    currentDevice: null,
    currentDriver: null,
    isOnline: true,
    isDriving: false,
    isCharging: false,
    isBackground: false,
    hasMobileApi: false,
    captureCredentials: async () => null,
    takePicture: async () => null,
    getCurrentLocation: async () => null,
});

export const useDrive = () => useContext(DriveContext);

interface DriveProviderProps {
    initialApi: GeotabApi;
    initialState: GeotabPageState;
    children: React.ReactNode;
}

export const DriveProvider: React.FC<DriveProviderProps> = ({ initialApi, initialState, children }) => {
    const [credentials, setCredentials] = useState<GeotabCredentials | null>(null);
    const [geotabHost, setGeotabHost] = useState('my.geotab.com');
    const [currentDevice, setCurrentDevice] = useState<{ id: string; name: string } | null>(null);
    const [currentDriver, setCurrentDriver] = useState<{ id: string; name: string } | null>(null);
    const [isOnline, setIsOnline] = useState(true);
    const [isDriving, setIsDriving] = useState(false);
    const [isCharging, setIsCharging] = useState(false);
    const [isBackground, setIsBackground] = useState(false);
    const apiRef = useRef(initialApi);
    const stateRef = useRef(initialState);
    const currentDeviceRef = useRef<{ id: string; name: string } | null>(null);

    const driveApi = initialApi as DriveGeotabApi;
    const hasMobileApi = !!(driveApi?.mobile?.exists?.());

    const asNonEmptyString = (value: unknown): string | null => {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    };

    const extractEntityId = (value: unknown): string | null => {
        if (!value || typeof value !== 'object') return asNonEmptyString(value);
        const candidate = (value as { id?: unknown }).id;
        return asNonEmptyString(candidate);
    };

    const getStateEntityIds = (): { deviceId: string | null; driverId: string | null } => {
        const typedState = stateRef.current as unknown as Partial<DriveState> & Record<string, unknown>;
        const pageState = stateRef.current.getState?.();

        const read = (key: string): unknown => {
            const typedValue = typedState[key];
            if (typedValue !== undefined && typedValue !== null) return typedValue;
            if (pageState && typeof pageState === 'object') {
                return (pageState as Record<string, unknown>)[key];
            }
            return undefined;
        };

        const deviceId = asNonEmptyString(read('device')) || extractEntityId(read('device'));
        const driverId =
            extractEntityId(read('driver')) ||
            asNonEmptyString(read('driverId')) ||
            extractEntityId(read('user'));

        return { deviceId, driverId };
    };

    const loadDeviceById = useCallback(async (deviceId: string) => {
        try {
            const devices = await apiRef.current.call<Array<{ id?: string; name?: string }>>('Get', {
                typeName: 'Device',
                search: { id: deviceId },
                resultsLimit: 1,
                propertySelector: { fields: ['id', 'name'], isIncluded: true }
            });
            const device = Array.isArray(devices) ? devices[0] : null;
            setCurrentDevice({
                id: device?.id || deviceId,
                name: device?.name || deviceId
            });
        } catch {
            setCurrentDevice({ id: deviceId, name: deviceId });
        }
    }, []);

    const loadDriverById = useCallback(async (driverId: string) => {
        try {
            const users = await apiRef.current.call<Array<{ id?: string; name?: string; firstName?: string; lastName?: string }>>('Get', {
                typeName: 'User',
                search: { id: driverId },
                resultsLimit: 1,
                propertySelector: { fields: ['id', 'name', 'firstName', 'lastName'], isIncluded: true }
            });
            const driver = Array.isArray(users) ? users[0] : null;
            const fallbackName = `${driver?.firstName || ''} ${driver?.lastName || ''}`.trim();
            setCurrentDriver({
                id: driver?.id || driverId,
                name: driver?.name || fallbackName || driverId
            });
        } catch {
            setCurrentDriver({ id: driverId, name: driverId });
        }
    }, []);

    useEffect(() => {
        currentDeviceRef.current = currentDevice;
    }, [currentDevice]);

    // Capture credentials from Geotab session
    // NOTE: getSession signature is getSession(callback, newSession?)
    // where newSession is a BOOLEAN, not an error callback!
    // Passing a function as the second arg is truthy → triggers new session → login redirect.
    const captureCredentials = useCallback(async (): Promise<GeotabCredentials | null> => {
        return new Promise((resolve) => {
            try {
                apiRef.current.getSession((session: SessionInfo) => {
                    console.log('[DriveContext] getSession result:', session);
                    const server = session.server || 'my.geotab.com';
                    const creds: GeotabCredentials = {
                        database: session.database,
                        userName: session.userName,
                        sessionId: session.sessionId,
                        server
                    };
                    setCredentials(creds);
                    setGeotabHost(server);
                    resolve(creds);
                });
            } catch (err) {
                console.error('[DriveContext] getSession exception:', err);
                resolve(null);
            }
        });
    }, []);

    // Capture credentials on mount
    useEffect(() => {
        captureCredentials();
    }, [captureCredentials]);

    // Load initial state (works in Drive mobile app and browser-hosted Drive pages)
    useEffect(() => {
        const loadInitialState = async () => {
            try {
                const { deviceId, driverId } = getStateEntityIds();
                if (deviceId) {
                    if (hasMobileApi) {
                        try {
                            const vehicle = await driveApi.mobile.vehicle.get();
                            setCurrentDevice({ id: deviceId, name: vehicle?.name || deviceId });
                        } catch {
                            await loadDeviceById(deviceId);
                        }
                    } else {
                        await loadDeviceById(deviceId);
                    }
                }

                if (driverId) {
                    if (hasMobileApi) {
                        try {
                            const users = await driveApi.mobile.user.get();
                            if (users?.length > 0) {
                                const driver = users[0];
                                setCurrentDriver({
                                    id: driver.id || driverId,
                                    name: driver.name || `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || driverId
                                });
                            } else {
                                await loadDriverById(driverId);
                            }
                        } catch {
                            await loadDriverById(driverId);
                        }
                    } else {
                        await loadDriverById(driverId);
                    }
                }
            } catch {
                // Ignore initial state errors
            }
        };

        void loadInitialState();

        if (!hasMobileApi) return;

        // Monitor Drive state changes via mobile API
        driveApi.mobile.listenTo((newState: DriveState) => {
            setIsOnline(newState.online ?? true);
            setIsDriving(newState.driving ?? false);
            setIsCharging(newState.charging ?? false);
            setIsBackground(newState.background ?? false);

            if (newState.device && newState.device !== currentDeviceRef.current?.id) {
                driveApi.mobile.vehicle.get()
                    .then(v => setCurrentDevice({ id: newState.device, name: v?.name || newState.device }))
                    .catch(() => setCurrentDevice({ id: newState.device, name: newState.device }));
            }
        });
    }, [hasMobileApi, driveApi, loadDeviceById, loadDriverById]);

    // Take picture via mobile camera
    const takePicture = useCallback(async (): Promise<string | null> => {
        if (!hasMobileApi) return null;
        try {
            return await driveApi.mobile.camera.takePicture();
        } catch (err) {
            console.error('[DriveContext] Camera error:', err);
            return null;
        }
    }, [hasMobileApi, driveApi]);

    // Get current GPS location
    const getCurrentLocation = useCallback(async (): Promise<{ latitude: number; longitude: number } | null> => {
        const geolocation = hasMobileApi ? driveApi.mobile.geolocation : navigator.geolocation;
        if (!geolocation) return null;

        return new Promise((resolve) => {
            geolocation.getCurrentPosition(
                (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
                () => resolve(null),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
            );
        });
    }, [hasMobileApi, driveApi]);

    return (
        <DriveContext.Provider value={{
            api: apiRef.current,
            state: stateRef.current,
            credentials,
            geotabHost,
            currentDevice,
            currentDriver,
            isOnline,
            isDriving,
            isCharging,
            isBackground,
            hasMobileApi,
            captureCredentials,
            takePicture,
            getCurrentLocation,
        }}>
            {children}
        </DriveContext.Provider>
    );
};
