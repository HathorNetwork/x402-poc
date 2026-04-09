'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type: Toast['type']) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const addToast = useCallback((message: string, type: Toast['type']) => {
    const id = Math.random().toString(36).substring(2, 11);
    console.log('[ToastProvider] Adding toast:', { id, message, type });
    setToasts((prev) => {
      const newToasts = [...prev, { id, message, type }];
      console.log('[ToastProvider] New toasts array:', newToasts);
      return newToasts;
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toastContainer = mounted ? (
    createPortal(
      <div
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'none'
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              border: '1px solid',
              pointerEvents: 'auto',
              minWidth: '300px',
              backgroundColor: toast.type === 'success' ? '#14532d' : toast.type === 'error' ? '#7f1d1d' : '#1e3a8a',
              borderColor: toast.type === 'success' ? '#15803d' : toast.type === 'error' ? '#b91c1c' : '#2563eb',
              color: toast.type === 'success' ? '#bbf7d0' : toast.type === 'error' ? '#fecaca' : '#bfdbfe'
            }}
          >
            <span style={{ fontSize: '20px' }}>
              {toast.type === 'success' && '✓'}
              {toast.type === 'error' && '✕'}
              {toast.type === 'info' && 'ℹ'}
            </span>
            <span style={{ fontSize: '14px', flex: 1 }}>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              style={{
                marginLeft: '8px',
                fontSize: '18px',
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                opacity: 0.8
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
            >
              ×
            </button>
          </div>
        ))}
      </div>,
      document.body
    )
  ) : null;

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {toastContainer}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

export const toast = {
  success: (message: string) => {
    console.log('[Toast] Dispatching success:', message);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message, type: 'success' } }));
    }
  },
  error: (message: string) => {
    console.log('[Toast] Dispatching error:', message);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message, type: 'error' } }));
    }
  },
  info: (message: string) => {
    console.log('[Toast] Dispatching info:', message);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message, type: 'info' } }));
    }
  },
};

export function Toaster() {
  const { addToast } = useToast();

  useEffect(() => {
    console.log('[Toaster] Setting up event listener');
    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('[Toaster] Received toast event:', customEvent.detail);
      addToast(customEvent.detail.message, customEvent.detail.type);
    };

    window.addEventListener('toast', handleToast);
    return () => {
      console.log('[Toaster] Cleaning up event listener');
      window.removeEventListener('toast', handleToast);
    };
  }, [addToast]);

  return null;
}
