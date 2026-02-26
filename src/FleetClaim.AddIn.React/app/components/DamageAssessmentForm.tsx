import React from 'react';
import { Card, ToggleButton } from '@geotab/zenith';
import { DamageAssessment } from '@/types';

interface DamageAssessmentFormProps {
    assessment?: DamageAssessment;
    onChange: (assessment: DamageAssessment) => void;
}

type DamageLevel = 'none' | 'minor' | 'moderate' | 'severe' | 'total';

const damageLevelOptions: { value: DamageLevel; label: string; description: string }[] = [
    { value: 'none', label: 'None', description: 'No visible damage' },
    { value: 'minor', label: 'Minor', description: 'Cosmetic only (scratches, small dents)' },
    { value: 'moderate', label: 'Moderate', description: 'Significant but vehicle operational' },
    { value: 'severe', label: 'Severe', description: 'Major damage affecting function' },
    { value: 'total', label: 'Total Loss', description: 'Not economically repairable' }
];

export const DamageAssessmentForm: React.FC<DamageAssessmentFormProps> = ({
    assessment = {},
    onChange
}) => {
    const handleChange = (field: keyof DamageAssessment, value: any) => {
        onChange({ ...assessment, [field]: value });
    };

    return (
        <div className="damage-form-grid">
            {/* LEFT COLUMN - Damage Level */}
            <Card title="Damage Level" autoHeight>
                <Card.Content>
                    <div className="damage-level-options">
                        {damageLevelOptions.map(option => (
                            <label 
                                key={option.value} 
                                className={`damage-level-option ${assessment.damageLevel === option.value ? 'selected' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="damageLevel"
                                    value={option.value}
                                    checked={assessment.damageLevel === option.value}
                                    onChange={() => handleChange('damageLevel', option.value)}
                                />
                                <div className="damage-level-content">
                                    <span className="damage-level-label">{option.label}</span>
                                    <span className="damage-level-desc">{option.description}</span>
                                </div>
                            </label>
                        ))}
                    </div>

                    <div className="form-field" style={{ marginTop: '16px' }}>
                        <label className="form-label">Estimated Repair Cost ($)</label>
                        <input
                            type="number"
                            className="form-input"
                            value={assessment.estimatedRepairCost || ''}
                            onChange={(e) => handleChange('estimatedRepairCost', e.target.value ? parseFloat(e.target.value) : undefined)}
                            placeholder="0.00"
                            min={0}
                        />
                    </div>

                    <div className="form-field">
                        <div className="toggle-row">
                            <ToggleButton
                                checked={assessment.isDriveable ?? true}
                                onChange={() => handleChange('isDriveable', !(assessment.isDriveable ?? true))}
                            />
                            <span style={{ marginLeft: '8px' }}>
                                {assessment.isDriveable !== false ? 'Vehicle is driveable' : 'Vehicle is NOT driveable'}
                            </span>
                        </div>
                    </div>
                </Card.Content>
            </Card>

            {/* RIGHT COLUMN - Description */}
            <Card title="Damage Description" autoHeight>
                <Card.Content>
                    <textarea
                        className="form-input"
                        value={assessment.description || ''}
                        onChange={(e) => handleChange('description', e.target.value)}
                        placeholder="Describe the damage in detail. Include affected areas, extent of damage, and any observations that may be relevant for insurance claims..."
                        rows={8}
                    />
                </Card.Content>
            </Card>
        </div>
    );
};
