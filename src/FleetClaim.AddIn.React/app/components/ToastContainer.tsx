import React from 'react';
import { IconClose } from '@geotab/zenith';
import { Toast } from '@/hooks';

interface ToastContainerProps {
    toasts: Toast[];
    onRemove: (id: string) => void;
}

const toastIcons: Record<Toast['type'], string> = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
    if (toasts.length === 0) return null;

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <div 
                    key={toast.id} 
                    className={`toast toast-${toast.type}`}
                    onClick={() => onRemove(toast.id)}
                >
                    <span className="toast-icon">{toastIcons[toast.type]}</span>
                    <span className="toast-message">{toast.message}</span>
                    <button
                        className="toast-close-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove(toast.id);
                        }}
                        aria-label="Close"
                    >
                        <IconClose />
                    </button>
                </div>
            ))}
        </div>
    );
};
