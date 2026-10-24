import React, { createContext, useContext, useState, useCallback } from 'react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  showNotification: (type: NotificationType, title: string, message?: string) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const showNotification = useCallback((type: NotificationType, title: string, message?: string) => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setNotifications((prev) => [...prev, { id, type, title, message }]);

    setTimeout(() => {
      removeNotification(id);
    }, 5000);
  }, [removeNotification]);

  return (
    <NotificationContext.Provider value={{ notifications, showNotification, removeNotification }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
        {notifications.map((n) => {
          const borderClass =
            n.type === 'success'
              ? 'border-emerald-500 bg-white text-slate-900 shadow-lg'
              : n.type === 'error'
              ? 'border-rose-500 bg-white text-slate-900 shadow-lg'
              : n.type === 'warning'
              ? 'border-amber-500 bg-white text-slate-900 shadow-lg'
              : 'border-blue-500 bg-white text-slate-900 shadow-lg';

          const iconColor =
            n.type === 'success'
              ? 'text-emerald-600'
              : n.type === 'error'
              ? 'text-rose-600'
              : n.type === 'warning'
              ? 'text-amber-600'
              : 'text-blue-600';

          return (
            <div
              key={n.id}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-lg border-l-4 border ${borderClass} transition-all duration-200`}
            >
              <div className={`mt-0.5 font-bold ${iconColor}`}>
                {n.type === 'success' && '✓'}
                {n.type === 'error' && '✕'}
                {n.type === 'warning' && '⚠'}
                {n.type === 'info' && 'ℹ'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                {n.message && <p className="text-xs text-slate-600 mt-0.5 break-words">{n.message}</p>}
              </div>
              <button
                onClick={() => removeNotification(n.id)}
                className="text-slate-400 hover:text-slate-700 text-xs p-1"
                title="Fechar"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
};

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return ctx;
}
