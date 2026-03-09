/**
 * Geotab API Types for FleetClaim Drive Add-In
 * Extended with Drive-specific types (mobile API, state)
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

// Drive-specific state
export interface DriveState extends GeotabPageState {
    device: string;
    driving: boolean;
    online: boolean;
    charging: boolean;
    background: boolean;
}

// Drive mobile API
export interface MobileApi {
    exists(): boolean;
    camera: { takePicture(): Promise<string> };
    geolocation: Geolocation;
    speak(message: string): void;
    notification: { notify(msg: string, title: string): Promise<any> };
    user: { get(includeAll?: boolean): Promise<any[]> };
    vehicle: { get(): Promise<any> };
    listenTo(callback: (state: DriveState) => void): void;
}

export interface DriveGeotabApi extends GeotabApi {
    mobile: MobileApi;
}

// Declare global geotab object (extended for Drive)
declare global {
    interface Window {
        geotab: {
            addin: {
                fleetclaimdrive?: GeotabAddIn;
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
    startup?: (freshApi: GeotabApi, freshState: DriveState, callback: () => void) => void;
}
