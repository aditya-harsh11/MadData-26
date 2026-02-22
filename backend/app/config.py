"""CamerAI configuration using Pydantic Settings."""

import logging
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings with environment variable support.

    All settings can be overridden via environment variables with the
    CAMERAI_ prefix (e.g., CAMERAI_HOST, CAMERAI_PORT).
    """

    model_config = SettingsConfigDict(env_prefix="CAMERAI_")

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Model paths
    models_dir: Path = Path("models")
    yolo_model: str = "yolov8n_det.onnx"
    face_det_model: str = "mediapipe_face_det.onnx"
    face_rec_model: str = "arcface_w600k_r50.onnx"
    whisper_model: str = "whisper_tiny_en.onnx"
    scene_model: str = "florence2_base.onnx"
    phi3_model_dir: str = "phi3-mini"

    # NPU / QNN
    qnn_enabled: bool = True
    npu_device_id: int = 0

    # Detection thresholds
    confidence_threshold: float = 0.5
    face_similarity_threshold: float = 0.6

    # Database
    db_path: str = "camerai.db"

    # Camera
    max_cameras: int = 4
    frame_width: int = 640
    frame_height: int = 480

    @property
    def qnn_provider_options(self) -> dict:
        """Return QNN Execution Provider configuration for Snapdragon X Elite HTP."""
        return {
            "backend_path": "QnnHtp.dll",
            "htp_performance_mode": "burst",
            "htp_graph_finalization_optimization_mode": "3",
        }

    @property
    def yolo_model_path(self) -> Path:
        return self.models_dir / self.yolo_model

    @property
    def face_det_model_path(self) -> Path:
        return self.models_dir / self.face_det_model

    @property
    def face_rec_model_path(self) -> Path:
        return self.models_dir / self.face_rec_model

    @property
    def whisper_model_path(self) -> Path:
        return self.models_dir / self.whisper_model

    @property
    def scene_model_path(self) -> Path:
        return self.models_dir / self.scene_model

    @property
    def phi3_model_path(self) -> Path:
        return self.models_dir / self.phi3_model_dir

    @field_validator("models_dir", mode="before")
    @classmethod
    def _resolve_models_dir(cls, v: str | Path) -> Path:
        return Path(v)


settings = Settings()
