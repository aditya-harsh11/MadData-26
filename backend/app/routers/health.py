"""Health-check endpoints for CamerAI."""

import logging
import time

from fastapi import APIRouter

from app.config import settings
from app.models.schemas import HealthResponse, ModelInfo, NPUStatus
from app.services.onnx_runtime_manager import OnnxRuntimeManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])

_start_time: float = time.time()


@router.get("", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Basic liveness probe."""
    return HealthResponse(
        status="ok",
        uptime_seconds=round(time.time() - _start_time, 2),
        version="1.0.0",
    )


@router.get("/npu", response_model=NPUStatus)
async def npu_status() -> NPUStatus:
    """Return NPU / QNN Execution Provider status."""
    manager = OnnxRuntimeManager()
    info = manager.get_provider_info()
    return NPUStatus(
        available=info["qnn_available"],
        provider=info["active_provider"],
        device_id=settings.npu_device_id,
        providers_list=info["available_providers"],
    )


@router.get("/models", response_model=list[ModelInfo])
async def loaded_models() -> list[ModelInfo]:
    """Return a list of all known model slots and their load status."""
    manager = OnnxRuntimeManager()
    info = manager.get_provider_info()
    loaded_set = set(info["loaded_models"])

    model_slots = [
        ("yolov8n_det.onnx", settings.yolo_model),
        ("mediapipe_face_det.onnx", settings.face_det_model),
        ("arcface_w600k_r50.onnx", settings.face_rec_model),
        ("whisper_tiny_en.onnx", settings.whisper_model),
        ("florence2_base.onnx", settings.scene_model),
    ]

    result: list[ModelInfo] = []
    for display_name, file_name in model_slots:
        is_loaded = file_name in loaded_set
        result.append(
            ModelInfo(
                name=display_name,
                loaded=is_loaded,
                provider=info["active_provider"] if is_loaded else "",
                path=str(settings.models_dir / file_name),
            )
        )

    return result
