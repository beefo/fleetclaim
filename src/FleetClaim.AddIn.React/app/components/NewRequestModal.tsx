import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    Modal,
    Button,
    ToggleButton,
    Dropdown,
    Pill
} from '@geotab/zenith';
import { useGeotab } from '@/contexts';
import { useRequests } from '@/hooks';
import { loadUnmergedSubmissions, SubmissionRecord } from '@/services';
import { DriverSubmission } from '@/types';

interface NewRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: () => void;
    toast: {
        success: (msg: string) => void;
        error: (msg: string) => void;
        info: (msg: string) => void;
    };
}

// Inline styles for Zenith compliance
const styles = {
    formField: {
        marginBottom: '20px'
    } as React.CSSProperties,
    label: {
        display: 'block',
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--zen-color-text-secondary, #6b7280)',
        marginBottom: '8px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px'
    } as React.CSSProperties,
    presetChips: {
        display: 'flex',
        gap: '8px',
        marginBottom: '12px'
    } as React.CSSProperties,
    dateTimeRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap' as const
    } as React.CSSProperties,
    dateTimeInput: {
        flex: '1',
        minWidth: '180px'
    } as React.CSSProperties,
    dateTimeLabel: {
        fontSize: '12px',
        color: 'var(--zen-color-text-tertiary, #9ca3af)',
        marginBottom: '4px',
        display: 'block'
    } as React.CSSProperties,
    input: {
        width: '100%',
        padding: '10px 12px',
        border: '1px solid var(--zen-color-border, #d1d5db)',
        borderRadius: '6px',
        fontSize: '14px',
        fontFamily: 'inherit',
        backgroundColor: '#fff',
        transition: 'border-color 0.15s, box-shadow 0.15s'
    } as React.CSSProperties,
    separator: {
        color: 'var(--zen-color-text-tertiary, #9ca3af)',
        fontSize: '14px',
        paddingTop: '20px'
    } as React.CSSProperties,
    toggleRow: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '16px',
        backgroundColor: 'var(--zen-color-background-secondary, #f9fafb)',
        borderRadius: '8px',
        border: '1px solid var(--zen-color-border, #e5e7eb)'
    } as React.CSSProperties,
    toggleContent: {
        flex: '1'
    } as React.CSSProperties,
    toggleTitle: {
        display: 'block',
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--zen-color-text-primary, #111827)',
        marginBottom: '4px'
    } as React.CSSProperties,
    toggleDescription: {
        display: 'block',
        fontSize: '13px',
        color: 'var(--zen-color-text-secondary, #6b7280)',
        lineHeight: '1.4'
    } as React.CSSProperties,
    footer: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        padding: '16px 24px',
        borderTop: '1px solid var(--zen-color-border, #e5e7eb)',
        backgroundColor: 'var(--zen-color-background-secondary, #f9fafb)'
    } as React.CSSProperties
};

export const NewRequestModal: React.FC<NewRequestModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    toast
}) => {
    const { api, devices, loadDevices } = useGeotab();
    const { submit } = useRequests();
    
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    const [rangeStart, setRangeStart] = useState<Date>(() => {
        const date = new Date();
        date.setHours(date.getHours() - 1);
        return date;
    });
    const [rangeEnd, setRangeEnd] = useState<Date>(new Date());
    const [forceReport, setForceReport] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activePreset, setActivePreset] = useState<'hour' | '24h' | null>('hour');
    
    // Driver submissions state
    const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
    const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>('');
    const [loadingSubmissions, setLoadingSubmissions] = useState(false);

    // Load devices when modal opens
    useEffect(() => {
        if (isOpen && devices.length === 0) {
            loadDevices();
        }
    }, [isOpen, devices.length, loadDevices]);
    
    // Load unmerged submissions when modal opens
    useEffect(() => {
        if (isOpen && api) {
            setLoadingSubmissions(true);
            loadUnmergedSubmissions(api)
                .then(setSubmissions)
                .catch(err => {
                    console.warn('Failed to load submissions:', err);
                    setSubmissions([]);
                })
                .finally(() => setLoadingSubmissions(false));
        }
    }, [isOpen, api]);

    const deviceOptions = useMemo(() => 
        devices.map(d => ({
            id: d.id,
            name: d.name
        })),
        [devices]
    );

    const selectedDevice = useMemo(() => 
        devices.find(d => d.id === selectedDeviceId),
        [devices, selectedDeviceId]
    );
    
    // Filter submissions for selected device
    const deviceSubmissions = useMemo(() => {
        if (!selectedDeviceId) return submissions;
        return submissions.filter(s => s.submission.deviceId === selectedDeviceId);
    }, [submissions, selectedDeviceId]);
    
    // Format submission for dropdown
    const submissionOptions = useMemo(() => 
        deviceSubmissions.map(s => {
            const date = new Date(s.submission.incidentTimestamp);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const driver = s.submission.driverName || 'Unknown driver';
            const vehicle = s.submission.deviceName || 'Unknown vehicle';
            return {
                id: s.submission.id,
                name: `${dateStr} - ${driver} (${vehicle})`
            };
        }),
        [deviceSubmissions]
    );
    
    const selectedSubmission = useMemo(() =>
        submissions.find(s => s.submission.id === selectedSubmissionId)?.submission,
        [submissions, selectedSubmissionId]
    );

    const handleSubmit = useCallback(async () => {
        if (!selectedDeviceId) {
            toast.error('Please select a vehicle');
            return;
        }
        
        if (rangeStart >= rangeEnd) {
            toast.error('End time must be after start time');
            return;
        }
        
        setIsSubmitting(true);
        
        try {
            await submit(
                selectedDeviceId,
                selectedDevice?.name || 'Unknown',
                rangeStart,
                rangeEnd,
                forceReport,
                selectedSubmissionId || undefined
            );
            onSubmit();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to submit request');
        } finally {
            setIsSubmitting(false);
        }
    }, [selectedDeviceId, selectedDevice, rangeStart, rangeEnd, forceReport, selectedSubmissionId, submit, onSubmit, toast]);

    const handleSetLastHour = useCallback(() => {
        const end = new Date();
        const start = new Date(end.getTime() - 60 * 60 * 1000);
        setRangeStart(start);
        setRangeEnd(end);
        setActivePreset('hour');
    }, []);

    const handleSetLast24Hours = useCallback(() => {
        const end = new Date();
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        setRangeStart(start);
        setRangeEnd(end);
        setActivePreset('24h');
    }, []);

    const handleCustomDateChange = useCallback(() => {
        setActivePreset(null);
    }, []);
    
    // When a submission is selected, auto-fill device and time range
    const handleSubmissionSelect = useCallback((submissionId: string) => {
        setSelectedSubmissionId(submissionId);
        const submission = submissions.find(s => s.submission.id === submissionId)?.submission;
        if (submission) {
            // Set device
            setSelectedDeviceId(submission.deviceId);
            // Set time range: 30 min before to 30 min after incident
            const incidentTime = new Date(submission.incidentTimestamp);
            const start = new Date(incidentTime.getTime() - 30 * 60 * 1000);
            const end = new Date(incidentTime.getTime() + 30 * 60 * 1000);
            setRangeStart(start);
            setRangeEnd(end);
            setActivePreset(null);
            // Force report since we're linking to a submission
            setForceReport(true);
        }
    }, [submissions]);

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="New Report Request"
        >
            <Modal.Content>
                {/* Driver Submission Section - shown if there are unmerged submissions */}
                {submissions.length > 0 && (
                    <div style={styles.formField}>
                        <label style={styles.label}>Link to Driver Submission (Optional)</label>
                        <Dropdown
                            dataItems={submissionOptions}
                            value={selectedSubmissionId ? [selectedSubmissionId] : []}
                            onChange={(selected: any[]) => {
                                const id = selected?.[0]?.id || '';
                                if (id) {
                                    handleSubmissionSelect(id);
                                } else {
                                    setSelectedSubmissionId('');
                                }
                            }}
                            placeholder={loadingSubmissions ? "Loading submissions..." : "Select a driver submission to link..."}
                            searchField={true}
                            multiselect={false}
                            errorHandler={(e) => console.error('Dropdown error:', e)}
                        />
                        {selectedSubmission && (
                            <div style={{ 
                                marginTop: '8px', 
                                padding: '12px', 
                                backgroundColor: 'var(--zen-color-background-secondary, #f0f9ff)', 
                                borderRadius: '6px',
                                border: '1px solid var(--zen-color-info, #0ea5e9)',
                                fontSize: '13px'
                            }}>
                                <strong>Driver submission selected</strong>
                                <div style={{ marginTop: '4px', color: 'var(--zen-color-text-secondary, #6b7280)' }}>
                                    {selectedSubmission.description || 'No description'} 
                                    {selectedSubmission.driverName && ` — ${selectedSubmission.driverName}`}
                                </div>
                                <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--zen-color-text-tertiary, #9ca3af)' }}>
                                    The vehicle, time range, and force report options have been auto-filled.
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
                <div style={styles.formField}>
                    <label style={styles.label}>Vehicle</label>
                    <Dropdown
                        dataItems={deviceOptions}
                        value={selectedDeviceId ? [selectedDeviceId] : []}
                        onChange={(selected: any[]) => {
                            const id = selected?.[0]?.id || '';
                            setSelectedDeviceId(id);
                            // Clear submission if device changes
                            if (selectedSubmissionId && id !== selectedSubmission?.deviceId) {
                                setSelectedSubmissionId('');
                            }
                        }}
                        placeholder="Select a vehicle..."
                        searchField={true}
                        multiselect={false}
                        errorHandler={(e) => console.error('Dropdown error:', e)}
                    />
                </div>
                
                <div style={styles.formField}>
                    <label style={styles.label}>Time Range</label>
                    <div style={styles.presetChips}>
                        <Button
                            type={activePreset === 'hour' ? 'primary' : 'secondary'}
                            onClick={handleSetLastHour}
                        >
                            Last hour
                        </Button>
                        <Button
                            type={activePreset === '24h' ? 'primary' : 'secondary'}
                            onClick={handleSetLast24Hours}
                        >
                            Last 24 hours
                        </Button>
                    </div>
                    <div style={styles.dateTimeRow}>
                        <div style={styles.dateTimeInput}>
                            <span style={styles.dateTimeLabel}>Start</span>
                            <input
                                type="datetime-local"
                                value={rangeStart.toISOString().slice(0, 16)}
                                onChange={(e) => {
                                    setRangeStart(new Date(e.target.value));
                                    handleCustomDateChange();
                                }}
                                max={rangeEnd.toISOString().slice(0, 16)}
                                style={styles.input}
                            />
                        </div>
                        <span style={styles.separator}>to</span>
                        <div style={styles.dateTimeInput}>
                            <span style={styles.dateTimeLabel}>End</span>
                            <input
                                type="datetime-local"
                                value={rangeEnd.toISOString().slice(0, 16)}
                                onChange={(e) => {
                                    setRangeEnd(new Date(e.target.value));
                                    handleCustomDateChange();
                                }}
                                min={rangeStart.toISOString().slice(0, 16)}
                                max={new Date().toISOString().slice(0, 16)}
                                style={styles.input}
                            />
                        </div>
                    </div>
                </div>
                
                <div style={styles.toggleRow}>
                    <div style={styles.toggleContent}>
                        <span style={styles.toggleTitle}>Force Report</span>
                        <span style={styles.toggleDescription}>
                            Generate a report even if no collision events are detected. 
                            Useful for creating baseline evidence for insurance claims.
                        </span>
                    </div>
                    <ToggleButton
                        checked={forceReport}
                        onChange={() => setForceReport(!forceReport)}
                    />
                </div>
            </Modal.Content>
            <Modal.SecondaryButton onClick={onClose} disabled={isSubmitting}>
                Cancel
            </Modal.SecondaryButton>
            <Modal.PrimaryButton onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </Modal.PrimaryButton>
        </Modal>
    );
};
