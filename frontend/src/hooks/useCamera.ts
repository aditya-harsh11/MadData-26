import { useState, useCallback, useRef, type RefObject } from 'react';
import { useCameraStore } from '../stores/cameraStore';

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { setStreaming, addCamera, updateCameraStream, resolution } = useCameraStore();

  const startCamera = useCallback(
    async (deviceId?: string) => {
      try {
        setError(null);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        const constraints: MediaStreamConstraints = {
          video: {
            width: { ideal: resolution.width },
            height: { ideal: resolution.height },
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
          audio: false,
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = mediaStream;
        setStream(mediaStream);
        setIsActive(true);
        setStreaming(true);

        const videoTrack = mediaStream.getVideoTracks()[0];
        const actualDeviceId = videoTrack.getSettings().deviceId || deviceId || 'default';
        const label = videoTrack.label || `Camera ${actualDeviceId.substring(0, 8)}`;

        addCamera({ id: actualDeviceId, label, stream: mediaStream });
        updateCameraStream(actualDeviceId, mediaStream);

        return mediaStream;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to access camera';
        setError(message);
        setIsActive(false);
        setStreaming(false);
        return null;
      }
    },
    [resolution, setStreaming, addCamera, updateCameraStream]
  );

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setIsActive(false);
    setStreaming(false);
  }, [setStreaming]);

  const captureFrame = useCallback(
    (videoRef: RefObject<HTMLVideoElement | null>): ImageData | null => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return null;

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    },
    []
  );

  const listCameras = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'videoinput');
    } catch {
      return [];
    }
  }, []);

  return {
    stream,
    isActive,
    startCamera,
    stopCamera,
    captureFrame,
    listCameras,
    error,
  };
}
