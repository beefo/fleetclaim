import React from 'react';
import { Toast } from '@/hooks';

interface ToastContainerProps {
    toasts: Toast[];
    onRemove: (id: string) => void;
}

const toastIcons: Record<Toast['type'], string> = {
    success: '\u2705',
    error: '\u274C',
    warning: '\u26A0\uFE0F',
    info: '\u2139\uFE0F'
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
                        className="toast-close"
                        onClick={(e) => { e.stopPropagation(); onRemove(toast.id); }}
                    >
                        \u2715
                    </button>
                </div>
            ))}
        </div>
    );
};
