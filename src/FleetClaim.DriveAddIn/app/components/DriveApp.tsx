/**
 * DriveApp - Root component for the Drive Add-In
 * Wizard flow controller with step navigation
 */

import React, { useState, useCallback } from 'react';
import { Button } from '@geotab/zenith';
import { useDrive } from '@/contexts';
import { useSubmission, useOnlineStatus, useToast } from '@/hooks';
import { syncSubmission } from '@/services/syncService';
import { SafetyScreen } from './SafetyScreen';
import { IncidentBasicsStep } from './IncidentBasicsStep';
import { DamageAssessmentStep } from './DamageAssessmentStep';
import { PhotoCaptureStep } from './PhotoCaptureStep';
import { ThirdPartyStep } from './ThirdPartyStep';
import { ReviewSubmitStep } from './ReviewSubmitStep';
import { SubmissionsList } from './SubmissionsList';
import { SyncStatusBanner } from './SyncStatusBanner';
import { ToastContainer } from './ToastContainer';

type View = 'safety' | 'wizard' | 'list' | 'submitted';

const STEP_LABELS = ['Basics', 'Damage', 'Photos', 'Third Party', 'Review'];

export const DriveApp: React.FC = () => {
    const { currentDevice, currentDriver, api, credentials, geotabHost, isOnline } = useDrive();
    const deviceId = currentDevice?.id || 'unknown';
    const deviceName = currentDevice?.name || 'Unknown Vehicle';

    const { submission, startNew, update, markPendingSync, discard, resume } = useSubmission(deviceId, deviceName);
    const toast = useToast();
    const [view, setView] = useState<View>('safety');
    const [wizardStep, setWizardStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { isOnline: online, syncNow } = useOnlineStatus((result) => {
        if (result.synced > 0) toast.success(`${result.synced} submission${result.synced > 1 ? 's' : ''} synced`);
        if (result.failed > 0) toast.warning(`${result.failed} submission${result.failed > 1 ? 's' : ''} failed to sync`);
    });

    const handleStartNew = useCallback(() => {
        startNew();
        setWizardStep(0);
        setView('wizard');
    }, [startNew]);

    const handleViewPast = useCallback(() => {
        setView('list');
    }, []);

    const handleResume = useCallback((id: string) => {
        resume(id);
        setWizardStep(0);
        setView('wizard');
    }, [resume]);

    const handleBack = useCallback(() => {
        if (wizardStep > 0) {
            setWizardStep(prev => prev - 1);
        } else {
            setView('safety');
        }
    }, [wizardStep]);

    const handleNext = useCallback(() => {
        if (wizardStep < STEP_LABELS.length - 1) {
            setWizardStep(prev => prev + 1);
        }
    }, [wizardStep]);

    const handleSubmit = useCallback(async () => {
        if (!submission || !api || !credentials) return;
        setIsSubmitting(true);
        try {
            // Mark as pending sync first
            markPendingSync();

            if (isOnline) {
                // Try immediate sync
                const success = await syncSubmission(api, credentials, geotabHost, submission.id);
                if (success) {
                    toast.success('Submission synced successfully');
                } else {
                    toast.warning('Saved locally. Will sync when possible.');
                }
            } else {
                toast.info('Saved locally. Will sync when online.');
            }

            setView('submitted');
        } catch (err) {
            toast.error('Failed to submit. Saved locally.');
        } finally {
            setIsSubmitting(false);
        }
    }, [submission, api, credentials, geotabHost, isOnline, markPendingSync, toast]);

    const handleSaveForLater = useCallback(() => {
        markPendingSync();
        toast.info('Saved locally. Will sync when online.');
        setView('submitted');
    }, [markPendingSync, toast]);

    const handleNewSubmission = useCallback(() => {
        setView('safety');
    }, []);

    return (
        <div className="drive-app">
            <SyncStatusBanner isOnline={online} syncNow={syncNow} />

            {view === 'safety' && (
                <SafetyScreen onContinue={handleStartNew} onViewPast={handleViewPast} />
            )}

            {view === 'list' && (
                <SubmissionsList onBack={() => setView('safety')} onResume={handleResume} />
            )}

            {view === 'wizard' && submission && (
                <div className="wizard-container">
                    {/* Progress bar */}
                    <div className="wizard-progress">
                        {STEP_LABELS.map((label, idx) => (
                            <div
                                key={label}
                                className={`progress-step ${idx === wizardStep ? 'active' : ''} ${idx < wizardStep ? 'completed' : ''}`}
                            >
                                <div className="progress-dot">{idx < wizardStep ? '\u2713' : idx + 1}</div>
                                <span className="progress-label">{label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Step content */}
                    {wizardStep === 0 && (
                        <IncidentBasicsStep submission={submission} onChange={update} />
                    )}
                    {wizardStep === 1 && (
                        <DamageAssessmentStep
                            assessment={submission.damageAssessment}
                            onChange={(assessment) => update({ damageAssessment: assessment })}
                        />
                    )}
                    {wizardStep === 2 && (
                        <PhotoCaptureStep
                            photos={submission.photos}
                            onPhotosChange={(photos) => update({ photos, pendingPhotoUploads: photos.filter(p => !p.mediaFileId).length })}
                        />
                    )}
                    {wizardStep === 3 && (
                        <ThirdPartyStep submission={submission} onChange={update} />
                    )}
                    {wizardStep === 4 && (
                        <ReviewSubmitStep
                            submission={submission}
                            onSubmit={handleSubmit}
                            onSaveForLater={handleSaveForLater}
                            isSubmitting={isSubmitting}
                        />
                    )}

                    {/* Navigation */}
                    <div className="wizard-nav">
                        <Button type="tertiary" onClick={handleBack}>
                            {wizardStep === 0 ? 'Cancel' : 'Back'}
                        </Button>
                        {wizardStep < STEP_LABELS.length - 1 && (
                            <Button type="primary" onClick={handleNext}>
                                {wizardStep === 3 ? 'Review' : 'Next'}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {view === 'submitted' && (
                <div className="submitted-screen">
                    <div className="submitted-icon">&#x2705;</div>
                    <h2>Submission Complete</h2>
                    <p>Your incident report has been {isOnline ? 'submitted' : 'saved and will sync when online'}.</p>
                    <div className="submitted-actions">
                        <Button type="primary" onClick={handleNewSubmission}>
                            New Submission
                        </Button>
                        <Button type="tertiary" onClick={handleViewPast}>
                            View All Submissions
                        </Button>
                    </div>
                </div>
            )}

            <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
        </div>
    );
};
