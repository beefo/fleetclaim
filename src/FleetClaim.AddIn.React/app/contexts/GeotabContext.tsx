import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { GeotabApi, GeotabPageState, SessionInfo, Device, User, Group } from '@/types';

// Credentials captured from api.getSession() for MediaFile uploads
export interface GeotabCredentials {
    database: string;
    userName: string;
    sessionId: string;
}

export interface GeotabContextValue {
    api: GeotabApi | null;
    state: GeotabPageState | null;
    session: SessionInfo | null;
    currentUser: User | null;
    devices: Device[];
    groups: Group[];
    isLoading: boolean;
    error: string | null;
    
    // Credentials for MediaFile uploads (captured after API warmup)
    credentials: GeotabCredentials | null;
    geotabHost: string;
    
    // Methods
    setGeotabApi: (api: GeotabApi, state: GeotabPageState) => void;
    refreshSession: () => Promise<void>;
    captureCredentials: () => Promise<void>;
    call: <T = unknown>(method: string, params: object) => Promise<T>;
    multiCall: <T = unknown[]>(calls: Array<[string, object]>) => Promise<T>;
    loadDevices: (includeHistoric?: boolean) => Promise<void>;
    loadGroups: () => Promise<void>;
    getGroupFilter: () => Array<{ id: string }>;
}

const GeotabContext = createContext<GeotabContextValue | undefined>(undefined);

export const useGeotab = (): GeotabContextValue => {
    const context = useContext(GeotabContext);
    if (!context) {
        throw new Error('useGeotab must be used within a GeotabProvider');
    }
    return context;
};

interface GeotabProviderProps {
    children: ReactNode;
    initialApi?: GeotabApi;
    initialState?: GeotabPageState;
}

export const GeotabProvider: React.FC<GeotabProviderProps> = ({ 
    children, 
    initialApi, 
    initialState 
}) => {
    const [api, setApi] = useState<GeotabApi | null>(initialApi || null);
    const [state, setState] = useState<GeotabPageState | null>(initialState || null);
    const [session, setSession] = useState<SessionInfo | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [devices, setDevices] = useState<Device[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Credentials for MediaFile uploads - captured AFTER API calls warm up the session
    const [credentials, setCredentials] = useState<GeotabCredentials | null>(null);
    const [geotabHost, setGeotabHost] = useState<string>('my.geotab.com');
    const credentialsCaptured = useRef(false);

    const setGeotabApi = useCallback((newApi: GeotabApi, newState: GeotabPageState) => {
        setApi(newApi);
        setState(newState);
        credentialsCaptured.current = false; // Reset on new API
    }, []);

    const refreshSession = useCallback(async () => {
        if (!api) return;
        
        return new Promise<void>((resolve, reject) => {
            api.getSession(
                (sessionInfo) => {
                    setSession(sessionInfo);
                    resolve();
                },
                (err) => {
                    console.error('Failed to get session:', err);
                    reject(err);
                }
            );
        });
    }, [api]);

    // Capture credentials for MediaFile upload
    // Try multiple methods since api.getSession() may not work in all environments
    const captureCredentials = useCallback(async () => {
        if (!api || credentialsCaptured.current) return;
        
        console.log('[GeotabContext] Attempting to capture credentials for MediaFile upload...');
        
        // Extract host from URL
        let host = 'my.geotab.com';
        try {
            host = window.location.hostname;
            console.log('[GeotabContext] Host from window.location:', host);
        } catch (e) {
            console.warn('[GeotabContext] Could not get host from URL');
        }
        
        // Extract database from URL path
        let database = '';
        try {
            const pathMatch = window.location.pathname.match(/^\/([^\/]+)/);
            if (pathMatch) {
                database = pathMatch[1];
                console.log('[GeotabContext] Database from URL path:', database);
            }
        } catch (e) {
            console.warn('[GeotabContext] Could not extract database from URL');
        }
        
        // Method 1: Try api.getSession() first
        try {
            await new Promise<void>((resolve, reject) => {
                if (typeof api.getSession !== 'function') {
                    reject(new Error('api.getSession not available'));
                    return;
                }
                
                api.getSession(
                    (cr: any) => {
                        // Handle both cr.credentials and cr directly (following Geotab mg-media-files pattern)
                        const creds = cr.credentials || cr;
                        
                        console.log('[GeotabContext] Session captured via api.getSession:', {
                            server: cr.server,
                            database: creds.database,
                            userName: creds.userName,
                            hasSessionId: !!creds.sessionId
                        });
                        
                        if (cr.server) {
                            if (cr.server.startsWith('http')) {
                                try { host = new URL(cr.server).hostname; } catch (e) { host = cr.server; }
                            } else {
                                host = cr.server;
                            }
                        }
                        
                        setGeotabHost(host);
                        setCredentials({
                            database: creds.database,
                            userName: creds.userName,
                            sessionId: creds.sessionId
                        });
                        credentialsCaptured.current = true;
                        
                        console.log('[GeotabContext] Credentials stored for uploads:', {
                            host,
                            database: creds.database,
                            userName: creds.userName,
                            hasSessionId: !!creds.sessionId
                        });
                        
                        resolve();
                    },
                    (err: any) => {
                        console.warn('[GeotabContext] api.getSession failed:', err);
                        reject(err);
                    }
                );
            });
            return; // Success, no need to try other methods
        } catch (e) {
            console.log('[GeotabContext] api.getSession failed, trying alternative methods...');
        }
        
        // Method 2: Try to get credentials from parent window (for iframes)
        try {
            const parentGeotab = (window.parent as any)?.geotab;
            if (parentGeotab?.addin?.credentials) {
                const creds = parentGeotab.addin.credentials;
                console.log('[GeotabContext] Credentials from parent window:', {
                    database: creds.database,
                    userName: creds.userName,
                    hasSessionId: !!creds.sessionId
                });
                setGeotabHost(host);
                setCredentials({
                    database: creds.database || database,
                    userName: creds.userName,
                    sessionId: creds.sessionId
                });
                credentialsCaptured.current = true;
                return;
            }
        } catch (e) {
            console.log('[GeotabContext] Could not access parent window credentials');
        }
        
        // Method 3: Try localStorage/sessionStorage
        try {
            const storageKeys = ['geotab-credentials', 'credentials', 'session'];
            for (const key of storageKeys) {
                const stored = sessionStorage.getItem(key) || localStorage.getItem(key);
                if (stored) {
                    const creds = JSON.parse(stored);
                    if (creds.sessionId) {
                        console.log('[GeotabContext] Credentials from storage:', key);
                        setGeotabHost(host);
                        setCredentials({
                            database: creds.database || database,
                            userName: creds.userName,
                            sessionId: creds.sessionId
                        });
                        credentialsCaptured.current = true;
                        return;
                    }
                }
            }
        } catch (e) {
            console.log('[GeotabContext] Could not get credentials from storage');
        }
        
        console.warn('[GeotabContext] Could not capture credentials via any method');
    }, [api]);

    const call = useCallback(
        async function callGeotab<T>(method: string, params: object): Promise<T> {
            if (!api) {
                throw new Error('Geotab API not initialized');
            }
            
            return new Promise<T>((resolve, reject) => {
                api.call(
                    method, 
                    params, 
                    (result: any) => resolve(result as T),
                    (err: any) => reject(err)
                );
            });
        }, [api]);

    const multiCall = useCallback(async <T = unknown[]>(calls: Array<[string, object]>): Promise<T> => {
        if (!api) {
            throw new Error('Geotab API not initialized');
        }
        return api.multiCall<T>(calls);
    }, [api]);

    const loadDevices = useCallback(async (includeHistoric = false) => {
        if (!api) return;
        
        setIsLoading(true);
        setError(null);
        
        try {
            const search: Record<string, unknown> = {};
            
            // Filter to active devices unless including historic
            if (!includeHistoric) {
                search.fromDate = new Date().toISOString();
            }
            
            const result: Device[] = await call<Device[]>('Get', {
                typeName: 'Device',
                search
            }) || [];
            
            // Sort by name
            const sorted = [...result].sort((a, b) => 
                (a.name || '').localeCompare(b.name || '')
            );
            
            setDevices(sorted);
        } catch (err) {
            console.error('Failed to load devices:', err);
            setError(err instanceof Error ? err.message : 'Failed to load devices');
        } finally {
            setIsLoading(false);
        }
    }, [api, call]);

    const loadGroups = useCallback(async () => {
        if (!api) return;
        
        try {
            const result: Group[] = await call<Group[]>('Get', {
                typeName: 'Group'
            }) || [];
            setGroups(result);
        } catch (err) {
            console.error('Failed to load groups:', err);
        }
    }, [api, call]);

    const getGroupFilter = useCallback(() => {
        if (!state) return [];
        return state.getGroupFilter();
    }, [state]);

    // Load current user when API is available
    // Use isCurrentUser search to get the logged-in user without needing username
    useEffect(() => {
        if (!api) return;
        
        const loadCurrentUser = async () => {
            try {
                // Use isCurrentUser search - works even when we don't know the username
                const users: User[] = await call<User[]>('Get', {
                    typeName: 'User',
                    search: { isCurrentUser: true }
                }) || [];
                
                if (users.length > 0) {
                    const user = users[0];
                    console.log('[GeotabContext] Current user loaded:', user.name);
                    setCurrentUser(user);
                    
                    // Update session with username if it was missing
                    if (!session?.userName && user.name) {
                        console.log('[GeotabContext] Updating session with username from User API:', user.name);
                        setSession(prev => prev ? {
                            ...prev,
                            userName: user.name
                        } : {
                            database: '',
                            userName: user.name,
                            sessionId: '',
                            server: ''
                        });
                    }
                }
            } catch (err) {
                console.error('Failed to load current user:', err);
            }
        };
        
        loadCurrentUser();
    }, [api, call]);

    // Refresh session when API changes
    useEffect(() => {
        if (api && state) {
            console.log('[GeotabContext] API and state available, checking session...');
            
            // First try to get session from state.getState()
            try {
                const stateData = state.getState() as any;
                console.log('[GeotabContext] state.getState() raw:', JSON.stringify(stateData));
                if (stateData && stateData.credentials) {
                    const sessionData = {
                        database: stateData.credentials.database || stateData.database,
                        userName: stateData.credentials.userName,
                        sessionId: stateData.credentials.sessionId,
                        server: stateData.server
                    };
                    console.log('[GeotabContext] Session from state.getState():', JSON.stringify(sessionData));
                    setSession(sessionData);
                    return;
                } else if (stateData && stateData.database) {
                    console.log('[GeotabContext] Found database at top level:', stateData.database);
                    setSession({
                        database: stateData.database,
                        userName: stateData.userName || '',
                        sessionId: stateData.sessionId || '',
                        server: stateData.server || ''
                    });
                    return;
                }
            } catch (e) {
                console.warn('[GeotabContext] Could not get session from state:', e);
            }
            
            // Extract database from URL (e.g., my.geotab.com/demo_fleetclaim or my.geotab.com/#demo_fleetclaim)
            const extractDatabaseFromUrl = (): string => {
                const pathname = window.location.pathname;
                const hash = window.location.hash;
                
                // Check pathname first (e.g., /demo_fleetclaim)
                if (pathname && pathname.length > 1) {
                    const dbFromPath = pathname.split('/').filter(Boolean)[0];
                    if (dbFromPath && !dbFromPath.startsWith('#')) {
                        console.log('[GeotabContext] Database from URL pathname:', dbFromPath);
                        return dbFromPath;
                    }
                }
                
                // Check hash (e.g., #demo_fleetclaim,...)
                if (hash && hash.length > 1) {
                    const hashContent = hash.substring(1); // Remove #
                    const dbFromHash = hashContent.split(',')[0];
                    if (dbFromHash) {
                        console.log('[GeotabContext] Database from URL hash:', dbFromHash);
                        return dbFromHash;
                    }
                }
                
                return '';
            };
            
            const dbFromUrl = extractDatabaseFromUrl();
            if (dbFromUrl) {
                console.log('[GeotabContext] Using database from URL:', dbFromUrl);
                setSession({
                    database: dbFromUrl,
                    userName: '',
                    sessionId: '',
                    server: window.location.hostname
                });
                return;
            }
            
            // Last resort: try api.getSession
            console.log('[GeotabContext] Falling back to api.getSession()');
            refreshSession().catch(err => {
                console.warn('Could not refresh session (may not be supported):', err);
            });
        }
    }, [api, state, refreshSession]);

    const value: GeotabContextValue = {
        api,
        state,
        session,
        currentUser,
        devices,
        groups,
        isLoading,
        error,
        credentials,
        geotabHost,
        setGeotabApi,
        refreshSession,
        captureCredentials,
        call,
        multiCall,
        loadDevices,
        loadGroups,
        getGroupFilter
    };

    return (
        <GeotabContext.Provider value={value}>
            {children}
        </GeotabContext.Provider>
    );
};

export default GeotabContext;
