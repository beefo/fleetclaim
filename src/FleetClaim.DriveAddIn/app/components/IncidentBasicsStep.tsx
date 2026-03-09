import React, { useEffect, useCallback } from 'react';
import { Card } from '@geotab/zenith';
import { DriverSubmission } from '@/types';
import { useDrive } from '@/contexts';
import { LocationPicker } from './LocationPicker';

interface IncidentBasicsStepProps {
    submission: DriverSubmission;
    onChange: (updates: Partial<DriverSubmission>) => void;
}

export const IncidentBasicsStep: React.FC<IncidentBasicsStepProps> = ({ submission, onChange }) => {
    const { currentDevice, currentDriver, getCurrentLocation } = useDrive();

    // Auto-populate device/driver/location on mount
    useEffect(() => {
        const updates: Partial<DriverSubmission> = {};

        if (currentDevice && !submission.deviceId) {
            updates.deviceId = currentDevice.id;
            updates.deviceName = currentDevice.name;
        }
        if (currentDriver && !submission.driverId) {
            updates.driverId = currentDriver.id;
            updates.driverName = currentDriver.name;
        }

        if (Object.keys(updates).length > 0) {
            onChange(updates);
        }

        // Grab location if we don't have one yet
        if (!submission.latitude) {
            getCurrentLocation().then(loc => {
                if (loc) {
                    onChange({ latitude: loc.latitude, longitude: loc.longitude });
                }
            });
        }
    }, []);

    // Handle location changes from the map
    const handleLocationChange = useCallback((lat: number, lng: number, address?: string) => {
        onChange({ 
            latitude: lat, 
            longitude: lng, 
            locationAddress: address 
        });
    }, [onChange]);

    // Refresh location from GPS
    const handleRefreshLocation = useCallback(async () => {
        return getCurrentLocation();
    }, [getCurrentLocation]);

    const formatLocalDateTime = (isoString: string): string => {
        try {
            const d = new Date(isoString);
            return d.toISOString().slice(0, 16);
        } catch {
            return '';
        }
    };

    return (
        <div className="drive-step">
            <h3 className="step-title">Incident Details</h3>

            <Card title="Vehicle & Driver" autoHeight>
                <Card.Content>
                    <div className="form-field">
                        <label className="form-label">Vehicle</label>
                        <input
                            type="text"
                            className="form-input"
                            value={submission.deviceName || ''}
                            readOnly
                        />
                    </div>
                    <div className="form-field">
                        <label className="form-label">Driver</label>
                        <input
                            type="text"
                            className="form-input"
                            value={submission.driverName || ''}
                            readOnly
                        />
                    </div>
                </Card.Content>
            </Card>

            <Card title="When & Where" autoHeight>
                <Card.Content>
                    <div className="form-field">
                        <label className="form-label">Date & Time</label>
                        <input
                            type="datetime-local"
                            className="form-input"
                            value={formatLocalDateTime(submission.incidentTimestamp)}
                            onChange={(e) => onChange({ incidentTimestamp: new Date(e.target.value).toISOString() })}
                        />
                    </div>
                    <div className="form-field">
                        <label className="form-label">Location</label>
                        <LocationPicker
                            latitude={submission.latitude}
                            longitude={submission.longitude}
                            address={submission.locationAddress}
                            onLocationChange={handleLocationChange}
                            onRefreshLocation={handleRefreshLocation}
                        />
                    </div>
                </Card.Content>
            </Card>

            <Card title="Description" autoHeight>
                <Card.Content>
                    <div className="form-field">
                        <label className="form-label">What happened?</label>
                        <textarea
                            className="form-input"
                            value={submission.description || ''}
                            onChange={(e) => onChange({ description: e.target.value })}
                            placeholder="Describe the incident..."
                            rows={4}
                        />
                    </div>
                    <div className="form-field">
                        <label className="form-label">Severity (optional)</label>
                        <div className="severity-options">
                            {(['low', 'medium', 'high', 'critical'] as const).map(sev => (
                                <label
                                    key={sev}
                                    className={`severity-option ${submission.severity === sev ? 'selected' : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="severity"
                                        value={sev}
                                        checked={submission.severity === sev}
                                        onChange={() => onChange({ severity: sev })}
                                    />
                                    {sev.charAt(0).toUpperCase() + sev.slice(1)}
                                </label>
                            ))}
                        </div>
                    </div>
                </Card.Content>
            </Card>
        </div>
    );
};
