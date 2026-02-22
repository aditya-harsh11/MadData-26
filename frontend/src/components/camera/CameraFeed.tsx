import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

interface CameraFeedProps {
  deviceId?: string;
  width?: number;
  height?: number;
  onFrame?: (frame: ImageData) => void;
  className?: string;
}

export interface CameraFeedHandle {
  videoElement: HTMLVideoElement | null;
  getStream: () => MediaStream | null;
}

export const CameraFeed = forwardRef<CameraFeedHandle, CameraFeedProps>(
  function CameraFeed({ deviceId, width = 640, height = 480, onFrame, className = '' }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [isActive, setIsActive] = useState(false);
    const [mirrored, setMirrored] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      get videoElement() {
        return videoRef.current;
      },
      getStream() {
        return streamRef.current;
      },
    }));

    const startCamera = useCallback(async () => {
      try {
        setError(null);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        const constraints: MediaStreamConstraints = {
          video: {
            width: { ideal: width },
            height: { ideal: height },
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setIsActive(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Camera access denied');
        setIsActive(false);
      }
    }, [deviceId, width, height]);

    useEffect(() => {
      startCamera();
      return () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };
    }, [startCamera]);

    // Frame callback
    useEffect(() => {
      if (!onFrame || !isActive) return;
      let animId: number;
      let lastTime = 0;

      const loop = (time: number) => {
        if (time - lastTime >= 100) {
          const video = videoRef.current;
          if (video && video.readyState >= 2) {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              onFrame(imageData);
            }
          }
          lastTime = time;
        }
        animId = requestAnimationFrame(loop);
      };

      animId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(animId);
    }, [onFrame, isActive]);

    return (
      <div className={`relative bg-slate-900 rounded-xl overflow-hidden ${className}`}>
        {isActive ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }}
            />
            {/* Mirror toggle */}
            <button
              onClick={() => setMirrored(!mirrored)}
              className="absolute top-3 right-3 p-1.5 bg-slate-900/70 hover:bg-slate-800/90 rounded-lg text-slate-300 hover:text-white transition-all"
              title={mirrored ? 'Disable mirror' : 'Enable mirror'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18" />
                <path d="M8 6l-4 6 4 6" />
                <path d="M16 6l4 6-4 6" />
              </svg>
            </button>
            {/* Live indicator */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 bg-red-500/90 rounded text-xs font-semibold text-white">
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full min-h-[300px] text-slate-500">
            {error ? (
              <>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-red-400">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={startCamera}
                  className="mt-3 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors"
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 animate-pulse">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <p className="text-sm">Connecting camera...</p>
              </>
            )}
          </div>
        )}
      </div>
    );
  }
);
