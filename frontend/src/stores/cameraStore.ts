import { create } from 'zustand';
import type { CameraDevice } from '../types';

interface CameraState {
  cameras: CameraDevice[];
  activeCamera: string | null;
  isStreaming: boolean;
  fps: number;
  resolution: { width: number; height: number };
  addCamera: (camera: CameraDevice) => void;
  removeCamera: (id: string) => void;
  setActiveCamera: (id: string | null) => void;
  setStreaming: (streaming: boolean) => void;
  setFPS: (fps: number) => void;
  setResolution: (width: number, height: number) => void;
  updateCameraStream: (id: string, stream: MediaStream | null) => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  cameras: [],
  activeCamera: null,
  isStreaming: false,
  fps: 0,
  resolution: { width: 640, height: 480 },

  addCamera: (camera) =>
    set((state) => {
      const exists = state.cameras.find((c) => c.id === camera.id);
      if (exists) return state;
      return { cameras: [...state.cameras, camera] };
    }),

  removeCamera: (id) =>
    set((state) => {
      const camera = state.cameras.find((c) => c.id === id);
      if (camera?.stream) {
        camera.stream.getTracks().forEach((track) => track.stop());
      }
      return {
        cameras: state.cameras.filter((c) => c.id !== id),
        activeCamera: state.activeCamera === id ? null : state.activeCamera,
      };
    }),

  setActiveCamera: (id) => set({ activeCamera: id }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  setFPS: (fps) => set({ fps }),

  setResolution: (width, height) => set({ resolution: { width, height } }),

  updateCameraStream: (id, stream) =>
    set((state) => ({
      cameras: state.cameras.map((c) =>
        c.id === id ? { ...c, stream } : c
      ),
    })),
}));
