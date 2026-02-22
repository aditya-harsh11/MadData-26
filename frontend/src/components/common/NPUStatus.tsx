import { useState, useEffect, useCallback } from 'react';
import { getNPUStatus } from '../../lib/api';
import type { NPUHealth } from '../../types';

export function NPUStatus() {
  const [status, setStatus] = useState<NPUHealth | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [error, setError] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getNPUStatus();
      setStatus(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const isNPU = status?.available ?? false;
  const providerName = status?.provider ?? 'Unknown';

  return (
    <div
      className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 cursor-pointer select-none"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="relative">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            error ? 'bg-gray-500' : isNPU ? 'bg-green-400' : 'bg-blue-400'
          }`}
        />
        {!error && (
          <div className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${isNPU ? 'bg-green-400' : 'bg-blue-400'} animate-ping opacity-75`} />
        )}
      </div>
      <span className="text-xs font-medium text-slate-300">
        {error ? 'Offline' : isNPU ? 'NPU Active' : 'CPU Mode'}
      </span>

      {showTooltip && status && (
        <div className="absolute top-full left-0 mt-2 w-64 p-3 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
          <div className="text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400">Provider</span>
              <span className="text-slate-200 font-mono text-[10px]">{providerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Device ID</span>
              <span className="text-slate-200">{status.device_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Available Providers</span>
              <span className="text-slate-200 text-[10px]">
                {status.providers_list?.join(', ') ?? 'N/A'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
