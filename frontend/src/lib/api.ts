import type {
  DetectionResponse,
  FaceMatch,
  RegisteredFace,
  SceneDescription,
  Transcription,
  Workflow,
  NPUHealth,
  ModelStatus,
} from '../types';

const API_BASE = '/api';

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`API Error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

// === Detection ===
export async function detect(imageBlob: Blob): Promise<DetectionResponse> {
  const formData = new FormData();
  formData.append('file', imageBlob, 'frame.jpg');

  return request<DetectionResponse>('/detect', {
    method: 'POST',
    body: formData,
  });
}

export async function detectBase64(base64: string): Promise<DetectionResponse> {
  return request<DetectionResponse>('/detect/base64', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64 }),
  });
}

// === Faces ===
export async function registerFace(
  name: string,
  imageBlob: Blob
): Promise<RegisteredFace> {
  const formData = new FormData();
  formData.append('name', name);
  formData.append('file', imageBlob, 'face.jpg');

  return request<RegisteredFace>('/faces/register', {
    method: 'POST',
    body: formData,
  });
}

export async function recognizeFace(imageBlob: Blob): Promise<FaceMatch[]> {
  const formData = new FormData();
  formData.append('file', imageBlob, 'face.jpg');

  const result = await request<{ matches: FaceMatch[]; faces_detected: number }>('/faces/recognize', {
    method: 'POST',
    body: formData,
  });
  return result.matches;
}

export async function listFaces(): Promise<RegisteredFace[]> {
  const result = await request<{ faces: RegisteredFace[]; total: number }>('/faces');
  return result.faces;
}

export async function deleteFace(id: number): Promise<void> {
  await request<void>(`/faces/${id}`, { method: 'DELETE' });
}

// === Scene ===
export async function describeScene(
  imageBlob: Blob
): Promise<SceneDescription> {
  const formData = new FormData();
  formData.append('file', imageBlob, 'scene.jpg');

  return request<SceneDescription>('/scene/describe', {
    method: 'POST',
    body: formData,
  });
}

// === Scene Chat ===
export interface SceneChatResponse {
  answer: string;
  detections_used: number;
  objects: string[];
}

export async function sceneChat(
  imageBlob: Blob,
  question: string = 'What do you see?'
): Promise<SceneChatResponse> {
  const formData = new FormData();
  formData.append('file', imageBlob, 'frame.jpg');
  formData.append('question', question);

  return request<SceneChatResponse>('/scene/chat', {
    method: 'POST',
    body: formData,
  });
}

// === Audio ===
export async function transcribe(audioBlob: Blob): Promise<Transcription> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.wav');

  return request<Transcription>('/transcribe', {
    method: 'POST',
    body: formData,
  });
}

// === Workflow ===
export async function generateWorkflow(text: string): Promise<Workflow> {
  const result = await request<{ workflow: Workflow; generation_time_ms: number; llm_available: boolean }>(
    '/workflow/from-text',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }
  );
  return result.workflow;
}

export async function generateWorkflowFromVoice(
  audioBlob: Blob
): Promise<Workflow> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'command.wav');

  const result = await request<{ workflow: Workflow; generation_time_ms: number; llm_available: boolean }>(
    '/workflow/from-voice',
    { method: 'POST', body: formData }
  );
  return result.workflow;
}

// === Health ===
export async function getHealth(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/health');
}

export async function getNPUStatus(): Promise<NPUHealth> {
  return request<NPUHealth>('/health/npu');
}

export async function getModelStatus(): Promise<ModelStatus[]> {
  return request<ModelStatus[]>('/health/models');
}
