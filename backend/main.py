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

# ─── Qualcomm AI Hub Configuration ───
QAI_HUB_TOKEN = os.environ.get("QAI_HUB_API_TOKEN", "fi3l2clm1oimw3f1aj3fl6zthbqtihxftki0z894")
try:
    import qai_hub
    qai_hub.set_session_token(QAI_HUB_TOKEN)
except (ImportError, Exception):
    pass

# ─── Nexa NPU License ───
NEXA_LICENSE = os.environ.get(
    "NEXA_TOKEN",
    "key/eyJhY2NvdW50Ijp7ImlkIjoiNDI1Y2JiNWQtNjk1NC00NDYxLWJiOWMtYzhlZjBiY2JlYzA2In0sInByb2R1Y3QiOnsiaWQiOiIxNDY0ZTk1MS04MGM5LTRjN2ItOWZmYS05MmYyZmQzNmE5YTMifSwicG9saWN5Ijp7ImlkIjoiYzI1YjE3OTUtNTY0OC00NGY1LTgxMmUtNGQ3ZWM3ZjFjYWI0IiwiZHVyYXRpb24iOjI1OTIwMDB9LCJ1c2VyIjp7ImlkIjoiZDI2MGIwZjAtMjRkNy00NWQ0LThkMzUtZmJhODQ5NGI4YTdjIiwiZW1haWwiOiJuaXNoYWRzY3JhdGNoQGdtYWlsLmNvbSJ9LCJsaWNlbnNlIjp7ImlkIjoiN2JkNjlkNmUtOTk1NC00OGY2LTgxNWEtOTIyZTZhNTE0ZmY1IiwiY3JlYXRlZCI6IjIwMjYtMDItMjFUMjM6Mzk6MjguNDgyWiIsImV4cGlyeSI6IjIwMjYtMDMtMjNUMjM6Mzk6MjguNDgyWiJ9fQ==.igYAIuiLvyKcDKR2CHo3lsmc1pungm4BbfMO5dxXwq3z3GlDT55YnTeo7GkqAydwUYQtwN_fS9XcjcvyMvNHBA==",
)
os.environ["NEXA_TOKEN"] = NEXA_LICENSE

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

STD_MODEL = MODEL_DIR / "yolov8n.onnx"
LOCAL_MODEL = STD_MODEL
watchdog = Watchdog(model_path=str(LOCAL_MODEL), confidence=0.45)
brain = ReasoningBrain()

DEFAULT_PROMPT = "Describe what you see. If there is any safety concern, explain it."
REASONING_INTERVAL_DEFAULT = 5


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("=" * 50)
    logger.info("  SnapFlow Backend Starting")
    logger.info("=" * 50)

    loop = asyncio.get_event_loop()

    if not watchdog.loaded:
        logger.warning(
            f"Watchdog model not found at {MODEL_DIR / 'yolov8n.onnx'}. "
            "Place a YOLOv8-nano ONNX model there, or detections will be empty."
        )

    async def _load_brain():
        try:
            await loop.run_in_executor(None, brain.load_vlm)
        except Exception as e:
            logger.warning(f"Could not load VLM: {e}")
        try:
            await loop.run_in_executor(None, brain.load_llm)
        except Exception as e:
            logger.warning(f"Could not load LLM: {e}")
        logger.info(f"VLM loaded:      {brain.vlm_loaded}")
        logger.info(f"LLM loaded:      {brain.llm_loaded}")

    asyncio.create_task(_load_brain())

    logger.info(f"Watchdog loaded: {watchdog.loaded}")
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
    active_providers = []
    if watchdog.session:
        active_providers = watchdog.session.get_providers()
    npu_active = "QNNExecutionProvider" in active_providers

    return {
        "status": "ok",
        "watchdog_loaded": watchdog.loaded,
        "vlm_loaded": brain.vlm_loaded,
        "llm_loaded": brain.llm_loaded,
        "npu_active": npu_active,
        "execution_providers": active_providers,
        "model_path": str(LOCAL_MODEL),
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

# ─── Per-client state ───
_client_state: dict[str, dict] = {}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    cid = await manager.connect(ws)

    _client_state[cid] = {
        "latest_frame": None,
        "latest_detections": [],
        "prompt": DEFAULT_PROMPT,
        "interval": REASONING_INTERVAL_DEFAULT,
        "reasoning_task": None,
    }

    task = asyncio.create_task(reasoning_loop(cid))
    _client_state[cid]["reasoning_task"] = task

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
            elif msg_type == "config":
                await handle_config(cid, payload)
            else:
                logger.warning(f"Unknown message type: {msg_type}")

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error ({cid}): {e}")
    finally:
        if cid in _client_state:
            t = _client_state[cid].get("reasoning_task")
            if t:
                t.cancel()
            del _client_state[cid]
        brain.clear_client(cid)
        manager.disconnect(cid)


# ─── Frame handler (Tier 1 — Watchdog) ───

async def handle_frame(cid: str, payload: dict):
    """Run Watchdog detection on incoming frame and store it for reasoning."""
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

    if cid in _client_state:
        _client_state[cid]["latest_frame"] = image_b64
        _client_state[cid]["latest_detections"] = detections


# ─── Reasoning loop (Tier 2 — VLM) ───

async def reasoning_loop(cid: str):
    """Periodic VLM reasoning. Runs immediately once a frame arrives, then
    repeats every `interval` seconds. Uses short sleep ticks so interval
    changes take effect right away."""
    logger.info(f"Reasoning loop started for client {cid}")
    try:
        # Wait for first frame (poll every 0.5s so we start fast)
        while cid in _client_state:
            if _client_state[cid].get("latest_frame"):
                break
            await asyncio.sleep(0.5)

        while cid in _client_state:
            state = _client_state[cid]
            frame = state.get("latest_frame")
            if not frame:
                await asyncio.sleep(0.5)
                continue

            prompt = state.get("prompt", DEFAULT_PROMPT)

            await manager.send(cid, "trigger_reasoning", {})

            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                brain.analyze_frame,
                frame,
                prompt,
                cid,
            )

            analysis = result.get("analysis", "")
            logger.info(f"Reasoning result for {cid}: {analysis[:100]}")

            await manager.send(cid, "reasoning", result)
            await manager.send(cid, "action_trigger", {
                "analysis": analysis,
            })

            # Sleep in 0.5s ticks so interval changes react immediately
            interval = state.get("interval", REASONING_INTERVAL_DEFAULT)
            elapsed = 0.0
            while elapsed < interval and cid in _client_state:
                await asyncio.sleep(0.5)
                elapsed += 0.5
                interval = _client_state.get(cid, {}).get("interval", interval)

    except asyncio.CancelledError:
        logger.info(f"Reasoning loop cancelled for {cid}")
    except Exception as e:
        logger.error(f"Reasoning loop error for {cid}: {e}")


# ─── Config handler ───

async def handle_config(cid: str, payload: dict):
    """Handle configuration updates from the frontend."""
    if cid not in _client_state:
        return

    if "reasoning_interval" in payload:
        new_interval = max(5, min(300, int(payload["reasoning_interval"])))
        _client_state[cid]["interval"] = new_interval
        logger.info(f"Client {cid} reasoning interval set to {new_interval}s")

    if "reasoning_prompt" in payload:
        new_prompt = str(payload["reasoning_prompt"]).strip()
        if new_prompt:
            _client_state[cid]["prompt"] = new_prompt
            logger.info(f"Client {cid} prompt set to: {new_prompt[:80]}")

    await manager.send(cid, "config_ack", {
        "reasoning_interval": _client_state[cid]["interval"],
        "reasoning_prompt": _client_state[cid]["prompt"],
    })


# ─── On-demand reasoning handler ───

async def handle_reasoning(cid: str, payload: dict):
    """Run VLM reasoning on a specific frame+prompt sent by the frontend."""
    image_b64 = payload.get("image", "")
    prompt = payload.get("prompt", DEFAULT_PROMPT)

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, brain.analyze_frame, image_b64, prompt, cid
    )

    await manager.send(cid, "reasoning", result)
    await manager.send(cid, "action_trigger", {
        "analysis": result.get("analysis", ""),
    })


# ─── Text generation handler ───

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
        reload=False,
        log_level="info",
    )
