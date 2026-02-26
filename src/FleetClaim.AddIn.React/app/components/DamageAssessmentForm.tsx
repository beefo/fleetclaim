import React, { useState, useEffect } from 'react';
import { Button, Card, ToggleButton, TextInput, Textarea, RadioGroup, IRadio } from '@geotab/zenith';
import { DamageAssessment } from '@/types';

interface DamageAssessmentFormProps {
    assessment?: DamageAssessment;
    onSave: (assessment: DamageAssessment) => Promise<void>;
    isSaving: boolean;
}

type DamageLevel = 'none' | 'minor' | 'moderate' | 'severe' | 'total';

const damageLevelOptions: { value: DamageLevel; label: string; description: string }[] = [
    { value: 'none', label: 'None', description: 'No visible damage' },
    { value: 'minor', label: 'Minor', description: 'Cosmetic damage only (scratches, small dents)' },
    { value: 'moderate', label: 'Moderate', description: 'Significant damage but vehicle is operational' },
    { value: 'severe', label: 'Severe', description: 'Major damage affecting vehicle function' },
    { value: 'total', label: 'Total Loss', description: 'Vehicle is not economically repairable' }
];

export const DamageAssessmentForm: React.FC<DamageAssessmentFormProps> = ({
    assessment,
    onSave,
    isSaving
}) => {
    const [damageLevel, setDamageLevel] = useState<DamageLevel>(assessment?.damageLevel || 'none');
    const [description, setDescription] = useState(assessment?.description || '');
    const [estimatedRepairCost, setEstimatedRepairCost] = useState<string>(
        assessment?.estimatedRepairCost?.toString() || ''
    );
    const [isDriveable, setIsDriveable] = useState(assessment?.isDriveable ?? true);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        // Check if form has changed from original
        const changed = 
            damageLevel !== (assessment?.damageLevel || 'none') ||
            description !== (assessment?.description || '') ||
            estimatedRepairCost !== (assessment?.estimatedRepairCost?.toString() || '') ||
            isDriveable !== (assessment?.isDriveable ?? true);
        setHasChanges(changed);
    }, [damageLevel, description, estimatedRepairCost, isDriveable, assessment]);

    const handleSave = async () => {
        const newAssessment: DamageAssessment = {
            damageLevel,
            description: description.trim() || undefined,
            estimatedRepairCost: estimatedRepairCost ? parseFloat(estimatedRepairCost) : undefined,
            isDriveable
        };
        await onSave(newAssessment);
        setHasChanges(false);
    };

    return (
        <div className="damage-assessment-form">
            <Card title="Damage Assessment">
                <Card.Content>
                    <div className="form-section">
                        <label className="form-label">Damage Level</label>
                        <RadioGroup
                            name="damageLevel"
                            value={damageLevel}
                            direction="vertical"
                            items={damageLevelOptions.map(option => ({
                                value: option.value,
                                title: `${option.label} - ${option.description}`
                            } as IRadio))}
                            onChange={(e) => setDamageLevel(e.target.value as DamageLevel)}
                        />
                    </div>

                    <div className="form-section">
                        <label className="form-label">Damage Description</label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe the damage in detail..."
                            rows={4}
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-section form-section-half">
                            <label className="form-label">Estimated Repair Cost ($)</label>
                            <TextInput
                                type="number"
                                value={estimatedRepairCost}
                                onChange={(e) => setEstimatedRepairCost(e.target.value)}
                                placeholder="0.00"
                                min={0}
                            />
                        </div>

                        <div className="form-section form-section-half">
                            <label className="form-label">Vehicle Driveable</label>
                            <div className="toggle-row">
                                <ToggleButton
                                    checked={isDriveable}
                                    onChange={() => setIsDriveable(!isDriveable)}
                                />
                                <span className="toggle-label-text">
                                    {isDriveable ? 'Yes, vehicle can be driven' : 'No, vehicle cannot be driven'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="form-actions">
                        <Button
                            type="primary"
                            onClick={handleSave}
                            disabled={isSaving || !hasChanges}
                        >
                            {isSaving ? 'Saving...' : 'Save Assessment'}
                        </Button>
                    </div>
                </Card.Content>
            </Card>
        </div>
    );
};
