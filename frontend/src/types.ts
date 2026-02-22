// === Detection Types ===
export interface Detection {
  class_id: number;
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] normalized 0-1
}

export interface DetectionResponse {
  detections: Detection[];
  inference_time_ms: number;
  frame_shape: [number, number, number]; // [height, width, channels]
}

// === Face Types ===
export interface FaceDetection {
  bbox: [number, number, number, number];
  confidence: number;
  landmarks: [number, number][];
}

export interface FaceMatch {
  name: string;
  confidence: number;
  bbox: [number, number, number, number];
  face_id?: number;
}

export interface RegisteredFace {
  id: number;
  name: string;
  created_at: string;
  image_path?: string;
}

// === Scene Types ===
export interface SceneDescription {
  caption: string;
  objects: string[];
  object_counts: Record<string, number>;
  timestamp: string;
}

// === Audio Types ===
export interface Transcription {
  text: string;
  language: string;
  duration: number;
}

// === Workflow Types ===
export interface WorkflowNodeData {
  label: string;
  type: 'camera' | 'trigger' | 'condition' | 'action';
  config: Record<string, unknown>;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at?: string;
}

// === Health Types ===
export interface NPUHealth {
  available: boolean;
  provider: string;
  device_id: number;
  providers_list: string[];
}

export interface ModelStatus {
  name: string;
  loaded: boolean;
  provider: string;
  path: string;
}

// === Alert Types ===
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertType = 'detection' | 'face' | 'workflow' | 'system';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
  read: boolean;
}

// === Camera Types ===
export interface CameraDevice {
  id: string;
  label: string;
  stream: MediaStream | null;
}
