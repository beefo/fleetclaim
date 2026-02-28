/**
 * FleetClaim Report Service
 * 
 * Handles loading, saving, and managing reports via Geotab AddInData
 */

import { GeotabApi, AddInData, IncidentReport, ReportRequest, AddInDataWrapper } from '@/types';

const ADDIN_ID = 'aji_jHQGE8k2TDodR8tZrpw';
const API_BASE_URL = 'https://fleetclaim-api-589116575765.us-central1.run.app';

export interface ReportRecord {
    report: IncidentReport;
    addInDataId: string;
}

export interface RequestRecord {
    request: ReportRequest;
    addInDataId: string;
}

/**
 * Load all reports from AddInData
 */
export async function loadReports(api: GeotabApi): Promise<ReportRecord[]> {
    const result = await apiCall<AddInData[]>(api, 'Get', {
        typeName: 'AddInData',
        search: { addInId: ADDIN_ID }
    });
    const addInData = result || [];
    
    const reports: ReportRecord[] = [];
    
    for (const item of addInData) {
        try {
            const raw = item.details;
            const wrapper = typeof raw === 'string' ? JSON.parse(raw) : raw;
            
            if (wrapper && (wrapper as AddInDataWrapper<IncidentReport>).type === 'report') {
                const report = (wrapper as AddInDataWrapper<IncidentReport>).payload || wrapper;
                reports.push({
                    report: report as IncidentReport,
                    addInDataId: item.id
                });
            }
        } catch (e) {
            console.warn('Error parsing report:', e);
        }
    }
    
    return reports;
}

/**
 * Load all report requests from AddInData
 */
export async function loadRequests(api: GeotabApi): Promise<RequestRecord[]> {
    const result = await apiCall<AddInData[]>(api, 'Get', {
        typeName: 'AddInData',
        search: { addInId: ADDIN_ID }
    });
    const addInData = result || [];
    
    const requests: RequestRecord[] = [];
    
    for (const item of addInData) {
        try {
            const raw = item.details;
            const wrapper = typeof raw === 'string' ? JSON.parse(raw) : raw;
            
            if (wrapper && (wrapper as AddInDataWrapper<ReportRequest>).type === 'reportRequest') {
                const request = (wrapper as AddInDataWrapper<ReportRequest>).payload || wrapper;
                requests.push({
                    request: request as ReportRequest,
                    addInDataId: item.id
                });
            }
        } catch (e) {
            console.warn('Error parsing request:', e);
        }
    }
    
    return requests;
}

/**
 * Update a report in AddInData
 */
export async function updateReport(
    api: GeotabApi, 
    addInDataId: string, 
    report: IncidentReport,
    groups?: Array<{ id: string }>
): Promise<void> {
    const wrapper: AddInDataWrapper<IncidentReport> = {
        type: 'report',
        payload: report,
        version: 1
    };
    
    try {
        // Pass wrapper as object, NOT stringified - Geotab API expects JSON object for details
        await apiCall(api, 'Set', {
            typeName: 'AddInData',
            entity: {
                id: addInDataId,
                addInId: ADDIN_ID,
                groups: groups || [{ id: 'GroupCompanyId' }],
                details: wrapper  // Object, not JSON.stringify(wrapper)
            }
        });
    } catch (err) {
        throw err;
    }
}

/**
 * Delete a report from AddInData
 */
export async function deleteReport(api: GeotabApi, addInDataId: string): Promise<void> {
    await apiCall(api, 'Remove', {
        typeName: 'AddInData',
        entity: { id: addInDataId }
    });
}

/**
 * Submit a new report request
 */
export async function submitReportRequest(
    api: GeotabApi,
    request: Omit<ReportRequest, 'id' | 'status' | 'requestedAt'>,
    groups?: Array<{ id: string }>
): Promise<string> {
    const fullRequest: ReportRequest = {
        ...request,
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'pending',
        requestedAt: new Date().toISOString()
    };
    
    const wrapper: AddInDataWrapper<ReportRequest> = {
        type: 'reportRequest',
        payload: fullRequest,
        version: 1
    };
    
    const result: string = await apiCall(api, 'Add', {
        typeName: 'AddInData',
        entity: {
            addInId: ADDIN_ID,
            groups: groups || [{ id: 'GroupCompanyId' }],
            details: wrapper  // Object, not JSON.stringify(wrapper)
        }
    });
    
    return result;
}

/**
 * Delete a request from AddInData
 */
export async function deleteRequest(api: GeotabApi, addInDataId: string): Promise<void> {
    await apiCall(api, 'Remove', {
        typeName: 'AddInData',
        entity: { id: addInDataId }
    });
}

/**
 * Credentials required for authenticated API calls
 */
export interface GeotabCredentials {
    database: string;
    userName: string;
    sessionId: string;
    server?: string;
}

/**
 * Build headers for authenticated API calls
 */
function buildAuthHeaders(credentials: GeotabCredentials): HeadersInit {
    return {
        'Content-Type': 'application/json',
        'X-Geotab-Database': credentials.database,
        'X-Geotab-UserName': credentials.userName,
        'X-Geotab-SessionId': credentials.sessionId,
        'X-Geotab-Server': credentials.server || 'my.geotab.com'
    };
}

/**
 * Download PDF for a report (requires authenticated credentials)
 */
export async function downloadPdf(
    reportId: string,
    credentials: GeotabCredentials
): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/pdf`, {
        method: 'POST',
        headers: buildAuthHeaders(credentials),
        body: JSON.stringify({ reportId })
    });
    
    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Session expired. Please refresh the page.');
        }
        throw new Error(`Failed to download PDF: ${response.status}`);
    }
    
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `FleetClaim-Report-${reportId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(downloadUrl);
}

/**
 * Download PDF using service account credentials (for external Add-Ins)
 * Requires database, reportId, and userName for authorization verification
 */
export async function downloadPdfSimple(
    database: string,
    reportId: string,
    userName: string
): Promise<void> {
    const url = new URL(`${API_BASE_URL}/api/pdf/${encodeURIComponent(database)}/${encodeURIComponent(reportId)}`);
    url.searchParams.set('userName', userName);
    
    const response = await fetch(url.toString(), {
        method: 'GET'
    });
    
    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('Report not found or database not configured');
        }
        throw new Error(`Failed to download PDF: ${response.status}`);
    }
    
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `FleetClaim-Report-${reportId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(downloadUrl);
}

/**
 * Send report via email (requires authenticated credentials)
 */
export async function sendReportEmail(
    reportId: string,
    toEmail: string,
    credentials: GeotabCredentials,
    message?: string
): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/email`, {
        method: 'POST',
        headers: buildAuthHeaders(credentials),
        body: JSON.stringify({
            reportId,
            email: toEmail,
            message
        })
    });
    
    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Session expired. Please refresh the page.');
        }
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `Failed to send email: ${response.status}`);
    }
}

/**
 * Helper to call Geotab API
 */
async function apiCall<T>(
    api: GeotabApi, 
    method: string, 
    params: object
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        api.call(
            method,
            params,
            (result: T) => resolve(result),
            (error: Error) => reject(error)
        );
    });
}
