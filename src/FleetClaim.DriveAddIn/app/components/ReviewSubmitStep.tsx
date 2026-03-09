import React from 'react';
import { Button, Card, Pill, Banner } from '@geotab/zenith';
import { DriverSubmission } from '@/types';
import { useDrive } from '@/contexts';
import { format, isValid } from 'date-fns';

interface ReviewSubmitStepProps {
    submission: DriverSubmission;
    onSubmit: () => void;
    onSaveForLater: () => void;
    isSubmitting: boolean;
}

const severityColors: Record<string, 'error' | 'warning' | 'info' | 'success'> = {
    critical: 'error',
    high: 'warning',
    medium: 'info',
    low: 'success'
};

const safeFormat = (dateStr: string | undefined, fmt: string): string => {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr);
        return isValid(d) ? format(d, fmt) : 'Invalid date';
    } catch { return 'Error'; }
};

export const ReviewSubmitStep: React.FC<ReviewSubmitStepProps> = ({
    submission,
    onSubmit,
    onSaveForLater,
    isSubmitting
}) => {
    const { isOnline } = useDrive();

    return (
        <div className="drive-step">
            <h3 className="step-title">Review & Submit</h3>

            {!isOnline && (
                <Banner type="warning" header="Offline">
                    You are offline. The submission will be saved locally and synced when connectivity is restored.
                </Banner>
            )}

            <Card title="Summary" autoHeight>
                <Card.Content>
                    <div className="review-rows">
                        <div className="review-row">
                            <span className="review-label">Vehicle</span>
                            <span className="review-value">{submission.deviceName}</span>
                        </div>
                        {submission.driverName && (
                            <div className="review-row">
                                <span className="review-label">Driver</span>
                                <span className="review-value">{submission.driverName}</span>
                            </div>
                        )}
                        <div className="review-row">
                            <span className="review-label">Date & Time</span>
                            <span className="review-value">
                                {safeFormat(submission.incidentTimestamp, 'MMM d, yyyy h:mm a')}
                            </span>
                        </div>
                        {submission.latitude && submission.longitude && (
                            <div className="review-row">
                                <span className="review-label">Location</span>
                                <span className="review-value">
                                    {submission.locationAddress || `${submission.latitude.toFixed(5)}, ${submission.longitude.toFixed(5)}`}
                                </span>
                            </div>
                        )}
                        {submission.severity && (
                            <div className="review-row">
                                <span className="review-label">Severity</span>
                                <span className="review-value">
                                    <Pill type={severityColors[submission.severity] || 'info'}>
                                        {submission.severity.charAt(0).toUpperCase() + submission.severity.slice(1)}
                                    </Pill>
                                </span>
                            </div>
                        )}
                        {submission.description && (
                            <div className="review-row">
                                <span className="review-label">Description</span>
                                <span className="review-value">{submission.description}</span>
                            </div>
                        )}
                        {submission.damageAssessment?.damageLevel && (
                            <div className="review-row">
                                <span className="review-label">Damage</span>
                                <span className="review-value">
                                    {submission.damageAssessment.damageLevel.charAt(0).toUpperCase() +
                                        submission.damageAssessment.damageLevel.slice(1)}
                                    {submission.damageAssessment.isDriveable === false && ' (not driveable)'}
                                </span>
                            </div>
                        )}
                        <div className="review-row">
                            <span className="review-label">Photos</span>
                            <span className="review-value">{submission.photos.length}</span>
                        </div>
                        {submission.thirdPartyInfo?.otherDriverName && (
                            <div className="review-row">
                                <span className="review-label">Other Driver</span>
                                <span className="review-value">{submission.thirdPartyInfo.otherDriverName}</span>
                            </div>
                        )}
                        {submission.policeReportNumber && (
                            <div className="review-row">
                                <span className="review-label">Police Report #</span>
                                <span className="review-value">{submission.policeReportNumber}</span>
                            </div>
                        )}
                        {submission.injuriesReported && (
                            <div className="review-row">
                                <span className="review-label">Injuries</span>
                                <span className="review-value">{submission.injuryDescription || 'Yes'}</span>
                            </div>
                        )}
                    </div>
                </Card.Content>
            </Card>

            <div className="submit-actions">
                {isOnline ? (
                    <Button type="primary" onClick={onSubmit} disabled={isSubmitting}>
                        {isSubmitting ? 'Submitting...' : 'Submit'}
                    </Button>
                ) : (
                    <Button type="primary" onClick={onSaveForLater} disabled={isSubmitting}>
                        Save for Later
                    </Button>
                )}
            </div>
        </div>
    );
};
