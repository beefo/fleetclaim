import React, { useState, useCallback, useRef } from 'react';
import { Button, Card, Select, Banner, Modal } from '@geotab/zenith';
import { Photo } from '@/types';
import { useGeotab } from '@/contexts';
import { uploadPhoto, getThumbnailUrl, getFullImageUrl, deletePhoto as deletePhotoApi, formatPhotoCategory } from '@/services';

interface PhotosSectionProps {
    photos: Photo[];
    reportId: string;
    deviceId: string;
    onUpdate: (photos: Photo[]) => Promise<void>;
    toast: {
        success: (msg: string) => void;
        error: (msg: string) => void;
        info: (msg: string) => void;
    };
}

type PhotoCategory = 'damage' | 'scene' | 'other';

export const PhotosSection: React.FC<PhotosSectionProps> = ({
    photos,
    reportId,
    deviceId,
    onUpdate,
    toast
}) => {
    const { session, api, state, credentials, geotabHost, captureCredentials } = useGeotab();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Get database from session or state fallback
    const database = session?.database || (state?.getState() as any)?.database || '';
    
    // Debug logging for credentials
    console.log('[PhotosSection] render - credentials:', credentials ? {
        database: credentials.database,
        userName: credentials.userName,
        hasSessionId: !!credentials.sessionId
    } : 'null', 'photos:', photos.length);
    const [selectedCategory, setSelectedCategory] = useState<PhotoCategory>('damage');
    const [isUploading, setIsUploading] = useState(false);
    const [viewingPhoto, setViewingPhoto] = useState<Photo | null>(null);
    const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

    const handleUploadClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        console.log('[PhotosSection] handleFileChange called, files:', files?.length);
        if (!files || files.length === 0) return;
        
        console.log('[PhotosSection] database value:', database);
        console.log('[PhotosSection] credentials:', credentials);
        console.log('[PhotosSection] geotabHost:', geotabHost);
        
        if (!database) {
            toast.error('Database not available. Please refresh the page.');
            console.error('[PhotosSection] database is empty, aborting upload');
            return;
        }

        setIsUploading(true);
        toast.info('Uploading photo...');

        try {
            if (!api) {
                throw new Error('Geotab API not available');
            }
            
            // Ensure we have credentials for upload
            // If not yet captured, capture them now (after API warmup from earlier calls)
            let uploadCredentials = credentials;
            let uploadHost = geotabHost;
            
            if (!uploadCredentials || !uploadCredentials.sessionId) {
                console.log('[PhotosSection] Credentials not captured, attempting capture...');
                try {
                    await captureCredentials();
                    // Note: this updates state, but we need to wait for re-render
                    // So we'll call getSession directly for this upload
                    const freshSession = await new Promise<any>((resolve, reject) => {
                        api.getSession((s: any) => resolve(s), reject);
                    });
                    uploadCredentials = {
                        database: freshSession.database,
                        userName: freshSession.userName,
                        sessionId: freshSession.sessionId
                    };
                    if (freshSession.server) {
                        uploadHost = freshSession.server.startsWith('http') 
                            ? new URL(freshSession.server).hostname 
                            : freshSession.server;
                    }
                } catch (credErr) {
                    console.error('[PhotosSection] Failed to capture credentials:', credErr);
                    throw new Error('Could not get session credentials. Please try again.');
                }
            }
            
            if (!uploadCredentials || !uploadCredentials.sessionId) {
                throw new Error('Session credentials not available. Please refresh the page.');
            }
            
            const file = files[0];
            const result = await uploadPhoto(
                api,
                uploadCredentials,
                uploadHost,
                file,
                deviceId,
                reportId,
                selectedCategory
            );

            const updatedPhotos = [...photos, result.photo];
            await onUpdate(updatedPhotos);
            toast.success('Photo uploaded');
        } catch (err) {
            console.error('[PhotosSection] Upload error:', err);
            toast.error(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setIsUploading(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }, [api, credentials, geotabHost, captureCredentials, database, deviceId, reportId, selectedCategory, photos, onUpdate, toast]);

    const handleDeletePhoto = useCallback(async (photo: Photo) => {
        if (!api || !confirm('Delete this photo?')) return;

        setDeletingPhotoId(photo.id);

        try {
            await deletePhotoApi(api, photo.mediaFileId);
            const updatedPhotos = photos.filter(p => p.id !== photo.id);
            await onUpdate(updatedPhotos);
            toast.success('Photo deleted');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete photo');
        } finally {
            setDeletingPhotoId(null);
        }
    }, [api, photos, onUpdate, toast]);

    const handleViewPhoto = useCallback((photo: Photo) => {
        setViewingPhoto(photo);
    }, []);

    const groupedPhotos = React.useMemo(() => {
        const groups: Record<PhotoCategory, Photo[]> = {
            damage: [],
            scene: [],
            other: []
        };

        photos.forEach(photo => {
            const category = photo.category as PhotoCategory || 'other';
            if (groups[category]) {
                groups[category].push(photo);
            } else {
                groups.other.push(photo);
            }
        });

        return groups;
    }, [photos]);

    return (
        <div className="photos-section">
            {/* Upload controls */}
            <Card title="Upload Photos">
                <Card.Content>
                    <div className="upload-controls">
                        <div className="category-select">
                            <Select
                                title="Category"
                                value={selectedCategory}
                                onChange={(id) => setSelectedCategory((id || 'damage') as PhotoCategory)}
                                items={[
                                    { id: 'damage', children: 'Vehicle Damage' },
                                    { id: 'scene', children: 'Accident Scene' },
                                    { id: 'other', children: 'Other' }
                                ] as any}
                            />
                        </div>
                        <Button
                            type="primary"
                            onClick={handleUploadClick}
                            disabled={isUploading}
                        >
                            {isUploading ? 'Uploading...' : '📷 Upload Photo'}
                        </Button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                        />
                    </div>
                </Card.Content>
            </Card>

            {/* Photo grid by category */}
            {Object.entries(groupedPhotos).map(([category, categoryPhotos]) => (
                categoryPhotos.length > 0 && (
                    <Card key={category} title={formatPhotoCategory(category)}>
                        <Card.Content>
                            <div className="photos-grid">
                                {categoryPhotos.map(photo => (
                                    <div key={photo.id} className="photo-item">
                                        <div 
                                            className="photo-thumbnail"
                                            onClick={() => handleViewPhoto(photo)}
                                        >
                                            {credentials?.sessionId ? (
                                                <img
                                                    src={getThumbnailUrl(photo.mediaFileId, credentials, geotabHost)}
                                                    alt={photo.fileName}
                                                    loading="lazy"
                                                    onError={(e) => {
                                                        console.log('[PhotosSection] Thumbnail load error for:', photo.mediaFileId);
                                                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23ccc" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%23666">📷</text></svg>';
                                                    }}
                                                />
                                            ) : (
                                                <div className="photo-thumbnail-loading">
                                                    <span>⏳</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="photo-info">
                                            <span className="photo-name" title={photo.fileName}>
                                                {photo.fileName.length > 20 
                                                    ? photo.fileName.substring(0, 17) + '...' 
                                                    : photo.fileName}
                                            </span>
                                            <Button
                                                type="tertiary"
                                                
                                                onClick={() => handleDeletePhoto(photo)}
                                                disabled={deletingPhotoId === photo.id}
                                            >
                                                {deletingPhotoId === photo.id ? '...' : '🗑️'}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card.Content>
                    </Card>
                )
            ))}

            {photos.length === 0 && (
                <Banner type="info" header="No Photos">
                    Upload photos of vehicle damage, the accident scene, or other relevant evidence.
                </Banner>
            )}

            {/* Photo viewer modal */}
            {viewingPhoto && credentials && (
                <Modal
                    isOpen={!!viewingPhoto}
                    onClose={() => setViewingPhoto(null)}
                    title={viewingPhoto.fileName}
                    maxWidth="800px"
                >
                    <div className="photo-modal-content">
                        <img
                            src={getFullImageUrl(viewingPhoto.mediaFileId, credentials, geotabHost)}
                            alt={viewingPhoto.fileName}
                            className="photo-modal-image"
                        />
                        <div className="photo-modal-info">
                            <span>{formatPhotoCategory(viewingPhoto.category)}</span>
                            <span>{new Date(viewingPhoto.uploadedAt).toLocaleString()}</span>
                        </div>
                    </div>
                    <Modal.SecondaryButton onClick={() => setViewingPhoto(null)}>
                        Close
                    </Modal.SecondaryButton>
                </Modal>
            )}
        </div>
    );
};
