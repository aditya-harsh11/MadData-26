import { useState, useRef } from 'react';
import { CameraFeed, type CameraFeedHandle } from './CameraFeed';
import { DetectionOverlay } from './DetectionOverlay';
import { useCameraStore } from '../../stores/cameraStore';
import { useDetectionStore } from '../../stores/detectionStore';

type GridLayout = '1x1' | '2x2' | '3x3';

export function CameraGrid() {
  const [layout, setLayout] = useState<GridLayout>('1x1');
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const cameras = useCameraStore((s) => s.cameras);
  const detections = useDetectionStore((s) => s.detections);
  const cameraRefs = useRef<Map<string, CameraFeedHandle>>(new Map());

  const gridClass =
    layout === '1x1'
      ? 'grid-cols-1 grid-rows-1'
      : layout === '2x2'
        ? 'grid-cols-2 grid-rows-2'
        : 'grid-cols-3 grid-rows-3';

  const displayCameras =
    cameras.length > 0
      ? cameras
      : [{ id: 'default', label: 'Camera 1', stream: null }];

  const maxCells =
    layout === '1x1' ? 1 : layout === '2x2' ? 4 : 9;

  const visibleCameras = displayCameras.slice(0, maxCells);

  if (selectedCamera) {
    const cam = displayCameras.find((c) => c.id === selectedCamera);
    if (cam) {
      return (
        <div className="relative w-full h-full">
          <button
            onClick={() => setSelectedCamera(null)}
            className="absolute top-3 right-3 z-10 p-2 bg-slate-900/80 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
          <div className="relative w-full h-full">
            <CameraFeed
              deviceId={cam.id === 'default' ? undefined : cam.id}
              ref={(handle) => {
                if (handle) cameraRefs.current.set(cam.id, handle);
              }}
              className="w-full h-full"
            />
            <DetectionOverlay
              detections={detections}
              width={640}
              height={480}
            />
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Grid controls */}
      <div className="flex items-center gap-2 p-2 mb-2">
        <span className="text-xs text-slate-400 mr-2">Layout:</span>
        {(['1x1', '2x2', '3x3'] as GridLayout[]).map((l) => (
          <button
            key={l}
            onClick={() => setLayout(l)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              layout === l
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className={`grid ${gridClass} gap-2 flex-1`}>
        {visibleCameras.map((cam) => (
          <div
            key={cam.id}
            className="relative rounded-xl overflow-hidden bg-slate-900 cursor-pointer border border-slate-800 hover:border-emerald-500/50 transition-colors"
            onClick={() => setSelectedCamera(cam.id)}
          >
            <CameraFeed
              deviceId={cam.id === 'default' ? undefined : cam.id}
              ref={(handle) => {
                if (handle) cameraRefs.current.set(cam.id, handle);
              }}
              className="w-full h-full"
            />
            <DetectionOverlay
              detections={detections}
              width={640}
              height={480}
            />
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-slate-900/80 rounded text-xs text-slate-300">
              {cam.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
