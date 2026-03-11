import {
    saveSubmission,
    loadSubmission,
    deleteSubmission,
    getAllSubmissions,
    getSubmissionIndex,
    getActiveSubmissionId,
    setActiveSubmission,
    clearActiveSubmission,
    getPendingSyncSubmissions,
    SUBMISSIONS_CHANGED_EVENT
} from '@/services/storageService';
import { DriverSubmission, createEmptySubmission } from '@/types';

describe('storageService', () => {
    describe('saveSubmission / loadSubmission', () => {
        it('should save and load a submission', () => {
            const sub = createEmptySubmission('b1', 'Vehicle 001');
            sub.description = 'Test incident';

            saveSubmission(sub);
            const loaded = loadSubmission(sub.id);

            expect(loaded).not.toBeNull();
            expect(loaded!.id).toBe(sub.id);
            expect(loaded!.description).toBe('Test incident');
            expect(loaded!.deviceName).toBe('Vehicle 001');
        });

        it('should add submission ID to the index', () => {
            const sub = createEmptySubmission('b1', 'Vehicle 001');
            saveSubmission(sub);

            const index = getSubmissionIndex();
            expect(index).toContain(sub.id);
        });

        it('should not duplicate IDs in index on re-save', () => {
            const sub = createEmptySubmission('b1', 'Vehicle 001');
            saveSubmission(sub);
            saveSubmission(sub);

            const index = getSubmissionIndex();
            expect(index.filter(id => id === sub.id).length).toBe(1);
        });

        it('should strip base64Data from photos before saving', () => {
            const sub = createEmptySubmission('b1', 'Vehicle 001');
            sub.photos = [{
                localId: 'p1',
                category: 'damage',
                capturedAt: new Date().toISOString(),
                base64Data: 'data:image/jpeg;base64,/9j/4AAQ...',
                mimeType: 'image/jpeg'
            }];

            saveSubmission(sub);
            const loaded = loadSubmission(sub.id);

            expect(loaded!.photos[0].base64Data).toBeUndefined();
            expect(loaded!.photos[0].localId).toBe('p1');
            expect(loaded!.photos[0].category).toBe('damage');
        });
    });

    describe('deleteSubmission', () => {
        it('should remove submission from storage and index', () => {
            const sub = createEmptySubmission('b1', 'Vehicle 001');
            saveSubmission(sub);
            deleteSubmission(sub.id);

            expect(loadSubmission(sub.id)).toBeNull();
            expect(getSubmissionIndex()).not.toContain(sub.id);
        });

        it('should clear active submission if deleting active', () => {
            const sub = createEmptySubmission('b1', 'Vehicle 001');
            saveSubmission(sub);
            setActiveSubmission(sub.id);
            deleteSubmission(sub.id);

            expect(getActiveSubmissionId()).toBeNull();
        });
    });

    describe('getAllSubmissions', () => {
        it('should return all saved submissions', () => {
            const sub1 = createEmptySubmission('b1', 'Vehicle 001');
            const sub2 = createEmptySubmission('b2', 'Vehicle 002');
            saveSubmission(sub1);
            saveSubmission(sub2);

            const all = getAllSubmissions();
            expect(all.length).toBe(2);
        });
    });

    describe('activeSubmission', () => {
        it('should track active submission ID', () => {
            setActiveSubmission('sub_123');
            expect(getActiveSubmissionId()).toBe('sub_123');
        });

        it('should clear active submission', () => {
            setActiveSubmission('sub_123');
            clearActiveSubmission();
            expect(getActiveSubmissionId()).toBeNull();
        });
    });

    describe('getPendingSyncSubmissions', () => {
        it('should return only pending_sync submissions', () => {
            const sub1 = createEmptySubmission('b1', 'Vehicle 001');
            sub1.status = 'pending_sync';
            const sub2 = createEmptySubmission('b2', 'Vehicle 002');
            sub2.status = 'draft';
            const sub3 = createEmptySubmission('b3', 'Vehicle 003');
            sub3.status = 'synced';

            saveSubmission(sub1);
            saveSubmission(sub2);
            saveSubmission(sub3);

            const pending = getPendingSyncSubmissions();
            expect(pending.length).toBe(1);
            expect(pending[0].id).toBe(sub1.id);
        });
    });

    describe('createEmptySubmission', () => {
        it('should create a submission with defaults', () => {
            const sub = createEmptySubmission('b1', 'Vehicle 001');

            expect(sub.id).toMatch(/^sub_/);
            expect(sub.deviceId).toBe('b1');
            expect(sub.deviceName).toBe('Vehicle 001');
            expect(sub.status).toBe('draft');
            expect(sub.photos).toEqual([]);
            expect(sub.pendingPhotoUploads).toBe(0);
        });
    });

    describe('submissions changed event', () => {
        it('should dispatch event when saving a submission', () => {
            const dispatchSpy = jest.spyOn(window, 'dispatchEvent');
            const sub = createEmptySubmission('b1', 'Vehicle 001');

            saveSubmission(sub);

            expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: SUBMISSIONS_CHANGED_EVENT }));
        });

        it('should dispatch event when deleting a submission', () => {
            const dispatchSpy = jest.spyOn(window, 'dispatchEvent');
            const sub = createEmptySubmission('b1', 'Vehicle 001');
            saveSubmission(sub);
            dispatchSpy.mockClear();

            deleteSubmission(sub.id);

            expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: SUBMISSIONS_CHANGED_EVENT }));
        });
    });
});
