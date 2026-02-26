import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    Modal,
    Button,
    ToggleButton,
    Dropdown
} from '@geotab/zenith';
import { useGeotab } from '@/contexts';
import { useRequests } from '@/hooks';

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

export const NewRequestModal: React.FC<NewRequestModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    toast
}) => {
    const { devices, loadDevices } = useGeotab();
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

    // Load devices when modal opens
    useEffect(() => {
        if (isOpen && devices.length === 0) {
            loadDevices();
        }
    }, [isOpen, devices.length, loadDevices]);

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
                forceReport
            );
            onSubmit();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to submit request');
        } finally {
            setIsSubmitting(false);
        }
    }, [selectedDeviceId, selectedDevice, rangeStart, rangeEnd, forceReport, submit, onSubmit, toast]);

    const handleSetLastHour = useCallback(() => {
        const end = new Date();
        const start = new Date(end.getTime() - 60 * 60 * 1000);
        setRangeStart(start);
        setRangeEnd(end);
    }, []);

    const handleSetLast24Hours = useCallback(() => {
        const end = new Date();
        const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        setRangeStart(start);
        setRangeEnd(end);
    }, []);

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="New Report Request"
            
        >
            <Modal.Content>
                <div className="request-form">
                    <div className="form-field">
                        <label>Vehicle</label>
                        <Dropdown
                            dataItems={deviceOptions}
                            value={selectedDeviceId ? [selectedDeviceId] : []}
                            onChange={(selected: any[]) => {
                                // ISelectionItem[] - each has id and name
                                const id = selected?.[0]?.id || '';
                                console.log('Dropdown onChange:', selected, 'selected id:', id);
                                setSelectedDeviceId(id);
                            }}
                            placeholder="Select a vehicle..."
                            searchField={true}
                            errorHandler={(e) => console.error('Dropdown error:', e)}
                        />
                    </div>
                    
                    <div className="form-field">
                        <label>Time Range</label>
                        <div className="time-range-presets">
                            <Button type="tertiary"  onClick={handleSetLastHour}>
                                Last hour
                            </Button>
                            <Button type="tertiary"  onClick={handleSetLast24Hours}>
                                Last 24 hours
                            </Button>
                        </div>
                        <div className="time-range-inputs">
                            <div className="datetime-input">
                                <label>Start</label>
                                <input
                                    type="datetime-local"
                                    value={rangeStart.toISOString().slice(0, 16)}
                                    onChange={(e) => setRangeStart(new Date(e.target.value))}
                                    max={rangeEnd.toISOString().slice(0, 16)}
                                    className="zen-input"
                                />
                            </div>
                            <span className="time-range-separator">to</span>
                            <div className="datetime-input">
                                <label>End</label>
                                <input
                                    type="datetime-local"
                                    value={rangeEnd.toISOString().slice(0, 16)}
                                    onChange={(e) => setRangeEnd(new Date(e.target.value))}
                                    min={rangeStart.toISOString().slice(0, 16)}
                                    max={new Date().toISOString().slice(0, 16)}
                                    className="zen-input"
                                />
                            </div>
                        </div>
                    </div>
                    
                    <div className="form-field form-field-toggle">
                        <div className="toggle-label">
                            <span className="toggle-title">Force Report</span>
                            <span className="toggle-description">
                                Generate a report even if no collision events are detected.
                                Useful for creating baseline evidence for insurance claims.
                            </span>
                        </div>
                        <ToggleButton
                            checked={forceReport}
                            onChange={() => setForceReport(!forceReport)}
                        />
                    </div>
                </div>
            </Modal.Content>
            <div className="modal-footer">
                <Button type="tertiary" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button type="primary" onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting...' : 'Submit Request'}
                </Button>
            </div>
        </Modal>
    );
};
