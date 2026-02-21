"""
SnapFlow Backend — FastAPI server with WebSocket pipeline.

Dual-tier AI architecture:
  Tier 1 (Watchdog): Lightweight ONNX object detection on every frame.
  Tier 2 (Brain):    Heavy Nexa SDK multimodal reasoning, triggered on demand.

Communicates with the Electron/Next.js frontend via WebSocket.
"""

import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from watchdog import Watchdog
from reasoning import ReasoningBrain

# ─── Logging ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("snapflow")

# ─── AI Engines ───
MODEL_DIR = Path(__file__).parent / "models"
MODEL_DIR.mkdir(exist_ok=True)

# Standard ONNX model — onnxruntime-qnn JIT-compiles it for the Qualcomm NPU
# via QNNExecutionProvider when running under native ARM64 Python.
LOCAL_MODEL = MODEL_DIR / "yolov8n.onnx"
watchdog = Watchdog(model_path=str(LOCAL_MODEL), confidence=0.45)
brain = ReasoningBrain()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("=" * 50)
    logger.info("  SnapFlow Backend Starting")
    logger.info("=" * 50)

    # Load models in background thread to avoid blocking
    loop = asyncio.get_event_loop()

    if not watchdog.loaded:
        logger.warning(
            f"Watchdog model not found at {MODEL_DIR / 'yolov8n.onnx'}. "
            "Place a YOLOv8-nano ONNX model there, or detections will be empty."
        )

    # Try loading Nexa SDK models (non-blocking)
    try:
        await loop.run_in_executor(None, brain.load_vlm)
    except Exception as e:
        logger.warning(f"Could not load VLM: {e}")

    try:
        await loop.run_in_executor(None, brain.load_llm)
    except Exception as e:
        logger.warning(f"Could not load LLM: {e}")

    logger.info(f"Watchdog loaded: {watchdog.loaded}")
    logger.info(f"VLM loaded:      {brain.vlm_loaded}")
    logger.info(f"LLM loaded:      {brain.llm_loaded}")
    logger.info("Backend ready — waiting for WebSocket connections")

    yield

    logger.info("Backend shutting down")


app = FastAPI(title="SnapFlow Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health Check ───
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "watchdog_loaded": watchdog.loaded,
        "vlm_loaded": brain.vlm_loaded,
        "llm_loaded": brain.llm_loaded,
    }


# ─── WebSocket Pipeline ───
class ConnectionManager:
    def __init__(self):
        self.active: dict[str, WebSocket] = {}

    async def connect(self, ws: WebSocket) -> str:
        await ws.accept()
        cid = str(uuid.uuid4())[:8]
        self.active[cid] = ws
        logger.info(f"Client connected: {cid} (total: {len(self.active)})")
        return cid

    def disconnect(self, cid: str):
        self.active.pop(cid, None)
        logger.info(f"Client disconnected: {cid} (total: {len(self.active)})")

    async def send(self, cid: str, msg_type: str, payload: dict):
        ws = self.active.get(cid)
        if ws:
            try:
                await ws.send_json({"type": msg_type, "payload": payload})
            except Exception:
                self.disconnect(cid)

    async def broadcast(self, msg_type: str, payload: dict):
        disconnected = []
        for cid, ws in self.active.items():
            try:
                await ws.send_json({"type": msg_type, "payload": payload})
            except Exception:
                disconnected.append(cid)
        for cid in disconnected:
            self.disconnect(cid)


manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    cid = await manager.connect(ws)

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")
            payload = msg.get("payload", {})

            if msg_type == "frame":
                await handle_frame(cid, payload)
            elif msg_type == "reasoning":
                await handle_reasoning(cid, payload)
            elif msg_type == "text_gen":
                await handle_text_gen(cid, payload)
            else:
                logger.warning(f"Unknown message type: {msg_type}")

    except WebSocketDisconnect:
        manager.disconnect(cid)
    except Exception as e:
        logger.error(f"WebSocket error ({cid}): {e}")
        manager.disconnect(cid)


async def handle_frame(cid: str, payload: dict):
    """Tier 1 — Run Watchdog detection on incoming frame."""
    image_b64 = payload.get("image", "")
    node_id = payload.get("node_id", "")

    if not image_b64:
        return

    loop = asyncio.get_event_loop()
    detections = await loop.run_in_executor(
        None, watchdog.detect_from_base64, image_b64
    )

    await manager.send(cid, "detection", {
        "node_id": node_id,
        "detections": detections,
        "frame_id": str(uuid.uuid4())[:8],
    })

    # Check for trigger conditions
    trigger_labels = [d["label"] for d in detections if d["confidence"] > 0.6]
    if trigger_labels:
        await manager.send(cid, "trigger_reasoning", {
            "labels": trigger_labels,
            "image": image_b64,
        })


async def handle_reasoning(cid: str, payload: dict):
    """Tier 2 — Run VLM reasoning on a triggered frame."""
    image_b64 = payload.get("image", "")
    prompt = payload.get("prompt", "Describe what you see.")
    trigger_label = payload.get("trigger_label", "")

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, brain.analyze_frame, image_b64, prompt, trigger_label
    )

    await manager.send(cid, "reasoning", result)

    # Also forward to action nodes
    await manager.send(cid, "action_trigger", {
        "analysis": result.get("analysis", ""),
        "trigger_label": trigger_label,
    })


async def handle_text_gen(cid: str, payload: dict):
    """Text generation via Llama-3.2-3B."""
    prompt = payload.get("prompt", "")
    node_id = payload.get("node_id", "")

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, brain.generate_text, prompt)

    await manager.send(cid, "text_gen_result", {
        "node_id": node_id,
        **result,
    })


# ─── Entry Point ───
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("SNAPFLOW_PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info",
    )
