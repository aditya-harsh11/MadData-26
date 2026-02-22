import { create } from 'zustand';
import type { Detection } from '../types';

interface DetectionState {
  detections: Detection[];
  isProcessing: boolean;
  inferenceTime: number;
  frameCount: number;
  provider: string;
  confidenceThreshold: number;
  setDetections: (detections: Detection[]) => void;
  setProcessing: (processing: boolean) => void;
  setInferenceTime: (time: number) => void;
  incrementFrame: () => void;
  setProvider: (provider: string) => void;
  setConfidenceThreshold: (threshold: number) => void;
}

export const useDetectionStore = create<DetectionState>((set) => ({
  detections: [],
  isProcessing: false,
  inferenceTime: 0,
  frameCount: 0,
  provider: 'CPUExecutionProvider',
  confidenceThreshold: 0.5,

  setDetections: (detections) => set({ detections }),

  setProcessing: (processing) => set({ isProcessing: processing }),

  setInferenceTime: (time) => set({ inferenceTime: time }),

  incrementFrame: () =>
    set((state) => ({ frameCount: state.frameCount + 1 })),

  setProvider: (provider) => set({ provider }),

  setConfidenceThreshold: (threshold) =>
    set({ confidenceThreshold: threshold }),
}));
