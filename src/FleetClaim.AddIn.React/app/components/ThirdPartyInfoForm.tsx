import React, { useState, useEffect } from 'react';
import { Button, Card, TextInput, Textarea } from '@geotab/zenith';
import { ThirdPartyInfo } from '@/types';

interface ThirdPartyInfoFormProps {
    info?: ThirdPartyInfo;
    onSave: (info: ThirdPartyInfo) => Promise<void>;
    isSaving: boolean;
}

export const ThirdPartyInfoForm: React.FC<ThirdPartyInfoFormProps> = ({
    info,
    onSave,
    isSaving
}) => {
    const [formData, setFormData] = useState<ThirdPartyInfo>({
        otherDriverName: info?.otherDriverName || '',
        otherDriverPhone: info?.otherDriverPhone || '',
        otherDriverInsurance: info?.otherDriverInsurance || '',
        otherDriverPolicyNumber: info?.otherDriverPolicyNumber || '',
        otherVehicleMake: info?.otherVehicleMake || '',
        otherVehicleModel: info?.otherVehicleModel || '',
        otherVehiclePlate: info?.otherVehiclePlate || '',
        witnesses: info?.witnesses || '',
        policeReportNumber: info?.policeReportNumber || '',
        additionalNotes: info?.additionalNotes || ''
    });
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        // Check if form has changed
        const changed = Object.keys(formData).some(key => {
            const k = key as keyof ThirdPartyInfo;
            return formData[k] !== (info?.[k] || '');
        });
        setHasChanges(changed);
    }, [formData, info]);

    const handleChange = (field: keyof ThirdPartyInfo, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        // Clean up empty strings
        const cleanedData: ThirdPartyInfo = {};
        Object.entries(formData).forEach(([key, value]) => {
            if (value && value.trim()) {
                cleanedData[key as keyof ThirdPartyInfo] = value.trim();
            }
        });
        await onSave(cleanedData);
        setHasChanges(false);
    };

    return (
        <div className="third-party-form">
            <Card title="Other Driver Information">
                <Card.Content>
                    <div className="form-grid">
                        <div className="form-field">
                            <label>Driver Name</label>
                            <TextInput
                                value={formData.otherDriverName || ''}
                                onChange={(e) => handleChange('otherDriverName', e.target.value)}
                                placeholder="Full name"
                            />
                        </div>
                        <div className="form-field">
                            <label>Phone Number</label>
                            <TextInput
                                type="tel"
                                value={formData.otherDriverPhone || ''}
                                onChange={(e) => handleChange('otherDriverPhone', e.target.value)}
                                placeholder="(555) 123-4567"
                            />
                        </div>
                        <div className="form-field">
                            <label>Insurance Company</label>
                            <TextInput
                                value={formData.otherDriverInsurance || ''}
                                onChange={(e) => handleChange('otherDriverInsurance', e.target.value)}
                                placeholder="Insurance company name"
                            />
                        </div>
                        <div className="form-field">
                            <label>Policy Number</label>
                            <TextInput
                                value={formData.otherDriverPolicyNumber || ''}
                                onChange={(e) => handleChange('otherDriverPolicyNumber', e.target.value)}
                                placeholder="Policy #"
                            />
                        </div>
                    </div>
                </Card.Content>
            </Card>

            <Card title="Other Vehicle Information">
                <Card.Content>
                    <div className="form-grid">
                        <div className="form-field">
                            <label>Make</label>
                            <TextInput
                                value={formData.otherVehicleMake || ''}
                                onChange={(e) => handleChange('otherVehicleMake', e.target.value)}
                                placeholder="e.g., Toyota"
                            />
                        </div>
                        <div className="form-field">
                            <label>Model</label>
                            <TextInput
                                value={formData.otherVehicleModel || ''}
                                onChange={(e) => handleChange('otherVehicleModel', e.target.value)}
                                placeholder="e.g., Camry"
                            />
                        </div>
                        <div className="form-field">
                            <label>License Plate</label>
                            <TextInput
                                value={formData.otherVehiclePlate || ''}
                                onChange={(e) => handleChange('otherVehiclePlate', e.target.value)}
                                placeholder="ABC 1234"
                            />
                        </div>
                    </div>
                </Card.Content>
            </Card>

            <Card title="Additional Information">
                <Card.Content>
                    <div className="form-section">
                        <label className="form-label">Witnesses</label>
                        <Textarea
                            value={formData.witnesses || ''}
                            onChange={(e) => handleChange('witnesses', e.target.value)}
                            placeholder="Names and contact information of any witnesses..."
                            rows={3}
                        />
                    </div>

                    <div className="form-field">
                        <label>Police Report Number</label>
                        <TextInput
                            value={formData.policeReportNumber || ''}
                            onChange={(e) => handleChange('policeReportNumber', e.target.value)}
                            placeholder="Report #"
                        />
                    </div>

                    <div className="form-section">
                        <label className="form-label">Additional Notes</label>
                        <Textarea
                            value={formData.additionalNotes || ''}
                            onChange={(e) => handleChange('additionalNotes', e.target.value)}
                            placeholder="Any other relevant information..."
                            rows={4}
                        />
                    </div>

                    <div className="form-actions">
                        <Button
                            type="primary"
                            onClick={handleSave}
                            disabled={isSaving || !hasChanges}
                        >
                            {isSaving ? 'Saving...' : 'Save Information'}
                        </Button>
                    </div>
                </Card.Content>
            </Card>
        </div>
    );
};
