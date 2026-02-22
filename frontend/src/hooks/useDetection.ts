import { useState, useCallback, useRef, type RefObject } from 'react';
import { useDetectionStore } from '../stores/detectionStore';
import { detect } from '../lib/api';
import type { Detection } from '../types';

export function useDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>
) {
  const [isDetecting, setIsDetecting] = useState(false);
  const [detections, setLocalDetections] = useState<Detection[]>([]);
  const [inferenceTime, setLocalInferenceTime] = useState(0);
  const [fps, setLocalFps] = useState(0);

  const animFrameRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const fpsCounterRef = useRef<number>(0);
  const fpsTimerRef = useRef<number>(Date.now());
  const processingRef = useRef(false);
  const isDetectingRef = useRef(false);

  const {
    setDetections: storeSetDetections,
    setProcessing,
    setInferenceTime: storeSetInference,
    incrementFrame,
    setProvider,
  } = useDetectionStore();

  const processFrame = useCallback(async () => {
    if (!isDetectingRef.current) return;

    const now = performance.now();
    const elapsed = now - lastFrameTimeRef.current;

    // Throttle to ~10 FPS
    if (elapsed < 100) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    if (processingRef.current) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    processingRef.current = true;
    setProcessing(true);
    lastFrameTimeRef.current = now;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        processingRef.current = false;
        animFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      ctx.drawImage(video, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.8)
      );

      if (!blob) {
        processingRef.current = false;
        animFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      const result = await detect(blob);

      if (isDetectingRef.current) {
        setLocalDetections(result.detections);
        storeSetDetections(result.detections);
        setLocalInferenceTime(result.inference_time_ms);
        storeSetInference(result.inference_time_ms);
        incrementFrame();

        // Provider is fetched via health endpoint, not detection response

        fpsCounterRef.current++;
        const fpsElapsed = Date.now() - fpsTimerRef.current;
        if (fpsElapsed >= 1000) {
          setLocalFps(Math.round((fpsCounterRef.current / fpsElapsed) * 1000));
          fpsCounterRef.current = 0;
          fpsTimerRef.current = Date.now();
        }
      }
    } catch (err) {
      // Silently handle detection errors to keep loop running
      console.error('Detection error:', err);
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }

    if (isDetectingRef.current) {
      animFrameRef.current = requestAnimationFrame(processFrame);
    }
  }, [videoRef, storeSetDetections, setProcessing, storeSetInference, incrementFrame, setProvider]);

  const startDetection = useCallback(() => {
    if (isDetectingRef.current) return;
    isDetectingRef.current = true;
    setIsDetecting(true);
    lastFrameTimeRef.current = 0;
    fpsCounterRef.current = 0;
    fpsTimerRef.current = Date.now();
    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [processFrame]);

  const stopDetection = useCallback(() => {
    isDetectingRef.current = false;
    setIsDetecting(false);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    processingRef.current = false;
    setProcessing(false);
  }, [setProcessing]);

  return {
    isDetecting,
    startDetection,
    stopDetection,
    detections,
    inferenceTime,
    fps,
  };
}
