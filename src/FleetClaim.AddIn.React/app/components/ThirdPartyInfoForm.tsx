import React, { useEffect } from 'react';
import { Card } from '@geotab/zenith';
import { ThirdPartyInfo } from '@/types';

interface ThirdPartyInfoFormProps {
    info?: ThirdPartyInfo;
    onChange: (info: ThirdPartyInfo) => void;
}

export const ThirdPartyInfoForm: React.FC<ThirdPartyInfoFormProps> = ({
    info = {},
    onChange
}) => {
    const handleChange = (field: keyof ThirdPartyInfo, value: string) => {
        onChange({ ...info, [field]: value });
    };

    return (
        <div className="third-party-grid">
            {/* LEFT COLUMN - Driver Info */}
            <div className="third-party-left">
                <Card title="Other Driver Information" autoHeight>
                    <Card.Content>
                        <div className="form-field">
                            <label className="form-label">Driver Name</label>
                            <input
                                type="text"
                                className="form-input"
                                value={info.otherDriverName || ''}
                                onChange={(e) => handleChange('otherDriverName', e.target.value)}
                                placeholder="Full name"
                            />
                        </div>
                        <div className="form-field">
                            <label className="form-label">Phone Number</label>
                            <input
                                type="tel"
                                className="form-input"
                                value={info.otherDriverPhone || ''}
                                onChange={(e) => handleChange('otherDriverPhone', e.target.value)}
                                placeholder="(555) 123-4567"
                            />
                        </div>
                        <div className="form-field">
                            <label className="form-label">Insurance Company</label>
                            <input
                                type="text"
                                className="form-input"
                                value={info.otherDriverInsurance || ''}
                                onChange={(e) => handleChange('otherDriverInsurance', e.target.value)}
                                placeholder="Insurance company name"
                            />
                        </div>
                        <div className="form-field">
                            <label className="form-label">Policy Number</label>
                            <input
                                type="text"
                                className="form-input"
                                value={info.otherDriverPolicyNumber || ''}
                                onChange={(e) => handleChange('otherDriverPolicyNumber', e.target.value)}
                                placeholder="Policy #"
                            />
                        </div>
                    </Card.Content>
                </Card>

                <Card title="Additional Information" autoHeight>
                    <Card.Content>
                        <div className="form-field">
                            <label className="form-label">Witnesses</label>
                            <textarea
                                className="form-input"
                                value={info.witnesses || ''}
                                onChange={(e) => handleChange('witnesses', e.target.value)}
                                placeholder="Names and contact info of witnesses..."
                                rows={3}
                            />
                        </div>
                        <div className="form-field">
                            <label className="form-label">Police Report Number</label>
                            <input
                                type="text"
                                className="form-input"
                                value={info.policeReportNumber || ''}
                                onChange={(e) => handleChange('policeReportNumber', e.target.value)}
                                placeholder="Report #"
                            />
                        </div>
                        <div className="form-field">
                            <label className="form-label">Additional Notes</label>
                            <textarea
                                className="form-input"
                                value={info.additionalNotes || ''}
                                onChange={(e) => handleChange('additionalNotes', e.target.value)}
                                placeholder="Any other relevant information..."
                                rows={3}
                            />
                        </div>
                    </Card.Content>
                </Card>
            </div>

            {/* RIGHT COLUMN - Vehicle Info */}
            <div className="third-party-right">
                <Card title="Other Vehicle Information" autoHeight>
                    <Card.Content>
                        <div className="form-field">
                            <label className="form-label">Make</label>
                            <input
                                type="text"
                                className="form-input"
                                value={info.otherVehicleMake || ''}
                                onChange={(e) => handleChange('otherVehicleMake', e.target.value)}
                                placeholder="e.g., Toyota"
                            />
                        </div>
                        <div className="form-field">
                            <label className="form-label">Model</label>
                            <input
                                type="text"
                                className="form-input"
                                value={info.otherVehicleModel || ''}
                                onChange={(e) => handleChange('otherVehicleModel', e.target.value)}
                                placeholder="e.g., Camry"
                            />
                        </div>
                        <div className="form-field">
                            <label className="form-label">License Plate</label>
                            <input
                                type="text"
                                className="form-input"
                                value={info.otherVehiclePlate || ''}
                                onChange={(e) => handleChange('otherVehiclePlate', e.target.value)}
                                placeholder="ABC 1234"
                            />
                        </div>
                        <div className="form-field">
                            <label className="form-label">Color</label>
                            <input
                                type="text"
                                className="form-input"
                                value={info.otherVehicleColor || ''}
                                onChange={(e) => handleChange('otherVehicleColor', e.target.value)}
                                placeholder="e.g., Silver"
                            />
                        </div>
                    </Card.Content>
                </Card>
            </div>
        </div>
    );
};
