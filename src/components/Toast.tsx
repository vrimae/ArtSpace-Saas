import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, Info } from 'lucide-react';

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
  exiting?: boolean;
}

interface ToastContextType {
  showToast: (type: Toast['type'], title: string, message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
};

const ToastItem: React.FC<{ toast: Toast, onRemove: (id: number, skipAnim?: boolean) => void }> = ({ toast, onRemove }) => {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);

  const getIcon = (type: Toast['type']) => {
    switch (type) {
      case 'success': return <CheckCircle size={20} />;
      case 'error': return <XCircle size={20} />;
      case 'info': return <Info size={20} />;
    }
  };

  const handleDragStart = (clientX: number) => {
    setIsDragging(true);
    startX.current = clientX - dragOffset;
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging) return;
    const newOffset = clientX - startX.current;
    setDragOffset(newOffset);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    // If swiped sideways more than 50px, dismiss
    if (Math.abs(dragOffset) > 50) {
      setDragOffset(dragOffset > 0 ? window.innerWidth + 100 : -(window.innerWidth + 100)); // Fly out completely off screen
      // Remove from DOM quickly without triggering the CSS toast-out animation
      setTimeout(() => onRemove(toast.id, true), 500);
    } else {
      setDragOffset(0); // Snap back
    }
  };

  return (
    <div 
      className={`toast ${toast.type} ${toast.exiting ? 'toast-exit' : ''}`}
      style={{ 
        transform: dragOffset !== 0 ? `translateX(${dragOffset}px)` : undefined,
        transition: isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.5s ease-out',
        opacity: Math.max(0, 1 - Math.abs(dragOffset) / 300)
      }}
      onTouchStart={e => handleDragStart(e.touches[0].clientX)}
      onTouchMove={e => handleDragMove(e.touches[0].clientX)}
      onTouchEnd={handleDragEnd}
      onMouseDown={e => handleDragStart(e.clientX)}
      onMouseMove={e => handleDragMove(e.clientX)}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
    >
      <div className="toast-icon">{getIcon(toast.type)}</div>
      <div className="toast-text">
        <div className="toast-title">{toast.title}</div>
        <div className="toast-message">{toast.message}</div>
      </div>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number, skipAnim = false) => {
    if (skipAnim) {
      setToasts(prev => prev.filter(t => t.id !== id));
      return;
    }
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 400); // Wait for the full CSS animation if not skipping
  }, []);

  const showToast = useCallback((type: Toast['type'], title: string, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => removeToast(id), 4000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
