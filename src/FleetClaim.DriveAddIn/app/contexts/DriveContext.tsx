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

    const driveApi = initialApi as DriveGeotabApi;
    const hasMobileApi = !!(driveApi?.mobile?.exists?.());

    // Capture credentials from Geotab session
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
                }, (err) => {
                    console.error('[DriveContext] getSession error:', err);
                    resolve(null);
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

    // Monitor Drive state changes via mobile API
    useEffect(() => {
        if (!hasMobileApi) return;

        // Get initial device/driver info
        const loadInitialState = async () => {
            try {
                const driveState = stateRef.current as unknown as DriveState;
                if (driveState.device) {
                    // Get device details
                    try {
                        const vehicle = await driveApi.mobile.vehicle.get();
                        setCurrentDevice({ id: driveState.device, name: vehicle?.name || driveState.device });
                    } catch {
                        setCurrentDevice({ id: driveState.device, name: driveState.device });
                    }
                }

                // Get driver info
                try {
                    const users = await driveApi.mobile.user.get();
                    if (users?.length > 0) {
                        const driver = users[0];
                        setCurrentDriver({
                            id: driver.id || '',
                            name: driver.name || `${driver.firstName || ''} ${driver.lastName || ''}`.trim()
                        });
                    }
                } catch {
                    // Driver info not available
                }
            } catch {
                // Ignore initial state errors
            }
        };

        loadInitialState();

        // Listen to state changes
        driveApi.mobile.listenTo((newState: DriveState) => {
            setIsOnline(newState.online ?? true);
            setIsDriving(newState.driving ?? false);
            setIsCharging(newState.charging ?? false);
            setIsBackground(newState.background ?? false);

            if (newState.device && newState.device !== currentDevice?.id) {
                driveApi.mobile.vehicle.get()
                    .then(v => setCurrentDevice({ id: newState.device, name: v?.name || newState.device }))
                    .catch(() => setCurrentDevice({ id: newState.device, name: newState.device }));
            }
        });
    }, [hasMobileApi]);

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
