import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { GeotabApi, GeotabPageState, SessionInfo, Device, User, Group } from '@/types';

// Credentials captured from api.getSession() for MediaFile uploads and API calls
export interface GeotabCredentials {
    database: string;
    userName: string;
    sessionId: string;
    server: string;
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
    
    // Credentials for MediaFile uploads and API calls (captured via api.getSession after warmup)
    credentials: GeotabCredentials | null;
    geotabHost: string;
    
    // Methods
    setGeotabApi: (api: GeotabApi, state: GeotabPageState) => void;
    refreshSession: () => Promise<void>;
    captureCredentials: () => Promise<void>;
    refreshCredentials: () => Promise<GeotabCredentials | null>;
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
            // NOTE: getSession signature is getSession(callback, newSession?) 
            // where newSession is a BOOLEAN, not an error callback!
            try {
                api.getSession((sessionInfo) => {
                    setSession(sessionInfo);
                    resolve();
                });
            } catch (err) {
                reject(err);
            }
        });
    }, [api]);

    /**
     * Capture credentials for MediaFile upload and API authentication.
     * Uses api.getSession() which returns credentials after API warmup.
     */
    const captureCredentials = useCallback(async () => {
        console.log('[GeotabContext] captureCredentials called, api:', !!api, 'alreadyCaptured:', credentialsCaptured.current);
        if (!api) return;
        
        // Skip if we already have valid credentials
        if (credentialsCaptured.current && credentials?.sessionId) {
            console.log('[GeotabContext] Skipping - already captured');
            return;
        }
        
        // Use api.getSession() to get credentials
        // NOTE: getSession signature is getSession(callback, newSession?) where newSession is a BOOLEAN!
        try {
            await new Promise<void>((resolve, reject) => {
                if (typeof api.getSession !== 'function') {
                    reject(new Error('api.getSession not available'));
                    return;
                }
                
                api.getSession((cr: any, server?: string) => {
                    // Handle both cr.credentials and cr directly (following Geotab mg-media-files pattern)
                    const creds = cr.credentials || cr;
                    
                    // Validate we got actual credentials
                    if (!creds?.sessionId) {
                        reject(new Error('No sessionId in credentials'));
                        return;
                    }
                    
                    // Debug: log all potential server sources
                    console.log('[GeotabContext] Server sources:', {
                        callbackServer: server,
                        crServer: cr.server,
                        credsServer: creds.server,
                        parentHostname: window.parent !== window ? 'unavailable (cross-origin)' : null,
                        topHostname: window.top !== window ? 'unavailable (cross-origin)' : null
                    });
                    
                    // Get server from getSession callback or credentials object
                    // Add-In runs in iframe from Cloud Run, so window.location.hostname is wrong
                    // We must use the server from the Geotab API
                    // Priority: callback server > cr.server > creds.server > try to extract from referrer
                    let host = server || cr.server || creds.server;
                    
                    // Fallback: try to get from document.referrer (the parent frame URL)
                    if (!host && document.referrer) {
                        try {
                            const referrerUrl = new URL(document.referrer);
                            if (referrerUrl.hostname.includes('geotab.com')) {
                                host = referrerUrl.hostname;
                                console.log('[GeotabContext] Using referrer hostname:', host);
                            }
                        } catch (e) {
                            // Invalid referrer URL
                        }
                    }
                    
                    // Final fallback
                    if (!host) {
                        host = 'my.geotab.com';
                        console.warn('[GeotabContext] WARNING: No server found, falling back to my.geotab.com');
                    }
                    
                    // Strip protocol if present
                    if (host.startsWith('https://')) {
                        host = host.substring(8);
                    } else if (host.startsWith('http://')) {
                        host = host.substring(7);
                    }
                    
                    console.log('[GeotabContext] Captured credentials - server:', host, 'database:', creds.database);
                    
                    setGeotabHost(host);
                    setCredentials({
                        database: creds.database,
                        userName: creds.userName,
                        sessionId: creds.sessionId,
                        server: host
                    });
                    credentialsCaptured.current = true;
                    
                    resolve();
                });
            });
        } catch (e) {
            // Allow retry on next call
            credentialsCaptured.current = false;
        }
    }, [api, credentials?.sessionId]);

    /**
     * Force-refresh credentials from api.getSession().
     * Use when a 401 indicates the cached session may be stale.
     * Returns the fresh credentials or null on failure.
     */
    const refreshCredentials = useCallback(async (): Promise<GeotabCredentials | null> => {
        if (!api) return null;
        
        // Reset the captured flag to force refresh
        credentialsCaptured.current = false;
        
        try {
            return await new Promise<GeotabCredentials | null>((resolve, reject) => {
                if (typeof api.getSession !== 'function') {
                    reject(new Error('api.getSession not available'));
                    return;
                }
                
                api.getSession((cr: any, server?: string) => {
                    const creds = cr.credentials || cr;
                    
                    if (!creds?.sessionId) {
                        reject(new Error('No sessionId in credentials'));
                        return;
                    }
                    
                    // Get server from getSession callback or credentials object
                    let host = server || cr.server || creds.server;
                    
                    // Fallback: try to get from document.referrer (the parent frame URL)
                    if (!host && document.referrer) {
                        try {
                            const referrerUrl = new URL(document.referrer);
                            if (referrerUrl.hostname.includes('geotab.com')) {
                                host = referrerUrl.hostname;
                            }
                        } catch (e) {
                            // Invalid referrer URL
                        }
                    }
                    
                    // Final fallback
                    if (!host) {
                        host = 'my.geotab.com';
                        console.warn('[GeotabContext] WARNING: No server found in refreshCredentials');
                    }
                    
                    if (host.startsWith('https://')) {
                        host = host.substring(8);
                    } else if (host.startsWith('http://')) {
                        host = host.substring(7);
                    }
                    
                    const freshCreds: GeotabCredentials = {
                        database: creds.database,
                        userName: creds.userName,
                        sessionId: creds.sessionId,
                        server: host
                    };
                    
                    setGeotabHost(host);
                    setCredentials(freshCreds);
                    credentialsCaptured.current = true;
                    
                    resolve(freshCreds);
                });
            });
        } catch (e) {
            credentialsCaptured.current = false;
            return null;
        }
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
            // Silently handle group load errors
        }
    }, [api, call]);

    const getGroupFilter = useCallback(() => {
        if (!state) return [];
        return state.getGroupFilter();
    }, [state]);

    // Load current user when API is available
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
                    setCurrentUser(user);
                    
                    // Update session with username if it was missing
                    if (!session?.userName && user.name) {
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
                // Silently handle user load errors
            }
        };
        
        loadCurrentUser();
    }, [api, call]);

    // Get session info when API changes
    useEffect(() => {
        if (api && state) {
            // Extract database from URL (e.g., my.geotab.com/demo_fleetclaim)
            const extractDatabaseFromUrl = (): string => {
                const pathname = window.location.pathname;
                const hash = window.location.hash;
                
                // Check pathname first (e.g., /demo_fleetclaim)
                if (pathname && pathname.length > 1) {
                    const dbFromPath = pathname.split('/').filter(Boolean)[0];
                    if (dbFromPath && !dbFromPath.startsWith('#')) {
                        return dbFromPath;
                    }
                }
                
                // Check hash (e.g., #demo_fleetclaim,...)
                if (hash && hash.length > 1) {
                    const hashContent = hash.substring(1);
                    const dbFromHash = hashContent.split(',')[0];
                    if (dbFromHash) {
                        return dbFromHash;
                    }
                }
                
                return '';
            };
            
            const dbFromUrl = extractDatabaseFromUrl();
            if (dbFromUrl) {
                setSession({
                    database: dbFromUrl,
                    userName: '',
                    sessionId: '',
                    server: window.location.hostname
                });
            }
            
            // Also try api.getSession for full session info
            refreshSession().catch(() => {
                // Session refresh is best-effort
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
        refreshCredentials,
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
