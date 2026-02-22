import { create } from 'zustand';
import type { Alert, AlertType, AlertSeverity } from '../types';

interface AlertState {
  alerts: Alert[];
  unreadCount: number;
  soundEnabled: boolean;
  ttsEnabled: boolean;
  addAlert: (type: AlertType, severity: AlertSeverity, message: string, data?: Record<string, unknown>) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
  markAllRead: () => void;
  toggleSound: () => void;
  toggleTTS: () => void;
}

function generateId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  unreadCount: 0,
  soundEnabled: true,
  ttsEnabled: false,

  addAlert: (type, severity, message, data) => {
    const alert: Alert = {
      id: generateId(),
      type,
      severity,
      message,
      timestamp: new Date().toISOString(),
      data,
      read: false,
    };

    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 200),
      unreadCount: state.unreadCount + 1,
    }));

    const { soundEnabled, ttsEnabled } = get();

    if (soundEnabled && severity === 'critical') {
      try {
        const audioCtx = new AudioContext();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        oscillator.stop(audioCtx.currentTime + 0.5);
      } catch {
        // Audio not available
      }
    }

    if (ttsEnabled && severity === 'critical') {
      try {
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 1.2;
        utterance.volume = 0.8;
        speechSynthesis.speak(utterance);
      } catch {
        // TTS not available
      }
    }
  },

  dismissAlert: (id) =>
    set((state) => {
      const alert = state.alerts.find((a) => a.id === id);
      const unreadDecrease = alert && !alert.read ? 1 : 0;
      return {
        alerts: state.alerts.filter((a) => a.id !== id),
        unreadCount: Math.max(0, state.unreadCount - unreadDecrease),
      };
    }),

  clearAlerts: () => set({ alerts: [], unreadCount: 0 }),

  markAllRead: () =>
    set((state) => ({
      alerts: state.alerts.map((a) => ({ ...a, read: true })),
      unreadCount: 0,
    })),

  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

  toggleTTS: () => set((state) => ({ ttsEnabled: !state.ttsEnabled })),
}));
