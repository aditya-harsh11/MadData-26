"""Shared Pydantic models for the CamerAI API."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------

class Detection(BaseModel):
    """A single object detection result."""
    class_id: int
    class_name: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: list[float] = Field(
        description="Bounding box [x1, y1, x2, y2] normalised 0-1"
    )


class DetectionResponse(BaseModel):
    """Response for a detection request."""
    detections: list[Detection]
    inference_time_ms: float
    frame_shape: list[int] = Field(description="[height, width, channels]")


# ---------------------------------------------------------------------------
# Faces
# ---------------------------------------------------------------------------

class FaceDetection(BaseModel):
    """A detected face with landmarks."""
    bbox: list[float] = Field(description="[x1, y1, x2, y2] normalised 0-1")
    confidence: float = Field(ge=0.0, le=1.0)
    landmarks: list[list[float]] = Field(
        default_factory=list,
        description="List of [x, y] landmark points",
    )


class FaceMatch(BaseModel):
    """A recognised face matched against the database."""
    name: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: list[float]


class FaceRegisterRequest(BaseModel):
    """Request body when registering a face via base64."""
    name: str
    image_base64: str | None = None


class FaceRecord(BaseModel):
    """Stored face record returned by the list endpoint."""
    id: int
    name: str
    created_at: str


# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------

class SceneDescription(BaseModel):
    """Scene understanding output."""
    caption: str
    objects: list[str] = Field(default_factory=list)
    object_counts: dict[str, int] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ---------------------------------------------------------------------------
# Speech
# ---------------------------------------------------------------------------

class Transcription(BaseModel):
    """Speech-to-text result."""
    text: str
    language: str = "en"
    duration: float = 0.0


# ---------------------------------------------------------------------------
# Workflow
# ---------------------------------------------------------------------------

class WorkflowNode(BaseModel):
    id: str
    type: str = Field(description="camera | trigger | condition | action")
    data: dict = Field(default_factory=dict)
    position: dict = Field(
        default_factory=lambda: {"x": 0, "y": 0},
        description='{"x": number, "y": number}',
    )


class WorkflowEdge(BaseModel):
    source: str
    target: str


class Workflow(BaseModel):
    name: str
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)


class WorkflowFromTextRequest(BaseModel):
    text: str
    max_tokens: int = 512
    temperature: float = 0.7


class WorkflowFromVoiceRequest(BaseModel):
    """Marker model -- actual audio comes as file upload."""
    max_tokens: int = 512
    temperature: float = 0.7


# ---------------------------------------------------------------------------
# Health / System
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str = "ok"
    uptime_seconds: float = 0.0
    version: str = "1.0.0"


class NPUStatus(BaseModel):
    available: bool
    provider: str
    device_id: int
    providers_list: list[str] = Field(default_factory=list)


class ModelInfo(BaseModel):
    name: str
    loaded: bool
    provider: str = ""
    path: str = ""


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertEvent(BaseModel):
    id: str = ""
    severity: AlertSeverity = AlertSeverity.INFO
    message: str = ""
    source: str = ""
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    data: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Base64 image input
# ---------------------------------------------------------------------------

class Base64ImageRequest(BaseModel):
    image: str = Field(description="Base64-encoded image bytes")


class SceneChatRequest(BaseModel):
    question: str = Field(description="User question about the scene")


class SceneChatResponse(BaseModel):
    answer: str
    detections_used: int = 0
    objects: list[str] = Field(default_factory=list)
