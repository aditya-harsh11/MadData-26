import type { FrameResult, ReasoningResult } from "./types";

type MessageHandler = (data: FrameResult | ReasoningResult) => void;

const BACKEND_WS_URL = "ws://localhost:8000/ws";

export class PipelineSocket {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

  get connected() {
    return this._connected;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(BACKEND_WS_URL);

      this.ws.onopen = () => {
        this._connected = true;
        this.emit("status", { connected: true } as any);
        console.log("[PipelineSocket] Connected to backend");
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type) {
            this.emit(data.type, data.payload);
          }
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onclose = () => {
        this._connected = false;
        this.emit("status", { connected: false } as any);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this._connected = false;
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  sendFrame(base64: string, nodeId: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "frame",
        payload: { image: base64, node_id: nodeId },
      })
    );
  }

  sendReasoning(base64: string, prompt: string, triggerLabel: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "reasoning",
        payload: { image: base64, prompt, trigger_label: triggerLabel },
      })
    );
  }

  sendTextGen(prompt: string, nodeId: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "text_gen",
        payload: { prompt, node_id: nodeId },
      })
    );
  }

  sendConfig(config: Record<string, number | string>) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "config",
        payload: config,
      })
    );
  }

  on(event: string, handler: MessageHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: MessageHandler) {
    this.handlers.get(event)?.delete(handler);
  }

  private emit(event: string, data: any) {
    this.handlers.get(event)?.forEach((h) => h(data));
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }
}

// Singleton instance
export const pipelineSocket = new PipelineSocket();
