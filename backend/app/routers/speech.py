"""Speech-to-text endpoints (Whisper tiny.en)."""

import logging
import time

from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect

from app.models.schemas import Transcription
from app.services.whisper_service import WhisperService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/speech", tags=["speech"])

_whisper: WhisperService | None = None


def _get_whisper() -> WhisperService:
    global _whisper
    if _whisper is None:
        _whisper = WhisperService()
    return _whisper


@router.post("/transcribe", response_model=Transcription)
async def transcribe_audio(file: UploadFile = File(...)) -> Transcription:
    """Upload a WAV audio file and receive a transcription.

    Expected format: WAV, 16 kHz, 16-bit PCM, mono.
    Other sample rates and channel counts are handled automatically.
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file.")

    svc = _get_whisper()
    t0 = time.perf_counter()
    result = svc.transcribe(data)
    elapsed = (time.perf_counter() - t0) * 1000
    logger.info("Transcription completed in %.1f ms: %s", elapsed, result.text[:80])

    return result


@router.websocket("/stream")
async def stream_transcription(ws: WebSocket) -> None:
    """Streaming audio transcription over WebSocket.

    Protocol
    --------
    Client sends: binary audio chunks (WAV or raw PCM s16le 16 kHz mono)
    Server replies: JSON ``Transcription`` for each chunk received
    """
    await ws.accept()
    svc = _get_whisper()
    logger.info("Speech stream WebSocket connected.")

    try:
        while True:
            data = await ws.receive_bytes()
            if not data:
                continue

            t0 = time.perf_counter()
            result = svc.transcribe(data)
            elapsed = (time.perf_counter() - t0) * 1000

            payload = result.model_dump()
            payload["inference_time_ms"] = round(elapsed, 2)
            await ws.send_json(payload)

    except WebSocketDisconnect:
        logger.info("Speech stream WebSocket disconnected.")
    except Exception:
        logger.exception("Error in speech stream.")
        await ws.close(code=1011, reason="Internal error")
