export interface Detection {
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] normalized
}

export interface FrameResult {
  timestamp: number;
  detections: Detection[];
  frame_id: string;
}

export interface ReasoningResult {
  timestamp: number;
  analysis: string;
  trigger_label: string;
  frame_id: string;
}

export interface BackendStatus {
  connected: boolean;
  watchdog_loaded: boolean;
  reasoning_loaded: boolean;
  fps: number;
}

export type NodeCategory = "input" | "processing" | "ai" | "output";

export interface NodeTypeInfo {
  type: string;
  label: string;
  description: string;
  category: NodeCategory;
  accent: string;
  icon: string;
}

export const NODE_CATALOG: NodeTypeInfo[] = [
  {
    type: "webcamInput",
    label: "Webcam Input",
    description: "Capture live camera feed",
    category: "input",
    accent: "#22d3ee",
    icon: "Camera",
  },
  {
    type: "watchdog",
    label: "Watchdog",
    description: "ONNX object detection",
    category: "processing",
    accent: "#f59e0b",
    icon: "Eye",
  },
  {
    type: "reasoningBrain",
    label: "Reasoning Brain",
    description: "Multimodal AI analysis",
    category: "ai",
    accent: "#a855f7",
    icon: "Brain",
  },
  {
    type: "filter",
    label: "Filter",
    description: "Filter detections by rules",
    category: "processing",
    accent: "#ec4899",
    icon: "Filter",
  },
  {
    type: "textGen",
    label: "Text Generator",
    description: "LLM text generation",
    category: "ai",
    accent: "#3b82f6",
    icon: "MessageSquare",
  },
  {
    type: "action",
    label: "Action",
    description: "Trigger real-world actions",
    category: "output",
    accent: "#10b981",
    icon: "Zap",
  },
];
