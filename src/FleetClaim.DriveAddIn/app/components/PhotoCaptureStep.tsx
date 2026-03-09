import React, { useState, useCallback } from 'react';
import { Button, Card } from '@geotab/zenith';
import { SubmissionPhoto } from '@/types';
import { useCamera } from '@/hooks';
import { deletePhotoData } from '@/services/storageService';

interface PhotoCaptureStepProps {
    photos: SubmissionPhoto[];
    onPhotosChange: (photos: SubmissionPhoto[]) => void;
}

type PhotoCategory = 'damage' | 'scene' | 'other';

const categoryLabels: Record<PhotoCategory, string> = {
    damage: 'Vehicle Damage',
    scene: 'Accident Scene',
    other: 'Other'
};

export const PhotoCaptureStep: React.FC<PhotoCaptureStepProps> = ({ photos, onPhotosChange }) => {
    const { capturePhoto } = useCamera();
    const [selectedCategory, setSelectedCategory] = useState<PhotoCategory>('damage');
    const [isCapturing, setIsCapturing] = useState(false);

    const handleCapture = useCallback(async () => {
        setIsCapturing(true);
        try {
            const photo = await capturePhoto(selectedCategory);
            if (photo) {
                onPhotosChange([...photos, photo]);
            }
        } finally {
            setIsCapturing(false);
        }
    }, [capturePhoto, selectedCategory, photos, onPhotosChange]);

    const handleDelete = useCallback(async (localId: string) => {
        await deletePhotoData(localId);
        onPhotosChange(photos.filter(p => p.localId !== localId));
    }, [photos, onPhotosChange]);

    return (
        <div className="drive-step">
            <h3 className="step-title">Photos</h3>

            <Card title="Capture Photos" autoHeight>
                <Card.Content>
                    <div className="form-field">
                        <label className="form-label">Photo Category</label>
                        <div className="category-selector">
                            {(Object.keys(categoryLabels) as PhotoCategory[]).map(cat => (
                                <label
                                    key={cat}
                                    className={`category-option ${selectedCategory === cat ? 'selected' : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="photoCategory"
                                        value={cat}
                                        checked={selectedCategory === cat}
                                        onChange={() => setSelectedCategory(cat)}
                                    />
                                    {categoryLabels[cat]}
                                </label>
                            ))}
                        </div>
                    </div>

                    <Button
                        type="primary"
                        onClick={handleCapture}
                        disabled={isCapturing}
                    >
                        {isCapturing ? 'Capturing...' : 'Take Photo'}
                    </Button>
                </Card.Content>
            </Card>

            {photos.length > 0 && (
                <Card title={`Photos (${photos.length})`} autoHeight>
                    <Card.Content>
                        <div className="photo-grid-mobile">
                            {photos.map(photo => (
                                <div key={photo.localId} className="photo-card-mobile">
                                    {photo.base64Data ? (
                                        <img src={photo.base64Data} alt={photo.category} className="photo-thumb-mobile" />
                                    ) : (
                                        <div className="photo-placeholder-mobile">Uploaded</div>
                                    )}
                                    <div className="photo-meta-mobile">
                                        <span className="photo-category-label">{categoryLabels[photo.category]}</span>
                                        <button
                                            className="photo-delete-btn"
                                            onClick={() => handleDelete(photo.localId)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card.Content>
                </Card>
            )}
        </div>
    );
};
