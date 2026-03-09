import React from 'react';
import { Card } from '@geotab/zenith';
import { ThirdPartyInfo, DriverSubmission } from '@/types';

interface ThirdPartyStepProps {
    submission: DriverSubmission;
    onChange: (updates: Partial<DriverSubmission>) => void;
}

export const ThirdPartyStep: React.FC<ThirdPartyStepProps> = ({ submission, onChange }) => {
    const info = submission.thirdPartyInfo || {};

    const handleInfoChange = (field: keyof ThirdPartyInfo, value: string) => {
        onChange({ thirdPartyInfo: { ...info, [field]: value } });
    };

    return (
        <div className="drive-step">
            <h3 className="step-title">Third Party & Police Info</h3>
            <p className="step-subtitle">Optional - skip if not applicable</p>

            <Card title="Other Driver" autoHeight>
                <Card.Content>
                    <div className="form-field">
                        <label className="form-label">Name</label>
                        <input
                            type="text"
                            className="form-input"
                            value={info.otherDriverName || ''}
                            onChange={(e) => handleInfoChange('otherDriverName', e.target.value)}
                            placeholder="Full name"
                        />
                    </div>
                    <div className="form-field">
                        <label className="form-label">Phone</label>
                        <input
                            type="tel"
                            className="form-input"
                            value={info.otherDriverPhone || ''}
                            onChange={(e) => handleInfoChange('otherDriverPhone', e.target.value)}
                            placeholder="(555) 123-4567"
                        />
                    </div>
                    <div className="form-field">
                        <label className="form-label">Insurance Company</label>
                        <input
                            type="text"
                            className="form-input"
                            value={info.otherDriverInsurance || ''}
                            onChange={(e) => handleInfoChange('otherDriverInsurance', e.target.value)}
                            placeholder="Insurance company"
                        />
                    </div>
                    <div className="form-field">
                        <label className="form-label">Policy Number</label>
                        <input
                            type="text"
                            className="form-input"
                            value={info.otherDriverPolicyNumber || ''}
                            onChange={(e) => handleInfoChange('otherDriverPolicyNumber', e.target.value)}
                            placeholder="Policy #"
                        />
                    </div>
                </Card.Content>
            </Card>

            <Card title="Other Vehicle" autoHeight>
                <Card.Content>
                    <div className="form-field">
                        <label className="form-label">Make</label>
                        <input
                            type="text"
                            className="form-input"
                            value={info.otherVehicleMake || ''}
                            onChange={(e) => handleInfoChange('otherVehicleMake', e.target.value)}
                            placeholder="e.g., Toyota"
                        />
                    </div>
                    <div className="form-field">
                        <label className="form-label">Model</label>
                        <input
                            type="text"
                            className="form-input"
                            value={info.otherVehicleModel || ''}
                            onChange={(e) => handleInfoChange('otherVehicleModel', e.target.value)}
                            placeholder="e.g., Camry"
                        />
                    </div>
                    <div className="form-field">
                        <label className="form-label">License Plate</label>
                        <input
                            type="text"
                            className="form-input"
                            value={info.otherVehiclePlate || ''}
                            onChange={(e) => handleInfoChange('otherVehiclePlate', e.target.value)}
                            placeholder="ABC 1234"
                        />
                    </div>
                    <div className="form-field">
                        <label className="form-label">Color</label>
                        <input
                            type="text"
                            className="form-input"
                            value={info.otherVehicleColor || ''}
                            onChange={(e) => handleInfoChange('otherVehicleColor', e.target.value)}
                            placeholder="e.g., Silver"
                        />
                    </div>
                </Card.Content>
            </Card>

            <Card title="Police & Injuries" autoHeight>
                <Card.Content>
                    <div className="form-field">
                        <label className="form-label">Police Report Number</label>
                        <input
                            type="text"
                            className="form-input"
                            value={submission.policeReportNumber || ''}
                            onChange={(e) => onChange({ policeReportNumber: e.target.value })}
                            placeholder="Report #"
                        />
                    </div>
                    <div className="form-field">
                        <label className="form-label">Police Agency</label>
                        <input
                            type="text"
                            className="form-input"
                            value={submission.policeAgency || ''}
                            onChange={(e) => onChange({ policeAgency: e.target.value })}
                            placeholder="Agency name"
                        />
                    </div>
                    <div className="form-field">
                        <label className="form-label">Were there any injuries?</label>
                        <div className="severity-options">
                            <label className={`severity-option ${submission.injuriesReported === true ? 'selected' : ''}`}>
                                <input
                                    type="radio"
                                    name="injuries"
                                    checked={submission.injuriesReported === true}
                                    onChange={() => onChange({ injuriesReported: true })}
                                />
                                Yes
                            </label>
                            <label className={`severity-option ${submission.injuriesReported === false ? 'selected' : ''}`}>
                                <input
                                    type="radio"
                                    name="injuries"
                                    checked={submission.injuriesReported === false}
                                    onChange={() => onChange({ injuriesReported: false })}
                                />
                                No
                            </label>
                        </div>
                    </div>
                    {submission.injuriesReported && (
                        <div className="form-field">
                            <label className="form-label">Injury Description</label>
                            <textarea
                                className="form-input"
                                value={submission.injuryDescription || ''}
                                onChange={(e) => onChange({ injuryDescription: e.target.value })}
                                placeholder="Describe injuries..."
                                rows={3}
                            />
                        </div>
                    )}
                    <div className="form-field">
                        <label className="form-label">Witnesses</label>
                        <textarea
                            className="form-input"
                            value={info.witnesses || ''}
                            onChange={(e) => handleInfoChange('witnesses', e.target.value)}
                            placeholder="Names and contact info..."
                            rows={3}
                        />
                    </div>
                </Card.Content>
            </Card>
        </div>
    );
};
