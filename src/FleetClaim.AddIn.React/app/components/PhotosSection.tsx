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
    const database = session?.database || (state?.getState() as any)?.database || '';
    
    const [selectedCategory, setSelectedCategory] = useState<PhotoCategory>('damage');
    const [isUploading, setIsUploading] = useState(false);
    const [viewingPhoto, setViewingPhoto] = useState<Photo | null>(null);
    const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

    const handleUploadClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        if (!database) {
            toast.error('Database not available. Please refresh the page.');
            return;
        }

        setIsUploading(true);
        toast.info('Uploading photo...');

        try {
            if (!api) throw new Error('Geotab API not available');
            
            let uploadCredentials = credentials;
            let uploadHost = geotabHost;
            
            if (!uploadCredentials || !uploadCredentials.sessionId) {
                try {
                    await captureCredentials();
                    // NOTE: getSession signature is getSession(callback, newSession?) where newSession is a BOOLEAN!
                    // Passing a function as second arg causes logout/MethodNotSupported error
                    const freshSession = await new Promise<any>((resolve, reject) => {
                        try {
                            api.getSession((s: any) => resolve(s));
                        } catch (e) {
                            reject(e);
                        }
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
                    throw new Error('Could not get session credentials. Please try again.');
                }
            }
            
            if (!uploadCredentials || !uploadCredentials.sessionId) {
                throw new Error('Session credentials not available. Please refresh.');
            }
            
            const file = files[0];
            const result = await uploadPhoto(api, uploadCredentials, uploadHost, file, deviceId, reportId, selectedCategory);
            const updatedPhotos = [...photos, result.photo];
            await onUpdate(updatedPhotos);
            toast.success('Photo uploaded');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [api, credentials, geotabHost, captureCredentials, database, deviceId, reportId, selectedCategory, photos, onUpdate, toast]);

    const handleDeletePhoto = useCallback(async (photo: Photo) => {
        if (!api || !confirm('Delete this photo?')) return;
        setDeletingPhotoId(photo.id);
        try {
            await deletePhotoApi(api, photo.mediaFileId);
            await onUpdate(photos.filter(p => p.id !== photo.id));
            toast.success('Photo deleted');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete');
        } finally {
            setDeletingPhotoId(null);
        }
    }, [api, photos, onUpdate, toast]);

    const groupedPhotos = React.useMemo(() => {
        const groups: Record<PhotoCategory, Photo[]> = { damage: [], scene: [], other: [] };
        photos.forEach(photo => {
            const cat = (photo.category as PhotoCategory) || 'other';
            (groups[cat] || groups.other).push(photo);
        });
        return groups;
    }, [photos]);

    return (
        <div className="photos-grid">
            {/* LEFT COLUMN - Upload */}
            <div className="photos-upload">
                <Card title="Upload Photos" autoHeight>
                    <Card.Content>
                        <div className="form-field">
                            <label className="form-label">Category</label>
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
                        <Button type="primary" onClick={handleUploadClick} disabled={isUploading}>
                            {isUploading ? 'Uploading...' : '📷 Upload Photo'}
                        </Button>
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                    </Card.Content>
                </Card>

                {photos.length === 0 && (
                    <Banner type="info" header="No Photos">
                        Upload photos of damage, scene, or other evidence.
                    </Banner>
                )}
            </div>

            {/* RIGHT COLUMN - Photo Gallery */}
            <div className="photos-gallery">
                {Object.entries(groupedPhotos).map(([category, categoryPhotos]) => (
                    categoryPhotos.length > 0 && (
                        <Card key={category} title={`${formatPhotoCategory(category)} (${categoryPhotos.length})`} autoHeight>
                            <Card.Content>
                                <div className="photo-thumbnails">
                                    {categoryPhotos.map(photo => (
                                        <div key={photo.id} className="photo-item">
                                            <div className="photo-thumb" onClick={() => setViewingPhoto(photo)}>
                                                <img
                                                    src={credentials?.sessionId 
                                                        ? getThumbnailUrl(photo.mediaFileId, credentials, geotabHost)
                                                        : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f5f5f5" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%23999" font-size="40">📷</text></svg>'
                                                    }
                                                    alt={photo.fileName}
                                                    loading="lazy"
                                                    onError={(e) => {
                                                        const img = e.target as HTMLImageElement;
                                                        // Prevent infinite loop
                                                        if (!img.dataset.errorHandled) {
                                                            img.dataset.errorHandled = 'true';
                                                            img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23eee" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%23999" font-size="40">📷</text></svg>';
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div className="photo-meta">
                                                <span className="photo-name" title={photo.fileName}>
                                                    {photo.fileName.length > 15 ? photo.fileName.substring(0, 12) + '...' : photo.fileName}
                                                </span>
                                                <button
                                                    className="photo-delete"
                                                    onClick={() => handleDeletePhoto(photo)}
                                                    disabled={deletingPhotoId === photo.id}
                                                    title="Delete"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card.Content>
                        </Card>
                    )
                ))}
            </div>

            {/* Photo viewer modal */}
            {viewingPhoto && credentials && (
                <Modal isOpen={!!viewingPhoto} onClose={() => setViewingPhoto(null)} title={viewingPhoto.fileName} maxWidth="800px">
                    <div style={{ textAlign: 'center' }}>
                        <img
                            src={getFullImageUrl(viewingPhoto.mediaFileId, credentials, geotabHost)}
                            alt={viewingPhoto.fileName}
                            style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '4px' }}
                        />
                        <div style={{ marginTop: '12px', color: '#666', fontSize: '13px' }}>
                            <span>{formatPhotoCategory(viewingPhoto.category)}</span>
                            <span style={{ margin: '0 8px' }}>•</span>
                            <span>{new Date(viewingPhoto.uploadedAt).toLocaleString()}</span>
                        </div>
                    </div>
                    <Modal.SecondaryButton onClick={() => setViewingPhoto(null)}>Close</Modal.SecondaryButton>
                </Modal>
            )}
        </div>
    );
};
