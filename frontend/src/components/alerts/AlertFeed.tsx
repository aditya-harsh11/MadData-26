import { useEffect, useRef } from 'react';
import { useAlertStore } from '../../stores/alertStore';
import type { Alert, AlertSeverity, AlertType } from '../../types';

const severityColors: Record<AlertSeverity, string> = {
  info: 'border-blue-500/40 bg-blue-500/5',
  warning: 'border-amber-500/40 bg-amber-500/5',
  critical: 'border-red-500/40 bg-red-500/5',
};

const severityDotColors: Record<AlertSeverity, string> = {
  info: 'bg-blue-400',
  warning: 'bg-amber-400',
  critical: 'bg-red-400',
};

function TypeIcon({ type }: { type: AlertType }) {
  switch (type) {
    case 'detection':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="2" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
    case 'face':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="9" cy="10" r="1" fill="currentColor" />
          <circle cx="15" cy="10" r="1" fill="currentColor" />
          <path d="M8 15c1 2 7 2 8 0" />
        </svg>
      );
    case 'workflow':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'system':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      );
  }
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface AlertFeedProps {
  maxItems?: number;
  compact?: boolean;
}

export function AlertFeed({ maxItems = 50, compact = false }: AlertFeedProps) {
  const alerts = useAlertStore((s) => s.alerts);
  const dismissAlert = useAlertStore((s) => s.dismissAlert);
  const clearAlerts = useAlertStore((s) => s.clearAlerts);
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayAlerts = alerts.slice(0, maxItems);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [alerts.length]);

  if (compact) {
    return (
      <div className="flex items-center gap-3 overflow-hidden">
        {displayAlerts.length === 0 ? (
          <span className="text-xs text-slate-500">No alerts</span>
        ) : (
          <div className="flex items-center gap-3 animate-marquee">
            {displayAlerts.slice(0, 5).map((alert: Alert) => (
              <div
                key={alert.id}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-xs whitespace-nowrap ${severityColors[alert.severity]}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${severityDotColors[alert.severity]}`} />
                <span className="text-slate-300">{alert.message}</span>
                <span className="text-slate-500">{formatTime(alert.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Alerts
        </h3>
        {alerts.length > 0 && (
          <button
            onClick={clearAlerts}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Alert List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {displayAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-50">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="text-xs">No alerts yet</span>
          </div>
        ) : (
          displayAlerts.map((alert: Alert) => (
            <div
              key={alert.id}
              className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity alert-slide-in ${
                severityColors[alert.severity]
              } ${alert.read ? 'opacity-60' : ''}`}
              onClick={() => dismissAlert(alert.id)}
            >
              <div className={`mt-0.5 ${
                alert.severity === 'critical' ? 'text-red-400' :
                alert.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
              }`}>
                <TypeIcon type={alert.type} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-300 leading-relaxed break-words">
                  {alert.message}
                </p>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  {formatTime(alert.timestamp)}
                </span>
              </div>
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${severityDotColors[alert.severity]}`} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
