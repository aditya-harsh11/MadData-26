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
  systemPrompt?: string;
  webhookUrl?: string;
  soundPreset?: string;
  emailTo?: string;
  emailSubject?: string;
  smsTo?: string;
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
    type: "video",
    label: "Video Input",
    description: "Play video file as camera input",
    category: "input",
    accent: "#22d3ee",
    icon: "Film",
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
    type: "audioFile",
    label: "Audio Input",
    description: "Play audio file as mic input",
    category: "input",
    accent: "#06b6d4",
    icon: "Music",
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
    type: "soundAction",
    label: "Sound Alert",
    description: "Play alert sound when triggered",
    category: "output",
    accent: "#f97316",
    icon: "Volume2",
  },
  {
    type: "logAction",
    label: "Log",
    description: "Timestamped event log with CSV export",
    category: "output",
    accent: "#10b981",
    icon: "FileText",
  },
  {
    type: "notifyAction",
    label: "Notification",
    description: "Desktop notification alert",
    category: "output",
    accent: "#eab308",
    icon: "Bell",
  },
  {
    type: "screenshotAction",
    label: "Screenshot",
    description: "Capture and save camera frames",
    category: "output",
    accent: "#06b6d4",
    icon: "Aperture",
  },
  {
    type: "webhookAction",
    label: "Webhook",
    description: "HTTP POST to external URL",
    category: "output",
    accent: "#8b5cf6",
    icon: "Webhook",
  },
  {
    type: "emailAction",
    label: "Email",
    description: "Send email alert (needs internet)",
    category: "output",
    accent: "#3b82f6",
    icon: "Mail",
  },
  {
    type: "smsAction",
    label: "SMS",
    description: "Send SMS via Twilio (needs internet)",
    category: "output",
    accent: "#14b8a6",
    icon: "MessageCircle",
  },
];
