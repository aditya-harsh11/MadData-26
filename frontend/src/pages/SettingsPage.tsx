import { useState, useEffect, useCallback } from 'react';
import { useDetectionStore } from '../stores/detectionStore';
import { useAlertStore } from '../stores/alertStore';
import { useCameraStore } from '../stores/cameraStore';
import { getNPUStatus, getModelStatus } from '../lib/api';
import type { NPUHealth, ModelStatus } from '../types';

export function SettingsPage() {
  const [npuHealth, setNpuHealth] = useState<NPUHealth | null>(null);
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [isLoadingHealth, setIsLoadingHealth] = useState(true);
  const [isLoadingModels, setIsLoadingModels] = useState(true);

  const confidenceThreshold = useDetectionStore((s) => s.confidenceThreshold);
  const setConfidenceThreshold = useDetectionStore((s) => s.setConfidenceThreshold);

  const soundEnabled = useAlertStore((s) => s.soundEnabled);
  const ttsEnabled = useAlertStore((s) => s.ttsEnabled);
  const toggleSound = useAlertStore((s) => s.toggleSound);
  const toggleTTS = useAlertStore((s) => s.toggleTTS);

  const resolution = useCameraStore((s) => s.resolution);
  const setResolution = useCameraStore((s) => s.setResolution);

  const [fpsThrottle, setFpsThrottle] = useState(10);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    getNPUStatus()
      .then(setNpuHealth)
      .catch(() => setNpuHealth(null))
      .finally(() => setIsLoadingHealth(false));

    getModelStatus()
      .then(setModels)
      .catch(() => setModels([]))
      .finally(() => setIsLoadingModels(false));
  }, []);

  const requestNotifPermission = useCallback(async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
    }
  }, []);

  const resolutionOptions = [
    { label: '320x240', width: 320, height: 240 },
    { label: '640x480', width: 640, height: 480 },
    { label: '1280x720', width: 1280, height: 720 },
    { label: '1920x1080', width: 1920, height: 1080 },
  ];

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Settings</h1>
          <p className="text-sm text-slate-400 mt-1">Configure CamerAI preferences</p>
        </div>

        {/* Camera Settings */}
        <SettingsSection title="Camera" icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        }>
          <SettingsRow label="Resolution" description="Camera capture resolution">
            <select
              value={`${resolution.width}x${resolution.height}`}
              onChange={(e) => {
                const opt = resolutionOptions.find((o) => o.label === e.target.value);
                if (opt) setResolution(opt.width, opt.height);
              }}
              className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              {resolutionOptions.map((opt) => (
                <option key={opt.label} value={opt.label}>{opt.label}</option>
              ))}
            </select>
          </SettingsRow>

          <SettingsRow label="FPS Throttle" description={`Target frame processing rate: ${fpsThrottle} FPS`}>
            <input
              type="range"
              min="1"
              max="30"
              value={fpsThrottle}
              onChange={(e) => setFpsThrottle(Number(e.target.value))}
              className="w-32 accent-emerald-500"
            />
            <span className="text-xs text-slate-400 ml-2 w-8">{fpsThrottle}</span>
          </SettingsRow>
        </SettingsSection>

        {/* Detection Settings */}
        <SettingsSection title="Detection" icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        }>
          <SettingsRow label="Confidence Threshold" description={`Minimum confidence: ${(confidenceThreshold * 100).toFixed(0)}%`}>
            <input
              type="range"
              min="0"
              max="100"
              value={confidenceThreshold * 100}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value) / 100)}
              className="w-32 accent-emerald-500"
            />
            <span className="text-xs text-slate-400 ml-2 w-10">{(confidenceThreshold * 100).toFixed(0)}%</span>
          </SettingsRow>
        </SettingsSection>

        {/* Alert Settings */}
        <SettingsSection title="Alerts" icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        }>
          <SettingsRow label="Sound Alerts" description="Play sound for critical alerts">
            <ToggleSwitch enabled={soundEnabled} onToggle={toggleSound} />
          </SettingsRow>

          <SettingsRow label="TTS Announcements" description="Speak alert messages aloud">
            <ToggleSwitch enabled={ttsEnabled} onToggle={toggleTTS} />
          </SettingsRow>

          <SettingsRow label="Browser Notifications" description={`Status: ${notifPermission}`}>
            {notifPermission !== 'granted' ? (
              <button
                onClick={requestNotifPermission}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg transition-colors"
              >
                Enable
              </button>
            ) : (
              <span className="text-xs text-green-400 font-medium">Enabled</span>
            )}
          </SettingsRow>
        </SettingsSection>

        {/* NPU Info Panel */}
        <SettingsSection title="NPU Information" icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
            <path d="M4 9h1M4 15h1M19 9h1M19 15h1M9 4v1M15 4v1M9 19v1M15 19v1" />
          </svg>
        }>
          {isLoadingHealth ? (
            <div className="flex items-center gap-2 py-4 text-slate-500">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs">Loading NPU status...</span>
            </div>
          ) : npuHealth ? (
            <div className="grid grid-cols-2 gap-4">
              <InfoCard label="Provider" value={npuHealth.provider} highlight={npuHealth.available} />
              <InfoCard label="NPU Available" value={npuHealth.available ? 'Yes' : 'No'} highlight={npuHealth.available} />
              <InfoCard label="Device ID" value={String(npuHealth.device_id)} />
              <div className="col-span-2">
                <span className="text-xs text-slate-500">Available Providers:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {npuHealth.providers_list?.map((p) => (
                    <span key={p} className="px-2 py-0.5 bg-slate-800 rounded text-[10px] text-slate-400 font-mono">
                      {p}
                    </span>
                  )) || <span className="text-[10px] text-slate-600">N/A</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-slate-500">Unable to fetch NPU status</p>
              <p className="text-xs text-slate-600 mt-1">Ensure the backend is running</p>
            </div>
          )}
        </SettingsSection>

        {/* Model Status */}
        <SettingsSection title="Model Status" icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        }>
          {isLoadingModels ? (
            <div className="flex items-center gap-2 py-4 text-slate-500">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs">Loading model status...</span>
            </div>
          ) : models.length > 0 ? (
            <div className="space-y-2">
              {/* Active models first */}
              {models.filter((m) => m.loaded).map((model, i) => (
                <div
                  key={`loaded-${i}`}
                  className="flex items-center justify-between px-4 py-3 bg-slate-800/50 rounded-lg border border-emerald-800/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    <div>
                      <p className="text-sm text-slate-200">{model.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{model.provider}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-medium text-green-400">Active</span>
                    <p className="text-[10px] text-slate-600 font-mono truncate max-w-[140px]">{model.path}</p>
                  </div>
                </div>
              ))}
              {/* Unloaded models - collapsed section */}
              {models.some((m) => !m.loaded) && (
                <details className="group">
                  <summary className="flex items-center gap-2 px-4 py-2 text-xs text-slate-500 cursor-pointer hover:text-slate-400 transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-open:rotate-90">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    {models.filter((m) => !m.loaded).length} optional models not loaded
                  </summary>
                  <div className="space-y-1.5 mt-1.5">
                    {models.filter((m) => !m.loaded).map((model, i) => (
                      <div
                        key={`unloaded-${i}`}
                        className="flex items-center justify-between px-4 py-2.5 bg-slate-800/30 rounded-lg border border-slate-800/50 opacity-60"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-slate-600" />
                          <div>
                            <p className="text-xs text-slate-400">{model.name}</p>
                            <p className="text-[10px] text-slate-600 font-mono">{model.provider}</p>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-600">Not loaded</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-slate-500">No model information available</p>
              <p className="text-xs text-slate-600 mt-1">Ensure the backend is running</p>
            </div>
          )}
        </SettingsSection>
      </div>
    </div>
  );
}

// === Helper Components ===

function SettingsSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: JSX.Element;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-800">
        <span className="text-emerald-400">{icon}</span>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-200">{label}</p>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

function ToggleSwitch({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        enabled ? 'bg-emerald-600' : 'bg-slate-700'
      }`}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-5.5 left-[1px]' : 'left-[2px]'
        }`}
        style={{ transform: enabled ? 'translateX(22px)' : 'translateX(0)' }}
      />
    </button>
  );
}

function InfoCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="px-4 py-3 bg-slate-800/50 rounded-lg border border-slate-800">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${highlight ? 'text-green-400' : 'text-slate-200'}`}>
        {value}
      </p>
    </div>
  );
}
