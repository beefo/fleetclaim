import { renderHook, act } from '@testing-library/react';
import { useToast } from '@/hooks/useToast';

describe('useToast', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    
    afterEach(() => {
        jest.useRealTimers();
    });
    
    it('should add a toast', () => {
        const { result } = renderHook(() => useToast());
        
        act(() => {
            result.current.addToast('Test message', 'info');
        });
        
        expect(result.current.toasts).toHaveLength(1);
        expect(result.current.toasts[0].message).toBe('Test message');
        expect(result.current.toasts[0].type).toBe('info');
    });
    
    it('should remove toast after duration', () => {
        const { result } = renderHook(() => useToast());
        
        act(() => {
            result.current.addToast('Test message', 'info', 3000);
        });
        
        expect(result.current.toasts).toHaveLength(1);
        
        act(() => {
            jest.advanceTimersByTime(3000);
        });
        
        expect(result.current.toasts).toHaveLength(0);
    });
    
    it('should manually remove toast', () => {
        const { result } = renderHook(() => useToast());
        
        let toastId: string;
        act(() => {
            toastId = result.current.addToast('Test message', 'info', 0); // No auto-remove
        });
        
        expect(result.current.toasts).toHaveLength(1);
        
        act(() => {
            result.current.removeToast(toastId);
        });
        
        expect(result.current.toasts).toHaveLength(0);
    });
    
    it('should have helper methods for each type', () => {
        const { result } = renderHook(() => useToast());
        
        act(() => {
            result.current.success('Success!');
            result.current.error('Error!');
            result.current.warning('Warning!');
            result.current.info('Info!');
        });
        
        expect(result.current.toasts).toHaveLength(4);
        expect(result.current.toasts.map(t => t.type)).toEqual(['success', 'error', 'warning', 'info']);
    });
    
    it('should use longer duration for error toasts', () => {
        const { result } = renderHook(() => useToast());
        
        act(() => {
            result.current.error('Error message');
        });
        
        expect(result.current.toasts).toHaveLength(1);
        
        // Default error duration is 8000ms
        act(() => {
            jest.advanceTimersByTime(5000);
        });
        
        // Should still be there
        expect(result.current.toasts).toHaveLength(1);
        
        act(() => {
            jest.advanceTimersByTime(3000);
        });
        
        // Now should be gone
        expect(result.current.toasts).toHaveLength(0);
    });
});
