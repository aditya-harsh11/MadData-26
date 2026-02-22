"""Natural-language workflow generation endpoints."""

import logging
import time

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.models.schemas import (
    Transcription,
    Workflow,
    WorkflowEdge,
    WorkflowFromTextRequest,
    WorkflowNode,
)
from app.services.llm_service import LLMService
from app.services.whisper_service import WhisperService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workflow", tags=["workflow"])

_llm: LLMService | None = None
_whisper: WhisperService | None = None


def _get_llm() -> LLMService:
    global _llm
    if _llm is None:
        _llm = LLMService()
        _llm.initialize()
    return _llm


def _get_whisper() -> WhisperService:
    global _whisper
    if _whisper is None:
        _whisper = WhisperService()
    return _whisper


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------


@router.post("/from-text")
async def workflow_from_text(body: WorkflowFromTextRequest) -> dict:
    """Convert a natural-language description into a workflow JSON.

    Uses Phi-3.5-mini via onnxruntime-genai when available; otherwise
    returns a template-based workflow.
    """
    llm = _get_llm()

    t0 = time.perf_counter()
    workflow = llm.generate_workflow(body.text)
    elapsed = (time.perf_counter() - t0) * 1000

    return {
        "workflow": workflow,
        "generation_time_ms": round(elapsed, 2),
        "llm_available": llm.available,
    }


@router.post("/from-voice")
async def workflow_from_voice(file: UploadFile = File(...)) -> dict:
    """Upload an audio file, transcribe it, then generate a workflow.

    Combines Whisper STT with Phi-3.5 workflow generation.
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file.")

    whisper = _get_whisper()
    t0 = time.perf_counter()
    transcription = whisper.transcribe(data)
    stt_elapsed = (time.perf_counter() - t0) * 1000

    if not transcription.text or transcription.text == "[empty transcription]":
        raise HTTPException(status_code=400, detail="Could not transcribe audio.")

    llm = _get_llm()
    t1 = time.perf_counter()
    workflow = llm.generate_workflow(transcription.text)
    llm_elapsed = (time.perf_counter() - t1) * 1000

    return {
        "transcription": transcription.model_dump(),
        "workflow": workflow,
        "stt_time_ms": round(stt_elapsed, 2),
        "generation_time_ms": round(llm_elapsed, 2),
        "llm_available": llm.available,
    }


@router.post("/validate")
async def validate_workflow(body: Workflow) -> dict:
    """Validate a workflow JSON structure.

    Checks:
    - At least one node exists
    - All edge source/target IDs reference existing nodes
    - At least one camera node is present
    - Node types are valid
    """
    errors: list[str] = []

    if not body.nodes:
        errors.append("Workflow must contain at least one node.")

    node_ids = {n.id for n in body.nodes}
    valid_types = {"camera", "trigger", "condition", "action"}

    has_camera = False
    for node in body.nodes:
        if node.type not in valid_types:
            errors.append(
                f"Node '{node.id}' has invalid type '{node.type}'. "
                f"Must be one of {valid_types}."
            )
        if node.type == "camera":
            has_camera = True

    if body.nodes and not has_camera:
        errors.append("Workflow must contain at least one 'camera' node.")

    for edge in body.edges:
        if edge.source not in node_ids:
            errors.append(f"Edge source '{edge.source}' does not match any node ID.")
        if edge.target not in node_ids:
            errors.append(f"Edge target '{edge.target}' does not match any node ID.")

    # Check for duplicate node IDs
    if len(node_ids) != len(body.nodes):
        errors.append("Duplicate node IDs detected.")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "node_count": len(body.nodes),
        "edge_count": len(body.edges),
    }
