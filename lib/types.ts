export interface BackendStatus {
  connected: boolean;
  vlm_loaded: boolean;
  npu_active: boolean;
}

export type NodeCategory = "input" | "ai" | "logic" | "output";

export interface NodeTypeInfo {
  type: string;
  label: string;
  description: string;
  category: NodeCategory;
  accent: string;
  icon: string;
}

export interface LogicCondition {
  id: string;
  operator: "contains" | "not_contains" | "equals" | "starts_with" | "regex";
  value: string;
}

export interface WorkflowNodeData {
  prompt?: string;
  interval?: number;
  conditions?: LogicCondition[];
  mode?: "any" | "all";
  actionType?: "sound" | "log" | "notification" | "webhook";
  systemPrompt?: string;
  webhookUrl?: string;
}

export const NODE_CATALOG: NodeTypeInfo[] = [
  {
    type: "camera",
    label: "Camera",
    description: "Live camera feed",
    category: "input",
    accent: "#22d3ee",
    icon: "Camera",
  },
  {
    type: "detection",
    label: "Object Detect",
    description: "YOLO object detection (NPU)",
    category: "ai",
    accent: "#f97316",
    icon: "ScanSearch",
  },
  {
    type: "visualLlm",
    label: "Visual LLM",
    description: "Vision AI analysis of camera feed",
    category: "ai",
    accent: "#a855f7",
    icon: "Eye",
  },
  {
    type: "llm",
    label: "LLM",
    description: "Text generation & processing",
    category: "ai",
    accent: "#3b82f6",
    icon: "MessageSquare",
  },
  {
    type: "logic",
    label: "Logic",
    description: "Conditional routing (if/then)",
    category: "logic",
    accent: "#f59e0b",
    icon: "GitBranch",
  },
  {
    type: "mic",
    label: "Microphone",
    description: "Live audio capture",
    category: "input",
    accent: "#06b6d4",
    icon: "Mic",
  },
  {
    type: "audioDetect",
    label: "Audio Detect",
    description: "YamNet sound classification (ONNX)",
    category: "ai",
    accent: "#8b5cf6",
    icon: "AudioLines",
  },
  {
    type: "audioLlm",
    label: "Audio LLM",
    description: "AI audio understanding (OmniNeural)",
    category: "ai",
    accent: "#ec4899",
    icon: "Ear",
  },
  {
    type: "action",
    label: "Action",
    description: "Sound, log, notification, webhook",
    category: "output",
    accent: "#10b981",
    icon: "Zap",
  },
];
