import { useEffect, useRef, useState, useCallback } from 'react';
import { useDetectionStore } from '../stores/detectionStore';
import { useCameraStore } from '../stores/cameraStore';
import { useAlertStore } from '../stores/alertStore';
import { useWorkflowStore } from '../stores/workflowStore';
import { useCamera } from '../hooks/useCamera';
import { useDetection } from '../hooks/useDetection';
import { useWorkflowEngine } from '../hooks/useWorkflowEngine';
import { DetectionOverlay } from '../components/camera/DetectionOverlay';
import { AlertFeed } from '../components/alerts/AlertFeed';
import { SceneChat } from '../components/chat/SceneChat';
import { getNPUStatus } from '../lib/api';
import type { NPUHealth, Detection } from '../types';

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface DetectionLogEntry {
  id: string;
  detection: Detection;
  timestamp: string;
}

export function DashboardPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [npuStatus, setNpuStatus] = useState<NPUHealth | null>(null);
  const [detectionLog, setDetectionLog] = useState<DetectionLogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const { stream, isActive, startCamera, stopCamera, error: cameraError } = useCamera();
  const { isDetecting, startDetection, stopDetection, detections, inferenceTime, fps } = useDetection(videoRef, canvasRef);

  const { isRunning: workflowRunning, start: startWorkflow, stop: stopWorkflow, triggeredActions } = useWorkflowEngine();
  const workflowNodes = useWorkflowStore((s) => s.nodes);

  const provider = useDetectionStore((s) => s.provider);
  const frameCount = useDetectionStore((s) => s.frameCount);
  const cameras = useCameraStore((s) => s.cameras);
  const alertCount = useAlertStore((s) => s.unreadCount);

  // Auto-start/stop workflow engine when detection starts/stops
  useEffect(() => {
    if (isDetecting && workflowNodes.length > 0 && !workflowRunning) {
      startWorkflow();
    } else if (!isDetecting && workflowRunning) {
      stopWorkflow();
    }
  }, [isDetecting, workflowNodes.length, workflowRunning, startWorkflow, stopWorkflow]);

  // Fetch NPU status
  useEffect(() => {
    getNPUStatus()
      .then(setNpuStatus)
      .catch(() => setNpuStatus(null));
  }, []);

  // Set video stream
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // Log detections
  useEffect(() => {
    if (detections.length > 0) {
      const newEntries = detections.map((d) => ({
        id: `${Date.now()}-${d.class_id}-${Math.random().toString(36).substring(2, 7)}`,
        detection: d,
        timestamp: new Date().toISOString(),
      }));
      setDetectionLog((prev) => [...newEntries, ...prev].slice(0, 200));
    }
  }, [detections]);

  // Auto-scroll detection log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = 0;
    }
  }, [detectionLog.length]);

  const handleStartCamera = useCallback(async () => {
    await startCamera();
  }, [startCamera]);

  const handleToggleDetection = useCallback(() => {
    if (isDetecting) {
      stopDetection();
    } else {
      startDetection();
    }
  }, [isDetecting, startDetection, stopDetection]);

  const videoWidth = videoRef.current?.videoWidth || 640;
  const videoHeight = videoRef.current?.videoHeight || 480;

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Stats Bar */}
      <div className="flex items-center gap-4 px-4 py-3 bg-slate-900/50 border-b border-slate-800">
        {/* NPU Status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60">
          <div className={`w-2 h-2 rounded-full ${npuStatus?.available ? 'bg-green-400' : 'bg-blue-400'}`} />
          <span className="text-xs text-slate-300">
            {npuStatus?.available ? 'NPU' : 'CPU'}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {provider.replace('ExecutionProvider', '')}
          </span>
        </div>

        {/* FPS */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-xs text-slate-300">{fps} FPS</span>
          <span className="text-[10px] text-slate-500">{inferenceTime.toFixed(0)}ms</span>
        </div>

        {/* Cameras */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <span className="text-xs text-slate-300">
            {Math.max(cameras.length, isActive ? 1 : 0)} cam{cameras.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Frames */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60">
          <span className="text-xs text-slate-300">Frames: {frameCount}</span>
        </div>

        {/* Workflow Status */}
        {workflowNodes.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60">
            <div className={`w-2 h-2 rounded-full ${workflowRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={workflowRunning ? '#10b981' : '#64748b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span className="text-xs text-slate-300">
              {workflowRunning ? 'Workflow Active' : 'Workflow Idle'}
            </span>
            {triggeredActions.length > 0 && (
              <span className="text-[10px] text-emerald-400 font-mono">{triggeredActions.length} fired</span>
            )}
          </div>
        )}

        {/* Alert Count */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="text-xs text-slate-300">{alertCount} alerts</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Controls */}
        <div className="flex items-center gap-2">
          {!isActive ? (
            <button
              onClick={handleStartCamera}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Start Camera
            </button>
          ) : (
            <>
              <button
                onClick={handleToggleDetection}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  isDetecting
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-green-600 hover:bg-green-500 text-white'
                }`}
              >
                {isDetecting ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                    Stop Detection
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Start Detection
                  </>
                )}
              </button>
              <button
                onClick={stopCamera}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors"
              >
                Stop Camera
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Camera Feed Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 relative bg-slate-950 flex items-center justify-center p-4">
            {isActive ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <div className="relative max-w-full max-h-full">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="rounded-xl max-w-full max-h-[calc(100vh-16rem)] object-contain"
                  />
                  <DetectionOverlay
                    detections={detections}
                    width={videoWidth}
                    height={videoHeight}
                    className="rounded-xl"
                  />
                  {/* Live indicator */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 bg-red-500/90 rounded text-xs font-semibold text-white">
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </div>
                  {/* Detection count */}
                  {detections.length > 0 && (
                    <div className="absolute top-3 right-3 px-2 py-1 bg-emerald-500/90 rounded text-xs font-semibold text-white">
                      {detections.length} object{detections.length !== 1 ? 's' : ''}
                    </div>
                  )}
                  {/* Scene Chat */}
                  <SceneChat />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-500">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-30">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <p className="text-sm mb-1">No camera active</p>
                <p className="text-xs text-slate-600">Click "Start Camera" to begin</p>
                {cameraError && (
                  <p className="text-xs text-red-400 mt-2">{cameraError}</p>
                )}
              </div>
            )}
          </div>

          {/* Bottom Alert Ticker */}
          <div className="h-10 px-4 bg-slate-900/80 border-t border-slate-800 flex items-center">
            <AlertFeed compact maxItems={5} />
          </div>
        </div>

        {/* Right Sidebar - Detection Feed */}
        <div className="w-72 bg-slate-900 border-l border-slate-800 flex flex-col">
          <div className="px-3 py-2.5 border-b border-slate-800">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Live Detections
            </h3>
          </div>
          <div ref={logRef} className="flex-1 overflow-y-auto p-2 space-y-1">
            {detectionLog.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-40">
                  <rect x="2" y="2" width="20" height="20" rx="2" />
                  <circle cx="12" cy="12" r="4" />
                  <path d="M2 2l20 20" />
                </svg>
                <span className="text-xs">No detections yet</span>
              </div>
            ) : (
              detectionLog.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-800/40 border border-slate-800/50 hover:border-slate-700 transition-colors"
                >
                  <div
                    className="w-1.5 h-8 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        entry.detection.class_name === 'person'
                          ? '#22c55e'
                          : entry.detection.confidence > 0.8
                            ? '#3b82f6'
                            : '#eab308',
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-200 truncate">
                        {entry.detection.class_name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                        {(entry.detection.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Alert Section */}
          <div className="h-64 border-t border-slate-800">
            <AlertFeed maxItems={20} />
          </div>
        </div>
      </div>
    </div>
  );
}
