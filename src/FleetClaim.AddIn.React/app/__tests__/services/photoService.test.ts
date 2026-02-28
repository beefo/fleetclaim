/**
 * Tests for photoService
 */

import {
    getDownloadUrl,
    getThumbnailUrl,
    getFullImageUrl,
    deletePhoto,
    getMediaFile,
    formatPhotoCategory
} from '../../services/photoService';

// Mock credentials
const mockCredentials = {
    database: 'test_db',
    userName: 'test@example.com',
    sessionId: 'test-session-123'
};

describe('photoService', () => {
    describe('getDownloadUrl', () => {
        it('should build correct download URL with credentials', () => {
            const url = getDownloadUrl('media-123', mockCredentials, 'my.geotab.com');
            
            expect(url).toContain('https://my.geotab.com/apiv1/DownloadMediaFile');
            expect(url).toContain('mediaFile={"id":"media-123"}');
            expect(url).toContain('credentials=');
            expect(url).toContain('test_db');
            expect(url).toContain('test-session-123');
        });

        it('should URL-encode special characters in credentials', () => {
            const credsWithSpecialChars = {
                database: 'test_db',
                userName: 'user+test@example.com',
                sessionId: 'session/with=special'
            };
            
            const url = getDownloadUrl('media-123', credsWithSpecialChars, 'my.geotab.com');
            
            expect(url).toContain(encodeURIComponent('user+test@example.com'));
            expect(url).toContain(encodeURIComponent('session/with=special'));
        });

        it('should return placeholder SVG when credentials are null', () => {
            const url = getDownloadUrl('media-123', null, 'my.geotab.com');
            
            expect(url).toContain('data:image/svg+xml');
            expect(url).toContain('📷');
        });

        it('should return placeholder SVG when sessionId is missing', () => {
            const credsWithoutSession = {
                database: 'test_db',
                userName: 'test@example.com',
                sessionId: ''
            };
            
            const url = getDownloadUrl('media-123', credsWithoutSession, 'my.geotab.com');
            
            expect(url).toContain('data:image/svg+xml');
        });

        it('should return placeholder SVG when sessionId is undefined', () => {
            const credsWithUndefined = {
                database: 'test_db',
                userName: 'test@example.com',
                sessionId: undefined as any
            };
            
            const url = getDownloadUrl('media-123', credsWithUndefined, 'my.geotab.com');
            
            expect(url).toContain('data:image/svg+xml');
        });

        it('should return valid URL when all credentials present', () => {
            const validCreds = {
                database: 'test_db',
                userName: 'test@example.com',
                sessionId: 'valid-session-id'
            };
            
            const url = getDownloadUrl('media-123', validCreds, 'my.geotab.com');
            
            expect(url).not.toContain('data:image/svg+xml');
            expect(url).toContain('DownloadMediaFile');
            expect(url).toContain('valid-session-id');
        });

        it('should use default host when not specified', () => {
            const url = getDownloadUrl('media-123', mockCredentials);
            
            expect(url).toContain('my.geotab.com');
        });
    });

    describe('getThumbnailUrl', () => {
        it('should return same URL as getDownloadUrl', () => {
            const downloadUrl = getDownloadUrl('media-123', mockCredentials, 'my.geotab.com');
            const thumbnailUrl = getThumbnailUrl('media-123', mockCredentials, 'my.geotab.com');
            
            expect(thumbnailUrl).toBe(downloadUrl);
        });
    });

    describe('getFullImageUrl', () => {
        it('should return same URL as getDownloadUrl', () => {
            const downloadUrl = getDownloadUrl('media-123', mockCredentials, 'my.geotab.com');
            const fullImageUrl = getFullImageUrl('media-123', mockCredentials, 'my.geotab.com');
            
            expect(fullImageUrl).toBe(downloadUrl);
        });
    });

    describe('formatPhotoCategory', () => {
        it('should format damage category', () => {
            expect(formatPhotoCategory('damage')).toBe('🚗 Vehicle Damage');
        });

        it('should format scene category', () => {
            expect(formatPhotoCategory('scene')).toBe('📍 Accident Scene');
        });

        it('should format other category', () => {
            expect(formatPhotoCategory('other')).toBe('📎 Other');
        });

        it('should return original string for unknown category', () => {
            expect(formatPhotoCategory('unknown')).toBe('unknown');
        });
    });

    describe('deletePhoto', () => {
        it('should call api.call with Remove method', async () => {
            const mockApi = {
                call: jest.fn((method, params, resolve, reject) => {
                    resolve();
                })
            };

            await deletePhoto(mockApi as any, 'media-123');

            expect(mockApi.call).toHaveBeenCalledWith(
                'Remove',
                {
                    typeName: 'MediaFile',
                    entity: { id: 'media-123' }
                },
                expect.any(Function),
                expect.any(Function)
            );
        });

        it('should reject when api.call fails', async () => {
            const mockApi = {
                call: jest.fn((method, params, resolve, reject) => {
                    reject(new Error('Delete failed'));
                })
            };

            await expect(deletePhoto(mockApi as any, 'media-123')).rejects.toThrow('Delete failed');
        });
    });

    describe('getMediaFile', () => {
        it('should call api.call with Get method', async () => {
            const mockMediaFile = {
                id: 'media-123',
                name: 'test.jpg',
                mediaType: 'Image'
            };

            const mockApi = {
                call: jest.fn((method, params, resolve, reject) => {
                    resolve([mockMediaFile]);
                })
            };

            const result = await getMediaFile(mockApi as any, 'media-123');

            expect(mockApi.call).toHaveBeenCalledWith(
                'Get',
                {
                    typeName: 'MediaFile',
                    search: { id: 'media-123' }
                },
                expect.any(Function),
                expect.any(Function)
            );
            expect(result).toEqual(mockMediaFile);
        });

        it('should return null when no media file found', async () => {
            const mockApi = {
                call: jest.fn((method, params, resolve, reject) => {
                    resolve([]);
                })
            };

            const result = await getMediaFile(mockApi as any, 'media-123');

            expect(result).toBeNull();
        });

        it('should reject when api.call fails', async () => {
            const mockApi = {
                call: jest.fn((method, params, resolve, reject) => {
                    reject(new Error('Get failed'));
                })
            };

            await expect(getMediaFile(mockApi as any, 'media-123')).rejects.toThrow('Get failed');
        });
    });
});
