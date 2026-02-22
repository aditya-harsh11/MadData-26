import { useState, useRef, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { NPUStatus } from '../common/NPUStatus';
import { useAlertStore } from '../../stores/alertStore';

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const severityDot: Record<string, string> = {
  info: 'bg-blue-400',
  warning: 'bg-amber-400',
  critical: 'bg-red-400',
};

export function AppLayout() {
  const [showAlerts, setShowAlerts] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = useAlertStore((s) => s.unreadCount);
  const alerts = useAlertStore((s) => s.alerts);
  const markAllRead = useAlertStore((s) => s.markAllRead);
  const dismissAlert = useAlertStore((s) => s.dismissAlert);
  const clearAlerts = useAlertStore((s) => s.clearAlerts);

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowAlerts(false);
      }
    }
    if (showAlerts) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showAlerts]);

  const handleBellClick = () => {
    setShowAlerts((prev) => !prev);
    if (!showAlerts && unreadCount > 0) {
      markAllRead();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Sidebar />

      {/* Top Bar */}
      <header className="fixed top-0 left-16 right-0 h-14 z-30 flex items-center justify-between px-6 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white">
            Camer<span className="text-emerald-400">AI</span>
          </h1>
          <span className="text-xs text-slate-500 hidden sm:inline">
            Smart Camera Orchestration
          </span>
        </div>

        <div className="flex items-center gap-4">
          <NPUStatus />

          {/* Alert Bell + Dropdown */}
          <div className="relative" ref={panelRef}>
            <button
              onClick={handleBellClick}
              className="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Alert Dropdown Panel */}
            {showAlerts && (
              <div className="absolute right-0 top-full mt-2 w-80 max-h-96 flex flex-col rounded-xl bg-slate-900 border border-slate-700/80 shadow-2xl shadow-black/50 overflow-hidden z-50">
                {/* Panel Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
                  <span className="text-xs font-semibold text-slate-300">Notifications</span>
                  <div className="flex items-center gap-2">
                    {alerts.length > 0 && (
                      <button
                        onClick={() => { clearAlerts(); setShowAlerts(false); }}
                        className="text-[10px] text-slate-500 hover:text-red-400 transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>

                {/* Alert List */}
                <div className="flex-1 overflow-y-auto">
                  {alerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-600">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-40">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                      <span className="text-xs">No notifications</span>
                    </div>
                  ) : (
                    alerts.slice(0, 30).map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-start gap-2.5 px-4 py-2.5 border-b border-slate-800/50 hover:bg-slate-800/40 cursor-pointer transition-colors"
                        onClick={() => dismissAlert(alert.id)}
                      >
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${severityDot[alert.severity] || 'bg-slate-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-300 leading-relaxed break-words">{alert.message}</p>
                          <span className="text-[10px] text-slate-500">{formatTime(alert.timestamp)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="ml-16 pt-14 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
