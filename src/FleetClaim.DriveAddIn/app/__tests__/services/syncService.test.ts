import { buildDriverSubmissionPayload } from '@/services/syncService';
import { createEmptySubmission } from '@/types';

describe('syncService payload mapping', () => {
    it('maps Drive-specific fields into worker-compatible fields', () => {
        const submission = createEmptySubmission('b1', 'Vehicle 001');
        submission.status = 'pending_sync';
        submission.severity = 'high';
        submission.notes = 'Driver notes';
        submission.damageAssessment = {
            damageLevel: 'total',
            description: 'Front end destroyed',
            estimatedRepairCost: 4500,
            isDriveable: false
        };
        submission.thirdPartyInfo = {
            otherDriverName: 'Other Driver',
            otherDriverInsurance: 'Insurer',
            witnesses: 'Saw collision',
            additionalNotes: 'Road was icy'
        };
        submission.photos = [{
            localId: 'photo-1',
            category: 'damage',
            capturedAt: new Date().toISOString(),
            mediaFileId: 'mf_123',
            fileName: 'damage.jpg',
            mimeType: 'image/jpeg'
        }];

        const payload = buildDriverSubmissionPayload(submission);

        expect(payload.damageLevel).toBe('totalLoss');
        expect(payload.damageDescription).toBe('Front end destroyed');
        expect(payload.vehicleDriveable).toBe(false);
        expect(payload.estimatedRepairCost).toBe(4500);
        expect(payload.otherDriverName).toBe('Other Driver');
        expect(payload.witnesses).toBe('Saw collision');
        expect(payload.notes).toContain('Driver notes');
        expect(payload.notes).toContain('Road was icy');
        expect(payload.photos).toEqual([
            expect.objectContaining({
                mediaFileId: 'mf_123',
                fileName: 'damage.jpg',
                category: 'vehicleDamage'
            })
        ]);
    });
});
