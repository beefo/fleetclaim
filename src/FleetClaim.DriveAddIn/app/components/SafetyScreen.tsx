import React from 'react';
import { Button, Card } from '@geotab/zenith';

interface SafetyScreenProps {
    onContinue: () => void;
    onViewPast: () => void;
}

export const SafetyScreen: React.FC<SafetyScreenProps> = ({ onContinue, onViewPast }) => {
    return (
        <div className="drive-safety-screen">
            <Card autoHeight>
                <Card.Content>
                    <div className="safety-content">
                        <div className="safety-icon">&#x1F6D1;</div>
                        <h2 className="safety-title">Safety First</h2>
                        <p className="safety-text">
                            If anyone needs medical attention or there is immediate danger, call emergency services first.
                        </p>
                        <Button
                            type="primary-destructive"
                            onClick={() => window.open('tel:911', '_system')}
                            className="safety-call-btn"
                        >
                            Call 911
                        </Button>
                    </div>
                </Card.Content>
            </Card>

            <div className="safety-actions">
                <Button type="primary" onClick={onContinue}>
                    Everyone is safe &mdash; Report Incident
                </Button>
                <Button type="tertiary" onClick={onViewPast}>
                    View Past Submissions
                </Button>
            </div>
        </div>
    );
};
