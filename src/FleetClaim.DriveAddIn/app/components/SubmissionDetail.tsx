import React from 'react';
import { Button, Card, Pill } from '@geotab/zenith';
import { DriverSubmission, SubmissionStatus } from '@/types';
import { format, isValid } from 'date-fns';

interface SubmissionDetailProps {
    submission: DriverSubmission;
    onBack: () => void;
}

const statusConfig: Record<SubmissionStatus, { label: string; description: string; type: 'success' | 'warning' | 'info' | 'error' }> = {
    draft: { label: 'Draft', description: 'Not yet submitted', type: 'warning' },
    pending_sync: { label: 'Pending Sync', description: 'Waiting for network connection', type: 'info' },
    synced: { label: 'Awaiting Merge', description: 'Submitted, waiting to be linked to report', type: 'info' },
    merged: { label: 'Merged', description: 'Linked to collision report', type: 'success' },
    converted: { label: 'Report Created', description: 'Converted to standalone report', type: 'success' },
    standalone: { label: 'Standalone', description: 'No matching collision detected', type: 'info' }
};

const severityConfig: Record<string, { label: string; type: 'success' | 'warning' | 'info' | 'error' }> = {
    low: { label: 'Low', type: 'info' },
    medium: { label: 'Medium', type: 'warning' },
    high: { label: 'High', type: 'error' },
    critical: { label: 'Critical', type: 'error' }
};

const damageConfig: Record<string, string> = {
    none: 'None',
    minor: 'Minor',
    moderate: 'Moderate',
    severe: 'Severe',
    total: 'Total Loss'
};

const safeFormat = (dateStr: string | undefined, fmt: string): string => {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr);
        return isValid(d) ? format(d, fmt) : 'Invalid date';
    } catch { return 'Error'; }
};

export const SubmissionDetail: React.FC<SubmissionDetailProps> = ({ submission, onBack }) => {
    const status = statusConfig[submission.status] || statusConfig.draft;
    const severity = submission.severity ? severityConfig[submission.severity] : null;
    const damage = submission.damageAssessment;
    const thirdParty = submission.thirdPartyInfo;
    const isProcessed = submission.status === 'merged' || submission.status === 'converted';

    return (
        <div className="drive-step submission-detail">
            <div className="list-header">
                <Button type="tertiary" onClick={onBack}>← Back</Button>
                <h3 className="step-title">Submission Details</h3>
            </div>

            {/* Status Banner */}
            <div className="detail-status-banner" data-type={status.type}>
                <Pill type={status.type}>{status.label}</Pill>
                <span className="status-desc">{status.description}</span>
                {isProcessed && submission.mergedIntoReportId && (
                    <span className="report-id">Report: {submission.mergedIntoReportId}</span>
                )}
            </div>

            {/* Basic Info */}
            <Card autoHeight>
                <Card.Content>
                    <h4 className="detail-section-title">Incident Information</h4>
                    <div className="detail-grid">
                        <div className="detail-row">
                            <span className="detail-label">Date & Time</span>
                            <span className="detail-value">{safeFormat(submission.incidentTimestamp, 'MMMM d, yyyy h:mm a')}</span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Vehicle</span>
                            <span className="detail-value">{submission.deviceName || 'Unknown'}</span>
                        </div>
                        {submission.driverName && (
                            <div className="detail-row">
                                <span className="detail-label">Driver</span>
                                <span className="detail-value">{submission.driverName}</span>
                            </div>
                        )}
                        {submission.locationAddress && (
                            <div className="detail-row">
                                <span className="detail-label">Location</span>
                                <span className="detail-value">{submission.locationAddress}</span>
                            </div>
                        )}
                        {severity && (
                            <div className="detail-row">
                                <span className="detail-label">Severity</span>
                                <span className="detail-value">
                                    <Pill type={severity.type}>{severity.label}</Pill>
                                </span>
                            </div>
                        )}
                    </div>
                    {submission.description && (
                        <div className="detail-description">
                            <span className="detail-label">Description</span>
                            <p>{submission.description}</p>
                        </div>
                    )}
                </Card.Content>
            </Card>

            {/* Damage Assessment */}
            {damage && (damage.damageLevel || damage.description || damage.isDriveable !== undefined) && (
                <Card autoHeight>
                    <Card.Content>
                        <h4 className="detail-section-title">Damage Assessment</h4>
                        <div className="detail-grid">
                            {damage.damageLevel && (
                                <div className="detail-row">
                                    <span className="detail-label">Damage Level</span>
                                    <span className="detail-value">{damageConfig[damage.damageLevel] || damage.damageLevel}</span>
                                </div>
                            )}
                            {damage.isDriveable !== undefined && (
                                <div className="detail-row">
                                    <span className="detail-label">Vehicle Driveable</span>
                                    <span className="detail-value">{damage.isDriveable ? 'Yes' : 'No'}</span>
                                </div>
                            )}
                            {damage.estimatedRepairCost !== undefined && (
                                <div className="detail-row">
                                    <span className="detail-label">Est. Repair Cost</span>
                                    <span className="detail-value">${damage.estimatedRepairCost.toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                        {damage.description && (
                            <div className="detail-description">
                                <span className="detail-label">Damage Description</span>
                                <p>{damage.description}</p>
                            </div>
                        )}
                    </Card.Content>
                </Card>
            )}

            {/* Photos */}
            {submission.photos.length > 0 && (
                <Card autoHeight>
                    <Card.Content>
                        <h4 className="detail-section-title">Photos ({submission.photos.length})</h4>
                        <div className="detail-photos">
                            {submission.photos.map((photo, idx) => (
                                <div key={photo.localId || idx} className="detail-photo-item">
                                    <div className="photo-placeholder">
                                        📷 {photo.category || 'Photo'}
                                    </div>
                                    <span className="photo-time">{safeFormat(photo.capturedAt, 'h:mm a')}</span>
                                </div>
                            ))}
                        </div>
                    </Card.Content>
                </Card>
            )}

            {/* Third Party Info */}
            {thirdParty && (thirdParty.otherDriverName || thirdParty.otherVehiclePlate || thirdParty.policeReportNumber) && (
                <Card autoHeight>
                    <Card.Content>
                        <h4 className="detail-section-title">Third Party & Police</h4>
                        <div className="detail-grid">
                            {thirdParty.otherDriverName && (
                                <div className="detail-row">
                                    <span className="detail-label">Other Driver</span>
                                    <span className="detail-value">{thirdParty.otherDriverName}</span>
                                </div>
                            )}
                            {thirdParty.otherDriverPhone && (
                                <div className="detail-row">
                                    <span className="detail-label">Phone</span>
                                    <span className="detail-value">{thirdParty.otherDriverPhone}</span>
                                </div>
                            )}
                            {(thirdParty.otherVehicleMake || thirdParty.otherVehicleModel) && (
                                <div className="detail-row">
                                    <span className="detail-label">Other Vehicle</span>
                                    <span className="detail-value">
                                        {[thirdParty.otherVehicleMake, thirdParty.otherVehicleModel].filter(Boolean).join(' ')}
                                        {thirdParty.otherVehicleColor && ` (${thirdParty.otherVehicleColor})`}
                                    </span>
                                </div>
                            )}
                            {thirdParty.otherVehiclePlate && (
                                <div className="detail-row">
                                    <span className="detail-label">License Plate</span>
                                    <span className="detail-value">{thirdParty.otherVehiclePlate}</span>
                                </div>
                            )}
                            {thirdParty.otherDriverInsurance && (
                                <div className="detail-row">
                                    <span className="detail-label">Insurance</span>
                                    <span className="detail-value">
                                        {thirdParty.otherDriverInsurance}
                                        {thirdParty.otherDriverPolicyNumber && ` #${thirdParty.otherDriverPolicyNumber}`}
                                    </span>
                                </div>
                            )}
                            {thirdParty.policeReportNumber && (
                                <div className="detail-row">
                                    <span className="detail-label">Police Report #</span>
                                    <span className="detail-value">{thirdParty.policeReportNumber}</span>
                                </div>
                            )}
                        </div>
                        {thirdParty.witnesses && (
                            <div className="detail-description">
                                <span className="detail-label">Witnesses</span>
                                <p>{thirdParty.witnesses}</p>
                            </div>
                        )}
                    </Card.Content>
                </Card>
            )}

            {/* Injuries */}
            {submission.injuriesReported !== undefined && (
                <Card autoHeight>
                    <Card.Content>
                        <h4 className="detail-section-title">Injuries</h4>
                        <div className="detail-grid">
                            <div className="detail-row">
                                <span className="detail-label">Injuries Reported</span>
                                <span className="detail-value">
                                    <Pill type={submission.injuriesReported ? 'error' : 'success'}>
                                        {submission.injuriesReported ? 'Yes' : 'No'}
                                    </Pill>
                                </span>
                            </div>
                        </div>
                        {submission.injuryDescription && (
                            <div className="detail-description">
                                <span className="detail-label">Description</span>
                                <p>{submission.injuryDescription}</p>
                            </div>
                        )}
                    </Card.Content>
                </Card>
            )}

            {/* Notes */}
            {submission.notes && (
                <Card autoHeight>
                    <Card.Content>
                        <h4 className="detail-section-title">Additional Notes</h4>
                        <p className="detail-notes">{submission.notes}</p>
                    </Card.Content>
                </Card>
            )}

            {/* Timestamps */}
            <Card autoHeight>
                <Card.Content>
                    <h4 className="detail-section-title">Submission Info</h4>
                    <div className="detail-grid detail-timestamps">
                        <div className="detail-row">
                            <span className="detail-label">Created</span>
                            <span className="detail-value">{safeFormat(submission.createdAt, 'MMM d, yyyy h:mm a')}</span>
                        </div>
                        {submission.submittedAt && (
                            <div className="detail-row">
                                <span className="detail-label">Submitted</span>
                                <span className="detail-value">{safeFormat(submission.submittedAt, 'MMM d, yyyy h:mm a')}</span>
                            </div>
                        )}
                        <div className="detail-row">
                            <span className="detail-label">Last Updated</span>
                            <span className="detail-value">{safeFormat(submission.updatedAt, 'MMM d, yyyy h:mm a')}</span>
                        </div>
                    </div>
                </Card.Content>
            </Card>
        </div>
    );
};
