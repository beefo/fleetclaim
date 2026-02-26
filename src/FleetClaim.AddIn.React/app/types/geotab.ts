/**
 * Geotab API Types for FleetClaim Add-In
 */

export interface GeotabCredentials {
    database: string;
    userName: string;
    sessionId: string;
    server?: string;
}

export interface SessionInfo {
    database: string;
    userName: string;
    sessionId: string;
    server?: string;
}

export interface GeotabApi {
    call: <T = unknown>(method: string, params: object, successCallback?: (result: T) => void, errorCallback?: (error: Error) => void) => Promise<T>;
    multiCall: <T = unknown[]>(calls: Array<[string, object]>) => Promise<T>;
    getSession: (successCallback: (session: SessionInfo) => void, errorCallback?: (error: Error) => void) => void;
}

export interface GeotabPageState {
    getState: () => Record<string, unknown>;
    setState: (state: Record<string, unknown>) => void;
    gotoPage: (pageName: string, options?: Record<string, unknown>) => boolean;
    hasAccessToPage: (pageName: string) => boolean;
    getGroupFilter: () => Array<{ id: string }>;
    translate: (text: string | HTMLElement) => string | HTMLElement;
}

export interface Device {
    id: string;
    name: string;
    serialNumber?: string;
    groups?: Array<{ id: string }>;
    activeFrom?: string;
    activeTo?: string;
}

export interface User {
    id: string;
    name: string;
    firstName?: string;
    lastName?: string;
}

export interface Group {
    id: string;
    name: string;
    parent?: { id: string };
    children?: Group[];
}

export interface AddInData {
    id: string;
    addInId: string;
    groups?: Array<{ id: string }>;
    details: string | object;
}

export interface MediaFile {
    id: string;
    name: string;
    solutionId: string;
    mediaType: string;
    fromDate: string;
    toDate: string;
    device?: { id: string };
    driver?: { id: string };
    metaData?: string;
}

// Declare global geotab object
declare global {
    interface Window {
        geotab: {
            addin: {
                fleetclaim?: GeotabAddIn;
            };
        };
    }
    const geotab: typeof window.geotab;
}

export interface GeotabAddIn {
    (api: GeotabApi, state: GeotabPageState): void;
    initialize?: (api: GeotabApi, state: GeotabPageState, callback: () => void) => void;
    focus?: (api: GeotabApi, state: GeotabPageState) => void;
    blur?: (api: GeotabApi, state: GeotabPageState) => void;
}
