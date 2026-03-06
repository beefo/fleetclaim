/**
 * FleetClaim Audit Service
 * 
 * Creates audit entries in MyGeotab for tracking report actions
 */

import { GeotabApi } from '@/types';

export type AuditAction = 
    | 'FleetClaim_ReportRequested'
    | 'FleetClaim_ReportEdited'
    | 'FleetClaim_ReportDeleted'
    | 'FleetClaim_PhotoAdded'
    | 'FleetClaim_PhotoRemoved';

/**
 * Add an audit entry to MyGeotab
 */
export async function addAudit(
    api: GeotabApi,
    action: AuditAction,
    comment: string,
    userName?: string
): Promise<void> {
    try {
        await new Promise<void>((resolve, reject) => {
            api.call(
                'Add',
                {
                    typeName: 'Audit',
                    entity: {
                        name: action,
                        comment: comment,
                        dateTime: new Date().toISOString(),
                        ...(userName && { userName })
                    }
                },
                () => resolve(),
                (error: Error) => {
                    // Log but don't fail - audits are best-effort
                    console.warn('Failed to add audit:', error);
                    resolve();
                }
            );
        });
    } catch (error) {
        // Audits should never block the main operation
        console.warn('Audit error:', error);
    }
}

/**
 * Audit: User requested a new report
 */
export function auditReportRequested(
    api: GeotabApi,
    vehicleName: string,
    dateRange: string,
    forceReport: boolean
): Promise<void> {
    const comment = forceReport
        ? `Requested baseline report for ${vehicleName} (${dateRange})`
        : `Requested incident report for ${vehicleName} (${dateRange})`;
    return addAudit(api, 'FleetClaim_ReportRequested', comment);
}

/**
 * Audit: User edited a report
 */
export function auditReportEdited(
    api: GeotabApi,
    reportId: string,
    vehicleName: string,
    changes: string[]
): Promise<void> {
    const changeList = changes.length > 0 ? changes.join(', ') : 'fields';
    const comment = `Edited report ${reportId} for ${vehicleName}: ${changeList}`;
    return addAudit(api, 'FleetClaim_ReportEdited', comment);
}

/**
 * Audit: User deleted a report
 */
export function auditReportDeleted(
    api: GeotabApi,
    reportId: string,
    vehicleName: string
): Promise<void> {
    const comment = `Deleted report ${reportId} for ${vehicleName}`;
    return addAudit(api, 'FleetClaim_ReportDeleted', comment);
}

/**
 * Audit: User added a photo to a report
 */
export function auditPhotoAdded(
    api: GeotabApi,
    reportId: string,
    vehicleName: string,
    photoCount: number
): Promise<void> {
    const comment = `Added ${photoCount} photo(s) to report ${reportId} for ${vehicleName}`;
    return addAudit(api, 'FleetClaim_PhotoAdded', comment);
}

/**
 * Audit: User removed a photo from a report
 */
export function auditPhotoRemoved(
    api: GeotabApi,
    reportId: string,
    vehicleName: string
): Promise<void> {
    const comment = `Removed photo from report ${reportId} for ${vehicleName}`;
    return addAudit(api, 'FleetClaim_PhotoRemoved', comment);
}
