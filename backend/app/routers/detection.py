"""Object detection endpoints (YOLOv8)."""

import base64
import io
import logging
import time

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from PIL import Image

from app.models.schemas import Base64ImageRequest, DetectionResponse
from app.services.yolo_service import YOLOService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/detect", tags=["detection"])

_yolo: YOLOService | None = None


def _get_yolo() -> YOLOService:
    global _yolo
    if _yolo is None:
        _yolo = YOLOService()
    return _yolo


def _decode_image_upload(data: bytes) -> np.ndarray:
    """Decode uploaded image bytes into an RGB numpy array."""
    try:
        pil_img = Image.open(io.BytesIO(data))
        pil_img = pil_img.convert("RGB")
        return np.array(pil_img)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image.")


def _decode_base64_image(b64: str) -> np.ndarray:
    """Decode a base64-encoded image string into an RGB numpy array."""
    # Strip optional data-URI prefix
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    try:
        raw = base64.b64decode(b64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64: {exc}") from exc
    return _decode_image_upload(raw)


# ------------------------------------------------------------------
# REST endpoints
# ------------------------------------------------------------------

@router.post("", response_model=DetectionResponse)
async def detect_objects(file: UploadFile = File(...)) -> DetectionResponse:
    """Upload an image file and receive YOLOv8 detections."""
    data = await file.read()
    img = _decode_image_upload(data)

    yolo = _get_yolo()
    t0 = time.perf_counter()
    try:
        detections = yolo.detect(img)
    except (FileNotFoundError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    elapsed = (time.perf_counter() - t0) * 1000

    return DetectionResponse(
        detections=detections,
        inference_time_ms=round(elapsed, 2),
        frame_shape=list(img.shape),
    )


@router.post("/base64", response_model=DetectionResponse)
async def detect_objects_base64(body: Base64ImageRequest) -> DetectionResponse:
    """Accept a base64-encoded image and return detections."""
    img = _decode_base64_image(body.image)

    yolo = _get_yolo()
    t0 = time.perf_counter()
    try:
        detections = yolo.detect(img)
    except (FileNotFoundError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    elapsed = (time.perf_counter() - t0) * 1000

    return DetectionResponse(
        detections=detections,
        inference_time_ms=round(elapsed, 2),
        frame_shape=list(img.shape),
    )


# ------------------------------------------------------------------
# WebSocket streaming
# ------------------------------------------------------------------

@router.websocket("/stream")
async def detect_stream(ws: WebSocket) -> None:
    """Stream binary image frames via WebSocket and receive JSON detections.

    Protocol
    --------
    Client sends: binary frame (JPEG / PNG encoded bytes)
    Server replies: JSON string with DetectionResponse fields
    """
    await ws.accept()
    yolo = _get_yolo()
    logger.info("Detection stream WebSocket connected.")

    try:
        while True:
            data = await ws.receive_bytes()
            img = _decode_image_upload(data)

            t0 = time.perf_counter()
            try:
                detections = yolo.detect(img)
            except FileNotFoundError:
                await ws.send_json({"error": "YOLO model not loaded"})
                continue
            elapsed = (time.perf_counter() - t0) * 1000

            response = DetectionResponse(
                detections=detections,
                inference_time_ms=round(elapsed, 2),
                frame_shape=list(img.shape),
            )
            await ws.send_text(response.model_dump_json())

    except WebSocketDisconnect:
        logger.info("Detection stream WebSocket disconnected.")
    except Exception:
        logger.exception("Error in detection stream.")
        await ws.close(code=1011, reason="Internal error")
