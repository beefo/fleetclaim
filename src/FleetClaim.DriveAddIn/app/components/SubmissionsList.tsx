import React from 'react';
import { Button, Card, Pill } from '@geotab/zenith';
import { DriverSubmission, SubmissionStatus } from '@/types';
import { getAllSubmissions, deleteSubmission, deleteAllPhotosForSubmission } from '@/services/storageService';
import { format, isValid } from 'date-fns';

interface SubmissionsListProps {
    onBack: () => void;
    onResume: (id: string) => void;
}

const statusConfig: Record<SubmissionStatus, { label: string; type: 'success' | 'warning' | 'info' | 'error' }> = {
    draft: { label: 'Draft', type: 'warning' },
    pending_sync: { label: 'Pending Sync', type: 'info' },
    synced: { label: 'Synced', type: 'success' },
    merged: { label: 'Merged', type: 'success' },
    standalone: { label: 'Standalone', type: 'info' }
};

const safeFormat = (dateStr: string | undefined, fmt: string): string => {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr);
        return isValid(d) ? format(d, fmt) : 'Invalid date';
    } catch { return 'Error'; }
};

export const SubmissionsList: React.FC<SubmissionsListProps> = ({ onBack, onResume }) => {
    const [submissions, setSubmissions] = React.useState<DriverSubmission[]>([]);

    React.useEffect(() => {
        setSubmissions(getAllSubmissions());
    }, []);

    const handleDelete = async (sub: DriverSubmission) => {
        if (!confirm('Delete this submission?')) return;
        await deleteAllPhotosForSubmission(sub.photos);
        deleteSubmission(sub.id);
        setSubmissions(prev => prev.filter(s => s.id !== sub.id));
    };

    return (
        <div className="drive-step">
            <div className="list-header">
                <Button type="tertiary" onClick={onBack}>Back</Button>
                <h3 className="step-title">Past Submissions</h3>
            </div>

            {submissions.length === 0 ? (
                <div className="empty-state">
                    <p className="empty-state-text">No submissions yet</p>
                </div>
            ) : (
                submissions.map(sub => {
                    const config = statusConfig[sub.status] || statusConfig.draft;
                    return (
                        <Card key={sub.id} autoHeight>
                            <Card.Content>
                                <div className="submission-card">
                                    <div className="submission-header">
                                        <strong>{sub.deviceName}</strong>
                                        <Pill type={config.type}>{config.label}</Pill>
                                    </div>
                                    <div className="submission-meta">
                                        <span>{safeFormat(sub.incidentTimestamp, 'MMM d, yyyy h:mm a')}</span>
                                        {sub.photos.length > 0 && <span>{sub.photos.length} photo{sub.photos.length > 1 ? 's' : ''}</span>}
                                    </div>
                                    {sub.description && (
                                        <p className="submission-desc">{sub.description}</p>
                                    )}
                                    <div className="submission-actions">
                                        {sub.status === 'draft' && (
                                            <Button type="primary" onClick={() => onResume(sub.id)}>Resume</Button>
                                        )}
                                        {(sub.status === 'draft' || sub.status === 'pending_sync') && (
                                            <Button type="tertiary-destructive" onClick={() => handleDelete(sub)}>Delete</Button>
                                        )}
                                    </div>
                                </div>
                            </Card.Content>
                        </Card>
                    );
                })
            )}
        </div>
    );
};
