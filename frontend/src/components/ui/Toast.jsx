import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Check, X, AlertTriangle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (msg, dur) => addToast(msg, 'success', dur),
    error: (msg, dur) => addToast(msg, 'error', dur || 5000),
    warning: (msg, dur) => addToast(msg, 'warning', dur || 4000),
    info: (msg, dur) => addToast(msg, 'info', dur),
    confirm: (msg) => new Promise(resolve => {
      const id = addToast(msg, 'confirm', 0);
      setToasts(prev => prev.map(t => t.id === id ? { ...t, resolve } : t));
    }),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }) {
  useEffect(() => {
    if (toast.duration > 0) {
      const timer = setTimeout(() => onRemove(toast.id), toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onRemove]);

  const icons = {
    success: <Check className="w-4 h-4 text-green-400" />,
    error: <X className="w-4 h-4 text-red-400" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
    info: <Info className="w-4 h-4 text-blue-400" />,
    confirm: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  };

  const bgColors = {
    success: 'bg-green-500/10 border-green-500/25',
    error: 'bg-red-500/10 border-red-500/25',
    warning: 'bg-amber-500/10 border-amber-500/25',
    info: 'bg-blue-500/10 border-blue-500/25',
    confirm: 'bg-amber-500/10 border-amber-500/25',
  };

  if (toast.type === 'confirm') {
    return (
      <div className="animate-slide-up bg-surface-1 border border-amber-500/25 rounded-xl p-4 shadow-xl">
        <div className="flex items-start gap-3">
          {icons.confirm}
          <div className="flex-1">
            <p className="text-sm text-ink-700">{toast.message}</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { toast.resolve?.(true); onRemove(toast.id); }}
                className="px-3 py-1.5 text-xs bg-vermillion-600 hover:bg-vermillion-500 rounded-lg transition"
              >
                确定
              </button>
              <button
                onClick={() => { toast.resolve?.(false); onRemove(toast.id); }}
                className="px-3 py-1.5 text-xs bg-surface-3 hover:bg-black/5 rounded-lg transition"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`animate-slide-up ${bgColors[toast.type]} border rounded-xl p-4 shadow-xl`}
         role="alert">
      <div className="flex items-center gap-3">
        {icons[toast.type]}
        <p className="text-sm text-ink-700 flex-1">{toast.message}</p>
        <button onClick={() => onRemove(toast.id)} className="text-ink-400 hover:text-ink-700">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
